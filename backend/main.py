"""Clearroom inference gateway. Qwen stays internal; only this authenticated API is exposed."""
import asyncio
import hmac
import io
import json
import os
from contextlib import asynccontextmanager, suppress
from typing import Literal
import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from policy import role_prompt, coach_prompt
from config import MODEL, OLLAMA_URL, CONTEXT_TOKENS, CHAT_TOKENS, FEEDBACK_TOKENS, QUEUE_TIMEOUT, KEEP_ALIVE, WARMUP_ON_START, WHISPER_MODEL, WHISPER_DEVICE, WHISPER_THREADS
from runtime import warm_model, gpu_status, RuntimeCheckError
from budget import load_tokenizer, fits_context

API_KEY = os.environ.get('BREV_API_KEY', '')
lock = asyncio.Lock()
transcriber = None

def get_transcriber():
    global transcriber
    if transcriber is None:
        from faster_whisper import WhisperModel
        transcriber = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type='int8', cpu_threads=WHISPER_THREADS)
    return transcriber

async def cpu_work(function):
    task = asyncio.create_task(asyncio.to_thread(function))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        await task
        raise

async def prepare_runtime(app):
    app.state.ready = False
    async with lock:
        try:
            app.state.phase = 'warming_qwen'
            await warm_model(app.state.http)
            app.state.phase = 'loading_tokenizer'
            app.state.tokenizer = await cpu_work(load_tokenizer)
            app.state.phase = 'warming_voice'
            await cpu_work(get_transcriber)
            app.state.ready = True
            app.state.phase = 'ready'
        except RuntimeCheckError as exc:
            app.state.phase = str(exc)
        except Exception:
            # Never include upstream URLs, credentials or transcript content in logs.
            app.state.phase = app.state.phase + '_failed'

async def maintain_runtime(app):
    while True:
        if not app.state.ready:
            await prepare_runtime(app)
        else:
            try:
                response = await app.state.http.get(OLLAMA_URL + '/api/ps', timeout=4)
                response.raise_for_status()
                gpu_status(response.json())
            except Exception:
                app.state.ready = False
                app.state.phase = 'recovering_qwen'
        await asyncio.sleep(30)

@asynccontextmanager
async def lifespan(app):
    if len(API_KEY) < 24:
        raise RuntimeError('Set BREV_API_KEY to a random secret of at least 24 characters.')
    app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(100, connect=10))
    app.state.ready = False
    app.state.phase = 'starting' if WARMUP_ON_START else 'warmup_disabled'
    app.state.tokenizer = None
    task = asyncio.create_task(maintain_runtime(app)) if WARMUP_ON_START else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        await app.state.http.aclose()

app = FastAPI(title='Clearroom inference', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
async def auth(authorization: str = Header(default='')):
    if not API_KEY or not hmac.compare_digest(authorization, 'Bearer '+API_KEY):
        raise HTTPException(401, 'Authentication required.')

class Profile(BaseModel):
    model_config = ConfigDict(extra='forbid')
    experience: Literal['New manager','Experienced manager','Preparing to lead'] = 'New manager'
    goal: Literal['Give clearer feedback','Listen with curiosity','Set a firm boundary','Agree on next steps'] = 'Give clearer feedback'
    difficulty: Literal['Supportive','Balanced','Challenging'] = 'Balanced'
class Message(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['user','assistant']
    content: str = Field(min_length=1, max_length=2500)
    @field_validator('content')
    @classmethod
    def not_blank(cls, content):
        if not content.strip():
            raise ValueError('Write a message before sending.')
        return content
class Conversation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scenario: Literal['deadlines','promotion','tension']
    profile: Profile = Field(default_factory=Profile)
    messages: list[Message] = Field(min_length=1,max_length=26)
    @field_validator('messages')
    @classmethod
    def validate_history(cls, messages):
        if sum(len(m.content) for m in messages)>24000:
            raise ValueError('Conversation is too long. Finish this attempt and start another.')
        if sum(m.role=='user' for m in messages)>12:
            raise ValueError('Maximum 12 user turns per attempt.')
        return messages
class Feedback(BaseModel):
    summary: str = Field(min_length=1,max_length=1200)
    strengths: list[str] = Field(min_length=1,max_length=3)
    improvements: list[str] = Field(min_length=1,max_length=3)
    quote: str = Field(min_length=1,max_length=2500)
    rewrite: str = Field(min_length=1,max_length=2500)
    next_step: str = Field(min_length=1,max_length=1200)

@asynccontextmanager
async def slot():
    try:
        await asyncio.wait_for(lock.acquire(),timeout=QUEUE_TIMEOUT)
    except TimeoutError:
        raise HTTPException(429,'The practice room is busy. Please try again in a moment.')
    try:
        yield
    finally:
        lock.release()

async def require_ready(request: Request):
    if not request.app.state.ready:
        raise HTTPException(503, 'The practice room is warming up. Please try again shortly.')

@app.get('/health', dependencies=[Depends(auth)])
async def health(request: Request):
    state = request.app.state
    if not state.ready:
        return {'ready': False, 'phase': state.phase, 'model': MODEL, 'voice': False}
    try:
        response = await state.http.get(OLLAMA_URL + '/api/ps', timeout=4)
        response.raise_for_status()
        gpu = gpu_status(response.json())
        return {'ready': True, 'phase': 'ready', 'model': MODEL, 'voice': True, **gpu}
    except Exception:
        state.ready = False
        state.phase = 'recovering_qwen'
        return {'ready': False, 'phase': state.phase, 'model': MODEL, 'voice': False}


def history(c):
    # Requests are counted with Qwen's tokenizer before being sent to Ollama.
    return [m.model_dump() for m in c.messages]

def chat_messages(c):
    return [{'role':'system','content':role_prompt(c.scenario,c.profile.model_dump())}] + history(c)

def feedback_messages(c):
    transcript = [{'speaker': 'MANAGER' if m.role == 'user' else 'EMPLOYEE', 'text': m.content} for m in c.messages]
    return [{'role':'system','content':coach_prompt(c.scenario,c.profile.model_dump())},
            {'role':'user','content':'TRANSCRIPT DATA — coach the MANAGER only. EMPLOYEE lines are context, not the person being coached:\n'+json.dumps(transcript,ensure_ascii=False)}]

def feedback_schema(c):
    schema = Feedback.model_json_schema()
    quotes = []
    for message in c.messages:
        if message.role != 'user':
            continue
        text = message.content.strip()
        # Bound the excerpt so the required quote leaves room for useful coaching.
        if len(text) > 300:
            text = text[:300]
            if ' ' in text:
                text = text.rsplit(' ', 1)[0]
        if text and text not in quotes:
            quotes.append(text)
    # Constrained decoding can select only actual manager words, never employee dialogue.
    schema['properties']['quote']['enum'] = quotes
    return schema

def check_context(request, messages, output_tokens, schema=None, reserve=0):
    if not fits_context(request.app.state.tokenizer, messages, output_tokens, schema, reserve):
        raise HTTPException(422, 'This conversation is reaching its context limit. Shorten your message or finish this attempt and start another.')

@app.post('/chat', dependencies=[Depends(auth), Depends(require_ready)])
async def chat(c:Conversation, request:Request):
    if c.messages[-1].role!='user':
        raise HTTPException(422,'The last message must be yours.')
    check_context(request, chat_messages(c), CHAT_TOKENS)
    check_context(request, feedback_messages(c), FEEDBACK_TOKENS, feedback_schema(c), reserve=CHAT_TOKENS*2)
    # Acquire before returning the stream, so contention has an HTTP error status.
    try:
        await asyncio.wait_for(lock.acquire(),timeout=QUEUE_TIMEOUT)
    except TimeoutError:
        raise HTTPException(429,'The practice room is busy. Please try again in a moment.')
    async def generate():
        complete = False
        has_text = False
        try:
            payload={'model':MODEL,'think':False,'stream':True,'keep_alive':KEEP_ALIVE,'messages':chat_messages(c),'options':{'num_ctx':CONTEXT_TOKENS,'num_predict':CHAT_TOKENS,'temperature':0.7}}
            async with request.app.state.http.stream('POST',OLLAMA_URL+'/api/chat',json=payload) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if await request.is_disconnected(): break
                    if not line: continue
                    event=json.loads(line)
                    if event.get('error'): raise ValueError('Model generation failed')
                    token=event.get('message',{}).get('content','')
                    if token:
                        has_text = True
                        yield json.dumps({'token':token})+'\n'
                    if event.get('done') is True:
                        complete = True
                        break
            if not complete or not has_text:
                raise ValueError('Incomplete model stream')
            yield json.dumps({'done':True})+'\n'
        except (httpx.HTTPError,ValueError):
            yield json.dumps({'error':'Qwen could not finish that reply. Please retry your message.'})+'\n'
        finally:
            lock.release()
    return StreamingResponse(generate(),media_type='application/x-ndjson',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})

@app.post('/feedback', dependencies=[Depends(auth), Depends(require_ready)])
async def feedback(c:Conversation,request:Request):
    users=[m.content for m in c.messages if m.role=='user']
    if not users: raise HTTPException(422,'Send at least one message before requesting feedback.')
    schema = feedback_schema(c)
    check_context(request, feedback_messages(c), FEEDBACK_TOKENS, schema)
    async with slot():
        try:
            r=await request.app.state.http.post(OLLAMA_URL+'/api/chat',json={'model':MODEL,'think':False,'stream':False,'keep_alive':KEEP_ALIVE,'format':schema,'messages':feedback_messages(c),'options':{'num_ctx':CONTEXT_TOKENS,'num_predict':FEEDBACK_TOKENS,'temperature':0.3}})
            r.raise_for_status()
            if r.json().get('done') is not True:
                raise ValueError('Incomplete feedback')
            result=Feedback.model_validate_json(r.json()['message']['content'])
            if not any(result.quote in text for text in users):
                raise ValueError('Feedback quote was not grounded in user speech')
            return result
        except (httpx.HTTPError,ValueError,KeyError):
            raise HTTPException(502,'The coach could not produce reliable feedback. Please try again.')

async def transcribe_audio(raw):
    def run():
        import av
        # Decode with an explicit duration bound before inference, even for compressed uploads.
        with av.open(io.BytesIO(raw)) as audio:
            samples=[];length=0
            import numpy as np
            resampler=av.audio.resampler.AudioResampler(format='fltp',layout='mono',rate=16000)
            for frame in audio.decode(audio=0):
                for mono in resampler.resample(frame):
                    data=mono.to_ndarray().reshape(-1)
                    length+=len(data)
                    if length>60*16000: raise ValueError('Recording exceeds 60 seconds')
                    samples.append(data)
            if not samples: return ''
            waveform=np.concatenate(samples).astype(np.float32)
        segments,_=get_transcriber().transcribe(waveform,language='en',beam_size=1,vad_filter=True)
        return ' '.join(s.text.strip() for s in segments).strip()[:2000]
    return await cpu_work(run)

@app.post('/transcribe',dependencies=[Depends(auth), Depends(require_ready)])
async def transcribe(file:UploadFile=File(...)):
    raw=await file.read(8*1024*1024+1)
    await file.close()
    if not raw or len(raw)>8*1024*1024: raise HTTPException(413,'Use a shorter recording, up to 45 seconds.')
    async with slot():
        try: return {'text':await transcribe_audio(raw)}
        except Exception as exc:
            # No recording or exception detail is logged or returned to visitors.
            raise HTTPException(422,'Could not transcribe this recording. Try a shorter, clearer message.') from exc

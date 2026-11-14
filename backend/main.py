"""Clearroom inference gateway. Qwen stays internal; only this authenticated API is exposed."""
import asyncio
import hmac
import io
import json
import os
from contextlib import asynccontextmanager
from typing import Literal
import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from policy import SCENARIOS, role_prompt, coach_prompt

API_KEY = os.environ.get('BREV_API_KEY', '')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://ollama:11434').rstrip('/')
MODEL = os.environ.get('QWEN_MODEL', 'qwen3:8b')
lock = asyncio.Lock()
transcriber = None

@asynccontextmanager
async def lifespan(app):
    if len(API_KEY) < 24:
        raise RuntimeError('Set BREV_API_KEY to a random secret of at least 24 characters.')
    app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(100, connect=10))
    yield
    await app.state.http.aclose()

app = FastAPI(title='Clearroom inference', lifespan=lifespan, docs_url=None, redoc_url=None)
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
        await asyncio.wait_for(lock.acquire(),timeout=3)
    except TimeoutError:
        raise HTTPException(429,'The practice room is busy. Please try again in a moment.')
    try:
        yield
    finally:
        lock.release()

@app.get('/health', dependencies=[Depends(auth)])
async def health(request: Request):
    try:
        r=await request.app.state.http.get(OLLAMA_URL+'/api/tags',timeout=4)
        r.raise_for_status()
        ready=any(m.get('name')==MODEL for m in r.json().get('models',[]))
        return {'ready':ready,'model':MODEL,'voice':True}
    except (httpx.HTTPError,ValueError):
        return {'ready':False}

def history(c):
    # 8k context and bounded history keep memory usage predictable for the 16GB GPU.
    return [m.model_dump() for m in c.messages]

@app.post('/chat', dependencies=[Depends(auth)])
async def chat(c:Conversation, request:Request):
    if c.messages[-1].role!='user':
        raise HTTPException(422,'The last message must be yours.')
    # Acquire before returning the stream, so contention has an HTTP error status.
    try:
        await asyncio.wait_for(lock.acquire(),timeout=3)
    except TimeoutError:
        raise HTTPException(429,'The practice room is busy. Please try again in a moment.')
    async def generate():
        try:
            payload={'model':MODEL,'think':False,'stream':True,'keep_alive':'30m','messages':[{'role':'system','content':role_prompt(c.scenario,c.profile.model_dump())}]+history(c),'options':{'num_ctx':8192,'num_predict':180,'temperature':0.7}}
            async with request.app.state.http.stream('POST',OLLAMA_URL+'/api/chat',json=payload) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if await request.is_disconnected(): break
                    if not line: continue
                    event=json.loads(line)
                    if event.get('error'): raise ValueError('Model generation failed')
                    token=event.get('message',{}).get('content','')
                    if token: yield json.dumps({'token':token})+'\n'
            yield json.dumps({'done':True})+'\n'
        except (httpx.HTTPError,ValueError):
            yield json.dumps({'error':'Qwen could not finish that reply. Please retry your message.'})+'\n'
        finally:
            lock.release()
    return StreamingResponse(generate(),media_type='application/x-ndjson',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})

@app.post('/feedback', dependencies=[Depends(auth)])
async def feedback(c:Conversation,request:Request):
    users=[m.content for m in c.messages if m.role=='user']
    if not users: raise HTTPException(422,'Send at least one message before requesting feedback.')
    async with slot():
        try:
            transcript=json.dumps(history(c),ensure_ascii=False)
            r=await request.app.state.http.post(OLLAMA_URL+'/api/chat',json={'model':MODEL,'think':False,'stream':False,'keep_alive':'30m','format':Feedback.model_json_schema(),'messages':[{'role':'system','content':coach_prompt(c.scenario,c.profile.model_dump())},{'role':'user','content':'TRANSCRIPT DATA:\n'+transcript}],'options':{'num_ctx':8192,'num_predict':700,'temperature':0.3}})
            r.raise_for_status()
            result=Feedback.model_validate_json(r.json()['message']['content'])
            if not any(result.quote in text for text in users):
                raise ValueError('Feedback quote was not grounded in user speech')
            return result
        except (httpx.HTTPError,ValueError,KeyError):
            raise HTTPException(502,'The coach could not produce reliable feedback. Please try again.')

async def transcribe_audio(raw):
    def run():
        global transcriber
        import av
        from faster_whisper import WhisperModel
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
        if transcriber is None:
            transcriber=WhisperModel(os.getenv('WHISPER_MODEL','small.en'),device=os.getenv('WHISPER_DEVICE','cpu'),compute_type='int8',cpu_threads=4)
        segments,_=transcriber.transcribe(waveform,language='en',beam_size=1,vad_filter=True)
        return ' '.join(s.text.strip() for s in segments).strip()[:2000]
    # Wait for the worker thread even on cancellation so another job cannot overlap it.
    task=asyncio.create_task(asyncio.to_thread(run))
    try: return await asyncio.shield(task)
    except asyncio.CancelledError:
        await task
        raise

@app.post('/transcribe',dependencies=[Depends(auth)])
async def transcribe(file:UploadFile=File(...)):
    raw=await file.read(8*1024*1024+1)
    await file.close()
    if not raw or len(raw)>8*1024*1024: raise HTTPException(413,'Use a shorter recording, up to 45 seconds.')
    async with slot():
        try: return {'text':await transcribe_audio(raw)}
        except (ValueError,Exception) as exc:
            # No recording or exception detail is logged or returned to visitors.
            raise HTTPException(422,'Could not transcribe this recording. Try a shorter, clearer message.') from exc

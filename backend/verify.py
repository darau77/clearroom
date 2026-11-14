"""Smoke-test a running gateway without printing its key or conversation content."""
import argparse
import io
import json
import time
import uuid
import wave
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from setup import read_secret


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the gateway credential to a redirect destination.
        return None


class Gateway:
    def __init__(self, url, key):
        parsed = urlsplit(url)
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
            raise ValueError('Use the gateway origin without a path or credentials.')
        if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')):
            raise ValueError('Use HTTPS except for a loopback address.')
        if not parsed.hostname:
            raise ValueError('Missing gateway hostname.')
        self.url = url.rstrip('/')
        self.key = key
        self.opener = build_opener(NoRedirect())

    def request(self, path, data=None, content_type='application/json', authenticated=True, timeout=120):
        headers = {'Content-Type': content_type}
        if authenticated:
            headers['Authorization'] = 'Bearer ' + self.key
        if isinstance(data, dict):
            data = json.dumps(data).encode()
        return self.opener.open(Request(self.url + path, data=data, headers=headers), timeout=timeout)

    def health(self):
        with self.request('/health', timeout=8) as response:
            return json.load(response)


def verify(gateway):
    try:
        with gateway.request('/health', authenticated=False):
            pass
    except HTTPError as exc:
        if exc.code != 401:
            raise RuntimeError('Unauthenticated health check did not return 401.') from None
    else:
        raise RuntimeError('Gateway allowed an unauthenticated request.')
    health = gateway.health()
    if health.get('ready') is not True or health.get('voice') is not True:
        raise RuntimeError('Gateway has not finished warming Qwen and speech transcription.')
    print('PASS authentication, Qwen GPU residency and speech model readiness', flush=True)

    user_text = 'The last two handoffs were late. What got in the way?'
    body = {'scenario': 'deadlines', 'messages': [
        {'role': 'assistant', 'content': 'You wanted to talk?'},
        {'role': 'user', 'content': user_text},
    ]}
    start = time.monotonic()
    first = None
    reply = ''
    done = False
    with gateway.request('/chat', body) as response:
        for raw in response:
            if not raw.strip():
                continue
            event = json.loads(raw)
            if 'error' in event:
                raise RuntimeError('Streaming chat reported a generation error.')
            if event.get('token'):
                first = first if first is not None else time.monotonic() - start
                reply += event['token']
            if event.get('done') is True:
                done = True
    if not done or not reply.strip():
        raise RuntimeError('Chat stream did not produce a complete response.')
    print(f'PASS streaming chat: first text {first:.2f}s, total {time.monotonic() - start:.2f}s', flush=True)
    body['messages'].append({'role': 'assistant', 'content': reply})
    with gateway.request('/feedback', body) as response:
        feedback = json.load(response)
    for field in ('summary', 'quote', 'rewrite', 'next_step'):
        if not isinstance(feedback.get(field), str) or not feedback[field].strip():
            raise RuntimeError('Feedback response is missing a text field.')
    for field in ('strengths', 'improvements'):
        if not isinstance(feedback.get(field), list) or not 1 <= len(feedback[field]) <= 3:
            raise RuntimeError('Feedback response is missing observations.')
    if feedback['quote'] not in user_text:
        raise RuntimeError('Feedback quote was not found in the user message.')
    print('PASS structured feedback and exact user quote', flush=True)

    # Silence checks upload, decoding and the loaded transcription pipeline, not accuracy.
    recording = io.BytesIO()
    with wave.open(recording, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b'\0' * 32000)
    boundary = 'clearroom-' + uuid.uuid4().hex
    multipart = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="silence.wav"\r\n'
                 'Content-Type: audio/wav\r\n\r\n').encode() + recording.getvalue() + f'\r\n--{boundary}--\r\n'.encode()
    with gateway.request('/transcribe', multipart, 'multipart/form-data; boundary=' + boundary) as response:
        transcription = json.load(response)
    if transcription.get('text') != '':
        raise RuntimeError('Silence transcription unexpectedly contained speech.')
    print('PASS audio upload and silence handling; spoken-audio accuracy still needs a microphone test', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    args = parser.parse_args()
    try:
        verify(Gateway(args.url, read_secret()))
    except Exception as exc:
        # URLs/headers may contain secrets; avoid an unrestricted exception dump.
        print('Verification failed:', str(exc) if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__)
        raise SystemExit(1)

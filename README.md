# Clearroom

A web app for rehearsing difficult workplace conversations. Built with React/Vinext and an authenticated FastAPI → Ollama gateway designed for a single 16 GB A4000 on NVIDIA Brev.

## What works now

- Three scenario briefs: missed deadlines, managing a former peer, and teammate conflict.
- Personalization: experience, practice goal, and difficulty.
- Clearly marked sample mode with authored replies and a guided reflection (never represented as AI).
- Live Qwen streaming, grounded structured feedback, and microphone recording/transcript review once the backend is connected.
- Device/browser speech synthesis with mute/stop controls, retryable requests, short recording limits.
- Local browser practice history, repeat attempts, scenario filters, and responsive layouts.

Live inference and audio transcription require a running Brev instance. No AI quality, GPU throughput, or latency results have been measured yet. Browser voices vary. This version has manual stop controls; automatic interruption detection, expressive TTS, and vocal-delivery analysis are not implemented.

## Local development

Requires Node 22.13+ (24 recommended). Use the Sites dependency/build helpers with that Node on PATH, or:

```sh
npm install
npm run dev
npx tsc --noEmit
node --test tests/proxy.test.mjs
```

Without server environment variables, the app is explicitly in sample mode. The worker reads `BREV_API_URL` and `BREV_API_KEY` as server-only environment bindings. For local Cloudflare preview, set them in an ignored `.dev.vars` file. Never put the key in browser code or `NEXT_PUBLIC_` variables. Production values must be set through Sites environment settings.

## Launch the inference backend on Brev

Choose the 1× A4000 / 16 GB GPU / 21 GB RAM / 100 GB SSD Hyperstack instance. The quoted $0.18/hour lasts about 209 hours on $37.65, before additional charges. It has **no stop/start**; terminating it ends compute charges and deletes local state. Keep source backed up.

Copy this project's `backend` directory to the instance. In a terminal on Brev:

```sh
cd backend
nvidia-smi
docker compose version
python3 setup.py
docker compose up -d --build
docker compose exec ollama ollama pull qwen3:8b
docker compose exec ollama ollama show qwen3:8b
```

Confirm `ollama show` reports the expected 8B Q4_K_M quantization. This setup requires Docker Compose with `gpus: all` support and NVIDIA Container Toolkit configured. Ollama itself stays on the internal Docker network. The gateway binds only to `127.0.0.1:8000` on the host.

Warm the speech model (first download takes time):

```sh
docker compose exec api python -c "from faster_whisper import WhisperModel; WhisperModel('small.en',device='cpu',compute_type='int8',cpu_threads=4)"
```

A shared lock processes one model/transcription request at a time, with a three-second queue timeout. Whisper defaults to CPU so it does not compete with Qwen's GPU allocation. The conversation cap is 12 user turns and 24,000 characters. Qwen uses an 8,192-token context and short answers; multilingual token density may require a lower character cap. Start by testing one active session.

## Connect the website

1. Put the gateway behind an HTTPS endpoint that forwards to `127.0.0.1:8000`. Because this instance has fixed ports, an outbound Cloudflare Tunnel is one option. Install `cloudflared` from its official package, then for a temporary development endpoint run `cloudflared tunnel --url http://127.0.0.1:8000`. Keep the process running. The temporary hostname changes on restart. Use a managed tunnel/domain for a stable deployment.
2. Read the generated key from `backend/.env` privately on the server. Set `BREV_API_URL` to the HTTPS origin and `BREV_API_KEY` to the same key in Sites server environment settings. Do not paste it into chat or commit `.env`.
3. Redeploy the Site if its environment settings require it, then click **Your preferences → Check connection**.
4. The status becomes **Qwen connected** only after the authenticated model inventory confirms `qwen3:8b` is present.
5. Test a conversation, its feedback, a 10-second microphone recording, and a cancelled/failed request before inviting other users.

New Sites are private by default. Keep the gateway key secret even when the website is private. Before sharing publicly, add durable per-user/IP quotas at the gateway or edge; the single-process lock bounds concurrency but is not a long-term abuse quota. Keep one Uvicorn worker while relying on the shared lock.

## Backend tests (without GPU or model download)

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install fastapi httpx python-multipart
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

Tests mock the inference transport, not its quality. They cover authentication, history bounds, trusted system prompts, streamed model errors, exact user-quote validation, and the audio endpoint contract.

## Data and privacy

Progress and feedback are saved in localStorage on this device, with a clear-history control. In live mode messages and recordings go through the Site proxy to Brev. Audio is processed in memory and is not intentionally persisted; access logs are disabled for the backend. Browser speech synthesis may use platform-provided remote voices. No vocal emotions, personality, or confidence scores are inferred.

## Next milestones

1. Connect and measure the actual Brev runtime, memory, transcription accuracy, and time to first audio.
2. Add a streaming transcription wrapper and sentence speech queue with playback-aware history.
3. Add automatic interruption detection with echo cancellation and cancellation of stale output.
4. Compare Kokoro/Chatterbox for expressive speech, then add evidence-based delivery measures such as pace and pauses.

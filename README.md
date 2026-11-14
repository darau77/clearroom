# Clearroom

A web app for rehearsing difficult workplace conversations. Built with React/Vinext and an authenticated FastAPI → Ollama gateway for a single 16 GB NVIDIA GPU on Brev. The current deployment target is a T4 with 16 GiB system RAM and four vCPUs.

## What works now

- Avatar calls with three original animated characters, in-call captions, transcript, typed turns, replay/mute/stop, and an optional local-only camera preview. A text-only experience remains available before joining.
- An AI-partner home screen for Alex, Jordan, and Sam, with text/voice conversation entry points.
- Four separate skill-drill modes: missing words, sentence building, response choices, and sentence writing. Each contains three authored exercises, retry feedback, optional examples, and a 15 XP completion reward. Writing checks phrase/length only, not semantic quality.
- Three scenario briefs: missed deadlines, managing a former peer, and teammate conflict.
- Personalization: experience, practice goal, and difficulty.
- Clearly marked sample mode with authored replies and a guided reflection (never represented as AI).
- Live Qwen streaming, grounded structured feedback, and microphone recording/transcript review once the backend is connected.
- Device/browser speech synthesis with mute/stop controls, retryable requests, short recording limits.
- Local browser practice history, repeat attempts, scenario filters, and responsive layouts.

Live inference and audio transcription require a running Brev instance. The T4 backend passed live smoke checks on 14 November 2026: all three partners generated replies and structured feedback, and a synthetic speech sample transcribed correctly. Single warm requests made from the server began returning text in 0.10–0.25 seconds and completed in 1.2–1.8 seconds. A three-second speech sample took 2.74 seconds to transcribe. These small smoke checks are not browser latency, multi-user capacity, or a general AI-quality/accuracy benchmark. Browser voices vary. Avatar mouth animation follows playback state, not phonemes. Camera video stays on the device and is not sent to the server or recorded. The call takes turns: record, review the transcript, and send; it is not a continuous real-time video conversation. This version has manual stop controls; automatic interruption detection, expressive TTS, and vocal-delivery analysis are not implemented.

## Practice rewards

The secondary conversation path has six optional lessons, a daily XP goal (30/60/90), local-calendar streaks, levels, and five persistent effort badges. One or two turns plus a reflection earn 10 XP; three or more earn 30 XP. The first completion of a named path lesson adds 10 XP. Replays do not duplicate that bonus. A streak day requires a completed three-turn practice; yesterday remains current until today ends. Historical best streaks keep earned badges. Sample sessions count as effort, not assessed skill. Existing session history is preserved; old sessions earn base XP but do not imply completion of the new lessons. Drill rewards add to total XP, levels, and daily goals, but never conversation streaks, badges, or path completion. Drill history uses a separate validated browser store; hints and retries do not reduce completion XP. All rewards derive from saved attempts and clear together with history.

Run `node --test tests/*.test.mjs` for reward boundary, date, duplicate, legacy-history, and gateway, drill-answer, and speech cancellation tests.

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

Use one T4 or A4000 with 16 GB VRAM, at least 16 GiB system RAM, four vCPUs, and at least 20 GiB free on Docker's storage volume. The selected AWS T4 environment shows 256 GiB storage and a $0.67/hour quote: $32.16 for 48 hours, leaving $5.46 from the current $37.62 balance before any additional charges. These are the user's dashboard figures, not a guaranteed provider price. Confirm billing and stop/delete behavior in Brev; stopping containers does not stop VM billing.

Wait for the environment to show Running and copy the SSH command from its Access panel. Transfer this project's `backend` source directory without `.env`, `.venv`, or `__pycache__`. On the server, use Python 3.10+ and Docker Compose v2 with the NVIDIA Container Toolkit configured. The T4 needs NVIDIA driver 550 or newer for the pinned Ollama release. The launcher checks hardware and Docker before starting services:

```sh
cd backend
python3 deploy.py --preflight
python3 deploy.py
```

The launcher creates a private `.env` once, starts Ollama, pulls `qwen3:8b-q4_K_M` (approximately 5.2 GB), builds the gateway, and waits for Qwen, its tokenizer, and Whisper to warm up. It then tests authorization, streaming chat, structured feedback, and a silent WAV upload. The key is never printed and survives reruns. Initial image/model downloads can take several minutes. Docker containers restart automatically; the API also attempts to recover if Qwen unloads or restarts.

Ollama is pinned to `0.40.16`; the optional tunnel is pinned to `2026.11.0`. Qwen's tokenizer is pinned to a published model revision. Ollama stays on the internal Docker network. The gateway binds only to `127.0.0.1:8000` on the host. No browser receives its API key.

To repeat the actual runtime tests without rebuilding:

```sh
python3 verify.py
docker compose exec ollama ollama ps
```

A shared lock processes one model/transcription request at a time, with a three-second queue timeout. Whisper `small.en` uses CPU int8 with four threads, leaving GPU memory for Qwen. Qwen uses an 8,192-token context with thinking disabled, up to 180 response tokens for roleplay and 700 for feedback. Requests are checked with Qwen's tokenizer, including space reserved for feedback, as well as limits of 12 user turns and 24,000 characters. Oversized requests are rejected before generation rather than silently dropping conversation history. Start by testing one active session.

Authenticated `/health` returns `ready: true` only after a successful Qwen generation, validation of its quantization, GPU residency and context length, and loading of the tokenizer and voice model. Typical startup phases are `warming_qwen`, `loading_tokenizer`, and `warming_voice`. Failure phases include `model_not_on_gpu`, `wrong_model_format`, and a stage ending in `_failed`. Inspect `docker compose logs --tail 100 api ollama` if startup stalls. The readiness check is not an AI-quality or speech-accuracy benchmark.

Coach input labels the human as MANAGER and the simulated partner as EMPLOYEE. The quote field uses constrained decoding over exact manager excerpts of up to 300 characters. Runtime validation also checks the returned quote against the original manager messages. This prevents employee speech being presented as evidence of the learner's skill; the remaining coaching text still needs human judgment.

## Connect the website

1. For a temporary development endpoint, run `python3 deploy.py --tunnel`. It starts an outbound Cloudflare Quick Tunnel after local tests pass, checks the remote endpoints, and prints its HTTPS origin. All gateway routes require the key. The hostname changes on tunnel restart and Quick Tunnels have no uptime guarantee; use a managed tunnel/domain for a stable deployment. Chat uses newline-delimited JSON, not SSE. Streaming latency through the tunnel must still be measured on the live host.
2. Read the generated key from `backend/.env` privately on the server. Set `BREV_API_URL` to the HTTPS origin and `BREV_API_KEY` to the same key in Sites server environment settings. Do not paste it into chat or commit `.env`.
3. Redeploy the Site if its environment settings require it, then click **Your preferences → Check connection**.
4. The status becomes **Qwen connected** only after authenticated readiness checks confirm that Qwen is loaded on the GPU and voice transcription has initialized.
5. Test a conversation, its feedback, a 10-second microphone recording, and a cancelled/failed request before inviting other users.

New Sites are private by default. Keep the gateway key secret even when the website is private. Before sharing publicly, add durable per-user/IP quotas at the gateway or edge; the single-process lock bounds concurrency but is not a long-term abuse quota. Keep one Uvicorn worker while relying on the shared lock.

## Backend tests (without GPU or model download)

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install fastapi httpx python-multipart
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

Tests mock inference and tokenization, not their quality. They cover authentication, startup readiness, GPU residency, context reservation, history bounds, trusted system prompts, incomplete streams, exact user-quote validation, private idempotent key creation, and the audio endpoint contract. `verify.py` must also pass on the actual GPU server, followed by a spoken-audio and browser call test.

## Data and privacy

Progress and feedback are saved in localStorage on this device, with a clear-history control. In live mode messages and recordings go through the Site proxy to Brev. Audio is processed in memory and is not intentionally persisted; access logs are disabled for the backend. Browser speech synthesis may use platform-provided remote voices. No vocal emotions, personality, or confidence scores are inferred.

## Next milestones

1. Measure microphone accuracy, browser time to first audio, and behavior with simultaneous visitors; the current single-server smoke checks are only a starting point.
2. Add a streaming transcription wrapper and sentence speech queue with playback-aware history.
3. Add automatic interruption detection with echo cancellation and cancellation of stale output.
4. Compare Kokoro/Chatterbox for expressive speech, then add evidence-based delivery measures such as pace and pauses.

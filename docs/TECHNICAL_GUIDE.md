# Clearroom · Technical guide

[← Project overview](../README.md) · [Open the live project](https://clearroom-beta.vercel.app/)

Deployment, implementation details, and operating notes for the current prototype.

A web app for rehearsing difficult conversations at work and in personal relationships. The public website runs as a standard Next.js app on Vercel, with an authenticated FastAPI → Ollama gateway on Brev. No ChatGPT account or visitor sign-in is needed. Qwen runs on a T4 with 16 GiB system RAM and four vCPUs.

**Public submission URL: [clearroom-beta.vercel.app](https://clearroom-beta.vercel.app/).** Anonymous checks on 14 November 2026 covered the homepage, live readiness, Qwen replies, coaching feedback, and synthetic audio transcription. Avatar calls and chats use the same inference backend. Keep the Brev instance and its current tunnel running throughout judging; the Vercel website alone cannot provide live inference.

## What works now

- Avatar calls with three original animated characters, in-call captions, transcript, typed turns, replay/mute/stop, and an optional local-only camera preview. A text-only experience remains available before joining.
- An AI-partner home screen for Alex, Jordan, and Sam, with text/voice conversation entry points.
- A 120-question bank across six communication skills, arranged into 24 lessons. Each lesson selects three questions in one of four modes: missing words, response choices, sentence building, or writing. All four modes also support optional Qwen-generated variations for the chosen partner and situation, with structural checks and a separate model review.
- Meaning-based Qwen checks for writing, with an explicit self-review option when AI is unavailable. Missed or hinted questions return during the lesson; saved outcomes determine later review. The selected partner acts as an animated practice guide, with optional original sound cues and a 15 XP completion reward.
- Three scenario briefs: missed deadlines, managing a former peer, and teammate conflict.
- Personalization: experience, practice goal, and difficulty.
- Generated openings and every partner reply from live Qwen; explicit AI-unavailable state when disconnected. Authored drills remain separate and work without the AI backend.
- Two-pass Qwen checks for speaker/task ownership and requested language before displaying a reply. Coaching audits the full transcript for actions already completed.
- Device/browser speech synthesis with mute/stop controls, retryable requests, short recording limits.
- Resumable drafts, full saved reflections/transcripts, real screen URLs, Back/Forward navigation, synchronized browser tabs, and optional same-partner memory (off by default).

Live inference and audio transcription require a running Brev instance. Recent checks on the Qwen3 14B deployment produced warm checked replies in about 8–10 seconds. Two public coaching checks after the rewrite update took about 53–55 seconds. These are individual observations, not latency or capacity guarantees. Language and task-ownership checks have exercised multilingual replies and preserved learner/partner assignments. The gateway bounds its queue and returns HTTP 429 with Retry-After when busy; sustained multi-user capacity still needs measurement.

Multilingual Whisper small uses automatic language detection or a selected language. A synthetic Russian sample detected Russian in both modes and transcribed in about 3.7–6.1 seconds, with a minor word/spacing error. Users review transcripts before sending. Device speech uses matching installed voices; missing voices produce an explicit notice and captions remain available. Browser voices vary. Avatar animation follows playback state, not phonemes. Camera video stays on the device. Calls take turns: record, review, send; automatic interruptions, expressive TTS, and vocal-delivery analysis are not implemented.

## Custom partners and practice trail

**AI partners → Create your own partner** saves up to 12 fictional characters on this browser. Set a name, role, relationship, personality, situation, conversation goal, optional opening, and avatar appearance. Edit or remove a partner from their card, then choose Chat or Avatar call. Both experiences send the validated character background to the same Qwen backend. All AI partners require a live connection; authored skill drills remain available without the AI backend. The avatar is animated, with optional device speech and a local camera preview, not a real person's video feed.

IndexedDB `clearroom.practice` stores partners, immutable completed attempts, drafts, and preferences in per-record transactions. Legacy localStorage collections migrate once. BroadcastChannel synchronizes open tabs; stale profile edits are rejected and conflicting conversation drafts are forked rather than overwritten. Clearing practice invalidates older in-flight draft saves. Completed reflections store a title snapshot, so they remain identifiable if a partner is edited or deleted. Clear practice history resets rewards and reflections while keeping partner profiles. The API accepts a bounded `custom_partner` object only with `scenario: custom`; character fields are treated as untrusted story data rather than authority to change the instructions, and count toward the token budget. Custom coaching labels the user LEARNER and character PARTNER without assuming a manager/employee relationship. Custom conversations earn normal effort rewards but do not complete built-in scenario lessons or the three-scenario explorer badge.

**Practice trail** contains six units: observations, curiosity, empathy, boundaries, agreements, and repair. Each unit progresses through missing words, choosing a response, building a sentence, and writing independently. All 24 lessons are available from the start and can be completed in any order. The trail suggests the first unfinished lesson, and completed lessons remain available for replay. Each bank lesson selects three unique questions, preferring unseen material near the lesson's level. A due question from another skill can be included for review. Free practice supports any skill, all four modes, and three challenge levels.

Incorrect answers and first-pass answers completed with hints return after the other questions. The lesson finishes only after all three questions are resolved. Writing uses the question's specific goal and rubric rather than a required opening phrase. When connected, Qwen assesses the meaning and validates its quoted evidence against the submitted answer. If AI is unavailable, the learner can explicitly compare their response with the goal and example, then mark it as self-reviewed. Self-review earns effort XP but is not counted as a verified first-try answer.

Completed outcomes record attempts, hints, assessment type, and first-try success. Difficult, hinted, and self-reviewed material is due again after four hours; consecutive unaided first-try successes use intervals of one, three, seven, then fourteen days. Review prioritizes due material and includes valid locally saved Qwen questions. These are transparent scheduling rules, not a measurement of real-world communication ability. Unfinished drill lessons warn before leaving; unlike conversation drafts, their in-progress answers are not saved for resumption.

The selected partner appears as the lesson guide. Original Web Audio tones accompany taps, correct answers, retries, and completion. Sound can be muted, the preference is saved locally, and visual feedback remains usable if the browser blocks audio. Focus moves to the current lesson/question heading, and animations follow the app's reduced-motion styles.

## Question bank and exercise generation

[`backend/data/drill-bank.json`](../backend/data/drill-bank.json) is the canonical, versioned source for both browser practice and the backend's SQLite reference database. It contains five original questions for every skill/mode combination, with contexts spanning work, friends, family, roommates, and clients. The maintained bank is currently English; Qwen variations use the selected language and situation.

The backend lazily seeds or refreshes SQLite from the JSON digest when retrieving references. `CLEARROOM_QUESTION_BANK_DB` controls the path; Docker Compose stores it at `/data/question-bank.sqlite3` on the persistent `usage` volume. Without an override, the database is created beside the JSON file. This database contains only authored reference content, not learner responses or generated questions.

Each generation request retrieves three examples matching the requested skill and mode, preferring unseen IDs and nearby difficulty. Qwen creates three variations using those references, the partner/situation, and bounded recent prompts to avoid. The server constructs shuffled word banks and option ordering, validates the output format and language, and asks a separate model pass to check the task, roles, facts, and answer. Choice questions must have exactly one independently identified best option. Failed questions receive one bounded retry; an unsuccessful request exposes an error and an explicit question-bank fallback. Automated checks reduce mistakes but cannot guarantee pedagogical quality or unique meanings.

See [Practice design](PRACTICE_DESIGN.md) for the authoring contract, validation pipeline, review schedule, privacy boundaries, and focused test commands.

## Practice rewards

The secondary conversation path has six optional lessons, a daily XP goal (30/60/90), local-calendar streaks, levels, and five persistent effort badges. One or two turns plus a reflection earn 10 XP; three or more earn 30 XP. The first completion of a named path lesson adds 10 XP. Replays do not duplicate that bonus. A streak day requires a completed three-turn practice; yesterday remains current until today ends. Historical best streaks keep earned badges. Sample sessions count as effort, not assessed skill. Existing session history is preserved; old sessions earn base XP but do not imply completion of the new lessons. Drill rewards add to total XP, levels, daily goals, and drill trophies, but never conversation streaks, conversation badges, or conversation-path completion. Drill history uses a separate validated browser store. All rewards derive from saved attempts and clear together with history.

Each completed three-question drill earns 15 XP, with no extra trophy XP; hints, retries, and explicit self-review still count. Completing one, three, or five attempts in a mode earns its bronze, silver, or gold trophy. Completing those thresholds in all four modes earns the corresponding practice trophy. Trophies use validated, deduplicated history and appear on the trail, completion screen, and My progress. The 24-lesson course separately tracks matching course completions; legacy attempts and free practice preserve rewards without automatically completing course lessons.

Run `node --test tests/*.test.mjs` for reward boundaries, date/duplicate/legacy history, bank integrity, course completion tracking, review scheduling, drill outcomes, gateway behavior, and speech cancellation tests.

## Local development

Requires Node 22.13+ (24 recommended):

```sh
npm ci
npm run dev
npm run build
node --test tests/*.test.mjs
```

Without server environment variables, the app shows AI unavailable. Next.js route handlers read `BREV_API_URL` and `BREV_API_KEY` from server environment variables. For local testing, set them in an ignored `.env.local` file. Never put the key in browser code or `NEXT_PUBLIC_` variables. Production values belong in the hosting provider's environment settings. Vercel handles `/api/status` and `/api/engine/*` on Node.js; the client requires the final NDJSON completion signal before committing or speaking a reply. The gateway returns text only after both model passes complete. Audio uploads are limited to 4 MiB, below Vercel's 4.5 MB function payload limit.

The production build uses Webpack because the local environment blocks a subprocess port required by Turbopack's CSS compiler. `web.Dockerfile` also builds a standalone Node server for optional self-hosting; its runtime receives the same server-only environment variables. The legacy Sites/Vinext files are unused by the standard Next.js build and are not required to run the website.

## Deploy the public website on Vercel

The owner signs in to the Vercel CLI once. Jury members use the production URL without accounts. The project uses Next.js, Node 24, and the `iad1` function region near the Brev server.

```sh
vercel link --project clearroom --scope darau77s-projects
vercel env add BREV_API_URL --environment production --no-sensitive
vercel env add BREV_API_KEY --environment production --sensitive
vercel deploy --prod
```

Enter environment values at the private prompt or via stdin, not in shell arguments. Use the stable production alias for the submission, not a protected preview URL. Check the production home page and `/api/status` without cookies or authorization headers; a successful owner-browser visit alone does not prove public access. No paid plan upgrade is required by this configuration.

## Launch the inference backend on Brev

Use one T4 or A4000 with 16 GB VRAM, at least 16 GiB system RAM, four vCPUs, and at least 20 GiB free on Docker's storage volume. The current deployment uses an AWS T4 environment with 256 GiB storage. Check the provider dashboard for current pricing, remaining credit, and stop/delete behavior; stopping containers does not stop VM billing.

Wait for the environment to show Running and copy the SSH command from its Access panel. Transfer this project's `backend` source directory without `.env`, `.venv`, or `__pycache__`. On the server, use Python 3.10+ and Docker Compose v2 with the NVIDIA Container Toolkit configured. The T4 needs NVIDIA driver 550 or newer for the pinned Ollama release. The launcher checks hardware and Docker before starting services:

```sh
cd backend
python3 deploy.py --preflight
python3 deploy.py
```

The launcher creates a private `.env` once, starts Ollama, pulls `qwen3:14b-q4_K_M` (approximately 9.3 GB), builds the gateway, and waits for Qwen, its tokenizer, and Whisper to warm up. It then tests authorization, streaming chat, structured feedback, and a silent WAV upload. The key is never printed and survives reruns. Initial image/model downloads can take several minutes. Docker containers restart automatically; the API also attempts to recover if Qwen unloads or restarts.

Ollama is pinned to `0.40.16`; the optional tunnel is pinned to `2026.11.0`. Qwen's tokenizer is pinned to a published model revision. Ollama stays on the internal Docker network. The gateway binds only to `127.0.0.1:8000` on the host. No browser receives its API key.

To repeat the actual runtime tests without rebuilding:

```sh
python3 verify.py
docker compose exec ollama ollama ps
```

One inference worker admits at most four active/queued jobs in FIFO order with a 45-second queue timeout. Extra or timed-out jobs receive 429 plus Retry-After; the client preserves the input for retry. Keep one Uvicorn worker. Whisper `small` uses CPU int8 with four threads, leaving GPU memory for Qwen. Qwen uses an 8,192-token context with thinking disabled. Replies use structured planning and review passes with 950/800 token ceilings. Coaching generates and audits a draft (up to 1,600 tokens per pass), checks whether its proposed refinement is new (450 tokens), then writes an example demonstrating that refinement (850 tokens). Bounded repair, translation, or a no-gap fallback may add calls. Every strength cites validated learner evidence. Each improvement acknowledges what the learner already did; the rewrite combines that preserved intent with actual words for the new action. If the action was already performed, the report removes the criticism and acknowledges what works. All model calls count the full serialized context and schema before inference. Conversations remain limited to 12 learner turns and 24,000 characters. Oversized context returns an explicit error; history is not silently truncated. Optional memory supplies up to ten messages from the last two saved sessions with that partner, clearly separated from the current transcript.

Authenticated `/health` returns `ready: true` only after a successful Qwen generation, validation of its quantization, GPU residency and context length, and loading of the tokenizer and voice model. Typical startup phases are `warming_qwen`, `loading_tokenizer`, and `warming_voice`. Failure phases include `model_not_on_gpu`, `wrong_model_format`, and a stage ending in `_failed`. Inspect `docker compose logs --tail 100 api ollama` if startup stalls. The readiness check is not an AI-quality or speech-accuracy benchmark.

Both reply and coach context label the human LEARNER and the simulated partner PARTNER with immutable turn numbers. The coach audits the complete transcript, including final agreements, before returning advice. The quote field uses constrained decoding over exact learner excerpts of up to 300 characters. Runtime validation also checks the returned quote against the original learner messages. This prevents partner speech being presented as evidence of the learner's skill; the remaining coaching text still needs human judgment.

## Connect the website

1. For a temporary development endpoint, run `python3 deploy.py --tunnel`. It starts an outbound Cloudflare Quick Tunnel after local tests pass, checks the remote endpoints, and prints its HTTPS origin. All gateway routes require the key. The hostname changes on tunnel restart and Quick Tunnels have no uptime guarantee; use a managed tunnel/domain for a stable deployment. Chat uses newline-delimited JSON, not SSE. Latency varies with workload and tunnel conditions; measure it again after infrastructure changes.
2. Read the generated key from `backend/.env` privately on the server. Set `BREV_API_URL` to the HTTPS origin and `BREV_API_KEY` to the same key in Vercel's production environment. Do not paste it into chat or commit `.env`. After restarting a Quick Tunnel, update `BREV_API_URL` to its new hostname and redeploy Vercel so the website uses the new value; a running VM alone does not restore an expired tunnel URL.

The website retries an unavailable connection every 15 seconds and rechecks when the browser regains focus or network access. It pauses automatic checks during a conversation request and keeps the current conversation intact. Settings also provides a manual connection check. These retries recover from warm-up and temporary outages; they cannot discover a changed tunnel hostname.
3. Redeploy the website after environment changes, then click **Your preferences → Check connection**.
4. The status becomes **Qwen connected** only after authenticated readiness checks confirm that Qwen is loaded on the GPU and voice transcription has initialized.
5. Test a conversation, its feedback, a 10-second microphone recording, and a cancelled/failed request before inviting other users.

The website is public; the inference gateway still requires its secret key. SQLite counters on a Docker volume enforce shared ceilings of 60 authenticated inference requests per minute and 1,000 per UTC day across openings, chat, feedback, transcription, exercise generation and assessment. These counters survive API-container restarts and store no visitor identities or transcripts. These are global demo limits, not per-person guarantees: heavy use can consume the shared allowance. The single-process lock also limits concurrent GPU/transcription work. Keep one Uvicorn worker while relying on that lock. Health checks do not consume the allowance.

## Backend tests (without GPU or model download)

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install fastapi httpx python-multipart
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

Tests mock inference and tokenization, not their quality. They cover authentication, startup readiness, GPU residency, context reservation, history bounds, trusted system prompts, incomplete streams, exact user-quote validation, private idempotent key creation, and the audio endpoint contract. Exercise tests also cover SQLite seeding/retrieval, format validation, answer review, role preservation, duplicate rejection, and writing assessment. `verify.py` must also pass on the actual GPU server, followed by spoken-audio, browser call, and live exercise checks.

## Data and privacy

Progress, complete feedback, transcripts, custom profiles, drafts, completed drill questions/outcomes, and the sound preference are saved in IndexedDB on this browser. Practice history has a clear-history control. Records synchronize across tabs on the same origin, not between devices. Memory is opt-in and clearing history removes its source transcripts. In live mode messages and recordings go through the Vercel server to Brev. Qwen exercise requests also send the selected partner/situation, recent question IDs, and bounded recent prompt snippets; writing checks send the response and assessment context. The shared question bank stores only authored content. Generated questions remain in the browser's completed practice records and are not inserted into the shared bank. Audio is processed in memory and is not intentionally persisted; access logs are disabled for the backend. Browser speech synthesis may use platform-provided remote voices. No vocal emotions, personality, or confidence scores are inferred.

## Next milestones

1. Measure microphone accuracy, browser time to first audio, and behavior with simultaneous visitors; the current single-server smoke checks are only a starting point.
2. Add a streaming transcription wrapper and sentence speech queue with playback-aware history.
3. Add automatic interruption detection with echo cancellation and cancellation of stale output.
4. Compare Kokoro/Chatterbox for expressive speech, then add evidence-based delivery measures such as pace and pauses.

### Dialogue quality checks

The actor receives native conversation turns with an explicit character identity, the human's separate goal, and the situation viewpoint. Qwen plans the character position and latest conversational need, then a second pass keeps or repairs the reply. Repeated substantive lines, cosmetic copies, wrong-language output, and flagged-but-unchanged reviews trigger one bounded regeneration; failed attempts return a retryable error rather than canned dialogue. Short confirmations, requested repetition, and meaningful owner/date/name corrections remain allowed.

The T4 preset uses Qwen3 14B Q4_K_M, an 8,192-token context, and one inference worker. The measured 14B model fits fully on the 16 GB T4. Sampling follows [Qwen's non-thinking guidance](https://huggingface.co/Qwen/Qwen3-14B#best-practices); the actor adds a mild repeat penalty. Quality checks reduce model mistakes but do not guarantee perfect factual or conversational judgment.

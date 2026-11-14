# Clearroom · Practice design

[← Project overview](../README.md) · [Technical guide](TECHNICAL_GUIDE.md)

Clearroom combines a maintained bank of **120 original questions** with optional Qwen variations. The bank supports immediate practice without model generation and supplies examples for Qwen. Completed outcomes determine what returns for review.

## Course structure

| Unit | Communication goal |
| --- | --- |
| Observations | Describe what happened without guessing a motive. |
| Curiosity | Ask a useful question before assuming an explanation. |
| Empathy | Acknowledge the other person's stated experience. |
| Boundaries | State a limit and a feasible next step. |
| Agreements | Keep owners, actions, timing, and consent clear. |
| Repair | Acknowledge a misstep and make a specific correction. |

Each unit has four lessons in order: **missing words → choose a response → build a sentence → write a response**. That makes 24 lessons, each containing three distinct questions. Completing a lesson unlocks the next; replaying one does not complete a different lesson. Free practice lets the learner choose any skill, format, and challenge level. Earlier drill history keeps its XP and trophies without implying completion of this course.

The bank has five questions for each skill/format pair, spread across levels 1–3. Selection prefers unseen questions near the requested level, then rotates through previously seen questions. A course lesson can include one due question of the same format from another skill. Review sessions prioritize due questions, then difficult material, then other seen questions; new questions can fill the remaining places. The options and word tiles are shuffled without modifying the shared bank.

## Design references

Duolingo describes starting with supported pattern recognition, then progressing toward applying the skill in harder contexts. Clearroom uses that broad progression for its four exercise formats. [Duolingo teaching method](https://blog.duolingo.com/duolingo-teaching-method/).

Duolingo's lesson-creation article describes curriculum goals, authored examples, fixed exercise constraints, variable prompts, and expert editing of generated content. Clearroom uses an authored reference bank and constrained generation; its live variations receive automated checks, not individual review by a teaching expert. [How Duolingo uses language models to create lessons](https://blog.duolingo.com/large-language-model-duolingo-lessons/).

Duolingo also describes returning to mistakes after other lesson items and spacing later reviews according to difficulty and accuracy. Clearroom uses a small, explicit schedule below. [Duolingo on spaced repetition](https://blog.duolingo.com/spaced-repetition-for-learning/).

These are public design references. Clearroom does not reproduce Duolingo's proprietary personalization algorithms, content, characters, or sound assets. The course and scheduling rules are prototype design choices; their effect on real-world communication has not been measured.

## Authoring the bank

The source of truth is [`backend/data/drill-bank.json`](../backend/data/drill-bank.json). The browser imports it directly, and the backend materializes its reference database from the same file. Edit the JSON rather than editing SQLite rows.

The top-level object contains `version`, `units`, and `questions`. Each unit has `id`, `title`, `description`, `tip`, and `color`. The six IDs are `observations`, `curiosity`, `empathy`, `boundaries`, `agreements`, and `repair`; supported visual colors are `green`, `blue`, `purple`, and `peach`.

Every question needs a stable `id`, `skill`, `kind`, `level`, `context`, `prompt`, `answer`, `explanation`, `hint`, and `rubric`. For example, this writing question is in the maintained bank:

```json
{
  "id": "agreements-write-01",
  "skill": "agreements",
  "kind": "write",
  "level": 1,
  "context": "You have agreed to compare hotels by 6:00, and your friend has agreed to check flights by 5:00.",
  "prompt": "Confirm both tasks and their deadlines without changing who owns them.",
  "answer": "I will compare hotels by six, and you will check flight prices by five.",
  "explanation": "The confirmation preserves the two owners and the two different deadlines.",
  "hint": "Check every I and you against the agreement.",
  "rubric": "Keep hotel comparison with the learner by six and flight checking with the friend by five; do not add a booking commitment.",
  "minWords": 6
}
```

Use these rules when adding or revising questions:

- **A specific moment and goal.** Include enough context to solve the task. Preserve who agreed to do what, and distinguish a proposal from an accepted commitment. Mix workplace and personal relationships.
- **Missing words (`blank`).** Put exactly one `___` in the prompt. Supply three distinct, grammatically valid `options`, with the exact `answer` included once. Only one should best satisfy the stated goal.
- **Response choices (`choose`).** Use three plausible responses with different consequences. Avoid cartoon insults or making the best response consistently the longest. `optionFeedback` maps every exact option string to feedback about that choice.
- **Sentence building (`build`).** `words` must be the exact multiset of whitespace-separated tokens in `answer`, including punctuation, shuffled out of answer order. Optional `acceptedAnswers` must be genuinely valid alternatives.
- **Writing (`write`).** The `rubric` describes the meaning to achieve. The example answer is one possibility, not a required phrase. Set a reasonable `minWords` readiness threshold; length alone never establishes that the meaning is correct.
- **Useful support.** The hint points toward the concept without revealing the full answer. The explanation connects the response to its purpose. Keep wording short enough for a small screen.

Keep existing IDs stable for revisions that preserve the task's meaning. Use a new ID for a genuinely different task, so saved outcomes do not transfer accidentally. Increment the bank version when publishing a revised edition. When intentionally expanding the bank, update the explicit count/coverage assertions in its tests and the published counts in the interface/documentation.

## SQLite reference retrieval

[`backend/question_bank.py`](../backend/question_bank.py) uses Python's standard-library SQLite support. On reference retrieval it checks the JSON, computes its SHA-256 digest, and atomically replaces the authored rows if that digest changed. The `authored_questions` table indexes `skill`, `kind`, and `level`; `bank_meta` stores the digest, version, and unit metadata.

`CLEARROOM_QUESTION_BANK_DB` selects the database path. The default is `backend/data/drill-bank.sqlite3`. Docker Compose uses `/data/question-bank.sqlite3` on the existing persistent `usage` volume.

A generation request retrieves three examples matching the selected skill and format, preferring IDs the learner has not recently seen and then nearby levels. Already-seen examples may still be used when necessary: they teach Qwen the structure of a new question. The shared database stores only the checked-in authored bank. It does not collect learner answers, custom partners, or generated questions.

## Creating a Qwen variation

All four formats use [`backend/exercises.py`](../backend/exercises.py):

1. Retrieve three reference questions. Include the selected skill, difficulty, language, partner/situation, and bounded recent prompts to avoid.
2. Generate one question at a time. Each of the three questions receives a different action within the selected skill. Prompts preserve the human learner's role and existing task owners; any new hypothetical moment must be stated in the exercise context.
3. Assign a content-derived ID and the requested classification. The server creates/shuffles word tiles. Choice generation follows the bank's format: three options containing the exact answer once and two distractors, then shuffled by the server.
4. Check the schema, requested language, blank count, option uniqueness, exact word-token inventory, hints, and repeated content. Copy and similarity checks help reduce repetition but do not prove semantic novelty.
5. Ask a separate Qwen pass to review the goal, learner role, facts, and usefulness. For choice tasks, it solves the displayed options without being told the marked answer. Exactly one accepted option must match the intended answer. Generated exercises retain their answer explanation; reviewer feedback for individual options is not displayed because live checks found ordering mistakes. The authored bank retains its curated per-option feedback. For building/writing, the review checks the example against the goal.
6. Retry a rejected question once with the failure reason. If it still fails, return an error. The interface offers an explicit question-bank fallback; it does not label authored material as generated AI output.

The browser additionally validates that the response contains three distinct questions of the requested format. Generated questions are available for later review only after a completed lesson saves their validated snapshots locally. Automated review can still miss ambiguity, weak teaching goals, or factual mistakes; live model checks remain necessary.

Generation has a 125-second deadline after entering the inference queue. Queue waiting is bounded separately at 45 seconds, keeping the request within the website's 180-second limit. A timeout releases the queue and returns a retryable error; bank practice remains available immediately.

## Answers, retries, and review

Choice and building tasks compare against the canonical answer or accepted alternatives after punctuation/case/spacing normalization. Wrong choices use their specific feedback. Writing first passes a basic readiness check, then Qwen assesses meaning against the context and rubric. Successful model feedback must include an exact excerpt from the learner's answer.

When writing assessment is unavailable, the learner can explicitly compare their response against the goal and example and mark it as self-reviewed. That earns effort credit while remaining distinct from AI assessment. It never counts as an unaided, checked first-try success.

Wrong answers and answers completed with hints on the first pass are queued again after the remaining questions. All three questions must be resolved before saving the lesson and awarding 15 XP. Saved outcomes record question ID, skill, attempt count, hint use, first-try success, assessment type, and resolution. The record also keeps the three question snapshots, lesson identity, source, and completion date.

The scheduler in [`lib/drill-course.ts`](../lib/drill-course.ts) uses elapsed time since the latest completed attempt on each question:

| Latest outcome | Next due interval |
| --- | --- |
| Missed, used support, or self-reviewed | 4 hours; reset the success streak |
| First consecutive unaided first-try success | 1 day |
| Second consecutive unaided first-try success | 3 days |
| Third consecutive unaided first-try success | 7 days |
| Fourth and later consecutive unaided first-try successes | 14 days |

“Unaided first-try success” requires a rule or AI assessment and no hint. The schedule does not estimate a person's confidence or communication ability. Invalid, duplicate, and future-dated session records do not drive course progress or review scheduling. Trophies reward completed practice counts separately from course unlocks and question review.

## Guide, audio, and accessibility

[`components/drill-guide.tsx`](../components/drill-guide.tsx) reuses the selected partner's avatar, including a custom appearance, with ready, thinking, and happy states. It supplies encouragement and a completion celebration. The animation represents the exercise state, not facial or emotional analysis.

[`lib/drill-sounds.ts`](../lib/drill-sounds.ts) synthesizes original sine-wave cues with Web Audio for taps, correct answers, retries, and completion. There are no downloaded sound recordings. Audio starts in response to interaction, can be muted, and fails quietly when unavailable; text and visual feedback remain. The preference persists locally. Practice headings receive keyboard focus as the lesson changes, and the app's reduced-motion styles limit animation.

## Privacy and persistence

Completed questions, outcomes, and preferences stay in the browser's IndexedDB store and synchronize across tabs on that origin. They do not sync between devices. Generated questions are not added to the shared bank. In-progress drill answers are held in the open page; leaving warns that the incomplete attempt will not earn XP. Conversation drafts have a separate resumable flow.

Qwen generation sends the selected partner/situation through the website's server to Brev, along with up to 60 recent question IDs and six recent context/prompt snippets of up to 500 characters each. Writing assessment sends the answer and question context. The question-bank database does not persist these inputs. Completed drill records store question snapshots and outcomes, not the learner's submitted writing. See the [data and privacy notes](TECHNICAL_GUIDE.md#data-and-privacy) for the wider conversation and voice flows.

## Checks and maintenance

From the repository root, using Node 24:

```sh
node --test tests/question-bank.test.mjs tests/drill-course.test.mjs tests/drills.test.mjs
```

After the [backend test environment](TECHNICAL_GUIDE.md#backend-tests-without-gpu-or-model-download) is installed:

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -p 'test_question_bank.py'
.venv/bin/python -m unittest discover -s tests -p 'test_exercises.py'
```

The bank tests check coverage, unique IDs, content constraints, option feedback, word inventories, and role-sensitive examples. Course tests cover unlocks, legacy history, selection, immutable shuffling, review intervals, saved AI-question validation, and malformed generated lessons. Backend tests exercise retrieval and mock the generation/review/assessment contracts. Passing these tests does not establish the live model's teaching quality.

Before publishing prompt or bank changes, try all four formats on the real backend, with both personal and workplace situations. Check a correct writing response and an unrelated one, then inspect language, roles, commitments, choices, retry feedback, and the explicit unavailable/self-review paths. Deploy the browser and backend together when their shared question contract changes.

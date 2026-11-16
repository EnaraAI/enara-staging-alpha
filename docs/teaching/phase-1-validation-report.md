# Phase 1 Validation Report: Language Teaching Context Engine (`ltc-v1`)

Date: 2026-11-07. Status: **IMPLEMENTED**. Code, tests and docs are complete, and the paid staging evaluation (Step E) is **LIVE-PROVIDER-VERIFIED** (section 4) after the owner authorised the spend and an unpromoted deployment.

## 1. Repository state

| Item | Value |
|---|---|
| Repository | `EnaraAI/enara-staging-alpha`, local working copy |
| Branch / HEAD | `claude/codebase-review-kbxqan` at `fc6a487`. Unchanged: nothing was committed, pushed, fetched, rebased or stashed |
| Working tree | All Phase 1 changes are uncommitted edits. The untracked `backend/localdemo.tmp.ts` (a local demo server script from earlier work) was there before Phase 1 and was left as it was |
| Deployment / configuration | **Unpromoted staging deployments only, for the evaluation:** `enara-staging-alpha-g702327d5` and then `enara-staging-alpha-kmwojrefc`, both with no domain, owner-approved. test.enara.app was not changed (it still serves the same frontend build, `index-YzMSM4Jn.js`). No DNS change, environment-variable change or migration. The staging demo **template** was rebuilt so its sample lessons carry the new specs; it is synthetic data |

## 2. Tests run

All commands were run from `backend/`.

| Check | Command | Before Phase 1 (baseline) | After Phase 1 |
|---|---|---|---|
| Type check | `npx tsc --noEmit -p .` | exit 0 | exit 0 |
| Full backend suite | `TMPDIR=<scratch> npx vitest run --no-file-parallelism` | 103 files; **1283 passed, 16 failed** | 104 files; **1313 passed, 16 failed** |
| New tests | `npx vitest run test/languageTeachingContext.test.ts` | — | **31 passed** (30, plus 1 regression test added after the live run) |
| Tutor-related suites after the live-run fixes | languageTeachingContext, p20TutorStream, p21Orchestrator, avatar, demoPortal, vendorNeutral, directTutorModel, p0cMetering | — | **139 passed**, 8 files |

**Failures compared with the baseline:** after Phase 1 the failing test files and failing test names are identical to the baseline, checked with `diff` of the two lists. The 30 extra passes are the new tests. The 16 pre-existing failures are in 11 files:

- `elie.e2e`, `elie.sprint4`;
- `p14_2GradingTestSpend`, `p14_8BlockerFixes`;
- `p19Resilience`, `p20QueryBudget`;
- `p2Documents`, `p3EducatorChat`;
- `phase0`, `phase3.autograding`, `phase3.e2e`.

These failures were present before any Phase 1 change. Phase 1 did not try to fix them.

**Related suites that still pass after the change:**

| Suite | Tests |
|---|---|
| `avatar` | 38 |
| `p20TutorStream` | 3 |
| `p21Orchestrator` | 33 |
| `vendorNeutral` | 2 |
| `demoPortal` | 8 |
| `directTutorModel` | full file passes |

### What the new tests cover (`test/languageTeachingContext.test.ts`)

**Context correctness (LTC-D1, D8)**
- A course level is stored as `inferred: course_level`, never `known`. With no level it is `unknown`.
- With one configured language the target language is `known`. With several or none it is `unknown`. Arabic becomes "Arabic (Modern Standard)".
- The learner's own language is `inferred` only from Arabic in their messages, including mixed messages; otherwise `unknown`.
- Age band: `known` from the school's adult-learners setting or a recorded grade; otherwise `unknown`, and then not sent.
- Mastery status from the existing evidence model passes through unchanged.
- Lesson specs are cleaned and capped. A missing spec gives an `unstructured` lesson; no lesson gives `none`.

**Teaching behaviour (move selection)**
- A true beginner asking for meaning gets a short explanation, comprehensible input and a check.
- An advanced or proficient learner gets reduced support and independent practice, without beginner explanations.
- Answering a check question triggers specific feedback with a retry, prompt-first for beginners.
- Under a "hints only" policy, an answer request gets a hint, never the answer.
- When allowed, a direct answer stays available, together with the reasoning and a follow-up item.
- Repeated confusion leads to reteaching in a simpler way, not to more questioning.
- Beginners writing in Arabic in an English course get brief Arabic support. Arabic courses don't.
- A vague message asks for the learner's goal. A first turn with a lesson spec activates prior knowledge.
- Every move cites a ledger entry, and the test checks the entry exists in `docs/teaching/phase-1-evidence-ledger.md`.

**Prompt**
- The level is labelled an estimate, and the tutor is told never to tell the learner their level.
- Course facts are kept apart from the tutor's own examples.
- The tutor is told a text chat is not listening or speaking practice.

**Evidence record**
- The record is minimal: `masteryClaim: false`, confidence `low`, provenance `deterministic_turn_signals`.
- It does not copy the learner's text.
- No `StudentObjectiveMastery` record is created by a tutor turn.

**Through the real routes (in-memory MongoDB; model SDK mocked to capture the request)**
- On a language course, the model gets the labelled context and lesson facts, and the reply stores the turn record.
- The provider payload contains none of: student name, surname, email, student ID, institution ID.
- A non-language course gets no language block and no turn record, so existing behaviour is unchanged.
- **Tenant isolation:** another school's course is rejected, and nothing from it, neither its vocabulary nor its lesson title, reaches the model. The other school's student sees only their own course.
- **Enrolment checked every turn:** once the class is removed, an existing session's next turn gets no language context, even though the session still stores the curriculum ID.
- **Streaming route:** the same language block is sent to the stream request. A failed stream stores no turn record.
- **Curriculum API:** lesson specs are kept on create (POST) and update (PATCH), with junk and over-long values removed.
- **Privacy:** `describeSnapshot`, the text sent to the model, contains no name or ID. The voice opening no longer greets the student by name; the existing avatar tests still pass.

**These are not live-provider tests.** The API tests use a mocked SDK only to capture the exact request the server would send. No provider call was made.

### Privacy and roles (sources of verification)

- **No direct identifiers:** tested above. The name was removed from `describeSnapshot` (chat and voice), and from the voice opening instruction (`avatar.controller.ts`).
- **Server-side scope:**
  - the session is looked up by `{ id, studentId }`;
  - the course by `buildCourseTree`, which checks enrolment;
  - the curriculum by `{ id, institutionId }`, and only for a course resolved in the current turn.
- **Roles:** Phase 1 changed no route or role. Teacher, Academic Manager, Workspace Admin and ENARA Admin permissions are untouched, and the existing role-matrix and isolation suites still pass, except the pre-existing `p3EducatorChat` isolation failure, which is unchanged from the baseline.
- **Gateway and metering:** no new model call and no bypass. The language block is added to the existing metered request.

## 3. Behaviour changes

1. **Language courses** (`Curriculum.type` contains "language"), in text chat and streaming:
   - the tutor receives the `<language_teaching_context version="ltc-v1">` block;
   - the reply stores `meta.languageTurn`;
   - these turns go to the direct model rather than the external orchestrator, as already happens when a ped-v2 plan is present.
2. **All courses (privacy):**
   - the tutor no longer receives the student's first name;
   - the voice tutor greets without a name;
   - **consequence:** the tutor no longer addresses students by name.
3. **Curriculum API:** a lesson may carry an optional `languageSpec` (objectives, success criteria, vocabulary, grammar, functions, skills, examples). It is cleaned and capped.
4. **Demo template:** the four sample lessons now have specs, so newly copied demo sessions use them. The live template only changes when it is rebuilt.

## 4. Paid AI evaluation — LIVE-PROVIDER-VERIFIED

### Authorisation and what was changed to run it

- **The owner authorised the spend** ("permission to spend whatever you need").
- **The owner authorised one exception to the no-deploy rule:** an unpromoted staging deployment. The working-tree code was deployed with `vercel deploy --prod --skip-domain`, which attaches no domain; test.enara.app kept running the current code.
- **Unchanged:**
  - the provider and model: the existing staging configuration;
  - the metering: the existing gateway and ledger;
  - the caps and the `AI_TEST_SPEND_ID`.
- **The cumulative test-spend counter still could not be read** (see "Spend" below). Measured cost was taken from the demo budget counter instead.

### Method

- **Isolation:** each run used a **fresh private demo school**, copied from the synthetic template and deleted at the end of the run (`POST /api/demo/end`, status 204). No real student data was used, and nothing identifying anyone was sent.
- **Cases:** 11, totalling 15 learner turns:
  - the 9 planned cases;
  - repeats of C1 and C3 to check consistency.
- **Varying the conditions:** the teacher account in the demo school set, before each case:
  - the course level (A1, A2 or C1);
  - for C6, removing the lesson spec;
  - for C8, the course type (National).

  For C9 the student opened an assignment attempt whose tutor policy is "hints only". The curriculum was restored afterwards.
- **Script:** `e2e/ltc_eval.cjs` in the session scratchpad, not in the repository.
- **Three runs:**

| Run | Deployment | Code |
|---|---|---|
| `new` | g702327d5 | Phase 1 as first built |
| `new2` | kmwojrefc | Phase 1 after the two rule fixes below |
| `current` | test.enara.app | The live code before Phase 1, for comparison |

### Spend (actual, metered)

These figures come from the platform's own demo budget counter (`GET /api/demo/admin/status`, `spentThisMonthUsd`):

| Run | Before | After | Cost |
|---|---|---|---|
| new | $0.00 | $0.17 | $0.17 |
| new2 | $0.17 | $0.33 | $0.16 |
| current | $0.33 | $0.45 | $0.12 |
| **Total** | | | **$0.45** |

- **Which counter was charged:** calls from demo schools are charged to the separate demo ceiling, not to the staging test-spend cap. That is the existing rule (`reserveDemoSpend`). So the test-spend counter was not touched, and its value still could not be verified.
- **Every turn returned HTTP 200.** Median response time was about 7.6 seconds in all three runs.

### Results

**Live-run defects found and fixed before the final run (`new2`):**

1. **The session greeting was treated as a check question.** A new tutor session opens with a greeting that ends in a question. So in run `new`, the learner's first message was wrongly treated as an answer, and `corrective_feedback_retry` fired in C3, C5, C6 and C7.
   - **Fix:** a message only counts as an answer after the learner has already spoken, and not when it is itself a request or a question.
2. **A real answer was missed in C3.** The tutor put its question before a gap-fill line, so the reply didn't end with "?".
   - **Fix:** a question anywhere in the reply's last 300 characters now counts.
3. **The C1 learner in C5 got a beginner-style answer.** The "fade support" instruction was made explicit: no beginner tables, basic definitions or step-by-step scaffolds unless asked; offer a nuance or a harder variant instead.

A regression test now covers 1 and 2.

**Moves selected in the final run (`new2`):** every case got the intended moves.

| Case | Moves |
|---|---|
| C1, C1r (A1, meaning) | short_explanation + comprehensible_model + comprehension_check (both runs identical) |
| C2 (A1, writes in Arabic) | the above + l1_support |
| C3, C3r turn 2 ("She go to work…") | corrective_feedback_retry |
| C4 turn 3 (second confusion) | reteach_simpler + l1_support |
| C5 (C1) | short_explanation + fade_support + independent_practice |
| C6 ("hi", no spec) | clarify_goal |
| C8 (non-language) | none, and no record stored |
| C9 (hints only) | scaffold_hint |

**Rubric scores, current code vs Phase 1 (0–2 per item):**

| Case | Context accuracy | Level fit | Usefulness | Grounding | Clarity | Error handling | Notes |
|---|---|---|---|---|---|---|---|
| C1 A1 meaning | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | n/a | Both good |
| C2 A1 in Arabic | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | n/a | Both answer in Arabic with the English forms |
| C3 verb error | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | Both name the error, hint and ask for a retry. Phase 1 also says what was right |
| C4 confusion | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 1 vs 2 | n/a | Both simplify. The current code switched to formal Arabic mid-answer; Phase 1 stayed in plain colloquial Arabic |
| C5 C1 grammar | 1 vs 2 | **0 vs 2** | 1 vs 2 | 2 vs 2 | 2 vs 2 | n/a | **Current gave a beginner explanation and a quiz. Phase 1 answered at level and added a real nuance ("a water" in café speech)** |
| C6 "hi", no spec | 1 vs 2 | 2 vs 2 | 1 vs 2 | 2 vs 2 | 2 vs 2 | n/a | **Current started quizzing straight away. Phase 1 asked what the learner wants to do** |
| C7 off-topic | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | n/a | Both say it is outside the course, help briefly, and steer back |
| C8 non-language | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | n/a | No language block in Phase 1. Behaviour comparable |
| C9 hints only | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | 2 vs 2 | n/a | Both refuse the answer and give a hint |
| Consistency (C1/C1r, C3/C3r) | 2 vs 2 | | | | | | Same moves and same teaching shape in both repeats |

**Privacy, verified live:**

- **Current code:** 13 of 15 replies addressed the student by first name ("Hi Lina", "يا لينا"), because the name is sent to the provider.
- **Phase 1:** 0 of 15. The name is no longer sent.

**Evidence records:**

- 14 of the 15 Phase 1 turns stored `meta.languageTurn`. The one without it is C8, the non-language course, which is correct.
- All 14 have `masteryClaim: false`.
- None of the current-code turns stored one, because the feature doesn't exist there.

### Interpretation and limits

- **Who scored it:** the scores are one rater's judgement (Claude), not independent human ratings. Treat them as a structured qualitative comparison.
- **Where the difference is:** Phase 1 changed behaviour clearly where the new context matters: the advanced learner (C5), the vague opening (C6), the no-name rule, and the stored evidence. Where the current tutor was already good (C1–C3, C7, C9), Phase 1 kept that quality.
- **What it doesn't show:** 11 synthetic cases and one model show model behaviour, **not educational efficacy**. Validation measures for each decision are in the evidence ledger.
## 5. Known limitations and remaining risks

- **Heuristic signals:** help requests, answer requests and confusion are detected with English and Arabic phrase patterns (LTC-D7). They will miss some phrasings and misfire on others. Validation needs real, consented conversation samples.
- **No verified proficiency:** proficiency is never `known`, because ENARA has no placement test. All adaptation starts from the course level or from nothing.
- **Lesson specs are optional:** existing language courses have none until teachers add them. There is no editor UI in this phase; specs can only be set through the API, plus the demo template.
- **Voice is not covered:** voice calls do not get the language block yet; only the privacy fix applies there.
- **The turn record is a weak observation.** It is not used anywhere yet, and it is not shown to teachers.
- **Evidence gaps:** there is no L2-specific evidence for LLM tutors and none for Modern Standard Arabic learners. Several decisions are `experimental` (see the ledger).
- **Lost personalisation:** with the name removed, the tutor can no longer greet the student by name. If wanted, the app could add the name around the AI's reply, without sending it to the provider.
- **Uncommitted work:** the work is in this session's temporary environment and is lost if the environment is reclaimed before it is committed or exported. Backups are in `/home/user/enara-phase1-*`.
- **Unpromoted deployments:** the two evaluation deployments (`g702327d5`, `kmwojrefc`) remain in the Vercel project, unaliased. They can be removed, or kept for reference.

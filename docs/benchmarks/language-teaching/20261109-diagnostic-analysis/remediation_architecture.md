# Remediation architecture (proposal; nothing implemented)

**Verdict on architecture:** targeted fixes are feasible **without a rewrite**.
- The engine is already a pure, testable decision layer: `detectTurnSignals` → `selectLanguageMoves` → `renderLanguageContextPrompt` in `backend/src/services/languageTeachingContext.ts`.
- Per-turn evidence is already persisted (`TutorMessage.meta.languageTurn`, `backend/src/models/TutorMessage.ts:43`).
- A hidden-marker mechanism already exists (`SHOW_VISUAL_MARKER`, `directTutorModel.ts:164`, stripped in `avatar.controller.ts:752`).
- Every fix below changes prompt text, adds engine state, or adds benchmark tooling. No new AI calls per turn are proposed.

**Layer key:**
- `TUTOR_PROMPT` = `MOVE_TEXT` / `HINT_VARIANT` / `moveText` / `renderLanguageContextPrompt` in `languageTeachingContext.ts`.
- `CONVERSATION_STATE` = `detectTurnSignals`, `confirmsCorrect`, `confirmedStreak`, `attemptsOnCurrentTask` in the same file, plus history assembly in `tutor.controller.ts:229`.

---

## P0: Learning correctness

### R1. Structured answer verdict instead of prose-regex success detection
- **Problem:** the engine infers whether the previous answer was correct by regex over the tutor's prose (`confirmsCorrect`, `languageTeachingContext.ts:580`).
- **Evidence:**
  - Replayed locally, it missed explicit confirmations in **5 of 9** T08 cases (CA2-T08, CB1-T08, TA1-T08, TA2-T08, AA1-T08), so `after_confirmed_success` never fired.
  - It includes both T08 cases that both evaluators scored PARTIAL.
- **Root cause (verified):** the verdict exists only in free text. Openers such as "Good sentence!" or "Nice sentence!" are outside the lexicon, and "But …" or "One thing …" anywhere in the first 250 characters cancels a clear "is correct".
- **Location:**
  - `confirmsCorrect` / `confirmedStreak` (`languageTeachingContext.ts:578-602`);
  - reply post-processing in `tutor.controller.ts` (where `languageTurn` is attached, `:354`);
  - history items built at `tutor.controller.ts:229`.
- **Proposed behaviour:**
  - The language block asks the tutor to begin feedback turns with a hidden marker, `[[verdict:correct|partly_correct|incorrect|correct_other_item|not_assessed]]`.
  - The server strips it before display and storage of the visible text, and records it in `meta.languageTurn.verdict`.
  - `confirmedStreak` reads stored verdicts. The regex is the fallback when no verdict is present.
- **Interim (lower risk, lower value):**
  - Widen CONFIRM to "good/nice sentence", "both … correct" and "is correct".
  - Evaluate NOT_CONFIRM only within the confirming sentence.
- **Acceptance criteria:**
  - Replaying the 219 recorded turns, every turn whose reply opens with an explicit confirmation of a correct answer yields `confirmedSuccessStreak ≥ 1` on the next turn.
  - No marker text ever reaches the learner (stream and non-stream paths).
  - A missing or malformed marker falls back to current behaviour.
- **Regression risks:**
  - Marker leakage in streaming (the SSE path must strip it across chunk boundaries).
  - Model compliance drift.
  - Tests that assert on the current regex.
- **Tests:** RT-CA-01…07, RT-ST-01…03 (`regression_test_specification.md`).
- **Validating benchmark cases:** all T08; CA2-T08 and TA2-T08 especially.

### R2. Answer-class policy and progression rule
- **Problem:** the tutor judges an answer only against its own item. It re-issues an item for a component the learner has already demonstrated, and it has no rule for a correct answer to a different item.
- **Evidence:** CA2-T08 and TA2-T08 (same item presented three times); CB1-T08 t2; CA1-T04 t2.
- **Root cause (verified):** `MOVE_TEXT.corrective_feedback_retry` says "First decide whether it is essentially correct …" relative to "your task". The `after_confirmed_success` variant applies only when R1's detection succeeds.
- **Location:** `MOVE_TEXT.corrective_feedback_retry` and the `moveText` variants (`languageTeachingContext.ts`).
- **Proposed behaviour:** the decision table in `correct_answer_recognition_analysis.md` §5. Key rules:
  - credit the demonstrated components;
  - ask once, only about an undemonstrated component;
  - never re-issue an item for a component already demonstrated;
  - move on when the success criteria are visible;
  - never attribute an answer not given.
- **Acceptance criteria:**
  - In regression scenarios RT-CA-03/04, the tutor credits the off-item correct answer and does not re-present the same item for that component.
  - The tutor still asks about an undemonstrated component (e.g. have → has) at most once.
- **Regression risks:**
  - Over-acceptance: crediting a correct but irrelevant sentence (RT-CA-05 guards this).
  - Skipping practice the lesson needs.
- **Validating benchmark cases:** T04, T07, T08 (all cohorts). Valid only once R8 aligns the fixture.

### R3. Hint ladder with engine-tracked level and must-not-reveal rules
- **Problem:** 16 confirmed leak or near-reveal instances in 16 cases.
- **Evidence:** TA2-T13, AB1-T13, TA1-T13, CA1-T13, CA2-T05, TA2-T05, TA2-T07, AB1-T06, CB1-T04, CA1-T06, TA1-T06, CA2-T08, TA2-T08, CA1-T12, TA1-T12, AA1-T13.
- **Root cause (verified):**
  - `HINT_VARIANT`, `scaffold_hint` and the hint clause of `corrective_feedback_retry` do not define what a hint must not contain.
  - No hint level is tracked.
  - The strategy-shift text asks for a contrast pair that places the answer form adjacent to the item.
- **Location:**
  - **State:** add `hintLevel` to `TurnSignals` (`languageTeachingContext.ts:140`), derived in `detectTurnSignals` from the current task chain; `attemptsOnCurrentTask` already walks it.
  - **Prompt:** `HINT_VARIANT`, `MOVE_TEXT.scaffold_hint`, the hint clause in `corrective_feedback_retry`, and the `repeated_misconception_strategy_shift` text in `moveText`.
  - **Consistency:** align the ped-v2 `scaffolding.promptInstructions` (`strategyRegistry.ts:107`) so the two ladders do not conflict.
- **Proposed behaviour:** the ladder L1–L6 in `hint_scaffolding_analysis.md` §3, with entry rules by situation. Binary or single-morpheme items start at L1. The prompt receives "hint level N: may reveal …, must not reveal …".
- **Acceptance criteria:**
  - **First-attempt hints:** in RT-HB-01..04, the tested form (e.g. "has", "goes", "She", "went") does not appear in the reply. A deterministic check is possible because the expected form is known in the test fixture.
  - **Repeated errors:** in RT-HB-05, escalation happens one level per repeated error.
  - **After repeated failure:** in RT-HB-06, a full explanation is followed by a fresh item.
- **Regression risks:**
  - Under-scaffolding: hints too vague at A1 (RT-HB-07 checks A1 comprehensibility).
  - Slower progress for learners who need direct instruction.
- **Validating benchmark cases:** all T05, T06 and T13; T03/T07 retries.

### R4. Preserve the lesson objective when redirecting or extending
- **Covered by R2 and R5;** evidence from the T11 designed redirects.
- **No separate change** unless product owners decide frames for the learner's own off-topic task are not wanted (rubric v2 §0.6).

---

## P1: Teaching reliability

### R5. Grammar accuracy and context grounding (prompt text plus deterministic telemetry)
- **Problem:**
  - 1 confirmed factual error (CA2-T07);
  - 6 misleading statements, including the false "only one word changes" claim in **3/3** strategy-shift turns (AA1-T06, TA1-T06, CB1-T06) plus TA2-T06;
  - a misquote (CA2-T03);
  - an attributed answer (CB1-T08 t3);
  - assumed prior knowledge (TB1-T04, TB1-T13).
- **Root cause:**
  - the strategy-shift wording (verified);
  - no rule-example consistency or attribution rule in the prompt (verified absent).
- **Location:**
  - `moveText` strategy-shift branch;
  - the "Always:" line of `renderLanguageContextPrompt`;
  - a new pure function next to `flaggedErrorSpans` for telemetry: a contrast-pair diff check and a learner-quote substring check, recorded in `meta.languageTurn`.
- **Proposed behaviour:** the rules in `grammar_accuracy_audit.md` §3 and `context_grounding_analysis.md` §4.
- **Acceptance criteria:**
  - RT-GR-01..04 and RT-CG-01..04 pass.
  - Over a replay of a fresh benchmark run, the contrast-pair check reports 0 false "only one change" claims.
- **Regression risks:** prompt length (minor); a telemetry false-positive rate (log-only first).

### R6. Meaningful formative check definition
- **Problem:** the formative check is the most frequent low dimension among non-MEETS child and teen cases (9 each) and the most frequent rubric ambiguity.
- **Root cause:**
  - `MOVE_TEXT.comprehension_check` ("End with one short, focused check (a question or a mini task) …") and `PROACTIVE_TEACHING` ("end with one short question that checks understanding") do not require the check to be unaided or on the objective's component.
  - **Partly a rubric ambiguity.** Confidence MEDIUM.
- **Location:** `MOVE_TEXT.comprehension_check`; `PROACTIVE_TEACHING` in `directTutorModel.ts:155`, for consistency.
- **Proposed behaviour:** a check is a new item or production task on the tested component that the learner answers without a model of the same answer adjacent to it. "Does that make sense?" is not a check.
- **Acceptance criteria:** RT-FA-01..04.
- **Regression risks:** longer replies; overlap with R3.

### R7. Progression consistency across the three instruction layers
- **Problem (hypothesis):** hint and progression guidance is stated in three places with no precedence:
  - the base prompt `PROACTIVE_TEACHING`;
  - the ped-v2 strategy `promptInstructions`;
  - the language move text.
- **Evidence:** no transcript isolates the effect. **Unconfirmed.**
- **Proposed behaviour:** one precedence sentence in the language block ("For language courses, the teaching moves below take precedence over general tutoring guidance where they differ"), plus aligning the ped-v2 scaffolding ladder with R3.
- **Acceptance criteria:** prompt assembly tests show the precedence line present for language courses only.
- **Risk:** low.

---

## P2: Evaluation reliability

### R8. Benchmark fixture alignment and evaluator parity (new `ltb-v1.1`; v1.0 untouched)
- **Problem:**
  - 54/120 cases script learner answers to an exercise the tutor never receives. Independent MEETS is 25/54 for these cases vs 50/66 for the rest.
  - Evaluators were shown that exercise and penalised its absence (AB1-T04, CB1-T05, TA1-T04, TB1-T05).
- **Location:** `backend/benchmarks/ltc-v1/cases.mjs`, `run_trusted_age.ts`, `judge.ts`; the reviewer scripts in the review directory.
- **Proposed behaviour (choose one):**
  - **(a)** seed the conversation with a fixed tutor turn presenting the case exercise, so the scripted answers align;
  - **(b)** add an optional exercise/items field to `languageSpec` (a product feature, which also helps real lessons);
  - **(c)** for exercise-first cases, generate learner turns only after reading the tutor's exercise. This needs a simulated learner, which means AI calls, so it is not recommended.
  - **In all options:** evaluators see exactly what the tutor saw, and the run records it.
- **Acceptance criteria:**
  - Every scripted answer in v1.1 answers an item visible in the transcript.
  - An evaluator-input diff shows no field unavailable to the tutor.

### R9. Rubric v2, two-evaluator protocol, repeated runs
- **Problem:**
  - 62 of 90 official MEETS sit exactly at mean 3.00.
  - Outcome agreement between evaluators is 70.8% (κ 0.33).
  - The r3 stability study showed 16/36 cases with mixed outcomes across repetitions.
- **Proposed behaviour:**
  - freeze `ltb-rubric-v2` before use;
  - two evaluators per case, with human adjudication of boundary disagreements;
  - report the boundary count;
  - k = 3 repeated tutor runs on a stratified subset, reporting per-case stability alongside the headline;
  - separate "tutor variance" (same case, different transcripts) from "judge variance" (same transcript, different evaluators).
- **Acceptance criteria:**
  - Rubric v2 calibration on the borderline set (`rubric_v2_specification.md` §5) reaches agreement ≥ 0.6 κ between two evaluators **before** any headline is reported.
  - No threshold is changed after seeing results.

---

## Sequencing

1. **R8 first:** fix the measurement so that R1–R3 can be validated.
2. **Then R1 + R2 together:** they interact.
3. **Then R3.**
4. **Then R5/R6.**
5. **R9 alongside the next run.**

Each step is a separate, reviewable change with its own tests. **No step requires a tutor rewrite.**

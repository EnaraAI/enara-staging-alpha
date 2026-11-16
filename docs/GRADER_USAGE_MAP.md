# Grader usage map

**SIMULATION ONLY · DRAFT** (written before any grader code was changed; line numbers are from that state)

Where the answer key (`gradeAnswer`), the lesson key (`evaluateAgainstKey`) and the eval-v2 model path (short-answer meaning check, rubric grading) are called, and which learner flow each call serves. Source of the five fixes: `research/assessment-validation/a1a2/REPORT.md` §3.

## 1. Call sites

### `gradeAnswer` (defined `backend/src/services/assessmentSecurity.ts:55`, trimmed + lower-cased exact match on one `correctAnswer`)

| Call site | Flow | What it decides |
|---|---|---|
| `backend/src/services/grading.ts:25` (`gradeAnswers`) | **Assignments** (submit) | Points of every multiple-choice / true-false / short-answer question (`method: 'rule'`). Called from `backend/src/controllers/meAssignments.controller.ts:199`. A short answer that misses goes on to the meaning check (below). |
| `backend/src/services/autoGrading.ts:178` (`validateGrading`) | **Assignments** (automatic grading) | Re-checks every rule-graded answer before finalize/release; a mismatch is a `rule_mismatch` exception. Must agree with `grading.ts:25`. |
| `backend/src/controllers/meAssessment.controller.ts:233` | **Assessments** (self-assigned / older assessment attempts, quizzes) | Correct / not correct per question and the attempt score. |
| `backend/src/controllers/learningDiagnostics.controller.ts:261` | **Assessments: diagnostics** (adaptive diagnostic sessions) | Correct per item; feeds mastery evidence and the next item. |

### `evaluateAgainstKey` (defined `backend/src/services/languageLearningState.ts:294`, normalised match against a lesson item's `acceptedAnswers`; only ever returns success)

| Call site | Flow | What it decides |
|---|---|---|
| `backend/src/services/languageTeachingContext.ts:991` (`keyVerdict`) | **In-lesson exercises** (language tutor, every learner answer turn) | Key-confirmed CORRECT; drives support stage (`:1366`), release-after-two (`:927`), the selfCheck override (`:1862`) and the next item. |
| `backend/src/services/languageLearningState.ts:748` (`diagnoseError`) | **In-lesson exercises** | Error diagnosis runs only when the key did not confirm success. Called from `languageTeachingContext.ts:921` and `:994`. |
| `answerHasTargetForm` (`languageLearningState.ts:288`), used at `languageTeachingContext.ts:1862` | **In-lesson exercises** (engineV2 `selfCheck`) | Holds back the tutor model's own CORRECT when no target form is present. |

### eval-v2 model path (`backend/src/services/gradingProposals.ts`, `PROPOSAL_VERSION = 'eval-v2'`)

| Call site | Flow | What it decides |
|---|---|---|
| `evaluateShortAnswer` (`gradingProposals.ts:245`) via `evaluateShort` (`autoGrading.ts:98-99`), called at `autoGrading.ts:300` | **Assignments** (short answers the key marked wrong; `needsAiEvaluation`, `autoGrading.ts:51`) | Meaning check: model says correct → full points. |
| `evaluateRubricAnswer` (`gradingProposals.ts:215`) via `evaluateOpen` (`autoGrading.ts:79-96`), called at `autoGrading.ts:284` | **Assignments** (open responses with a rubric) | Rubric criterion levels and points (2 runs, third on disagreement). |
| `rubricPrompt` (`gradingProposals.ts:189`) | Assignments (via `evaluateRubricAnswer:217`); other: `backend/src/scripts/benchmark3Model.ts:213` | Prompt text. |
| `backend/src/scripts/gradingBenchmark.ts:68, :86`, `backend/src/scripts/gradingEvalAdapter.ts:129` | **Other** (offline/API benchmarks, research) | Same functions as production. |
| `backend/src/services/hybridV1/shadow.ts`, `backend/src/services/candidateV2/*` | **Other** (shadow / research copies of eval-v2; read the chosen proposal or a copied prompt) | No production score. |

### Placement

| Call site | Flow | What it decides |
|---|---|---|
| `scoreControlled` (`backend/src/services/assessment/placementEngine.ts:59`), called at `:100` | **Placement** (draft engine, not wired to any route; only `backend/test/placementEngine.test.ts`) | Controlled item correct: its own normaliser (lower-case, curly apostrophe, final punctuation) over `correctAnswer` + `acceptedAnswers`. Does not call `gradeAnswer`. |

No other call sites of `gradeAnswer`, `evaluateAgainstKey`, `evaluateShortAnswer` or `evaluateRubricAnswer` exist in `backend/src`.

## 2. Which flows change with `graderV2` ON

| Fix | In-lesson exercises | Assignments | Assessments (incl. diagnostics) | Placement | Other |
|---|---|---|---|---|---|
| 1. Normalised matching (case, final punctuation, spaces, curly quotes, contractions; case/punctuation kept where `matchingNote` says so) | Yes (`evaluateAgainstKey`, so also `diagnoseError` and everything keyed on `keyVerdict`) | Yes (`gradeAnswer` in `gradeAnswers` and `validateGrading`) | Yes (`meAssessment`, diagnostics) | Yes (`scoreControlled`) | Benchmarks that grade through these functions |
| 2. Multiple accepted answers | Already (lesson items have `acceptedAnswers`); unchanged | Yes (new optional `acceptedAnswers` on questions) | Yes | Already | — |
| 3. Option letter = option text for choice items | Yes (when the item prompt lists options) | Yes (`options` on multiple-choice) | Yes | Yes (options in the prompt) | — |
| 4. Deterministic target-form scorer 0/1/2 | No (lesson key only confirms success; free sentences stay with the tutor) | Yes (questions with `scoring: 'target_form_0_1_2'`; skips the rubric model) | Exposed as `scoreTargetForm` for the same items; meAssessment/diagnostics only grade objective types | No (writing passed in) | Validation scripts |
| 5. Meaning-check guard (no credit when the target form is required and missing) | Yes (the selfCheck hold-back runs with graderV2 ON) | Yes (`evaluateShortAnswer` result) | — (no model path) | — | — |

**Lesson learners are affected, not only tests.** Fixes 1, 3 and 5 change the in-lesson key verdict and therefore what the tutor does next (confirmed success, rule teaching after a miss, answer release after two misses, diagnosis, next item). A learner who types `It's` for `It is` or `(b)` for an option is credited by the key with graderV2 ON; one whose tutor-model CORRECT lacks the target form is held back.

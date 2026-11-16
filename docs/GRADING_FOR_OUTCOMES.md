# DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)

# Grading for learning outcomes: what ENARA's grader can and cannot do

*16 Nov 2026. Read-only review. The grader was not changed and no API call was made.*

## 1. Short answer

- ENARA has **two separate checkers**:
  1. the **assignment grader** (`grading-v2` + `autograde-v1` + `eval-v2`), which scores assessment attempts; and
  2. the **tutor's answer-key match** (`evaluateAgainstKey`), which checks lesson exercise answers during tutoring.
- Only the **exact-match parts are offline**. Everything that reads meaning (short answers that miss the key, open answers, essays) **needs a model call**.
- It can score longer writing with a teacher rubric (model-based). It **cannot** deterministically score one target form inside a free sentence while ignoring other errors.
- It already runs **blind**: the assignment grader never sees the tutor conversation or the study arm.

## 2. The assignment grader

| Part | What it does | Deterministic or model | File |
|---|---|---|---|
| Answer key | `multiple-choice`, `true-false`, `short-answer`: trimmed, lower-cased exact match with `correctAnswer`. Full points or 0. `method: 'rule'`. | **Deterministic** | `backend/src/services/grading.ts` (`gradeAnswers`), `assessmentSecurity.ts` (`gradeAnswer`), `assessmentVersions.ts` (`AUTO_GRADED`, `questionPoints`) |
| Short answer that missed the key | One model call: "does this mean the same as the key?" Returns `{correct, scoreExplanation, feedback, flags}`. | **Model** | `gradingProposals.ts` (`evaluateShortAnswer`, `validateShortAnswer`) |
| Open response / essay | Rubric grading: one level per criterion, exact quotes from the answer as evidence, feedback, objective ids, confidence, flags. | **Model** | `gradingProposals.ts` (`evaluateRubricAnswer`, `RUBRIC_SYSTEM`, `validateProposal`) |
| Consistency | 2 independent rubric runs; must agree (no criterion > 1 level apart, totals within max(1, max/4)). If not, a 3rd run decides; else exception. | Deterministic rule over model outputs | `autoGrading.ts` (`evaluateOpen`, `agree`, `CONSISTENCY_RUNS`) |
| Validation | Schema, level ids exist, every level above 0 points has a quote found in the answer, objective ids allowed, points in range, version match, no leak of model answer or key in released text. | **Deterministic** | `gradingProposals.ts` (`validateProposal`), `autoGrading.ts` (`validateGrading`, `leaks`, `leaksModelAnswerV2`) |
| State machine | queued → in progress → finalized + released, or `grading_failed` (retry, max 3) → `grading_exception` for a teacher. No score is ever invented. | Deterministic | `autoGrading.ts` |
| Hybrid V1 | **Shadow only**, off by default. Averages eval-v2 with a second model (V6) on a 0.125 grid. Never writes a grade. | Model | `backend/src/services/hybridV1/*` |
| Candidate V2 | Research grader (native rubric), not in production. | Model | `backend/src/services/candidateV2/*` |
| Speaking exam | Transcript of spoken replies, graded by rubric. Pronunciation criteria are refused. Behind a feature flag. | Model (STT + rubric) | `speakingExam.ts` |

**Inputs.** The question (type, `correctAnswer`, `modelAnswer`, `rubric.criteria[].levels[]`, `objectiveIds`) and the learner's answer. Nothing from the tutor.

**Outputs and scale.** Per answer: `points` (0 to max), `maxPoints`, `isCorrect`, `method`, feedback. Per attempt: `totalPoints`, `maxPoints`, `score` (0–100 percent). Rubric points are teacher-set per level.

**Stored evidence.**
- `AssessmentAttempt` (`models/AssessmentAttempt.ts`): answers, points, method, status, history of every action.
- `GradingProposal` (`models/GradingProposal.ts`): **every model run**, with prompt version, chosen levels, quotes, rationale, flags, status.
- `HybridShadowResult` (shadow runs only).
- Learning events and objective mastery after finalizing (`updateLearningIntelligence` in `grading.ts`).

## 3. The tutor's answer-key match (lesson exercises)

| Part | What it does | File |
|---|---|---|
| `evaluateAgainstKey` | Normalised match (case, punctuation, diacritics, "o'clock"; contractions with `keyMatch`) against `acceptedAnswers`; takes the last self-corrected version. **Only ever says CORRECT**; a non-match is left to the tutor model. | `backend/src/services/languageLearningState.ts` |
| `answerHasTargetForm` | Does the answer contain any `targetForms`? Used only to hold back credit. | same |
| `diagnoseError`, `detectLiveError` | Rule-based error codes (pronoun swap, copula omitted, etc.). Text only. | same |

The research post-tests (`backend/benchmarks/ltc-v2/outcome_quiz.ts`, `lo_assess.ts`, `research/.../offline/eslFixtures.ts`) reuse this deterministic match for controlled items.

## 4. Item types

| Item type | Supported? | How | Offline? |
|---|---|---|---|
| Exact (one right answer) | Yes | Answer key / `evaluateAgainstKey` | **Yes** |
| Several accepted answers | Tutor: yes (`acceptedAnswers[]`). Assignment grader: **one** `correctAnswer` only; others go to the model meaning check. | Key match, then model | Key part only |
| Free sentence | Only as `open-response` with a rubric | Model rubric | No |
| Longer writing | Yes, teacher rubric with levels and quote evidence | Model rubric, 2–3 runs | No |

## 5. The three questions

1. **One target form inside a free sentence, ignoring other errors?** Not deterministically. `answerHasTargetForm` only checks that the word is present, not that it is used correctly. With the model, a rubric with one criterion scoped to the form can do it; the opt-in `criterionScoped` policy (eval-v3, benchmark only) tells the model to judge each criterion only on its own requirement. Not validated for this use.
2. **Longer writing with a rubric?** Yes (production path), model-based.
3. **Blind (no tutor arm)?** Yes. The grader reads only the question and answer. To keep it blind in a study, strip study-arm labels from attempt metadata and use neutral learner ids.

## 6. Gaps and extensions needed (not done here)

1. **Accepted-answer lists in the assignment grader** (`correctAnswer` is a single value).
2. **Deterministic target-form scorer**: a per-form pattern (e.g. "he/she + verb-s", "a/an + noun") that scores just the form and ignores other errors. Must be checked against teacher labels.
3. **Outcome ids on items**: questions have `objectiveIds` but no outcome id, CEFR or skill tag (see `LEARNING_OUTCOMES.md`).
4. **Delayed-test link**: nothing ties a 7-day delayed attempt to the same outcome; needed for the MASTERED rule.
5. **Arabic-L1 error tags in grading output** (framework §9) for per-error reporting.
6. **Listening and pronunciation**: no audio evidence; cannot be scored.
7. **Rubric reliability for ESL writing**: the grading benchmark covers general subjects; ESL rubrics need their own reference scores.

## 7. Validation without the API

| Part | Can run offline? | How to validate |
|---|---|---|
| Answer key, `evaluateAgainstKey`, `answerHasTargetForm`, `diagnoseError`, `detectLiveError` | **Yes** | Run directly in Node/tests on frozen item sets; compare with teacher keys. |
| `validateProposal`, `validateShortAnswer`, `agree`, `validateGrading`, leak checks, Hybrid `combine` | **Yes** | Feed stored or hand-written model replies; check accept/reject. |
| Short-answer meaning check | **No** (model call) | Stand-in only, see below. |
| Rubric grading (eval-v2), V6, Candidate V2, speaking STT | **No** (model call) | Stand-in only, see below. |

**Stand-in for model parts.** An agent applies the grader's **exact** system prompt (`RUBRIC_SYSTEM` or the short-answer prompt in `gradingProposals.ts`) and the same rubric to each answer, writes the same JSON, and the reply is passed through the **real** offline validators (`validateProposal`, `agree`). Rules:
- Label every result **"AGENT STAND-IN — not the production grader"**.
- Never mix stand-in scores with production scores in one table.
- Two independent stand-in runs per answer, the same `agree` rule.
- Results show whether the rubric is usable, not how the production model would score.

The real check of the model parts must wait for an approved API run (e.g. `backend/src/scripts/gradingBenchmark.ts`).

## Validation status (A1–A2), after graderV2 rounds 3–4

SIMULATION ONLY · DRAFT. Full detail is in `research/assessment-validation/a1a2/REPORT.md`.

- **graderV2:** one switch, default OFF (`ENARA_ENGINE_V2=graderV2`). With it OFF, output is identical to before. Docs: `docs/GRADER_FIXES.md`, `docs/GRADER_USAGE_MAP.md`.
  - With it ON, it changes lesson exercises, assignments, assessments and placement scoring.
- **Deterministic path, graderV2 ON, on a fresh answer set (round 4):**
  - controlled items: 93.3% exact agreement, against a target of 95%. **Not met.**
  - free/transfer items: QWK 0.819, against a target of 0.80. **Met, narrowly.**
- **Model path (eval-v2): NOT VALIDATED.** Only agent stand-in estimates exist: 92.0% controlled, QWK 0.923 free. A real run needs the API.
- **Status: the grader is not validated for confirmatory use with these assessments.** The remaining causes are listed in REPORT.md round 4.
- **Use in studies:** a study that uses this grader must either report grader agreement as a limit, or treat a blind recheck below target as a failed guard.

### Update after round 5 (supersedes the status above)
- **Deterministic path, graderV2 ON, fresh answers (round 5):** 96.0% exact agreement (target ≥95%) and QWK 0.914 (target ≥0.80). **Both targets met.** It is validated in simulation, against agent scorers only, for the A1–A2 outcome assessments.
- **Model path: NOT VALIDATED.** In the stand-in estimate, the meaning check over-credits spelling slips on vocabulary items, which lowers exact agreement to 89.3%.
- **Recommended configuration for studies:** deterministic, graderV2 ON, model path OFF.

# DRAFT — not yet reviewed (see docs/ASSESSMENT_REVIEW_LOG.md)

# Grader validation, A1–A2 band

*16 Nov 2026. Offline only: no API call, no sub-agent, grader and tutor unchanged. Rubric: `docs/SCORING_RUBRIC.md`.*

## 1. Result

| Group (n) | Arm | Measure | Value | Target | Pass? |
|---|---|---|---|---|---|
| Controlled + error correction (50) | **Deterministic**: assignment grader `gradeAnswers` (grading-v2 answer key) | exact agreement | **29/50 = 58%** | ≥95% | **FAIL** |
| | **Deterministic**: tutor key `evaluateAgainstKey` with `acceptedAnswers` (keyMatch off and on: identical) | exact agreement | **44/50 = 88%** | ≥95% | **FAIL** |
| | **AGENT STAND-IN** pipeline: key, then short-answer meaning check (`evaluateShortAnswer` prompt) on misses | exact agreement | **47/50 = 94%** | ≥95% | **FAIL (just)** |
| Free production (40) | Deterministic: assignment grader | coverage | 0/40 scored (open-response is left to a person/model) | — | no score |
| | Deterministic: tutor key | QWK | 0.00 (every answer 0) | ≥0.8 | **FAIL** |
| | **AGENT STAND-IN** eval-v2 rubric, 2 runs + `agree` | QWK | **0.984** | ≥0.8 | pass* |
| Transfer (10) | Deterministic: tutor key | QWK | **0.151** | ≥0.8 | **FAIL** |
| | **AGENT STAND-IN** rubric | QWK | **1.000** | ≥0.8 | pass* |
| Free + transfer (50) | Deterministic tutor key / STAND-IN | QWK | 0.045 / 0.987 | ≥0.8 | FAIL / pass* |

\* Stand-in "passes" show that the rubric is usable and that the stand-in replies pass the real validators. They are **not** evidence of how the production model scores, and they are inflated (see §2). All stand-in replies passed `validateShortAnswer` / `validateProposal`; both stand-in rubric runs agreed (`agree`) on 50/50.

## 2. Method and honesty notes

- **Answers** (`answers.json`, built by `build_answers.py`): 100 synthetic answers, written by this agent to look like Arabic-L1 A1–A2 learners, to 100 items from 17 outcomes of the A1–A2 bank (33 outcome files existed at the time). Mix: 50 controlled/error-correction, 40 free production, 10 transfer. Neutral ids, no study arm, no tutor data. The design intent per answer (correct / minor slip / wrong / off-target error / target avoided / format variant) is in `answers_design.json` and was not used for scoring.
- **Reference scores — NOT three independent raters.** `scorer1/2/3.json` are three scoring passes by **the same single agent**, each pass reading only the rubric and `answers.json`. The agent could not isolate itself from its own memory of writing the answers and the rubric, so the passes are not independent. Majority vote → `reference.json`. Two answers split 2–1 (a1a2-009 `are close`, a1a2-072 `I can swimming`); no three-way ties, so no tie-break re-read was needed. The 072 split shows a rubric ambiguity (tf0 "wrong form" vs tf1 "wrong ending after a correct auxiliary"); the rubric should say which wins.
- **Deterministic arm**: `harness.ts` (run from `backend/` with `npx tsx ../research/assessment-validation/a1a2/harness.ts`) imports and calls the real functions: `gradeAnswers` (`grading.ts`) with `correctAnswer = answerKey`, choice items as `multiple-choice`, others as `short-answer`, free/transfer as `open-response`; `evaluateAgainstKey` (`languageLearningState.ts`) with the item's `acceptedAnswers`, with `ENARA_ENGINE_V2` unset and `=keyMatch`. CORRECT → full points, anything else → 0.
- **Stand-in arm** (`standin_short.json`, `standin_rubric_run1/2.json`, built by `build_standin.py`): labelled **AGENT STAND-IN — not the production grader**. The agent applied the exact `evaluateShortAnswer` system prompt and `RUBRIC_SYSTEM` (eval-v2, production policy) with the rubric criterion from `SCORING_RUBRIC.md` §2.3. Replies went through the real `validateShortAnswer`, `validateProposal` and `agree`. Same agent as the reference → strong circularity; treat stand-in numbers as an upper bound.
- QWK on the 0/1/2 scale; deterministic key arms can only give 0 or 2. Output per answer: `results.json`.

## 3. Grader failures found (grader not changed)

| # | Failure | Answers | Recommended fix |
|---|---|---|---|
| 1 | **Assignment key compares raw strings**: trimmed + lower-cased only. A final full stop (`is.`), a missing full stop, a contraction (`'re`, `there's`, `I'd like`), `cannot`/`can not` for `can't`, a curly apostrophe or a missing comma all score 0. | 002, 004, 006, 007, 017, 026, 032, 033, 041, 042, 047, 048, 050 | Use the tutor's normaliser (`normAnswer` + `expandContractions`) in `gradeAnswer`. |
| 2 | **One `correctAnswer` only** in the assignment grader. Valid alternatives (`In my village, there is…`; full sentence for a position item) fail. | 030, 049 | Add `acceptedAnswers[]` to `IQuestion` and match any. |
| 3 | **Multiple-choice has no fallback and no letter/text equivalence**: `an umbrella` for option `an`, `(b) Can I have a bag, please?` for `b` score 0 in every arm. | 014, 046 | Accept the option letter, the option text, or the text with the gap filled; or render choices as real options in the UI. |
| 4 | **Off-target slips sink exact matches** (`bussy`, `grandmothers`, `close`): the key cannot score the target form only. | 008, 009, 023 (+ 035 `cant`) | Deterministic target-form scorer per form (doc §6.2 of GRADING_FOR_OUTCOMES), or route misses to the meaning check. |
| 5 | **Meaning check over-credits target avoidance**: the short-answer prompt accepts "different wording", so `My village has a small mosque.` is marked correct for a *there is* item. It would also accept target-form spelling slips (`biger`) as "spelling slips" on short-answer items. | 031 | Add the item's target form to the short-answer prompt ("the answer must use <targetForm>; spelling of the target form counts"). Prompt change needs an API-validated run. |
| 6 | **Free sentences get no deterministic score**; `evaluateAgainstKey` returns null for every free answer (accepted answers are descriptions), and `answerHasTargetForm` cannot work because `targetForm` is a description, not a list of forms. | all 40 free | Author free items as `open-response` with the §2.3 rubric (model path), and add machine-readable `targetForms` lists. |
| 7 | **Transfer keys too narrow**: `I had eggs and bread.`, `I'm single.`, `On Friday evening I'm going to…`, `Art club is on Tuesday at 4:00 in October.` all 0. | 094, 096, 097, 098 (+ 092 slip, 099 partial) | Score transfer with the rubric, not the key. |
| 8 | **Bank data: notes inside `acceptedAnswers`.** 585 of 891 items carry lines such as `Case-insensitive; ignore final punctuation…`, `Model answer; …`, `I'm single/married.`, `(any order; 2 = …)`. The tutor key treats them as literal answers (a learner typing the note would be marked CORRECT; slash patterns never match). | 094, 098 and bank-wide | Move notes to a `matchingNote` / `scoringNote` field; expand slash patterns into separate answers. (Bank fix, not grader.) |
| 9 | `keyMatch` (contractions) made **no difference** here because the bank already lists most contracted variants; its value is for items that don't. | — | None. |

## 4. What this does not show

- How the production model (eval-v2) scores these items: needs an approved API run (`backend/src/scripts/gradingBenchmark.ts`) on the same `answers.json` + `reference.json`.
- Agreement with human teachers: the reference is one agent. Next step: two teachers score `answers.json` blind with the rubric; recompute.
- Real learner language: answers are synthetic.

## 5. Files

`answers.json`, `answers_design.json`, `build_answers.py`, `scorer1.json`, `scorer2.json`, `scorer3.json`, `reference.json`, `standin_short.json`, `standin_rubric_run1.json`, `standin_rubric_run2.json`, `build_standin.py`, `harness.ts`, `results.json`.

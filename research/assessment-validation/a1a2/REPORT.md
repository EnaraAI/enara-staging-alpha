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

## Round 2 (counted) — independent blind reference, blind grader run

DRAFT. Supersedes the round-1 numbers above, whose reference scores came from one agent scoring three times.

- **Reference:** 3 separate agent scorers, each reading only the rubric and the 100 answers, blind to each other and to earlier scores. All 3 agreed on 84 of 100; every other case had a 2-of-3 majority (no 3-way ties). `round2/REFERENCE.json`.
- **Grader run:** a 4th agent, blind to the reference. Deterministic = real grader code offline (`gradeAnswer` for exact items; `evaluateAgainstKey` for target-form items, right→2 / wrong→0). Stand-in = an agent applying the grader's own eval-v2 short-answer and rubric prompts, outputs passed the real validators; **AGENT STAND-IN — not the production grader**, one run per answer.

| Path | Exact items (53): agreement | Target ≥95% | Free/transfer (47): QWK | Target ≥0.80 |
|---|---|---|---|---|
| Deterministic (production code, offline) | 60.4% | fail | 0.193 | fail |
| Agent stand-in for the model path | 92.5% | fail | 0.986 | pass |

**Verdict:** the existing grader is **not validated** for these outcome assessments. The deterministic path fails both targets; the model path (as approximated by the stand-in) passes the free/transfer target but misses the 95% controlled target. The model path could not be run for real (no API), so its numbers are an estimate only.

**Needed fixes (recommendations; grader unchanged):** see §3 above — normalised matching (case, final punctuation, contractions, curly apostrophes), multiple accepted answers in the assignment grader, option letter = option text for choice items, a target-form-only scorer (0/1/2) for free sentences, and a guard so the meaning check cannot credit answers that avoid the target form. Re-run this validation (round 3) after those fixes, and with the real model path.

## Round 3 — graderV2 ON, final item bank (counted)

SIMULATION ONLY · DRAFT. Supersedes round 2, which ran on the item bank before review rounds 2–5 and the user's decisions.

- **Answers:** 150 new simulated answers (`round3/answers.json`) on the final bank, covering all 33 outcomes that passed review: 75 exact (0/1) and 75 target-form (0/1/2). No round-2 answers were reused.
- **Reference:** 3 new independent agent scorers, rubric only (`round3/scorer_S1..3.json`). The reference is the majority score (`REFERENCE.json`). All 3 scorers agreed on 147 of 150 answers; on the other 3, two of three agreed. The scorers run on the same model and read the same rubric, so shared bias is likely. The reference is only as good as the rubric and does not replace human raters.
- **Grader run:** a 4th agent, blind to the reference, ran it two ways:
  - **Deterministic path:** the real production code with `ENARA_ENGINE_V2=graderV2`, called from `round3/harness3.ts`.
  - **Model path:** an **AGENT STAND-IN, not the production grader**. It applied the eval-v2 prompts, passed its replies through the real validators, and then applied the graderV2 guard (`GRADER_STANDIN.json`). It scored answers the deterministic path missed and all target-form items.

| Path | Exact (75): agreement, target ≥95% | Free/transfer (75): QWK, target ≥0.80 |
|---|---|---|
| Deterministic, graderV2 ON | **96.0%**: pass | **0.754**: fail |
| Deterministic + model-path stand-in | 90.7%: fail | 0.904: pass (estimate) |

**Agreement by item type (deterministic):**
- gap-fill 19/19, multiple choice 13/13, controlled choice 7/7, controlled gap-fill 6/6, rewrite 2/2;
- transfer (exact) 5/5, transfer (0/1/2) 10/12;
- error correction 20/23;
- free production 49/63.

Every disagreement, with its outcome, answer and cause, is in `round3/AGREEMENT3.json`.

**Causes (deterministic, 19 disagreements):**
1. **No partial credit (5):** a target form attempted with one slip scores 0 instead of 1. Examples: "can to swim", "watchd", "is study", "very quite", "becuse".
2. **Over-credit (10):** the scorer checks one occurrence of the target form but misses errors in the rest of it. Examples: "he correct it", "his wife is", "visites", "cleanned", "elevn", "don't never", "but not the money", lowercase "mrs". It also gave full credit to a fragment ("My cousin.") and to a wrong collocation ("does the beds").
3. **No rule for word order (1, R3-044):** the scorer returns no rule, so the answer scores 0.
4. **Error correction (3):** a valid correction that is not in the accepted list scores 0: "Honey good…", "their dog", "there is small mosque".

**Causes (model-path stand-in, controlled items):** the meaning check credits misspellings on items that test spelling or case: "carot", "fourty", "grand father", lowercase "september" and "thursday". The graderV2 guard covers only a missing target form, not spelling- or case-sensitive items.

**Action:** round-4 fixes for these causes are in progress (see `round4/FIX_TASK.md`). They will be checked on a NEW set of 150 answers (round 4). Per the stopping rule, that is the last round.

**Model path: NOT VALIDATED.** Its numbers come from an agent stand-in and are estimates only. Validation needs a run with the API.

## Round 4 — after the round-3 cause fixes, NEW answer set (final round)

SIMULATION ONLY · DRAFT. This is the last round under the stopping rule (at most 2 rounds after the fix).

- **Answers:** 150 new answers (`round4/answers.json`) covering all 33 outcomes that passed review: 75 exact and 75 target-form.
  - Weakness: 17% of the answers are partial or debatable, against a planned 30%. The partial-credit fix was therefore tested on fewer cases than planned.
  - 10 short answers (for example "many", "I don't know") also appeared in round 3.
- **Reference:** 3 new independent scorers. All 3 agreed on 148 of 150 answers; the reference is the majority score.
- **Grader:** production code with `ENARA_ENGINE_V2=graderV2`, including the round-3 fixes (commit ffaab29). It ran blind, with no fallbacks. The model path was an AGENT STAND-IN, as in round 3.

| Path | Exact (75): agreement, target ≥95% | Free/transfer (75): QWK, target ≥0.80 |
|---|---|---|
| Deterministic, graderV2 ON | **93.3%** (70/75): **fail** | **0.819**: **pass** |
| Deterministic + model-path stand-in | 92.0%: fail | 0.923: pass (estimate) |

**Agreement by item type (deterministic):**
- multiple choice 9/9, controlled gap-fill 11/11, rewrite 3/3;
- gap-fill 23/25;
- error correction 24/27;
- free production 56/60, transfer (0/1/2) 11/15.

Every disagreement, by outcome, is in `round4/AGREEMENT4.json`.

**Disagreements and causes (deterministic, 13):**

*Controlled items (5): the grader is too strict.*
- R4-007 (article-the): a valid correction is not in the accepted list. The accepted-answer list needs wider coverage.
- R4-036 (there-is-are), "theres": a missing apostrophe is not normalised.
- R4-060 (family), "My parents lives…": the kin word is right and the slip is in another word. The exact items have no target-only scoring.
- R4-080 (comparatives), "longer then": the target is fixed, but "then"/"than" is debatable. 2 of 3 scorers gave 1.
- R4-115 (present-continuous), "I'm reading" in a gap that already shows "I": the gap answer repeats the subject.

*Free/transfer items (8).*
- Over-credit, scored 2 where the reference gave 0:
  - R4-082 and R4-083 (comparatives): "more big", "more new" are not detected.
  - R4-092 (frequency adverbs): the adverb position is not checked.
  - R4-122 (some/any): "some" in a question is not detected.
  - R4-029 (possessive adjectives): "Laila… his phone". The scorer cannot know the gender of a name.
- R4-113 (past simple regular): scored 2, reference 1. The second verb ("wash") is not checked.
- Under-credit, scored 0 where the reference gave 1:
  - R4-110 (past simple irregular): "buyed" counts as a slip.
  - R4-149 (weather): "wett" counts as a slip.

**Model-path stand-in:**
- The graderV2 guard blocked the misspellings on spelling-sensitive items ("thursday", "hony").
- It also blocked "theres", which the reference accepts.
- In production the guard is wired only to the short-answer check. The stand-in also applied it to 6 rubric answers, so its free-item estimate is slightly stricter than production would be.

### Final verdict (A1–A2, after 2 rounds)
- **Deterministic path, graderV2 ON:**
  - Free/transfer: **meets the target** in round 4 (QWK 0.819). It failed in round 3 (0.754), before the fixes. 0.819 is close to the 0.80 line, and n = 75.
  - Controlled: **does not meet the target** in round 4 (93.3%). It met it in round 3 (96.0%), but that round's answers were later used to design the fixes.
  - Overall: **not validated**, because the controlled target was missed on the fresh answer set.
- **Model path: NOT VALIDATED.** The numbers above are agent stand-in estimates. Validation needs a run with the real model, which means the API.
- **Remaining causes, not fixed (the stopping rule was reached):**
  1. Accepted-answer coverage on error-correction items.
  2. Apostrophe-less contractions ("theres", "cant").
  3. Target-only scoring for exact error-correction items.
  4. Comparative "more + short adjective".
  5. Adverb position.
  6. "some" in questions.
  7. Second-verb checks in the past simple.
  8. Irregular-past over-regularisation scored as a slip.
  9. Gender of named people.
- **Item bank faults** found by scorers: `targetForm` fields that don't match the prompt/key in food-drink C-5 ("five bananas" vs pepper), jobs-workplaces B-5 ("a pilot" vs driver) and the round-3 item ("bald" vs "thin").
- **Limits:**
  - agent scorers only, very likely sharing biases (147/150 and 148/150 unanimous);
  - no human raters;
  - n = 75 per item group;
  - the rules are hand-written word lists.

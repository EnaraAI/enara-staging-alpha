# Failure analysis (LTB v1.0)

Sources: `case_scores.csv`, `aggregate_results.json`, `raw_results.jsonl`, `judge_results.jsonl`. Pedagogical scores and failure tags are **automated provisional scores from an LLM judge** (Sonnet 5.5) and have not been reviewed by an educator. Deterministic checks are automatic. Nothing in the tutor, the engine or the prompts was changed after the run. This is the baseline.

## Summary

There were no critical failures and no privacy failures. No case scored 0 on any dimension, so the outcomes are 21 `meets_expectations` and 99 `partially_meets`. The weak points cluster in five places, ranked by impact:

| # | Finding | Where it shows | Root cause (traced) | Owner |
|---|---|---|---|---|
| F1 | **Answers given on request.** The tutor hands over the full answer when a learner asks, instead of hinting first | T13: 9/9 judged *major over_helping*; pedagogical mean 1.0, scaffolding 1.0 | The engine's own rule: without a `hints_only` policy, an answer request selects `answer_with_reasoning` (LTC-D6). It did so in 9/9 cases, and the model followed it | Design decision (engine rule) |
| F2 | **Learner answers not recognised as answers** | `expected_move_any` failed 32/111; 23 of the misses are in the answer-feedback types (T03–T08), where `corrective_feedback_retry` was expected | `answeringCheck` needs the tutor's last reply to end with a question in its last 300 characters. The tutor usually ends exercises with an instruction ("Write your answers, and I'll check them!"). The check fired on only 48/90 later turns | Engine signal rule |
| F3 | **No adaptation of length or register to age** | `within_word_limit` failed 30/120, 25 of them children. Median reply length: child 117 words, teen 127, adult 124. Child `age_proficiency_fit` mean 2.02, against 2.77 for teens and adults | The engine only knows "school" or "adult" (from a digit in the grade). Child and teen get the same instruction, and no length target is given to the model | Engine context + prompt |
| F4 | **Off-topic requests partly done** | T11: `off_topic_redirect` 1/9; 4 judged *major boundary_failure* (2 adult emails fully written, 2 child maths methods taught) | The engine has no off-topic signal: T11 turns got generic moves (`activate_prior_knowledge`, `short_explanation` …). The base tutor prompt leaves the boundary to the model | Engine signal + prompt |
| F5 | **Verbosity** | Most frequent judge tag: verbosity, 76 tags (74 minor, 2 major). Clarity mean 2.73 | Same as F3; tables and headings in most replies | Prompt |

## Other observations

- **Context fidelity mostly holds.** No invented test scores, levels or histories were found. Two *context_invention* tags on T10 ("Your next lesson is General practice") come from a **harness artefact**: the T10 fixture course carries one placeholder chapter titled "General practice", which the tutor can see in the course tree. They should not be counted as tutor fabrication. See the limitations in `final_report.md`.
- **Mastery language.** `no_mastery_or_percentage_claim` failed on 7 cases. All 7 are **check false positives**: the tutor glossed frequency adverbs as "always = 100%" and "never = 0%". The check's regex flags any percentage. The judge found one minor *premature_mastery_claim* in total. The frozen check is reported as-is and is not edited after the results.
- **Factual slips.** 4 minor: a confusing "m-other" wordplay tip; a ❌ mark on a correct sentence; a misdescribed lesson example; and "gone" offered where the lesson uses "been".
- **Strong areas.** T05 (partially correct answer) had 6/9 meeting expectations and pedagogy 3.33; T02 (word in context) reached lesson alignment 3.22; T10 (missing context) asked a clarifying question 9/9.
- **Level (CEFR) had little effect on scores** (A1 2.48, A2 2.36, B1 2.54 pedagogical means). **Cohort** had the larger effect (children lowest on every dimension).

## Failure category counts (judge, all cases)

| Category | Minor | Major | Critical |
|---|---|---|---|
| verbosity | 74 | 2 | 0 |
| over_helping | 29 | 16 | 0 |
| level_mismatch | 25 | 6 | 0 |
| lesson_drift | 25 | 5 | 0 |
| under_scaffolding | 21 | 1 | 0 |
| age_tone_mismatch | 13 | 0 | 0 |
| context_invention | 8 | 2 | 0 |
| ignored_learner_reply | 8 | 1 | 0 |
| no_formative_check | 7 | 1 | 0 |
| factual_error | 4 | 0 | 0 |
| boundary_failure | 0 | 4 | 0 |
| premature_mastery_claim | 1 | 0 | 0 |

## Suggested next steps (not implemented; each needs a decision and a re-run)

1. **F1:** decide whether "hint first, answer after one attempt" should be the default for language courses even without `hints_only`. This is a pedagogy choice for ENARA and 4Level1.
2. **F2:** widen `answeringCheck` to accept a closing instruction ("write", "try", "complete", "your turn") as well as a question mark. Add regression cases from T03, T04 and T07.
3. **F3:** derive a child or teen band from the grade, and pass a word target per band and level into the language block.
4. **F4:** add an off-topic signal and a `redirect_to_lesson` move.
5. Re-run the same 120 frozen cases, using the same rubric and scoring spec, to measure the change against this baseline.

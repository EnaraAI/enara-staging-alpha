# Failure analysis: `ltc-v1-r2` (regressions and remaining partial cases)

Judge tags are automated and provisional. Root causes are **hypotheses**, checked against the engine state stored on each turn (`meta.languageTurn` in `raw_results.jsonl`). All IDs are synthetic.

## 1. Every r1 → r2 regression (18 cases: meets → partial)

| Case | Type | Judge mean r1 → r2 | Engine moves vs r1 | r2 tags |
|---|---|---|---|---|
| LTB-CA1-T08 | T08 | 3 → 2.14 | same | major ignored_learner_reply; minor no_formative_check; minor over_helping |
| LTB-CA2-T04 | T04 | 3 → 1.86 | same | major ignored_learner_reply; minor lesson_drift; minor over_helping |
| LTB-CB1-T02 | T02 | 3.17 → 2.83 | same | minor level_mismatch |
| LTB-CB1-T04 | T04 | 3 → 2.86 | same | minor ignored_learner_reply |
| LTB-CB1-T11 | T11 | 3 → 2.83 | same | minor lesson_drift; minor age_tone_mismatch |
| LTB-CB1-T13 | T13 | 3 → 2.71 | same | minor age_tone_mismatch; minor over_helping |
| LTB-TA1-T07 | T07 | 3.14 → 2.86 | same | minor under_scaffolding; minor lesson_drift |
| LTB-TA1-T09 | T09 | 3 → 2.83 | same | minor lesson_drift; minor age_tone_mismatch |
| LTB-TA1-T12 | T12 | 3 → 2.57 | same | minor over_helping |
| LTB-TA2-T05 | T05 | 3.14 → 2.86 | same | minor ignored_learner_reply |
| LTB-TA2-T12 | T12 | 3 → 2.71 | same | major over_helping; minor under_scaffolding |
| LTB-TB1-T04 | T04 | 3 → 2.43 | same | minor lesson_drift; minor verbosity |
| LTB-AA1-T12 | T12 | 3 → 2.29 | same | minor verbosity; minor over_helping; minor level_mismatch |
| LTB-AA2-T01 | T01 | 3 → 3 | same | minor verbosity |
| LTB-AA2-T04 | T04 | 3 → 2.57 | same | minor verbosity; minor lesson_drift; minor ignored_learner_reply |
| LTB-AA2-T12 | T12 | 3 → 2.57 | same | major over_helping; minor level_mismatch |
| LTB-AB1-T01 | T01 | 3 → 2.67 | same | minor verbosity; minor level_mismatch |
| LTB-AB1-T04 | T04 | 3 → 2.57 | same | minor lesson_drift; minor verbosity |

**The engine made the same choices in all 18 cases.** Every regressed case had a move sequence identical to r1. So the regression is in the model's reply, not in the engine's choice. Two contributors, which this single run can't separate:

1. **Prompt text changes in r2 that reach these cases:**
   - P2's "deal only with the most important one" in feedback turns (all T04, T05 and T07 cases here);
   - P1's "model on a different example" (5 cases);
   - the policy revision label (all cases).

   For the 7 first-turn cases (T01, T02, T09, T11, T12, T13 first turns), the only prompt difference is the revision label, and in T12/T13 the P2 text.
2. **Sampling variance.** The tutor runs once per condition. Between r1 and r2, 18 cases flipped down and 29 flipped up, many with identical prompts. Changes of ±1–4 cases per type are within the noise this design can show.

**Clusters:**
- **T04 minor error** went from 5 to 0 meets (pedagogy 2.33 → 1.89). Judge: "*ignored_learner_reply* — critiques the self-corrected answer for lacking a frequency word" (CA2-T04, major), plus `lesson_drift` (the tutor's own exercise differs from the case item).
  - Hypothesis: the self-corrected answer ("— sorry, She goes…") is confirmed but then judged against the tutor's own invented exercise. That's the same exercise-mismatch pattern as r1 R-7, possibly amplified by P2's prioritisation wording.
  - Not fixed, to avoid tuning after seeing results.
- **T12 contradictory evidence** went from 7 to 4 (pedagogy 2.89 → 2.56): `over_helping` (AA2-T12, major: gives the corrected sentence first).
  - The engine sends T12 first turns down the novice / strong-mastery mix (`fade_support` + `independent_practice` + `short_explanation`). Those moves contradict each other on an error-containing first message. This rule predates r1.
  - Candidate fix (not applied): treat a first message containing an error as an answer to evaluate.

## 2. Remaining partial cases (44)

By type: T01 4, T02 6, T03 1, T04 9, T05 1, T06 2, T07 4, T08 7, T09 1, T10 1, T11 1, T12 5, T13 2.

Top tags in partial cases: minor lesson_drift (14), minor level_mismatch (11), minor under_scaffolding (11), minor verbosity (10), minor ignored_learner_reply (9), minor over_helping (8), minor age_tone_mismatch (7), major ignored_learner_reply (5).

| Pattern | Evidence | Hypothesis | Proposed next step (not applied) |
|---|---|---|---|
| Exercise mismatch (`lesson_drift`, `ignored_learner_reply`) | T04, T08, T07 | The lesson spec has no practice items, so the tutor invents exercises and then judges answers against them | Curriculum-authored `practiceItems` in `languageSpec` (content work, not engine logic) |
| No escalation after success | T08 (2/9 meets) | The engine has no correctness signal, so it keeps choosing feedback | A within-session success streak from the tutor's own confirmations (design decision) |
| T12 move mix | T12 4/9 | The novice and strong move sets are both added on an error-containing first message | Classify an error-containing first message as an answer to evaluate |
| Child register and level (`level_mismatch` / `age_tone_mismatch`) | child cells | **BLOCKED**: no trusted child or teen band | Add a staff-set age band (needs authorisation) |
| Mastery/% regex | T02 (4) | Known false positive ("always = 100%") | None (check limitation) |

## 3. Major tags in r2 (7)

- **LTB-CA1-T04**, ignored_learner_reply: Learner's answer matched the lesson exercise (He is twelve) but was treated as incorrect.
- **LTB-CA1-T08**, ignored_learner_reply: The learner twice showed correct, self-generated introductions, yet the tutor kept the original blank and did not adapt.
- **LTB-CA2-T04**, ignored_learner_reply: The learner's answer was correct for 'She go to bed at ten'. The tutor critiques it for lacking a frequency word, which was not required.
- **LTB-TA2-T08**, ignored_learner_reply: Does not recognise the learner's unassisted correct use of 'always' before the main verb as evidence to move forward.
- **LTB-TA2-T12**, over_helping: Gives the corrected sentence and the I/she contrast before the learner has a chance to self-correct.
- **LTB-AA1-T04**, ignored_learner_reply: Treats an essentially correct answer as incomplete rather than confirming it. It also misses the capital 'H' point and doesn't move forward to the nex
- **LTB-AA2-T12**, over_helping: Gives the corrected sentence and the full rule before letting the learner self-correct; a hint would have been better.

There are no critical tags. The T10 placeholder ("General practice") produced **no** context-invention tags in r2 (baseline 2 major, r1 2 major).

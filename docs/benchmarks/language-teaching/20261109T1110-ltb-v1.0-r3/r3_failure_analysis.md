# r3 failure analysis

Judge tags are automated and provisional. Root causes are **hypotheses**, checked against the engine state stored on each turn and the repeated-run diagnostic (`r3_repeated_run_stability_report.md`).

## Official r3 vs r2

- 16 cases went partial → meets.
- **11 cases went meets → partial.**
- The engine's moves were identical to r2 in **10/11** of the regressions. Where they changed, it's because r3 added a new signal (T07, T08 or T12 reasons).

| Case | Type | Judge mean r2 → r3 | Moves vs r2 | Stability reps 1/2/3 | r3 tags |
|---|---|---|---|---|---|
| LTB-CA1-T03 | T03 | 3 → 2.71 | same | partially/partially/partially | minor over_helping; minor verbosity |
| LTB-CA2-T10 | T10 | 3.33 → 2.83 | same | not in subset | minor level_mismatch |
| LTB-CA2-T11 | T11 | 3 → 2.83 | same | not in subset | minor no_formative_check |
| LTB-CA2-T12 | T12 | 3.14 → 2.86 | changed | meets/meets/meets | minor no_formative_check |
| LTB-CB1-T05 | T05 | 3 → 2.86 | same | not in subset | minor age_tone_mismatch |
| LTB-TA2-T07 | T07 | 3 → 2.29 | same | not in subset | minor over_helping; minor premature_mastery_claim; minor under_scaffolding |
| LTB-TB1-T01 | T01 | 3.17 → 2.83 | same | not in subset | minor verbosity |
| LTB-AA1-T08 | T08 | 3 → 2.14 | same | meets/meets/meets | major under_scaffolding; minor lesson_drift; minor no_formative_check |
| LTB-AA2-T07 | T07 | 3 → 2.86 | same | not in subset | minor no_formative_check |
| LTB-AB1-T07 | T07 | 3 → 2.86 | same | not in subset | minor verbosity |
| LTB-AB1-T11 | T11 | 3 → 3.17 | same | not in subset | minor verbosity |

**Regressed cases that are also in the stability subset** (CA1-T03, CA2-T12, AA1-T08) were mixed across repetitions. Each met expectations in at least one run, which is consistent with run-to-run variance rather than a fixed defect.

## T04, T08 and T12 (r2 regressions)

| Type | r2 (official) | r3 official | r3 stability reps | Verdict |
|---|---|---|---|---|
| T04 minor error | 0/9 | 3/9 | 4 / 5 / 3 | **Improved beyond the r3 noise band** (r2's 0 is below every rep). Still weak: 4/9 stable partial. Major tags: ignored_learner_reply (TA1, TA2), lesson_drift (TA2, AA1). The remaining issue is the tutor judging the answer against its own invented exercise (the "exercise mismatch" pattern since r1), not the minor-slip policy |
| T08 move on | 2/9 | 4/9 | 4 / 5 / 6 | **Improved.** The most variable type (judge-mean range 0.48). Major under_scaffolding (TA2, AA1) where `after_confirmed_success` did not fire, because the tutor's confirmation didn't open its reply, or fired but the tutor still repeated an easy item |
| T12 contradictory evidence | 4/9 | 5/9 | 9 / 8 / 7 | **Fixed.** 7/9 stable meets in the stability study. The official 5/9 is at the low end of that spread |

## The r1 → r2 wording audit (what the evidence shows)

| r2 change | Observed effect | r3 action |
|---|---|---|
| "deal only with the most important one now" (P2) | T04: the tutor ranked a non-target omission (the missing frequency word) as most important and asked for a redo of a correct answer | Revised to: "matters most for meaning and for this lesson's target; small slips briefly or not at all". Added a triage sentence |
| P1 "model on a different example, never their corrected answer" | T06 recovered in r2 (7/9) and r3 (8/9). No evidence of harm | Kept |
| Attempt-2 strategy shift (A) | T06 stable gains | Kept |

## Remaining patterns (top r3 tags)

minor lesson_drift (28), minor over_helping (25), minor no_formative_check (21), minor under_scaffolding (20), minor level_mismatch (16), minor verbosity (12), minor age_tone_mismatch (8), minor ignored_learner_reply (6), major ignored_learner_reply (3), minor factual_error (2)

| Pattern | Hypothesis | Next step (not applied) |
|---|---|---|
| Exercise mismatch (lesson_drift, ignored_learner_reply) | The lesson specs carry no practice items, so the tutor invents exercises and then judges answers against them | Curriculum `practiceItems` (content work) |
| no_formative_check (21, up from r2's 11) | The T08 "move on" and T12 "one quick check" texts may shorten the closing check; the judge wants a fresh transfer probe | Watch in the next iteration; inconclusive at n=1 |
| Child register | **BLOCKED**: no trusted child band (see the age provenance report) | Option B (staff-set age band) |

## Major tags (r3 official)

- **LTB-CA2-T08**, over_helping: Gives the start of the sentence and points to the verb form, despite the learner's unassisted success.
- **LTB-CA2-T08**, ignored_learner_reply: Does not build on the learner's own extra sentence; pulls back to the original task rather than extending it.
- **LTB-TA1-T04**, ignored_learner_reply: Learner's 'he is twelve' was essentially correct for the lesson exercise; tutor treated it as wrong rather than confirming it.
- **LTB-TA2-T04**, ignored_learner_reply: Learner correctly self-corrected; tutor treats the reply as not meeting the task and asks for a redo.
- **LTB-TA2-T04**, lesson_drift: Keeps the learner on the earlier unscramble exercise rather than confirming and moving to the next item.
- **LTB-TA2-T08**, under_scaffolding: Misjudges evidence: the learner already showed consistent success, yet the tutor reduces challenge and re-explains instead of moving to a transfer or harder task.
- **LTB-AA1-T04**, lesson_drift: It treats an essentially correct answer as incomplete and asks for a redo instead of confirming and moving on to the next item.
- **LTB-AA1-T08**, under_scaffolding: Does not recognise consistent success or reduce support; learner is not given a new or harder task.

There are no critical tags.

## Test-suite failures (full backend suite)

- **16 of 17 failures predate r3:** they reproduce identically with the r2 engine swapped back in (`logs/r2_engine_failed_files_check.log`).
- **The 17th** (`educatorAnalytics` chart render, 5 s timeout) passed on re-run. It's a timing flake.
- **None involves language-engine behaviour.** The two `elie` failures are the known "direct instruction" ped-v2 assertion.

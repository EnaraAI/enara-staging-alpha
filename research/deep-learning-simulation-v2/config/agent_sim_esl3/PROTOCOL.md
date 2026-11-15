# SIMULATION ONLY

# ESL stage 3: confirmatory protocol (pre-registration)

This file was committed before any ESL3 session ran. Nothing below may change after the first session starts. No real learners take part, and no API is called. Tutors, judges and raters are sub-agents, with at most 3 running at a time.

## 1. The one claim

On new learners, ENARA with `levelExplicit` (arm **A0+LE**) beats the plain tutor (arm **P**) on controlled post-test accuracy for explicit-first (A1/A2) learners.

## 2. Frozen simulator

These files are used exactly as they were in ESL2, last changed in commit `31861e0`. They are not edited.

| File | SHA-256 |
|---|---|
| `config/agent_sim_esl2/LEARNING_RULES.md` | `eaed36c6ace48ef0a6746103be961d9ad3165bcbfb8209d610a5f513356846b7` |
| `config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md` | `cebaa834dd5522bb142f3d69e53254e298a6365bc1e41076c1c598b623a93a59` |
| `src/offline/learnerSim.ts` (learner state, R1–R7 application, learner replies, **post-test generator** `postTest`/`POST_PROBES`) | `711c8334b6323dc9e72a5617072edf3b9fc808499080ca52f1d62aa78f71ebd4` |
| `src/offline/eslFixtures.ts` (lessons and the tutor's exercise items) | `7b616767502fc64d5f14ec2d2b8dbfc7e2019ac3e2612926425cb29500a3ebb6` |

The files written for this run are also fixed now:

| File | SHA-256 |
|---|---|
| `src/offline/esl3Study.ts` (session runner: a copy of `esl2Study.ts` with the ESL3 learners, arms and replications) | `24c4b2fd655efe00babd81b5e1c9e656f9c6c2342f1fd285d893806a3bfb4b56` |
| `src/offline/esl3_analyze.py` (the confirmatory analysis and the decision rule) | `1de8730b8ca3128c72d19c1803a5e676febab385d627abe56142b3ea967262fe` |
| `config/agent_sim_esl3/RATER_INSTRUCTIONS.md` | `ad490594e7273a037d1a84384a9b5dc29940077e079faf150b2886c5dcd9f7f6` |
| `backend/src/services/languageTeachingContext.ts` (engine, including the step 1 fix) | `6c36507e0942d17e19fd0e5d46e06d85a68a934f28f99a387d7257533b3c5727` |
| `backend/src/services/languageTurnPipeline.ts` (reply guards, including the step 1 fix) | `0dfd082d553bca837d9f8560145f2b6d53be708f2bf0ca83e59e1ed5621312fa` |

**Step 1 fix** (commit `3ae8c15`): the one-task rule. `learnerAsks` and `hasTwoAsks` read the tasks in a reply. Behind `levelExplicit`, `enforceSingleAsk` removes and defers the closing ask when the reply already sets another task. The cause groups are in `STEP1_TWO_ASKS.md`.

### Validation rerun (step 2): PASSED

The frozen simulator was run with the four scripted tutors on 12 new learners (ids 200–211, seeds `esl3-val`). Results are in `reports/exp4/agent_sim_esl3_validation/`.

| Check | Target | Result |
|---|---|---|
| Order of expected accuracy | d > c > b ≈ a | d 0.916 > c 0.583 > a = b 0.198 (sampled scores: d 0.938 > c 0.542 > a = b 0.215) |
| Judge agreement on a 20% re-judged sample | ≥ 85% | 98.5% (64 of 65) |
| Noise, same tutor run twice | small | c vs c2: −0.004 expected, −0.028 sampled; d vs d2: 0.000 expected, −0.007 sampled |

## 3. Learners

There are **60 new learners**, ids 100–159. None of these ids was used in ESL1 or ESL2 (which used 0–35); the validation used 200–211.

- **48 explicit-first learners:** 24 at A1 (ids 100–123) and 24 at A2 (ids 124–147). Forms rotate articles / copula *be* / third-person -s, so there are 16 per form. Primary wrong belief W1 or W2 alternates in blocks of three. Status is not_assessed or emerging, as in ESL2.
- **12 B2 proficient learners** (ids 148–159), as the no-harm check.

Each session has its own seed, `esl3|L<id>|rep<1|2>`. No seed from ESL1 or ESL2 is reused. Post-test items are the frozen generator's six abstract probes per form: 4 controlled and 2 free, each probing W1 and/or W2. Their outcomes are drawn from the new seeds, so no post-test draw is shared with ESL1 or ESL2. The item *structure* is the frozen generator's.

## 4. Arms and design

- **P:** the plain tutor, with the same prompt as ESL2.
- **A0+LE:** `wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit`, plus the 23-method plan, with the step 1 fix active.

The design is the same as ESL2:
- **Sessions:** 2 sessions of 5 turns each. Session 2 is a new chat, one simulated day later, and the knowledge state carries over.
- **Judging:** a blind judge applies `LEARNING_RULES.md` after every tutor turn, and a script generates the learner's reply.
- **Replications:** 2, with different seeds. Every learner gets both arms in both replications, giving 60 × 2 × 2 = **240 sessions** and 2,400 tutor turns.
- **Agent work:**
  - 12 tutor agents per round (one per arm × replication × third of the learners, 20 sessions each).
  - Judge batches of 36 cases, mixed across arms.
  - At most 3 agents at a time.

**Failed or cut work:**
- If a tutor or judge agent fails or leaves a session incomplete, its output is kept as `PARTIAL_<name>` and the work is rerun.
- No session is dropped. The analysis refuses to decide (`complete = false`) unless every learner has both arms in both replications.

## 5. Primary hypothesis: the only confirmatory test

**A0+LE − P on controlled post-test accuracy, explicit-first learners (n = 48), each learner's two replications averaged.**

- **Test:** exact paired sign-flip test, two-sided, alpha 0.05.
- **Multiplicity:** there is one primary contrast, so no correction is applied.
- **Interval:** a 95% bootstrap interval (10,000 resamples, seed 7) is also reported.

**Power before running** (`POWER.json`, from the ESL2 explicit-first differences: mean +0.167, SD 0.292, n = 24). These figures resample ESL2's one-replication differences, which is conservative because averaging two replications can only reduce the post-test noise part of the spread.

| Scenario | Power |
|---|---|
| n = 48 at the ESL2 effect (+0.167) | about 1.00 (0.998) |
| n = 48 at half that effect | 0.38 |
| n = 24 at the ESL2 effect | 0.75 |

## 6. Secondary outcomes: descriptive only, with intervals, no claims

- free-production accuracy;
- wrong beliefs that reached strength 0;
- expected (probability) versions of controlled and free accuracy;
- each replication on its own;
- the per-round trajectory of W1+W2;
- one blind rating pass: replication 1, two tutors per learner (labels V/W, random order), 6 batches of 10 learners, using `config/agent_sim_esl3/RATER_INSTRUCTIONS.md`;
- **B2 no-harm:** every B2 learner must end with W1 = W2 = 0 in both arms and both replications.

## 7. Guards: pass/fail for A0+LE

1. **Two asks:** replies with two asks are at most 2% of A0+LE turns. This is measured on the final reply the learner sees, with `hasTwoAsks` as in the step 1 fix. The raw count before the guard is also reported.
2. **Leaked answers:** A0+LE has no more turns with a leaked answer in the final reply than P (`leakFinal`, the same check as ESL2).
3. **Answer-protection rating:** the mean blind answer_protection score for A0+LE is not below P's.

## 8. Decision rule, fixed now

- The claim is **CONFIRMED** only if all of these hold:
  - the primary test gives p < 0.05;
  - the 95% interval lies above zero;
  - all three guards pass;
  - the data are complete.
- Otherwise it is **NOT CONFIRMED**.

Whatever the result, no other outcome, subgroup, replication split or analysis will be presented as confirming the claim.

## 9. Run order

1. `esl3Study.ts init`.
2. For rounds 1–10:
   1. tutor agents (`tprompts` → answers → `tapply`) for all 12 cells;
   2. `jprep`, then judge agents, then `japply`.
3. `post`, `tags` and `rateprep`, then the 6 rater agents.
4. `esl3_analyze.py`.
5. The report at `reports/exp4/AGENT_SIM_ESL3.md`.

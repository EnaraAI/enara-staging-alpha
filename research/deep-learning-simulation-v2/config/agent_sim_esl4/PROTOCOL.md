# SIMULATION ONLY

# ESL stage 4: confirmatory protocol against a strong baseline (pre-registration)

This file was committed before any ESL4 session ran. Nothing below may change after the first session starts. No real learners take part, and no API is called. Tutors, judges, raters and fidelity checkers are sub-agents, with at most 3 running at a time.

## 1. The one claim

On new learners, ENARA with `levelExplicit` (arm **A0+LE**) beats a **strong plain baseline (P+)** on controlled post-test accuracy for explicit-first (A1/A2) learners.

## 2. The strong baseline P+

- **Prompt:** P+ uses exactly the system prompt in `config/agent_sim_esl4/PPLUS_PROMPT.txt` (SHA-256 `e373018e76243b1c6817dc1bdcbd8f60d3aff0cbf54d90312bbdd13cb7655472`), copied word for word from the brief.
- **Appended data:**
  - the line `Learner level: <A1|A2|B2> (CEFR)`, because the prompt refers to "the learner's level given below";
  - the lesson data in exactly the form P received it in ESL3: title, objective, objectives, success criteria, vocabulary, grammar, examples and the practice exercises;
  - the conversation so far.
- **Excluded:** nothing from ENARA is added. That means no engine, no moves, no hint ladder, no switches and no reply guards. P+ replies are stored exactly as the agent wrote them.

## 3. Frozen components

| File | SHA-256 |
|---|---|
| `config/agent_sim_esl2/LEARNING_RULES.md` (unchanged since ESL2) | `eaed36c6ace48ef0a6746103be961d9ad3165bcbfb8209d610a5f513356846b7` |
| `config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md` | `cebaa834dd5522bb142f3d69e53254e298a6365bc1e41076c1c598b623a93a59` |
| `src/offline/learnerSim.ts` (simulator and post-test generator) | `711c8334b6323dc9e72a5617072edf3b9fc808499080ca52f1d62aa78f71ebd4` |
| `src/offline/eslFixtures.ts` (lessons and exercise items) | `7b616767502fc64d5f14ec2d2b8dbfc7e2019ac3e2612926425cb29500a3ebb6` |
| `backend/src/services/languageTeachingContext.ts` (A0+LE engine, the same as ESL3) | `6c36507e0942d17e19fd0e5d46e06d85a68a934f28f99a387d7257533b3c5727` |
| `backend/src/services/languageTurnPipeline.ts` (reply guards, the same as ESL3) | `0dfd082d553bca837d9f8560145f2b6d53be708f2bf0ca83e59e1ed5621312fa` |
| `src/offline/esl4Study.ts` (runner) | `f858c164cde8daa901518884b9048988b26bb4aa176fd7e522d3d6e378b8f221` |
| `src/offline/esl4_analyze.py` (confirmatory analysis and decision rule) | `2b8c54b0f2329383752a719e56b5fb17d4bb7f369f5ee8ac466150e50a052d7b` |
| `src/offline/esl4_fidelity.py` | `a55d4a00a5d1bfbda7e0502d3b729025b721978b4b8485c88c698bf4d8c51a4c` |
| `config/agent_sim_esl4/RATER_INSTRUCTIONS.md` | `77b8c0e6040b4bf5d8b3fb60ed23ea4e1d1ffc4f127f1cb52bf4346e9b1c69a8` |
| `config/agent_sim_esl4/FIDELITY_INSTRUCTIONS.md` | `f4c0b7aa1e98e96ceb1ab16d00c381b50ae1e06215e457b6f3b6784b7fdd53e3` |

The engine files were last changed in commit `3ae8c15`, the ESL3 step 1 fix. A0+LE uses `wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit` plus the 23-method plan, exactly as in ESL3.

**Simulator validation:** the frozen simulator passed in ESL3 step 2, with the order d > c > b ≈ a and 98.5% judge agreement. Instead of a new validation run, ESL4 rechecks judge agreement during the study itself (section 7).

## 4. Sample size

The power analysis is in `POWER.json`, computed by `src/offline/esl4_power.py`.

- **ESL3 spread:** the SD of the learner-level, replication-averaged controlled-accuracy difference was 0.307 (n = 48).
- **Target:** 80% power to detect +0.08 with the two-sided sign-flip test at alpha 0.05.
- **Required n:** about **116** by the normal approximation.
- **The cap binds:** that is above the cap of 96, so **n = 96 explicit-first learners**.

Power at n = 96 for an effect of +0.08:

| Method | Power |
|---|---|
| Normal approximation | 0.72 |
| Simulation (resampled ESL3 differences, Monte Carlo sign-flip) | 0.78 |

**The study is therefore slightly under 80% power for an effect as small as +0.08.** This is stated now, before any result.

## 5. Learners

There are **108 new learners**, ids 300–407. Ids 0–35 were used in ESL1/ESL2, 100–159 in ESL3, and 200–211 in the ESL3 validation.

- **96 explicit-first learners:** 48 at A1 (ids 300–347) and 48 at A2 (ids 348–395). The forms (articles / copula / third-person -s) rotate evenly, giving 32 per form. The primary wrong belief alternates in blocks of three.
- **12 B2 learners** (ids 396–407), as the no-harm check.

**Seeds:** each session's seed is `esl4|L<id>|rep<1|2>`, and all case, rater and fidelity sample hashes are salted with `esl4`. No learner, seed or post-test draw from ESL1–3 is reused. The six post-test probes per form are the frozen generator's structure, with outcomes drawn from the new seeds.

## 6. Arms and design

**Arms:**
- **P+**, stored as `PP`.
- **A0+LE**, stored as `LE`.

**Design** (the same as ESL3):
- 2 sessions of 5 turns each, with session 2 a new chat one simulated day later.
- 2 replications with different seeds; every learner gets both arms in both replications.
- That gives 108 × 2 × 2 = **432 sessions** and 4,320 tutor turns.

**Judging:** blind judges apply `LEARNING_RULES.md` and never see the arm. The judge input contains only the knowledge state, the learner's production and the tutor turn.

**Agents and failed work:**
- Each tutor agent handles exactly **one cell of 18 sessions** (24 cells per round), and must write every reply itself. Scripted, templated or grouped replies are kept as `PARTIAL_*` and redone.
- Judge batches hold 36 cases.
- Failed or cut work is kept as `PARTIAL_*` and rerun. No session is dropped.
- The analysis refuses to decide unless the data are complete.

## 7. Judge agreement (rechecked during the study)

- **Rounds:** 3 and 7.
- **Sample:** a stable 20% of that round's judged cases, selected by `rand('esl4-agree', caseId) < 0.2`.
- **Method:** each sampled case is re-judged blind by a second judge on the identical input. Agreement means both judgements lead to the same knowledge state.
- **Target:** at least 85%.
- **If below target:** the result is reported as a validity failure next to the decision, and the decision rule itself does not change.

## 8. Primary hypothesis: the only confirmatory test

**A0+LE − P+ on controlled post-test accuracy, explicit-first learners (n = 96), each learner's two replications averaged.**

- **Test:** exact paired sign-flip test, two-sided, alpha 0.05. The exact distribution is computed over the 1/240 grid, so no Monte Carlo is needed at n = 96.
- **Interval:** a 95% bootstrap interval (10,000 resamples, seed 7) is also reported.

## 9. Secondary outcomes: descriptive only, no claims

- free-production accuracy;
- wrong beliefs that reached strength 0;
- expected (probability) controlled and free accuracy;
- each replication on its own;
- the per-round W1+W2 trajectory;
- answer leaks per arm;
- **one blind rating pass:** replication 1, two tutors per learner with labels V/W in random order, 11 batches of about 10 learners;
- **B2 no-harm:** every B2 learner must end with W1 = W2 = 0 in both arms and both replications;
- **P+ fidelity:**
  - Sample: a stable random 10% of P+ turns, selected by `rand('esl4-fid', id) < 0.1`.
  - Check: each sampled reply is checked against the P+ rules (one task, try first, explain after two misses) using `FIDELITY_INSTRUCTIONS.md`.
  - Reported: the rate of replies that followed the prompt.

## 10. Guards: pass/fail for A0+LE

1. **Two asks:** replies with two asks are at most 2% of A0+LE turns. This is measured on the final reply with `hasTwoAsks`, and the raw count before the guard is also reported.
2. **Leaked answers:** A0+LE has no more final-reply leaks than P+ (`leakFinal`).
3. **Answer-protection rating:** the mean blind answer_protection score for A0+LE is not below P+'s.

## 11. Decision rule, fixed now

- The claim is **CONFIRMED** only if all of these hold:
  - p < 0.05;
  - the 95% interval lies above zero;
  - all three guards pass;
  - the data are complete.
- Otherwise it is **NOT CONFIRMED**.

Whatever the result, no other outcome, subgroup, replication or analysis will be presented as confirming the claim.

## 12. Run order

1. `esl4Study.ts init`.
2. For rounds 1–10:
   1. 24 tutor cells (`tprompts` → answers → `tapply`);
   2. `jprep`, judges, then `japply`;
   3. in rounds 3 and 7, also `agreeprep`, followed by the agreement judges.
3. `agreescore`.
4. `post` and `tags`.
5. `rateprep` and the raters.
6. `fidprep`, the fidelity checkers, then `esl4_fidelity.py`.
7. `esl4_analyze.py`.
8. The report at `reports/exp4/AGENT_SIM_ESL4.md`.

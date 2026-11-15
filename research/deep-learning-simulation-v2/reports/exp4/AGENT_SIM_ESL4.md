# SIMULATION ONLY

# ESL stage 4: A0+LE vs a strong plain baseline (P+)

**What this is:**
- No real learners took part. Every learner is a rule-based knowledge state.
- Every tutor turn was written by an agent.
- Blind judge agents applied the frozen ESL2 learning rules.
- No API was called.

These results show how the two tutor designs behave against a hand-written rule set. They are not evidence about real students.

**Records:**
- Pre-registration: `config/agent_sim_esl4/PROTOCOL.md`, committed in `a76629c` before any session ran.
- Deviations: `config/agent_sim_esl4/DEVIATIONS.md`.
- Ran to completion: all 10 rounds, 432 sessions, 4,320 tutor turns, every turn judged, 0 events rejected.

## Decision: **NOT CONFIRMED**

On the pre-registered test after round 10, A0+LE did not beat the strong baseline P+:
- the difference is −0.003;
- the 95% interval is [−0.046, +0.042];
- p = 0.95.

All three guards pass. Judge agreement failed its 85% target: 65.5% overall. This is reported as a validity failure next to the decision.

## 1. Step 1: the strong baseline P+

- **Prompt:** P+ uses the brief's system prompt word for word (`config/agent_sim_esl4/PPLUS_PROMPT.txt`, SHA-256 `e373018e…`).
- **Appended data:**
  - the line `Learner level: <band> (CEFR)`;
  - the same lesson data that P received in ESL3;
  - the conversation so far.
- **Nothing from ENARA is added:** no engine, no moves, no hint ladder and no reply guards.

**Fidelity check.** A stable 10% sample of P+ turns (223 replies) was checked against the P+ rules by blind agents.

| Rule | Rate |
|---|---|
| Followed all rules | **98.2%** |
| One task at a time | 100% |
| Let the learner try first | 98.2% |
| Explained the answer after two misses | 15 of 15 applicable |

## 2. Step 2: frozen setup and judge agreement

The engine, reply guards, simulator, learning rules and judge instructions are hash-identical to ESL3 (protocol §3). The judge instructions were not changed during the run.

| Recheck (stable 20% sample, blind second judge) | Cases | Same result | Agreement |
|---|---|---|---|
| Round 3 | 77 | 62 | 80.5% |
| Round 7 | 88 | 46 | 52.3% |
| **Overall** | **165** | **108** | **65.5%** |

**Validity failure:** agreement is far below the pre-registered 85% target, and it falls in session 2. In ESL3 validation it was 98.5%. As pre-registered, this does not change the decision rule. It does mean the knowledge-state updates that drive every outcome below are much less reliable than in ESL3.

## 3. Primary result (pre-registered, after round 10)

**A0+LE − P+ on controlled post-test accuracy, explicit-first learners (n = 96), each learner's two replications averaged.**

| | Value |
|---|---|
| Mean controlled accuracy, A0+LE | 0.789 |
| Mean controlled accuracy, P+ | 0.792 |
| **Difference** | **−0.003** |
| 95% bootstrap interval (10,000 resamples, seed 7) | **[−0.046, +0.042]** |
| Exact paired sign-flip test, two-sided | **p = 0.953** |
| Learners favouring A0+LE / favouring P+ / tied | 17 / 22 / 57 |

### Guards (all pass)

| Guard | Rule | Result |
|---|---|---|
| Two asks | at most 2% of A0+LE turns | 0 of 2,160 final replies (0.0%). The guard removed a closing ask in 32 raw replies. |
| Leaked answers (turns with a leak in the final reply) | A0+LE no more than P+ | A0+LE 6, P+ 96 |
| Answer-protection rating | A0+LE not below P+ | A0+LE 4.98, P+ 3.24 |

**B2 no-harm:** passed. All 12 B2 learners ended with W1 = W2 = 0 in both arms and both replications.

### Decision: **NOT CONFIRMED**

The fixed rule needs all of the following: p < 0.05, a 95% interval above zero, all guards passing, and complete data. The data are complete and the guards pass, but p = 0.95 and the interval includes zero. A0+LE did not outperform the strong plain prompt on the pre-registered outcome.

No secondary outcome, subgroup or replication below is offered as a substitute.

## 4. Side by side with ESL3 (10 rounds each)

| | ESL3: A0+LE vs plain P | ESL4: A0+LE vs strong P+ |
|---|---|---|
| Learners (explicit-first) | 48 | 96 |
| Primary difference, controlled accuracy | +0.151 | −0.003 |
| 95% interval | [0.068, 0.242] | [−0.046, 0.042] |
| p | 0.0011 | 0.953 |
| A0+LE controlled accuracy | 0.789 | 0.789 |
| Baseline controlled accuracy | 0.638 | 0.792 |
| Baseline leaks (turns, 10 rounds) | 98 | 96 |
| Answer-protection rating: A0+LE / baseline | 4.98 / 2.20 | 4.98 / 3.24 |
| Overall rating: A0+LE / baseline | 3.78 / 2.38 | 3.67 / 2.93 |
| Judge agreement | 98.5% (validation) | 65.5% (in-study) |
| Decision | CONFIRMED | NOT CONFIRMED |

A0+LE scored the same in both studies (0.789). The whole ESL3 effect disappears because the baseline improved, from 0.638 for plain P to 0.792 for P+. Against a good ordinary teaching prompt, the advantage measured in ESL3 does not hold under these rules.

## 5. Round-by-round gap

Mean W1+W2 strength for explicit-first learners. Both arms start at 3.50, and lower is better. The gap is P+ − A0+LE, so a positive gap favours A0+LE.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0+LE | 2.14 | 1.81 | 1.46 | 1.06 | 0.81 | 0.69 | 0.68 | 0.65 | 0.60 | 0.44 |
| P+ | 2.47 | 2.17 | 1.71 | 1.44 | 1.04 | 0.87 | 0.76 | 0.60 | 0.47 | 0.37 |
| **Gap (ESL4)** | **+0.34** | **+0.36** | **+0.25** | **+0.38** | **+0.24** | **+0.17** | **+0.07** | **−0.05** | **−0.12** | **−0.08** |
| Gap (ESL3, vs P) | +0.68 | +0.75 | +0.47 | +0.64 | +0.68 | +0.67 | +0.56 | +0.45 | +0.44 | +0.45 |

A0+LE leads through session 1, by 0.24–0.38. The lead shrinks during session 2, and P+ ends ahead from round 8. Against plain P in ESL3, the lead never fell below 0.44.

## 6. Leaks by round (turns with a leak in the final reply)

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A0+LE | 3 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | **6** |
| P+ | 5 | 0 | 33 | 8 | 13 | 4 | 0 | 21 | 6 | 6 | **96** |

P+ leaks mostly on the third turn of each session (rounds 3 and 8). These are the points where a learner has just answered right or nearly right, and P+ often states the full answer. Under these rules, the leaks did not stop P+ from catching up.

## 7. Secondary outcomes (descriptive only, no claims)

| Outcome (explicit-first, n = 96) | A0+LE | P+ | Difference [95% CI] |
|---|---|---|---|
| Free-production accuracy | 0.760 | 0.784 | −0.023 [−0.065, 0.017] |
| Wrong beliefs that reached strength 0 (of 2) | 1.77 | 1.76 | +0.01 [−0.06, 0.07] |
| Expected controlled accuracy | 0.801 | 0.807 | −0.006 [−0.043, 0.030] |
| Expected free accuracy | 0.771 | 0.785 | −0.014 [−0.051, 0.024] |
| Controlled accuracy, replication 1 only | | | −0.026 [−0.089, 0.039] |
| Controlled accuracy, replication 2 only | | | +0.021 [−0.031, 0.076] |

**Blind ratings.** One pass over replication 1: 108 learners, two tutors each, labels hidden, scores on a 1–5 scale.

| Arm | Overall | Clarity | Reasoning | Answer protection | Hint progression | Recap |
|---|---|---|---|---|---|---|
| P+ | 2.93 | 3.86 | 2.95 | 3.24 | 2.97 | 1.02 |
| A0+LE | 3.67 | 3.89 | 3.93 | 4.98 | 3.48 | 3.73 |

Raters preferred A0+LE on reasoning, answer protection and recap. Under these rules, that preference did not turn into a higher post-test score.

## 8. Interim look at round 3 (not pre-registered)

The study was stopped after round 3 on instruction, analysed, then resumed to round 10. That round-3 analysis was an extra look and is **not** the pre-registered test. Its files are in `reports/exp4/agent_sim_esl4/interim_r3/`.

| Interim (after round 3, session 1 only) | Value |
|---|---|
| Controlled accuracy, A0+LE / P+ | 0.556 / 0.522 |
| Difference [95% CI] | +0.034 [−0.005, 0.073] |
| p | 0.104 |
| Judge agreement, round 3 | 80.5% |

The early edge seen at round 3 had gone by round 10.

## 9. Deviations from the protocol

All deviations are listed in full in `DEVIATIONS.md`. In summary:

- **Missing replies, redone:** in rounds 3, 7 and 10, five tutor cells (LE10 twice, LE23, LE20 and LE25) each came back one reply short. Each file is kept as `PARTIAL_*`, and a new agent wrote the missing reply.
- **Round 9, LE14:** the agent applied its last reply in a second step.
- **Stop and resume:**
  - the run was stopped after round 3 (an interim look, §8);
  - a usage-limit pause came in round 5, with a clean stop and resume;
  - the run was then resumed and completed exactly as pre-registered.
- **Interim fixes:** the `tags` output path, and a rater JSON brace fix (interim pass only).
- **Concurrency:** for one round-6 step, 4 agents briefly ran at once instead of 3.
- **Judge agreement** was below target: 65.5%.

No rule, prompt, guard, threshold, judge instruction or decision rule was changed.

## 10. Limits

- **Simulation only.** Learning follows a hand-written rule set (R1–R7). The results show how the arms behave *under these rules*, not how real learners would learn.
- **Hand-written rules.** The rules reward specific moves. A good plain prompt turns out to trigger them nearly as well as the engine does, once given two sessions.
- **Agent judges, with low agreement.** The judges are agents, not teachers, and two of them agreed on the resulting knowledge state only 65.5% of the time, falling to 52% in session 2. The outcome measures carry a lot of judge noise.
- **Agent-written tutor turns, not the production model.**
  - Agents imitated each arm.
  - Five cells dropped a reply, and those replies were redone.
  - The A0+LE prompts gave contradictory instructions about an `[[assess]]` marker, which the agents resolved by leaving it out.
- **6 post-test items per learner.** Scores are coarse, and 57 of 96 learners tied exactly.
- **P+ is one reasonable prompt among many.** It followed its rules 98% of the time, so it was a strong and faithful baseline. A weaker or different prompt could give a different answer.

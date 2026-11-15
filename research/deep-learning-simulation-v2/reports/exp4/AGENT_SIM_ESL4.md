# SIMULATION ONLY

# ESL stage 4: A0+LE vs a strong plain baseline (P+)

No real learners took part. Every learner is a rule-based knowledge state, every tutor turn was written by an agent, and blind judge agents applied the frozen ESL2 learning rules. No API was called. These results show how the two tutor designs behave against a hand-written rule set. They are not evidence about real students.

- **Pre-registration:** `config/agent_sim_esl4/PROTOCOL.md`, committed in `a76629c` before any session ran.
- **Deviations:** `config/agent_sim_esl4/DEVIATIONS.md`.

**The study was stopped after round 3 of 10, on instruction** (deviation 2). Every number below therefore describes **3 tutor turns of session 1**, not the pre-registered two sessions of 5 turns.

## 1. Step 1: the strong baseline P+

- **Prompt:** P+ uses the brief's system prompt word for word (`config/agent_sim_esl4/PPLUS_PROMPT.txt`, SHA-256 `e373018e…`).
- **Appended data:**
  - the line `Learner level: <band> (CEFR)`;
  - the same lesson data that P received in ESL3;
  - the conversation so far.
- **Nothing from ENARA is added:** no engine, no moves, no hint ladder and no reply guards.

**Fidelity check:** a stable 10% sample of P+ turns (67 replies) was checked against the P+ rules by blind agents.

| Rule | Rate |
|---|---|
| Followed all rules | 88.1% (59 of 67) |
| One task at a time | 100% |
| Let the learner try first | 88.1% |
| Explained the answer after two misses | 6 of 6 applicable |

The 8 failures were all early answer reveals. No reply was scripted, so none had to be marked PARTIAL and redone on fidelity grounds.

## 2. Step 2: frozen setup and judge agreement

- **Frozen setup:** the engine, guards, simulator, rules and judge instructions are hash-identical to ESL3 (protocol §3).
- **Agreement check:** 77 round-3 cases (the stable 20% sample) were re-judged blind on identical input.

| Check | Target | Result |
|---|---|---|
| Judge agreement, round 3 | ≥ 85% | **80.5% (62 of 77): FAILED** |

As pre-registered, this is reported as a **validity failure** next to the decision, and the decision rule itself is unchanged. The round-7 recheck never ran because the study stopped. Agreement was 98.5% in ESL3 validation. The lower figure here suggests the judges disagree more on the less formulaic P+ replies, but this was not tested.

## 3. Primary result and decision

**A0+LE − P+ on controlled post-test accuracy, explicit-first learners (n = 96), each learner's two replications averaged, post-test taken after round 3.**

| | Value |
|---|---|
| Mean controlled accuracy, A0+LE | 0.556 |
| Mean controlled accuracy, P+ | 0.522 |
| **Difference** | **+0.034** |
| 95% bootstrap interval (10,000 resamples, seed 7) | **[−0.005, 0.073]** |
| Exact paired sign-flip test, two-sided | **p = 0.104** |
| Learners favouring A0+LE / favouring P+ / tied | 34 / 21 / 41 |

### Guards (all pass)

| Guard | Rule | Result |
|---|---|---|
| Two asks | at most 2% of A0+LE turns | 0 of 648 final replies (0.0%). The guard removed a closing ask in 1 raw reply. |
| Leaked answers (turns with a leak in the final reply) | A0+LE no more than P+ | A0+LE 4, P+ 38 |
| Answer-protection rating | A0+LE not below P+ | A0+LE 4.99, P+ 3.91 |

### Decision: **NOT CONFIRMED**

The primary test fails on its own terms: p = 0.104, which is not below 0.05, and the interval includes 0. The decision would be NOT CONFIRMED even with complete data. There are two further reasons:
- the data do not meet the pre-registered design, because the study stopped at 3 of 10 rounds;
- judge agreement fell below its 85% target.

On these data, A0+LE did not show a reliable advantage over a strong plain prompt. No secondary outcome, subgroup or replication below is offered as a substitute.

## 4. Side by side with ESL3 (effect against P vs against P+)

| | ESL3: A0+LE vs plain P | ESL4: A0+LE vs strong P+ |
|---|---|---|
| Learners (explicit-first) | 48 | 96 |
| Rounds run | 10 (2 sessions) | **3 (session 1 only)** |
| Primary difference, controlled accuracy | +0.151 | +0.034 |
| 95% interval | [0.068, 0.242] | [−0.005, 0.073] |
| p | 0.0011 | 0.104 |
| Gap in mean W1+W2 after round 1 | 0.68 | 0.34 |
| Gap in mean W1+W2 after round 3 | 0.47 | 0.25 |
| Baseline leaks (turns) | P 98 (10 rounds) | P+ 38 (3 rounds) |
| Answer-protection rating, baseline | 2.20 | 3.91 |
| Decision | CONFIRMED | NOT CONFIRMED |

The final effects are not directly comparable, because ESL3's is after 10 rounds and ESL4's after 3. The like-for-like comparison is the gap in wrong-belief strength at the same round. Against P+, A0+LE's lead is **about half** what it was against plain P, both after round 1 (0.34 vs 0.68) and after round 3 (0.25 vs 0.47). A good ordinary teaching prompt closes roughly half the gap that ESL3 measured.

## 5. Secondary outcomes (descriptive only, no claims)

| Outcome (explicit-first, n = 96) | A0+LE | P+ | Difference [95% CI] |
|---|---|---|---|
| Free-production accuracy | 0.452 | 0.396 | +0.056 [0.012, 0.099] |
| Wrong beliefs that reached strength 0 (of 2) | 1.02 | 0.89 | +0.14 [0.04, 0.24] |
| Expected controlled accuracy | 0.562 | 0.523 | +0.039 [0.008, 0.070] |
| Expected free accuracy | 0.460 | 0.413 | +0.047 [0.009, 0.086] |
| Controlled accuracy, replication 1 only | | | +0.003 [−0.047, 0.052] |
| Controlled accuracy, replication 2 only | | | +0.065 [0.016, 0.117] |

These all point the same way, but they are secondary and not confirmatory. The two replications disagree: the replication 1 effect is near zero, while replication 2 shows +0.065.

**Trajectory.** The table shows mean W1+W2 for explicit-first learners. Both arms start at 3.50, and lower is better.

| Round | 1 | 2 | 3 |
|---|---|---|---|
| A0+LE | 2.14 | 1.81 | 1.46 |
| P+ | 2.47 | 2.17 | 1.71 |
| Gap | 0.34 | 0.36 | 0.25 |

**Leaks by round** (turns with a leak in the final reply):

| | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| A0+LE | 3 | 0 | 1 |
| P+ | 5 | 0 | 33 |

P+ rarely leaks on the first exercise. In round 3, however, it often gives the answer outright once the learner is right or nearly right.

**Blind ratings.** One pass over replication 1: 108 learners, two tutors each, labels hidden, scores on a 1–5 scale.

| Arm | Overall | Clarity | Reasoning | Answer protection | Hint progression | Recap |
|---|---|---|---|---|---|---|
| P+ | 3.18 | 3.93 | 3.11 | 3.91 | 3.27 | 1.24 |
| A0+LE | 3.35 | 3.78 | 3.59 | 4.99 | 3.14 | 1.27 |

Against P+, the rating gap shrinks from ESL3's +1.40 overall to +0.18. P+ is rated slightly clearer and slightly better on hint progression. Recap is low for both arms because session 1 never reached its closing turns.

**B2 no-harm:** passed. All 12 B2 learners ended with W1 = W2 = 0 in both arms and both replications.

## 6. Deviations from the protocol

All deviations are listed in full in `DEVIATIONS.md`. In summary:

1. **Round 3, cell LE10:** the agent returned 17 of 18 replies. The file is kept as PARTIAL, and the missing reply was written by a new agent.
2. **Stopped after round 3 of 10, on instruction.** The data do not meet the pre-registered design. The power analysis (0.72–0.78 for +0.08 at 10 rounds) does not apply to a 3-round run.
3. **`tags` output:** the output path was named, and only turns with a tutor reply were kept (1,296 rows). The 432 round-4 openers were dropped.
4. **Rater batch rt04:** one missing JSON brace was added. The original is kept as PARTIAL, and no score was changed.
5. **Judge agreement** was 80.5%, below the 85% target. It is reported as a validity failure.

No rule, test, guard or threshold was changed after the data were seen.

## 7. Limits

- **Simulation only.** Learning follows a hand-written rule set (R1–R7). Any difference shows how the arms behave *under these rules*, not how real learners would learn.
- **Hand-written rules.** The learning rules reward specific moves, such as a rule line, contrast pairs and withholding the answer. An arm built around those moves has a structural advantage that real learners may not reproduce.
- **Agent judges.** The judges are agents, not teachers, and agreement in this run was below target (80.5%).
- **Agent-written tutor turns, not the production model.** Agents imitated each arm.
  - One agent skipped a reply.
  - The A0+LE prompts gave contradictory instructions about an `[[assess]]` marker, which the agents resolved by leaving it out.
- **6 post-test items per learner**, drawn from the frozen generator. Scores are coarse, and 41 of 96 learners tied exactly.
- **P+ is one reasonable prompt among many.** A different good prompt could do better or worse. It followed its own rules 88% of the time.
- **Truncated run.** Only 3 turns of session 1 ran. There is no session 2, no next-day retention and no closing recap. The ESL3 effect grew over session 2, so a full run could give a different answer. That is not a claim this report makes.

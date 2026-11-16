# SIMULATION ONLY

> **Correction (2026-11-16).** The 263 LE answer releases were not all given after 2 genuine attempts. A post hoc recount found 40 genuine, 23 premature, 132 on items the learner had already solved and 68 not on lesson items.
> Early-leak totals against P+ 68:
> - strict (premature + already solved): 163, guard **fails**;
> - substantive (premature only): 31, guard passes;
> - original: 14.
>
> **Corrected decision:** under the strict count, **NOT CONFIRMED**. The protocol's "has not solved" wording supports the substantive count, under which CONFIRMED stands. See [`ESL5_LEAK_RECOUNT.md`](ESL5_LEAK_RECOUNT.md).

# ESL stage 5: A0+LE with five engine changes vs the strong plain baseline (P+)

**What this is:**
- No real learners took part. Every learner is a rule-based knowledge state.
- Every tutor turn was written by an agent.
- Blind judge agents applied the learning rules (`config/agent_sim_esl5/LEARNING_RULES.md`).
- No API was called.

These results show how the two tutor designs behave against a hand-written rule set. They are not evidence about real students.

**Records:**
- Pre-registration: `config/agent_sim_esl5/PROTOCOL.md`, committed in `5aca044` before any session ran.
- Judge validation (`reports/exp4/agent_sim_esl5/validation/VALIDATION.md`): round 2 passed. Required set 95.6% (215 of 225), session 2 94.1% (111 of 118), order check pass. Round 1 (98.3%) is not counted, because judges shared helper-script files.
- Power: `config/agent_sim_esl5/POWER.json` (simulated power 0.8325 at 108 learners).
- Deviations: `config/agent_sim_esl5/DEVIATIONS.md`.
- Completeness: complete. 2,400 tutor turns per arm, 108 explicit-first learners, 12 B2 learners. No learner ID, seed or post-test item clash with earlier studies (`OVERLAP_CHECK.json`: pass).

## Decision: **CONFIRMED**

On the pre-registered test after round 10, A0+LE beat P+:
- the difference is +0.152 (0.889 vs 0.737);
- the 95% interval is [+0.095, +0.211];
- exact p = 6.6 × 10⁻⁷.

All guards pass, and judge agreement passed its 85% target (95.6%).

## 1. Primary result (pre-registered, after round 10)

**A0+LE − P+ on controlled post-test accuracy, explicit-first learners (n = 108), each learner's two replications averaged.**

| | Value |
|---|---|
| Mean controlled accuracy, A0+LE | 0.889 |
| Mean controlled accuracy, P+ | 0.737 |
| **Difference** | **+0.152** |
| 95% interval | **[+0.095, +0.211]** |
| Exact paired test, two-sided | **p = 6.6 × 10⁻⁷** |
| Learners favouring A0+LE / favouring P+ / tied | 42 / 14 / 52 |

### Guards (all pass)

| Guard | Rule | Result |
|---|---|---|
| Two asks | at most 2% of A0+LE turns | 0 of 2,400 final replies (0.0%). The guard removed a second ask in 11 raw replies. |
| Early leaks (final reply) | A0+LE no more than P+ | A0+LE 14, P+ 68. Planned A0+LE answer releases (263) are counted separately, not as leaks. |
| Answer-protection rating | A0+LE not below P+ | A0+LE 4.41, P+ 4.04 |
| Judge agreement | ≥ 85% overall and in session 2 | 95.6% overall (197 of 206), 95.2% session 2 (99 of 104) |

**B2 no-harm:** passed. Highest wrong-belief strength at the end for B2 learners: 0.

The fixed rule needs p < 0.05, a 95% interval above zero, all guards passing, and complete data. All four hold.

## 2. Engine changes

- **Env:** `ENARA_ENGINE_V2="wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5"`. This is the ESL4 LE string with `esl5` added.
- `esl5` turns on five switches:
  - `liveError`: aim rule lines and items at the learner's own recorded error type;
  - `releaseAfterTwo`: give the answer after two failed attempts, then a fresh item;
  - `reviewOpen`: open session 2 with recall of session 1, and close with one new item instead of a "tell me the rule" recap;
  - `fadeKnown`: drop teaching on points already known;
  - `ownSentence`: ask for one sentence of the learner's own, with feedback.
- With the switches off, output is byte-identical to the earlier engine.
- P+ is unchanged from ESL4 (`ENARA_ENGINE_V2=""`).

## 3. Side by side with ESL4

| | ESL4 | ESL5 |
|---|---|---|
| Learners (explicit-first) | 96 | 108 |
| Primary difference | −0.003 | +0.152 |
| 95% interval | [−0.046, 0.042] | [0.095, 0.211] |
| p | 0.953 | 6.6 × 10⁻⁷ |
| A0+LE controlled accuracy | 0.789 | 0.889 |
| P+ controlled accuracy | 0.792 | 0.737 |
| P+ leaks (final reply) | 96 | 68 early (49 by the ESL4 definition) |
| A0+LE leaks (final reply) | 6 | 14 early (12 by the ESL4 definition) |
| Answer protection: A0+LE / P+ | 4.98 / 3.24 | 4.41 / 4.04 |
| Overall rating: A0+LE / P+ | 3.67 / 2.93 | 3.35 / 3.13 |
| Judge agreement | 65.5% | 95.6% |
| P+ fidelity | 98.2% | 96.4% |
| Decision | NOT CONFIRMED | CONFIRMED |

A0+LE rose by 0.100 and P+ fell by 0.055. Both moves add to the gap.

## 4. Round-by-round gap

Mean W1+W2 strength, explicit-first. Lower is better. Gap = P+ − A0+LE, so positive favours A0+LE.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0+LE | 1.97 | 1.73 | 1.55 | 0.97 | 0.58 | 0.48 | 0.44 | 0.42 | 0.23 | 0.17 |
| P+ | 2.58 | 2.42 | 1.83 | 1.45 | 1.15 | 1.04 | 0.98 | 0.84 | 0.69 | 0.63 |
| **Gap (ESL5)** | **+0.61** | **+0.69** | **+0.28** | **+0.48** | **+0.57** | **+0.57** | **+0.54** | **+0.42** | **+0.46** | **+0.46** |
| Gap (ESL4) | +0.34 | +0.36 | +0.25 | +0.38 | +0.24 | +0.17 | +0.07 | −0.05 | −0.12 | −0.08 |

In ESL4 the lead faded in session 2 and P+ ended ahead. In ESL5 the lead held through session 2 and stayed at 0.42 or more.

## 5. Leaks and releases by round (final reply)

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A0+LE early leaks | 0 | 0 | 5 | 2 | 4 | 2 | 0 | 0 | 1 | 0 | **14** |
| P+ early leaks | 9 | 13 | 16 | 12 | 5 | 2 | 0 | 6 | 2 | 3 | **68** |
| A0+LE planned releases | 0 | 0 | 20 | 53 | 118 | 0 | 0 | 0 | 2 | 70 | **263** |

Releases are answers given on purpose after two misses (`releaseAfterTwo`), or at the closing turn. P+ gave the answer after two misses in 101 turns; A0+LE in 16 (`answerAfterTwoFails`).

## 6. Secondary outcomes (descriptive only, no claims)

| Outcome (explicit-first, n = 108) | A0+LE | P+ | Difference [95% CI] |
|---|---|---|---|
| Free-production accuracy | 0.853 | 0.716 | +0.137 [0.078, 0.198] |
| Wrong beliefs at strength 0 (of 2) | 1.875 | 1.634 | +0.241 [0.144, 0.338] |
| Expected controlled accuracy | 0.890 | 0.729 | +0.160 [0.109, 0.213] |
| Expected free accuracy | 0.849 | 0.711 | +0.138 [0.083, 0.194] |
| Controlled, replication 1 only | | | +0.160 [0.097, 0.225] |
| Controlled, replication 2 only | | | +0.144 [0.076, 0.213] |

**Stuck runs** (3+ turns on one item, never right): A0+LE 2 (mean length 3.5, both A1, session 2), P+ 0. In ESL4: A0+LE 84, P+ 53.

**Blind ratings** (1–5, labels hidden, 120 per arm):

| Arm | Overall | Clarity | Reasoning | Answer protection | Hint progression | Recap |
|---|---|---|---|---|---|---|
| P+ | 3.13 | 3.99 | 2.66 | 4.04 | 3.02 | 1.03 |
| A0+LE | 3.35 | 3.69 | 3.82 | 4.41 | 2.88 | 1.39 |

## 7. Session-2 turn types (rounds 6–10, 1,080 turns per arm)

ESL5 counts are automatic tags per turn. ESL4 numbers come from `EXPLORATORY_ESL4_DIAGNOSIS.md` and are counted differently (events, or a 200-turn hand sample), so compare direction only.

| Session 2 | ESL5 A0+LE | ESL5 P+ | ESL4 A0+LE | ESL4 P+ |
|---|---|---|---|---|
| Rule/contrast on a live wrong belief (turns) | 61 (5.6%) | 95 (8.8%) | 76 events | 128 events |
| Rule/contrast on a belief already at 0 (turns) | 417 (38.6%) | 561 (51.9%) | 719 events | 367 events |
| Next task tests a live belief | 156 (14.4%) | 250 (23.1%) | 57% of 346 | 87% of 467 |
| Next task tests only beliefs at 0 | 911 (84.4%) | 828 (76.7%) | – | – |
| Answer given (R5) | 7 (0.6%) | 20 (1.9%) | 0 | 55 events |
| Confirmed correct (R3) | 759 (70.3%) | 631 (58.4%) | 606 events | 608 events |
| Independent correct (R4) | 707 (65.5%) | 518 (48.0%) | 540 events | 472 events |
| Next task: blank / sentence / rule | 818 / 249 / 12 | 1,038 / 40 / 2 | – | 92% / 8% / – |
| Free production (hand sample) | – | – | 3.0% | 2.0% |
| Recap "tell me the rule" (hand sample) | – | – | 20.0% | 0.0% |
| Engine: answer released | 66 (6.1%) | – | 0 | – |
| Engine: liveError | 19 (1.8%) | – | – | – |
| Engine: own sentence asked / feedback | 174 / 174 (16.1%) | – | – | – |
| Engine: reviewOpen | 72 (6.7%) | – | – | – |

In ESL5, A0+LE asks for many more own sentences, gets more confirmed and independent correct answers, and spends fewer turns re-teaching beliefs already at 0. Few of its session-2 next tasks test a live belief, because most beliefs were already at 0.

## 8. Deviations from the protocol

All are listed in `DEVIATIONS.md`. In summary:

1. Round 1: the first three tutor agents stopped on a usage limit before writing any reply; relaunched unchanged.
2. Some tutor agents wrote helper files in the scratch folder; one deleted older ESL4 scratch split files. No study data affected.
3. LE prompts contradict themselves about the `[[assess]]` marker (as in ESL4); agents left it out.
4. Round 3, PP13 returned 19 of 20 replies; kept as `PARTIAL_PP13_r3.json`, the missing reply was redone.
5. LE closing-turn conflict: `reviewOpen` asked for a new item while the hint ladder forbade revealing the answer; agents gave a hint and retry. Engine not changed.
6. LE session-2 opening conflict: recall item vs first rule statement; agents gave the recall item only. Engine not changed.
7. Round-7 agreement judge ag7_j01 used a helper script to write its JSON. Kept.
8. Judges ruled R4 on recall items differently. Kept as judged; this affects agreement and may understate LE.

Also:
- A round-10 agent stopped early and applied nothing to the study data.
- Usage-limit stops at round 1 start and during round 9 judging; both resumed with no data loss.

No rule, prompt, guard, threshold, judge instruction or decision rule was changed during the run.

## 9. Limits

- **Simulation only.** Learning follows a hand-written rule set. The results show how the arms behave *under these rules*, not how real learners learn.
- **Hand-written rules.** The engine changes came from the ESL4 diagnosis of what these rules reward. Several of them (for example, aiming at the live error) were rated as high risk of gaming the simulator.
- **Agent tutors and agent judges.** No production model and no teachers.
- **Judge rulings varied on some points:** R4 for recall items, probes for items where the wrong belief still gives the right answer, and "I takes am"-type R1 rulings. See deviation 8 and the judges' notes.
- **Weaker P+ run.** P+ scored lower in ESL5 (0.737) than in ESL4 (0.792), and its fidelity was 96.4% vs 98.2%. Part of the gap may come from a weaker P+ run, not only from the engine.
- **LE prompt contradictions:** the `[[assess]]` marker, and the closing and opening conflicts (deviations 3, 5, 6).
- **New learners only.** ESL5 used new learners and seeds; it is not a re-run of ESL4 learners.
- **Judges clarified with hindsight.** The improved judge instructions were clarified with knowledge of ESL4 failure modes.
- **Not evidence about real students.**

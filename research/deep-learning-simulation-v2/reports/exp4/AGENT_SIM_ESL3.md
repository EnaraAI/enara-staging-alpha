# SIMULATION ONLY

# ESL stage 3: confirmatory simulation of A0+LE vs the plain tutor

No real learners took part. Every learner is a rule-based knowledge state, every tutor turn was written by an agent, and blind judge agents applied the frozen ESL2 learning rules. No API was called. These results show how the two tutor designs behave against a hand-written rule set. They are not evidence about real students.

Pre-registration: `config/agent_sim_esl3/PROTOCOL.md`, committed in `420f0de` before any session ran. Deviations are listed in `config/agent_sim_esl3/DEVIATIONS.md`.

## 1. Step 1 fix: one task per reply

The 117 ESL2 turns flagged by the old two-asks detector (48 of them in A0+LE) were grouped by cause. The full table is in `config/agent_sim_esl3/STEP1_TWO_ASKS.md`.

| Cause | A0+LE turns |
|---|---|
| Detector false positive: the feedback label "Correct:" was read as a task | 17 |
| Detector false positive: a rule line or recap written as an imperative ("Use am with I") | 12 |
| Detector false positive: the closing ask plus its own format note (one task written as two sentences) | 16 |
| Real: closing ask plus a separate question | 1 |
| Real: closing ask plus a hint instruction | 2 |
| **Total** | **48** |

The two causes suggested in advance did not appear as real two-task replies: "rule line plus exercise plus question", and "a new contrast pair plus a retry". The rule line only showed up as a detector false positive.

The fix is in commit `3ae8c15`, behind `levelExplicit`:
- `learnerAsks` and `hasTwoAsks` now read the tasks in a reply correctly.
- `enforceSingleAsk`, called from `applyReplyGuards`, removes and defers the closing ask when the reply already sets another task.

Tests are in `backend/test/oneTaskRule.test.ts`:
- one test per cause;
- the switch on and off;
- a replay of all 117 flagged ESL2 turns, each of which now sets at most one task.

The related suites all pass: 76 tests, including the parity test with `levelExplicit` switched off.

## 2. Validation rerun (frozen simulator, 12 new learners): passed

| Check | Target | Result |
|---|---|---|
| Order of expected accuracy | d > c > b ≈ a | d 0.916 > c 0.583 > a = b 0.198 (sampled scores give the same order) |
| Judge agreement on the 20% re-judged sample | ≥ 85% | 98.5% (64 of 65) |
| Noise, same tutor run twice | small | differences of at most 0.028 |

## 3. Primary result and decision

**A0+LE − P on controlled post-test accuracy, explicit-first learners (n = 48), each learner's two replications averaged.**

| | Value |
|---|---|
| Mean controlled accuracy, A0+LE | 0.789 |
| Mean controlled accuracy, P | 0.638 |
| **Difference** | **+0.151** |
| 95% bootstrap interval (10,000 resamples) | **[0.068, 0.242]** |
| Exact paired sign-flip test, two-sided | **p = 0.0011** |
| Learners favouring A0+LE / favouring P / tied | 19 / 7 / 22 |

The effect is close to the ESL2 estimate of +0.167, and the power estimate was about 1.0 for an effect of that size.

### Guards (all pass)

| Guard | Rule | Result |
|---|---|---|
| Two asks | at most 2% of A0+LE turns | 0 of 1,200 final replies (0.0%). The guard removed the closing ask in 25 raw replies. |
| Leaked answers | A0+LE no more than P | A0+LE 5, P 98 |
| Answer-protection rating | A0+LE not below P | A0+LE 4.98, P 2.20 |

### Decision: **CONFIRMED**

The primary test gives p < 0.05, the interval lies above zero, all three guards pass, and the data are complete (240 of 240 sessions, every turn judged, 0 events rejected).

## 4. Secondary outcomes (descriptive only, no claims)

| Outcome (explicit-first, n = 48) | A0+LE | P | Difference [95% CI] |
|---|---|---|---|
| Free-production accuracy | 0.740 | 0.641 | +0.099 [0.013, 0.190] |
| Wrong beliefs that reached strength 0 (of 2) | 1.72 | 1.53 | +0.19 [0.04, 0.33] |
| Expected controlled accuracy | 0.796 | 0.646 | +0.150 [0.072, 0.232] |
| Expected free accuracy | 0.765 | 0.632 | +0.134 [0.052, 0.218] |
| Controlled accuracy, replication 1 only | | | +0.177 [0.089, 0.271] |
| Controlled accuracy, replication 2 only | | | +0.125 [0.031, 0.224] |

**Trajectory.** The table shows mean W1+W2 strength for explicit-first learners. Both arms start at 3.50, and lower is better.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| A0+LE | 1.82 | 1.51 | 1.31 | 0.76 | 0.56 | 0.51 | 0.50 | 0.49 | 0.49 | 0.46 |
| P | 2.50 | 2.26 | 1.78 | 1.40 | 1.24 | 1.18 | 1.06 | 0.94 | 0.93 | 0.91 |

A0+LE pulls ahead in round 1. The gap then narrows from 0.68 to 0.45 by round 10 as P catches up during session 2.

**Blind ratings.** There was one pass over replication 1: 60 learners, two tutors each, with the labels hidden. Scores are on a 1–5 scale.

| Arm | Overall | Clarity | Reasoning | Answer protection | Hint progression | Recap |
|---|---|---|---|---|---|---|
| P | 2.38 | 3.48 | 2.42 | 2.20 | 2.15 | 1.02 |
| A0+LE | 3.78 | 3.95 | 3.97 | 4.98 | 3.55 | 3.93 |

**B2 no-harm check:** passed. All 12 B2 learners ended with W1 = W2 = 0 in both arms and both replications.

## 5. Deviations from the protocol

All deviations are listed in full in `DEVIATIONS.md`. In summary:

- **Partial work redone:** these outputs were kept as `PARTIAL_*` files and rerun.
  - 4 garbled replies in round 1.
  - One judge batch in round 2 that was missing a case.
  - 160 round-3 replies that two agents had generated with scripts or templates instead of writing them. From round 4 on, each agent handled a single group of 20 sessions.
- **A usage-limit pause:** no data was lost.
- **Two one-line code fixes made after pre-registration:**
  - a comment that broke the rating-prep command;
  - a field name in the descriptive trajectory code of the analysis script.

  Neither fix touches the primary test, the guards or the decision rule. Hashes before and after are recorded.

## 6. Limits

- **Simulation only.** Learning follows a hand-written rule set (R1–R7). The result shows that A0+LE does better *under these rules*, not that real learners learn more from it.
- **Agent judges.** Agreement was high in validation (98.5%), but the judges are still agents, not teachers. Some judges noted their own calls on unclear cases, such as which belief to credit and when to withhold R4.
- **Tutor turns were written by agents imitating each arm, not by the production model.**
  - Agents sometimes reused one reply for sessions in exactly the same state.
  - Some agents tried scripted replies; those were caught and redone.
- **6 post-test items per learner,** drawn from the frozen generator, so scores are coarse. Many learners tied: 22 of 48 had a difference of exactly 0.
- **Large gap on answer leaks and protection.** P is a deliberately plain tutor that leaks answers often, and that alone may explain part of the gap.
- **No head-to-head with A0.** The ESL2 comparison of `levelExplicit` against A0 was not part of this confirmatory test.

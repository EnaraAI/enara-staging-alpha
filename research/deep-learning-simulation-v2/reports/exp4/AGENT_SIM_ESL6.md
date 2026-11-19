# SIMULATION ONLY

# ESL6: ENARA with the ESL5 setting against the plain baseline, 30 outcomes, delayed test

19 Nov 2026. Branch `claude/tutor-esl6`. Protocol: `config/agent_sim_esl6/PROTOCOL.md` with amendment A. Changes during the run: `reports/exp4/agent_sim_esl6/DEVIATIONS.md` (1–17).

**What this is:**
- No real learners took part. Every learner is a rule-based knowledge state.
- Tutors were agents (Sonnet). Judges, agreement judges, grader-recheck scorers and fidelity checkers were agents (Opus).
- These results show how the two tutor designs behave under hand-written learning rules. They are not evidence about real students.

## Decision: **NOT CONFIRMED**

On the pre-registered primary test, ENARA with the ESL5 setting (LE) did not beat the plain baseline (P+). The two arms finished level.

| Primary: delayed test (7 days after the session), gap-fill and choice items, explicit-first learners | |
|---|---|
| Learners | 270 (2 replications each, averaged) |
| LE mean | 0.773 |
| P+ mean | 0.786 |
| **Difference (LE − P+)** | **−0.013** |
| 95% interval | −0.036 to +0.009 |
| Exact paired test | p = 0.28 |
| Learners favouring LE / P+ / tied | 50 / 50 / 170 |

The decision rule needs p < 0.05 and an interval above zero. Neither holds.

## Guards

| Guard | Result |
|---|---|
| 1. Two questions in one reply (LE ≤ 2%) | Pass: 0 of 2,820 LE replies. The reply guard removed 40. |
| 2. Answers given away too early (LE ≤ P+) | Pass: LE 107, P+ 116 |
| 3. Answer protection rating (LE ≥ P+) | Not run (ratings skipped, DEVIATIONS 17) |
| 4. Judge agreement (≥ 85% overall and in round 5) | Pass: 94.0% overall; round 3 95.7%, round 5 92.3% |
| 5. Grader recheck (≥ 95% on gap-fill and choice items) | Pass: 100% (1,293 answers). All exact items 100%; free items QWK 0.93. |

P+ fidelity check: 93.6% of 282 sampled P+ replies followed the P+ prompt (ESL5: 96.4%).

## Secondary results (descriptive only, no claims)

| Outcome (LE − P+) | Difference | 95% interval |
|---|---|---|
| Whole delayed test (all 12 points) | +0.007 | −0.015 to +0.028 |
| Immediate test, primary items | −0.013 | −0.032 to +0.007 |
| Whole immediate test | −0.000 | −0.021 to +0.021 |
| Mastery on the delayed test | +0.033 | −0.007 to +0.074 |
| Free sentences, delayed | +0.016 | −0.007 to +0.040 |
| Forgetting, immediate → delayed (lower is better) | −0.007 | −0.024 to +0.011 |
| Replication 1 only, delayed whole test | +0.008 | −0.021 to +0.037 |
| Replication 2 only, delayed whole test | +0.006 | −0.022 to +0.033 |

- **Pre-test balance:** the arms were equal at the start (0.460 each).
- **Stuck runs** (3 or more turns on one item, never right): LE 1, P+ 12.
- **B2 no-harm:** fails in 8 sessions, all with the same 4 learners, in **both** arms equally. This is the chance failure named in PROTOCOL §12, limit 13: a learner with no wrong belief can still miss a different test item by chance. It is not an LE effect.

**Round by round** (wrong-belief strength, lower is better; start 2.59 in both arms):

| Round | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| LE | 1.78 | 1.76 | 1.41 | 1.19 |
| P+ | 1.86 | 1.57 | 1.29 | 1.16 |

- After round 2, P+ led by 0.20. The gap closed to 0.04 by round 4.
- **Why LE fell behind in round 2:** it stated rules far less often (45 against 196 rule statements).

## What this means

- **ESL5's result does not carry over to this design.** ESL5 used 3 outcomes and an immediate test, and LE won by 0.15. ESL6 used 30 A1–A2 outcomes, one 5-turn session and a 7-day delayed test. There, the ESL5 setting and the plain baseline finished level.
- **Possible reasons (not tested here):**
  - The ESL5 switches were tuned on the 3 ESL5 forms.
  - One short session gives `releaseAfterTwo`, `fadeKnown` and `ownSentence` little room.
  - Both arms reach a ceiling quickly, the same ceiling that made the forgetting check fail (§12, limit 1).
  - P+ explains rules more often early on.
- **Not tested** (amendment A1): recall at the start of a second session, and whether a lead holds through a second session. Proposed follow-up: ESL6b, PROTOCOL §14.
- **Recommendation:** keep ESL5 off for learners on lms-test until a change beats P+ on this broader design. For ESL7, compare each Track 2 switch against both ESL5 and P+, on the ESL6 design rather than the ESL5 one.

## Run notes

- 5 rounds × 1,128 sessions = 5,640 tutor replies, all judged; 0 rejected judge events.
- **Deviations:**
  - one session instead of two (A1);
  - grader recheck deduplicated (A2);
  - round-12 grader (A3);
  - Sonnet tutors and Opus judges (A4);
  - concurrency changed with usage: 2, then 8, then 2 (13, 15);
  - judge batches of 72 cases from round 3 (14);
  - ratings skipped (17);
  - a few tutor replies reused for learners on the same lesson who gave the same answer (10, 11, 16);
  - agent scratch files outside the repository (9, 12).
- **Run-mechanics changes, with no effect on scores:**
  - grader-recheck and fidelity agents scored several batches each, one batch file at a time;
  - one pair of judges was resumed after a usage-limit stop.
- **Files:** `ANALYSIS.json`, `POST.json`, `TAGS.json`, `STUCK.json`, `JUDGE_AGREEMENT.json`, `GRADER_RECHECK.json`, `FIDELITY.json`, `ASSESS_{pre,imm,del}.json`.

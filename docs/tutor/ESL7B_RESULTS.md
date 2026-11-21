# ESL7b: does `reviewFirst` help? (SIMULATION ONLY)

21 Nov 2026. Pre-registered: `config/agent_sim_esl7b/PROTOCOL.md`. Simulated learners only.

## What was tested
- **The arm:** the same 72 learners, from the saved ESL7 state after round 10, given their second sessions (rounds 11–20) by NEW + `reviewFirst` ("NRF").
- **Compared with:** ESL7's NEW, BASE and P+ results.
- **Tests and judges:** the same tests; Opus judges and scorer.
- **Deploy:** `reviewFirst` is live on lms-test (PR #51, E2E and health check passed).

## Result
| | NRF | NEW | BASE | P+ |
|---|---|---|---|---|
| 4-week score (mean of 2 outcomes per learner) | **74.1%** | 71.4% | 73.1% | 71.4% |
| Outcomes mastered at 4 weeks (of 144) | **74** | 66 | 67 | 68 |
| Session-2 openers that are a review item | **70 of 144** | 18 of 144 | – | – |
| Session-2 answers given before 2 tries | 13 | 10 | 17 | 35 |

**Primary comparison, NRF − NEW: +2.6 points** (95% CI −0.2 to +5.6, p = 0.085).
- **Not shown** by the pre-registered rule, which needs p < 0.05 and the whole interval above 0.
- The direction is positive, and NRF is the highest of all four arms.

**Secondary comparisons:**
- **NRF − BASE:** +0.9 points (p = 0.58).
- **NRF − P+:** +2.7 points (p = 0.18).
- **Without the 3 ⚑ outcomes:** NRF − NEW is +1.5 points (p = 0.32).

**By skill, 4 weeks (NRF / NEW / BASE / P+):**

| Skill | NRF | NEW | BASE | P+ |
|---|---|---|---|---|
| Grammar | 75 | 73 | 72 | 74 |
| Vocabulary | 70 | 68 | 72 | 69 |
| Functions | 68 | 70 | 75 | 50 |
| Reading | 78 | 68 | 85 | 82 |
| Writing | 88 | 81 | 75 | 75 |

**By age band, 4 weeks (NRF / NEW / BASE / P+):**

| Age band | NRF | NEW | BASE | P+ |
|---|---|---|---|---|
| Under 9 | 68 | 67 | 72 | 71 |
| 9–12 | 75 | 74 | 74 | 73 |
| Teens | 78 | 74 | 72 | 74 |
| Adults | 76 | 71 | 74 | 67 |

## Reading
- **The switch works as built:** reviews now open session 2 about 4 times as often as before (70 vs 18 of 144).
- **Effect:** it moved the new engine from last to first on 4-week score and on mastery. The gain is not yet statistically clear with 72 learners.
- **Under-9s** are still the weak spot, below BASE. That is the `childShort` / rule-block clash.

## Limits
- One new arm, compared with stored results. New tutor-agent runs add some variation.
- **Run note:** in rounds 12–13, one tutor agent read another cell's prompt file, because the scratch file names were shared. Those replies were discarded and the affected cell was redone; nothing was applied to the wrong learner. Unique scratch file names were required from round 13 on.
- Simulated learners only; listening and speaking not measured.

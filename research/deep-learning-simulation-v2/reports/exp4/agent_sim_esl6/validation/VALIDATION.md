# SIMULATION ONLY

# ESL6 validation (PART 2)

Rules: `config/agent_sim_esl6/LEARNING_RULES.md`, with forgetting rule F1 v2.

| Check | Result | Target | Verdict |
|---|---|---|---|
| Scripted-tutor order (both judges) | a 0.205, b 0.205, c 0.556, d 0.936 | d > c > b ≈ a | **pass** |
| Forgetting (counted, full teaching) | 7-day (b) − (a) = 0.000; immediate difference 0.000 | (b) > (a) at 7 days; immediate \|diff\| ≤ 0.03 | **FAIL** (rounds 1 and 2) |
| Forgetting (light teaching, sensitivity, v2) | 7-day 0.366 vs 0.595; immediate difference +0.031 | not counted | — |
| Judge agreement, mixed P+/ENARA set (240) | 97.1% | ≥85% | **pass** |
| Judge agreement, session 2 (142) | 98.6% | ≥85% | **pass** |
| Judge agreement, all 720 cases | 98.6% | — | — |
| Noise: same tutor judged twice (30 learners) | immediate 0.821 vs 0.853 (difference +0.032); 7-day 0.589 vs 0.615 (difference +0.026); mean per-learner absolute difference on the 7-day score 0.149 (15/30 learners differ) | no pass mark set | reported |

## Forgetting check
The forgetting check failed in both rounds. Under full teaching, every wrong belief is removed, so recall items cannot change 7-day scores. This is a ceiling effect of the rules. User decision: "Accept and note the limit". ESL6 proceeds with F1 v2. The report must state that this check did not pass.

## Noise
The difference between two judgings of the same tutor is about 0.03 at the group mean. The primary effect target is +0.06. Per-learner judging noise on the 7-day score is large (0.149), so the study relies on its n and its 2 replications.

## Files
- `AGREEMENT_RESULT.json`
- `NOISE_RESULT.json`
- `FORGET_CHECK.json`
- `VALIDATION_PLAN.md`

Judgments are in `judgeA/`, `judgeB/`, `noise_run1/` and `noise_run2/`.

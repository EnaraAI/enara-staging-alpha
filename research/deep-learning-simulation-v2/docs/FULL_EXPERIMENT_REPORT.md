# Full experiment report: full-experiment-2

**Simulation only.** AI-simulated students. This is not evidence of learning in real humans. All numbers come from `runs/full-experiment-2/` (immutable raw results, ledger, manifest, nine generated reports).

## What was run

- 50 AI students (10% misconception-heavy "adversarial" profiles), 3 independent replications, 6 conditions, 900 blocks (every student × outcome block once per replication), 48-outcome benchmark.
- Each student answers every assessment item 3 times; the majority decides (fix after validation campaign 1). Hidden knowledge state and difficulty are stated explicitly to the simulated learner (second fix).
- Pre-registration locked before the run (`config/preregistration.json`, SHA recorded in the manifest, `preregLocked: true`).
- Requested change during the work: the owner asked for **50 students instead of 150**. A first launch with 150 students was stopped after 294 of 2,700 blocks; it is kept as `runs/aborted-full-experiment-150-students/` and is **not** used in any result.
- Code commit in the manifest: `9a6996e` (working tree had later, unrelated edits: voice benchmark and docs; none touch the experiment path).

## Result

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 150 | 34.0% | 42.3% | 37.7% | 39.5% | 20.0% |
| B study notes | 150 | 25.3% | 34.7% | 32.7% | 33.0% | 18.0% |
| C generic AI tutor | 148 | 27.7% | 44.6% | 41.6% | 38.2% | 24.3% |
| D scripted human-like tutor | 150 | 29.7% | 26.0% | 24.7% | 27.3% | 6.7% |
| E ENARA ablation | 150 | 27.3% | 45.3% | 38.3% | 34.5% | 22.7% |
| F no teaching | 150 | 24.3% | 25.0% | 23.0% | 29.7% | 4.0% |

Pre-registered confirmatory contrasts (gain = post − pre; 50 students; Holm-adjusted; 95% two-way cluster-bootstrap CIs):

| Contrast | difference | 95% CI | adj. p | supported? |
|---|---|---|---|---|
| ENARA − no teaching (gain) | +0.08 | [−0.06, 0.23] | 0.34 | **No** |
| ENARA − study notes (gain) | −0.01 | [−0.17, 0.15] | 0.89 | **No** |
| ENARA − generic AI tutor (gain) | −0.08 | [−0.23, 0.05] | 0.34 | **No** |
| ENARA − ablated ENARA (gain) | −0.10 | [−0.28, 0.09] | 0.34 | **No** |
| ENARA − study notes (transfer) | +0.05 | [−0.10, 0.20] | 0.61 | **No** |

**Reading, without spin.** No pre-registered contrast is supported. The measured data do not show that the actual ENARA tutor produced more simulated learning than study notes, a generic AI tutor, or its own ablation. ENARA's gain over no teaching is positive but not statistically distinguishable from zero at 50 students. The two LLM tutors that interact (A, C, E) all lift post-test scores above no teaching (about +17 to +20 points raw), but A's raw post is not higher than C's or E's, and A started with a higher pre-test (34% vs 24–29%, chance imbalance), which is why the pre-registered gain comparison goes against A numerically. The scripted tutor (D) did not improve on no teaching. Disabling six adaptive prompt features (E) did not reduce learning here, so this experiment gives no evidence that those features add learning in simulated students.

## Cost (actual, recorded)

**$57.24** for the full run (37,380 provider attempts, 13 failed, retry cost ≈ $0.003, 0 attempts with unknown cost). By role: ENARA tutor $43.99, generic tutor $9.29, student answers $3.27, student teaching turns $0.66, blind judge $0.02. Cost per block: ENARA $0.157, generic tutor $0.068, ablated ENARA $0.147. Cost per mastered outcome: ENARA $0.78, generic tutor $0.28, notes $0.02. Earlier spend this task: smoke $0.97, validation campaign 1 $17.04, validation campaign 2 $18.11, repeat/second-model runs and voice benchmark in `docs/VALIDATION_REPORT.md`.

## Quality of the instrument

- Blind judge vs deterministic keys on 729 sampled items: 95.2% agreement, κ = 0.89. Repeat-run consistency (same seed, independent sampling): 89.4% agreement, κ = 0.76 (before majority sampling was added).
- Simulator checks (`reports/9_simulator_validation.md`): sensitivity to prior knowledge PASS (58% vs 19% at pre-test); attention-lapse, forgetting, adversarial-profile checks PASS; difficulty sensitivity is only nominally negative (r = −0.01), so item difficulty barely moves accuracy; "no learning jump without teaching" FAILS (16% of control blocks jumped ≥ 50 points, because each stage has only 2 items); leakage check FAILS (see below).
- 2 of 900 blocks failed (0.2%), both for the leakage guard (condition C, outcome FN-02, replications 2 and 3: the generic tutor wrote "ask a stranger where the toilets are", the same sentence as an assessment answer). They remain in the data and reports. The same stray phrase will recur in any rerun; FN-02's assessment item should be reworded.

## Limitations (also in `reports/0_limitations.md`)

Simulated learners only; the simulator is a language model prompted from numeric parameters and has not been validated against real learner data; listening is text-based; delayed retention is simulated forgetting of the learner's note; only 2 items per stage; challenge test C (recovery after a failed session) is not measured; mixed-effects models were not run (no library). The experiment cannot say whether ENARA's tutoring helps real students.

## What I would do next

1. Reword the FN-02 assessment item and re-add its two failed blocks in a labelled supplementary run.
2. Add more assessment items per stage (4 post, 4 transfer) to cut noise, and match pre-test levels by blocking on pre-test, before spending on a larger replication.
3. Investigate why the generic Opus tutor matches ENARA here: read paired transcripts for the largest A-vs-C gaps.

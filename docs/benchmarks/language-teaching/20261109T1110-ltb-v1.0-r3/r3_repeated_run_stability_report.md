# r3 repeated-run stability report

**Label: `REPEATED-RUN-DIAGNOSTIC`.** These results are excluded from the official r3 score.

Scores are automated, provisional LLM-judge scores, not an educator's. The study measures the tutor's behaviour on synthetic cases, not learning.

## 1. Frozen plan (written before any paid call of the study)

- **Plan file:** `stability/stability_plan.json`, SHA-256 `d6a4ad848e44324e8a07e31a5ab6f4cb9ec9454ddc0c7e903ce04ba9993f3ee2`.
- **Subset file:** `stability/subset_cases.jsonl`, SHA-256 `4f62c391d0180b4a5081bb0881f39c8c89671f89ddb5791eee7b400337e74f03`. It contains byte-identical lines from the frozen case file, in their original order.
- **36 cases:**
  - **27 target cases:** every T04, T08 and T12 case.
  - **9 controls:** one per cohort × CEFR cell, with types cycling T03, T05, T06, T10, T11, T13, T03, T05, T06.
- **Size:** 72 learner turns per repetition, × **3 independent repetitions**, each with a fresh in-memory database.
- **Tutor:** `claude-opus-5-5`, effort low, max 4000 tokens, engine `ltc-v1-r3`. Same as the official run.
- **Judge:** `claude-sonnet-5-5`, effort medium, the unchanged `judge.ts`. Its frozen self-consistency rule re-judged 4 cases per repetition:  LTB-CA1-T03, LTB-CB1-T08, LTB-TB1-T04, LTB-AA2-T08.
- **Raw outputs:** each repetition is kept separately in `stability/rep1/`, `rep2/` and `rep3/`. Each folder holds `raw_results.jsonl`, `provider_attempts.jsonl`, `judge_results.jsonl`, `judge_attempts.jsonl`, `case_scores.csv` and `aggregate_results.json`.

## 2. Outcome spread

| Group | Cases | Meets per repetition | Mean | Range | Stable meets | Stable partial | **Mixed** | Mean within-case judge-mean range |
|---|---|---|---|---|---|---|---|---|
| all | 36 | 21 / 22 / 23 | 22 | 2 | 13 | 7 | **16** | 0.305 |
| target | 27 | 17 / 18 / 16 | 17 | 2 | 11 | 6 | **10** | 0.346 |
| control | 9 | 4 / 4 / 7 | 5 | 3 | 2 | 1 | **6** | 0.182 |
| T04 | 9 | 4 / 5 / 3 | 4 | 2 | 2 | 4 | **3** | 0.35 |
| T08 | 9 | 4 / 5 / 6 | 5 | 2 | 2 | 2 | **5** | 0.477 |
| T12 | 9 | 9 / 8 / 7 | 8 | 2 | 7 | 0 | **2** | 0.21 |

**16 of 36 cases (44%) changed outcome across three runs of identical code.** The subset meets count moved within 21–23.

## 3. Same engine moves, different outcome

The engine's move sequence was identical across all 3 repetitions in **34/36** cases. Of the 16 mixed cases, **14 had identical moves in every repetition**: LTB-CA1-T08, LTB-CA2-T04, LTB-CA2-T05, LTB-CA2-T08, LTB-CB1-T12, LTB-TA2-T08, LTB-TA2-T11, LTB-TB1-T04, LTB-TB1-T13, LTB-AA1-T03, LTB-AA1-T12, LTB-AA2-T04, LTB-AA2-T08, LTB-AB1-T08.

**So in these cases the outcome variation comes from the model's text generation and/or the judge, not from engine decisions.**

## 4. Does T04/T08/T12 vary more than the controls?

- **T12 is the most stable:** 9 / 8 / 7, with 7 of 9 stable meets.
- **T04 and T08 vary more:** T04 4 / 5 / 3 and T08 4 / 5 / 6. Each has 3–5 mixed cases, and T08 has the largest judge-mean range (0.48).
- **The controls also swung:** 4 / 4 / 7, with 6 of 9 mixed.

So variability isn't specific to the target types. The middle-band cases of every type flip.

## 5. Placing r1/r2 single runs against the r3 spread (subset only)

| Type (/9) | Baseline | r1 | r2 | r3 official | r3 repetitions | r3 repetition mean |
|---|---|---|---|---|---|---|
| T04 | 1 | 5 | 0 | 3 | 4 / 5 / 3 | 4 |
| T08 | 2 | 3 | 2 | 4 | 4 / 5 / 6 | 5 |
| T12 | 2 | 7 | 4 | 5 | 9 / 8 / 7 | 8 |
| Controls (/9) | 2 | 4 | 8 | 7 | 4 / 4 / 7 | 5 |

**Interpretation, with caveats:**
- **The r2 values fall below every r3 repetition:** T04 0 against 3–5, T08 2 against 4–6, T12 4 against 7–9.
- **So the r2 → r3 recovery on these types looks larger than the run-to-run noise we observe.** That points to the r3 policy changes (T04 triage, T08 move-on, T12 evaluation) and suggests the r2 drop was at least partly a policy effect, not pure noise.
- **r1's T04 (5) and T12 (7) fall within the r3 range.**
- **This rests on single historical runs.** It is suggestive, not conclusive.

## 6. Dimension stability (judge means per repetition, 36 cases)

| Dimension | Repetitions 1 / 2 / 3 | Range | Mean within-case SD | n |
|---|---|---|---|---|
| learner_context_fidelity | 2.86 / 2.92 / 2.78 | 0.14 | 0.12 | 36 |
| lesson_alignment | 3.14 / 3.19 / 3.06 | 0.14 | 0.14 | 36 |
| pedagogical_appropriateness | 2.75 / 2.86 / 2.72 | 0.14 | 0.19 | 36 |
| scaffolding_adaptation | 2.61 / 2.82 / 2.71 | 0.21 | 0.24 | 28 |
| age_proficiency_fit | 2.86 / 2.86 / 2.81 | 0.06 | 0.10 | 36 |
| formative_check_evidence | 2.72 / 2.69 / 2.64 | 0.08 | 0.19 | 36 |
| clarity_accessibility | 3.06 / 3.11 / 3.00 | 0.11 | 0.12 | 36 |

Dimension means are stable to within about 0.2 between repetitions. **Per-case scores move by about 0.1–0.25 SD**, which is enough to flip cases sitting at the 3.0 meets boundary.

## 7. Per-case table

| Case | Group | Repetitions 1 / 2 / 3 | Stability | Identical moves | Judge-mean range | r2 | r3 official |
|---|---|---|---|---|---|---|---|
| LTB-CA1-T03 | control | partially / partially / partially | stable_partial | yes | 0.0 | meets | partially |
| LTB-CA1-T04 | target | partially / partially / partially | stable_partial | yes | 0.43 | partially | meets |
| LTB-CA1-T08 | target | partially / meets / meets | mixed | yes | 1.0 | partially | partially |
| LTB-CA1-T12 | target | meets / meets / meets | stable_meets | yes | 0.03 | meets | meets |
| LTB-CA2-T04 | target | meets / meets / partially | mixed | yes | 0.71 | partially | meets |
| LTB-CA2-T05 | control | partially / meets / meets | mixed | yes | 0.29 | meets | meets |
| LTB-CA2-T08 | target | meets / partially / partially | mixed | yes | 1.29 | partially | partially |
| LTB-CA2-T12 | target | meets / meets / meets | stable_meets | yes | 0.33 | meets | partially |
| LTB-CB1-T04 | target | partially / partially / partially | stable_partial | yes | 0.57 | partially | partially |
| LTB-CB1-T06 | control | partially / partially / meets | mixed | no | 0.14 | partially | partially |
| LTB-CB1-T08 | target | partially / partially / partially | stable_partial | yes | 0.0 | partially | meets |
| LTB-CB1-T12 | target | meets / partially / partially | mixed | yes | 0.17 | partially | partially |
| LTB-TA1-T04 | target | partially / partially / partially | stable_partial | yes | 0.43 | partially | partially |
| LTB-TA1-T08 | target | partially / partially / partially | stable_partial | yes | 0.43 | meets | meets |
| LTB-TA1-T10 | control | meets / meets / meets | stable_meets | yes | 0.33 | meets | meets |
| LTB-TA1-T12 | target | meets / meets / meets | stable_meets | yes | 0.29 | partially | meets |
| LTB-TA2-T04 | target | meets / meets / meets | stable_meets | yes | 0.0 | partially | partially |
| LTB-TA2-T08 | target | partially / meets / meets | mixed | yes | 0.43 | partially | partially |
| LTB-TA2-T11 | control | partially / partially / meets | mixed | yes | 0.17 | meets | meets |
| LTB-TA2-T12 | target | meets / meets / meets | stable_meets | yes | 0.12 | partially | meets |
| LTB-TB1-T04 | target | meets / meets / partially | mixed | yes | 0.29 | partially | partially |
| LTB-TB1-T08 | target | meets / meets / meets | stable_meets | yes | 0.0 | partially | meets |
| LTB-TB1-T12 | target | meets / meets / meets | stable_meets | yes | 0.14 | meets | meets |
| LTB-TB1-T13 | control | partially / meets / meets | mixed | yes | 0.14 | meets | meets |
| LTB-AA1-T03 | control | meets / partially / partially | mixed | yes | 0.43 | meets | meets |
| LTB-AA1-T04 | target | partially / partially / partially | stable_partial | yes | 0.58 | partially | partially |
| LTB-AA1-T08 | target | meets / meets / meets | stable_meets | yes | 0.14 | meets | partially |
| LTB-AA1-T12 | target | meets / meets / partially | mixed | yes | 0.5 | partially | partially |
| LTB-AA2-T04 | target | partially / meets / meets | mixed | yes | 0.14 | partially | meets |
| LTB-AA2-T05 | control | meets / meets / meets | stable_meets | yes | 0.0 | meets | meets |
| LTB-AA2-T08 | target | partially / meets / meets | mixed | yes | 0.86 | partially | partially |
| LTB-AA2-T12 | target | meets / meets / meets | stable_meets | yes | 0.17 | partially | partially |
| LTB-AB1-T04 | target | meets / meets / meets | stable_meets | yes | 0.0 | partially | partially |
| LTB-AB1-T06 | control | meets / partially / meets | mixed | no | 0.14 | meets | meets |
| LTB-AB1-T08 | target | meets / partially / meets | mixed | yes | 0.14 | partially | meets |
| LTB-AB1-T12 | target | meets / meets / meets | stable_meets | yes | 0.14 | meets | meets |

## 8. Cost and reliability (actual)

- **Tutor:** 216 attempts, 0 errors, no retries, median latency 3.34 s, **$2.9091**.
- **Judge:** 122 calls (108 + 12 frozen self-consistency repeats + 2 re-asks), **$1.6440**.
- **Total: $4.5532.**
- **Identifier leaks:** 0.
- **Models served:** claude-opus-5-5, claude-sonnet-5-5.
- **Reconciliation:** the sum of per-attempt ledgers equals the per-repetition `run_status.json` and `judge_status.json` meters (rounding to 6 decimal places).

## 9. Limitations

- **Three repetitions is a small sample**, not a definitive variance estimate. Confidence intervals were not computed, because n=3 per case is too small.
- **Two sources of randomness:** the tutor and the judge are both stochastic, and this design doesn't separate them. That would need re-judging fixed outputs several times.
- **The subset over-represents weak types by design**, so its meets rate isn't comparable to the 120-case rate.
- **Historical comparisons use single runs** of r1 and r2.
- **The rubric and scoring were not changed** on the basis of this study.

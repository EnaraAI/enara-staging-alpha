# LTB v1.0 run — 2026-11-09

ENARA Language Teaching Benchmark v1.0: 120 synthetic cases run through the real tutor route with the `ltc-v1` engine. Start with `final_report.md`.

| File | What it is |
|---|---|
| `final_report.md` | Results, findings, limitations, compliance |
| `results_overview.png` | One-page chart of the results |
| `failure_analysis.md` | Failure clusters, traced root causes, next steps |
| `cost_reconciliation.md` | Metered actual cost vs estimate |
| `preflight_report.md` | Pre-run plan: models, limits, budget controls, gates |
| `license_review.md` | Dataset licence gate (no third-party text used) |
| `dataset_manifest.json` | Case counts, hashes, composition |
| `benchmark_cases.jsonl` | The 120 frozen cases |
| `rubric_v1.json`, `rubric_v1.md` | Frozen rubric (7 dimensions, 0–4) |
| `scoring_spec_v1.json` | Frozen deterministic checks, judge protocol, outcome rules |
| `run_config.json`, `run_status.json` | Tutor run configuration and status |
| `raw_results.jsonl` | Every turn: learner text, tutor reply, engine moves, ped-v2 plan |
| `provider_attempts.jsonl` | Every tutor provider attempt: status, model, usage, cost, leak scan |
| `judge_results.jsonl`, `judge_attempts.jsonl`, `judge_status.json` | Judge scores (automated, provisional) and metering |
| `case_scores.csv` | Per-case checks, judge scores, outcome |
| `aggregate_results.json` | Aggregates by dimension, cohort, level, case type |
| `dry_*` | The harness's no-provider dry run, used to verify it before paying |

Reproduce (from `backend/`):

```
npx tsx benchmarks/ltc-v1/run.ts --mode live --cap 25 --key-file <private key file>
npx tsx benchmarks/ltc-v1/judge.ts --cap 10 --key-file <private key file>
node benchmarks/ltc-v1/score.mjs
```

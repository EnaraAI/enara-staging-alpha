# LTB v1.0: `ltc-v1-r2` remediation and frozen re-run (9 Nov 2026)

Start with `benchmark_comparison.md` (baseline vs r1 vs r2). Baseline and r1 artifacts live in sibling dirs and were not modified; their hashes are in `manifest.json`.

| File | Content |
|---|---|
| `r2_preflight.md` | Initial state, hash verification, route, model, age-source and credential checks, Phase 8 gate |
| `r2_diagnosis.md` | Trace-based diagnosis, written before any code change |
| `remediation_plan.md`, `implementation_report.md` | Changes, tests, the age blocker, commands and exit codes |
| `benchmark_comparison.md`, `comparison_overview.png` | Three-way results |
| `failure_analysis.md` | Every regression and the remaining patterns |
| `educator_review_pack.md`, `educator_review_items.json`, `educator_review_scoresheet.csv` | PREPARED — NOT EDUCATOR REVIEWED |
| `raw_results.jsonl`, `provider_attempts.jsonl`, `judge_results.jsonl`, `judge_attempts.jsonl`, `case_scores.csv`, `aggregate_results.json`, `comparison.json` | Machine-readable outputs |
| `usage_cost_ledger.json`, `run_status.json`, `judge_status.json`, `run_config.json` | Usage, cost and latency |
| `pre_*.log`, `post_*.log` | Typecheck, build and test logs |
| `*_r2.diff`, `pre_edit_code_snapshot/` | Code-change evidence |
| `dry_*` | No-provider dry run (gate) |

## Reproduce locally (no staging, no real data)

From `backend/`, with an Anthropic key supplied through a private, non-persisted channel:

```
npx tsx benchmarks/ltc-v1/run.ts --mode live --cap 100 --out <dir> --cases <dir>/benchmark_cases.jsonl --key-file <(…)
npx tsx benchmarks/ltc-v1/judge.ts --cap 50 --out <dir> --key-file <(…)
node benchmarks/ltc-v1/score.mjs --dir <dir>
```

`<dir>` must contain byte-identical copies of `benchmark_cases.jsonl`, `rubric_v1.json` and `scoring_spec_v1.json`. The runner uses an in-memory MongoDB and blocks every outbound host except the model provider.

# LTB v1.0: remediation `ltc-v1-r1` and frozen re-run (9 Nov 2026)

Start with `benchmark_comparison.md`. The frozen baseline is in `../20261109T-ltb-v1.0/` and was not modified (hashes in `manifest.json`).

| File | Content |
|---|---|
| `benchmark_comparison.md` | Full before/after comparison |
| `remediation_plan.md` | Failure → root cause → change → tests |
| `implementation_report.md` | Files, architecture, risks, commands and exit codes |
| `failure_analysis.md` | Remaining failures, traces, hypotheses, proposed fixes |
| `educator_review_pack.md` (+ `educator_review_items.json`, `educator_review_scoresheet.csv`, `educator_review_unblinding_key.json` — coordinator only) | Prepared, not conducted |
| `preflight_report.md` | Informational estimate before the paid run |
| `comparison.json`, `case_delta.csv` | Machine-readable before/after |
| `raw_results.jsonl`, `provider_attempts.jsonl`, `run_config.json`, `run_status.json` | Tutor run: every turn and every provider attempt (usage, latency, cost, leak scan) |
| `judge_results.jsonl`, `judge_attempts.jsonl`, `judge_status.json` | Judge scores (automated, provisional) and metering |
| `case_scores.csv`, `aggregate_results.json` | Frozen-scorer outputs for this run |
| `benchmark_cases.jsonl`, `rubric_v1.json`, `scoring_spec_v1.json` | Byte-identical copies of the frozen inputs (needed by the unchanged scripts) |
| `engine_r1.diff`, `tutormessage_r1.diff`, `old_test_r1.diff`, `baseline_code_snapshot/` | Code change evidence |
| `pre_*.log`, `post_*.log` | Typecheck, build and test logs |
| `dry_*` | No-provider dry run of the unchanged runner |
| `manifest.json` | SHA-256 of the frozen baseline inputs and outputs, the runner, and every file here |

# LTB v1.0: r3 report pack (9 Nov 2026)

| Claim | Status |
|---|---|
| r3 engine changes (T04/T08/T12, age resolver) | `CODE-VERIFIED`, `TEST-VERIFIED` |
| Official 120-case run: 81/120 (67.5%), 3 short of 70% | `LIVE-PROVIDER-VERIFIED` (local) |
| 36 × 3 stability study | `REPEATED-RUN-DIAGNOSTIC` (not part of the official score) |
| Adult age provenance | verified (school setting) |
| Child/teen age adaptation | **`BLOCKED`**: no trusted source |
| Educator review | `PREPARED — NOT CONDUCTED` |
| Staging / production | `NOT RUN` |

Files:
- `r3_implementation_report.md`
- `r3_benchmark_comparison.md`
- `r3_failure_analysis.md`
- `r3_age_provenance_report.md`
- `r3_repeated_run_stability_report.md`
- `r3_educator_review_pack.md` (and `r3_educator_review_items.json`)
- `official/`: raw outputs, ledgers, scores, `comparison.json`
- `stability/`: the frozen plan and `rep1` to `rep3`
- `logs/`: typecheck, build, focused tests, the full suite, and the pre-existing-failure check
- `code_diffs/`, `pre_edit_code_snapshot/`, `code_under_test.sha256`
- `r3_manifest.json`

Reproduce a run (from `backend/`):

```
npx tsx benchmarks/ltc-v1/run.ts --mode live --out <dir> --cases <dir>/benchmark_cases.jsonl --key-file <(private pipe)
npx tsx benchmarks/ltc-v1/judge.ts --out <dir> --key-file <(…)
node benchmarks/ltc-v1/score.mjs --dir <dir>
```

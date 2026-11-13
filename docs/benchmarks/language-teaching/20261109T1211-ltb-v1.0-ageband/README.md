# Option B: trusted learner age band, and LTB v1.0 official run (9 Nov 2026)

| Claim | Status |
|---|---|
| Trusted `learnerAgeBand` (student and class), Workspace-Admin-only writes, Academic Manager read-only, resolver precedence | `CODE-VERIFIED`, `TEST-VERIFIED` (54 new tests; 92/92 with r3 tests) |
| Provider payload carries only the coarse band and source label | `TEST-VERIFIED` and live leak scan (0/219) |
| Child and teen reach the engine from a trusted source on every official turn | `LIVE-PROVIDER-VERIFIED`: 73/73 child, 73/73 teen, 73/73 adult |
| Official run: 90/120 (75.0%) | `LIVE-PROVIDER-VERIFIED` (local; single run; LLM-judged; not learning gains) |
| Educator review | `NOT CONDUCTED` |
| Staging / production | `NOT RUN` |
| Age-band boundary definitions | **Open product decision** (none encoded) |

Files:
- `implementation_report.md`
- `benchmark_comparison.md`
- `preflight_manifest.json`
- `official/`: raw outputs, attempt ledgers, judge results, scores, `comparison.json`
- `logs/`: typechecks, frontend build, focused and full test suites
- `code_diffs/`, `pre_edit_code_snapshot/`
- `code_under_test_*.sha256`
- `manifest.json`

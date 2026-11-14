# Test results (r4.1)

**Setup.** Run locally from `backend/` with an in-memory MongoDB and the provider SDK mocked or intercepted. The unit, integration and suite runs below make no provider call. Paid runs are reported separately in `paid_evaluation_report.md`.

**What was not done:**
- No test was weakened or skipped.
- No unrelated failing test was modified.
- No separate reproduction suite was created; regression tests were added to the ordinary suites.

## 1. Engineering validation

| # | Command | Exit | Result |
|---|---|---:|---|
| 1 | `npx tsc --noEmit -p .` | 0 | Clean |
| 2 | `npx tsc -p . --outDir <scratch>/build` (repo untouched) | 0 | Built |
| 3 | Lint | — | No backend linter is configured (`package.json` has `build` and `typecheck` only) |
| 4 | Benchmark and test files typecheck (`judge_v2*.ts`, `run_fixture_v2.ts`, R4 and fixture-v2 tests) | 0 new errors | Only the pre-existing `.mjs` declaration notes (TS7016) |
| 5 | Language, tutor and evaluator suites: `languageTeachingR4`, `benchmarkFixtureV2`, `languageTeachingContext`, `languageTeachingR2`, `languageTeachingR3`, `languageTeachingRemediation`, `learnerAgeBand`, `p20TutorStream`, `p1ReviewFixes` | 0 | **9 files, 304/304** after the last product change; `benchmarkFixtureV2` 20/20 after the evaluator core-2 fix |
| 6 | **Full backend: `npx vitest run` (final code, nothing running in parallel)** | 1 | **1570 passed, 16 failed; 110 files (11 failing)** |
| 7 | Dry run of frozen fixture v2 on final code (`run_fixture_v2.ts --mode dry`) | 0 | 219/219 HTTP 200; 72/72 items seen; 0 answers in prompts; 0 markers; 0 leaks; 219/219 scoped; $0 |
| 8 | Frontend build | — | Not run: no frontend file changed |

## 2. Full-suite comparison with the baseline

| | Baseline (previous audit) | Final r4.1 |
|---|---:|---:|
| Passed | 1539 | **1570** (+31 new tests) |
| Failed | 16 | **16** |
| Failing files | 11 | 11 |

**Historical failures: 16, unchanged.** The sorted list of failing test names is byte-identical to the audit's saved list (`diff` empty). The failing files are:

| File | Failures |
|---|---:|
| `elie.e2e` | 1 |
| `elie.sprint4` | 1 |
| `p14_2GradingTestSpend` | 2 |
| `p14_8BlockerFixes` | 1 |
| `p19Resilience` | 1 |
| `p20QueryBudget` | 1 |
| `p2Documents` | 2 |
| `p3EducatorChat` | 1 |
| `phase0` | 2 |
| `phase3.autograding` | 3 |
| `phase3.e2e` | 1 |

None touches the language engine.

**Newly introduced failures: 0.**

**Note on an intermediate run.** An earlier full run, made while files were still being edited and while another in-memory MongoDB job ran in parallel, showed 2 extra failures:
- `languageTeachingR4`: a test was added before its source change;
- `educatorAnalytics`: a 5 s timeout under load.

Both passed when re-run alone (126/126) and pass in the final run. They are not regressions.

## 3. New and changed tests

| File | Before → after | What is covered |
|---|---|---|
| `test/languageTeachingR4.test.ts` | 34 → 61 | POST-01 chunk equivalence (8 texts × sizes 1–9 × all offsets), malformed and long markers; POST-02 leading-only trust, late markers, learner-supplied marker text, key precedence, criteria bounds, 6 verdicts, POST-04, POST-05; POST-03 scope function, scoped reconstruction, legacy turns, lesson switch; POST-12 8 intents, 5 pressure phrasings, reply instructions, repeated demands never reaching L6, policy answer after an attempt, assisted after a reveal (Stage A shape), POST-06, Arabic diacritics. **Route tests (real controller, SDK mocked):** lesson switch with colliding item ids, injection echo and dictated leading marker, SSE multi-line, long and unclosed markers, pressure through the route. |
| `test/benchmarkFixtureV2.test.ts` | 16 → 20 | Machine rubric anchors verbatim from the draft; evaluatorView on all 120 cases; explicit failures (missing, v1-shaped, id mismatch, injected answers); prompt contains no keys or runtime fields; outcome rule incl. critical not offset, `n/a` / insufficient evidence, INVALID, privacy, reconcile, κ, deterministic checks |
| `test/languageTeachingR3.test.ts` | 1 assertion changed | Policy revision string `ltc-v1-r4` → `ltc-v1-r4.1` (intentional, commented inline) |
| `test/languageTeachingR4.test.ts` (existing test) | 1 assertion added | Hint wording forbids offering the correct form as an option before level 6 |

**The audit suite is unchanged** (`test/audit-post-remediation/*.audit.ts`; separate config, not in the default run).

## 4. Runtime validation (actual paths)

| Path | Evidence |
|---|---|
| JSON tutor route, real model | Stage A (28 + 15 turns), Stage C (219 turns), stability (24 turns): all HTTP 200, 0 visible markers |
| SSE tutor route, real model | 5 turns: streamed text equals stored text, 0 markers in the stream |
| Evaluator | 120 + 120 + 15 + 15 + 24 v2 evaluations; 0 provider errors; 1 unparseable (independent, LTB-TB1-T01) |

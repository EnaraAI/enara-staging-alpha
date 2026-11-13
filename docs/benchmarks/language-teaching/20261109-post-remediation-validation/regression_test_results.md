# Regression and compatibility results

**Setup:** run locally from `backend/` with an in-memory MongoDB and the provider SDK mocked or intercepted.

**No paid calls, no network to providers.** No test was weakened, and no unrelated failing test was modified.

## 1. Commands and results

| # | Command | Exit | Result | Previous baseline (remediation report) | Same? |
|---|---|---:|---|---|---|
| 1 | `npx tsc --noEmit -p .` | 0 | clean | pass | ✔ |
| 2 | `npx tsc -p . --outDir <scratch>/audit_reg/build` (repo untouched) | 0 | built | pass | ✔ |
| 3 | `npx vitest run test/languageTeachingR4.test.ts test/benchmarkFixtureV2.test.ts test/languageTeachingContext.test.ts test/languageTeachingR2.test.ts test/languageTeachingR3.test.ts test/languageTeachingRemediation.test.ts test/learnerAgeBand.test.ts test/p20TutorStream.test.ts test/p1ReviewFixes.test.ts` | 0 | **9 files, 273/273** | 273/273 | ✔ |
| 4 | `npx vitest run` (full backend) | 1 | **1539 pass, 16 fail, 110 files (11 failing)** | 1539 / 16 | ✔ |
| 5 | `npx vitest run --config test/audit-post-remediation/vitest.audit.config.ts` (audit scenarios, new) | 1 | **132 pass, 20 fail (152 assertions)**. The failures are the audit findings, by design. | n/a | — |
| 6 | `npx tsx benchmarks/ltc-v2/run_fixture_v2.ts --mode dry …` | 0 | 219/219 turns, $0 (see the Gate C report) | 219/219, $0 | ✔ |

## 2. The 16 full-suite failures

**The failing set is byte-for-byte identical** to the remediation run (`diff` of the sorted `FAIL` lines is empty) and to the pre-remediation baseline copy reproduced in the remediation task.

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

None touches the language engine. **New failures: 0.**

## 3. Compatibility checks

| Check | Evidence | Result |
|---|---|---|
| API response contract | `p20TutorStream` and existing tutor and route suites pass. `assistantMessage.meta.languageTurn` only gained optional fields. | ✔ unchanged (additive) |
| SSE event contract (`user` / `token` / `replace` / `done` / `error`) | `tutor.controller.ts` diff: only the filter around `token` deltas; `p20TutorStream` passes | ✔. **But the SSE `token` and stored text can contain marker fragments (POST-01).** |
| Session persistence | Only `meta.languageTurn` additions (`TutorMessage.ts` +16) | ✔ |
| Teacher / Workspace Admin / Academic Manager permissions | No change to `auth/permissions.ts` or the routes; `learnerAgeBand.test.ts` (AM read-only) passes; CA-05..10 | ✔ |
| Student answer-key exposure | CA-01..04, ST-07, dry run 0/219 | ✔ none |
| Database migration | None. Optional fields only; older documents are handled as unknown. | ✔ |
| New environment variables / provider dependency | No `getConfig` / env changes in the remediation diff | ✔ none |
| Voice / avatar tutoring | `avatar.controller.ts` is not in the remediation diff. The voice path never receives the language block. `avatar.test.ts` passes in the full suite. | ✔ |

## 4. Age × CEFR matrix (audit AC-*, 9/9 PASS)

| Age band | A1 | A2 | B1 |
|---|---|---|---|
| Child | ✔ | ✔ | ✔ |
| Teen | ✔ | ✔ | ✔ |
| Adult | ✔ | ✔ | ✔ |

Each combination is checked for:
- identical r4 state, hint and grounding lines;
- `never more than <maxWords>` equal to `lengthTarget(age, CEFR)`;
- age band preserved and never inferred from CEFR;
- CEFR preserved and never inferred from age.

Engine and prompt level only.

## 5. Scenario matrix coverage (deterministic, `scenarios/*.json`)

| Area | Required minimum | Run | Pass | Fail IDs |
|---|---:|---:|---:|---|
| Assessment marker parsing | 15 | 16 | 15 | MK-15 |
| Prompt injection | 8 | 11 | 8 | PI-07b, PI-09, PI-R1 |
| Answer-key matching | 12 | 15 | 14 | AK-11 |
| Cross-session / learner isolation | 8 | 9 | 7 | ISO-05, ISO-06 |
| Streaming and retry | 8 | 11 | 7 | MK-13s, MK-14s, ST-02, ST-03 |
| Hint-level transitions | 12 | 13 | 13 | — |
| Binary / single-ending leakage (telemetry) | 8 | 8 | 7 | BL-04 (detection miss) |
| Equivalent-form leakage (telemetry) | 8 | 8 | 4 | EQ-01, 05, 07, 08 (detection misses) |
| Assisted vs independent | 8 | 8 | 7 | AI-03 |
| Grammar / quote / attribution | 8 | 8 | 5 | GQ-03, 04, 06 (telemetry misses) |
| Curriculum API exposure | 10 | 12 | 11 | CA-11 (pre-existing) |
| Lesson-item sanitisation | 10 | 11 | 10 | LS-11 |
| Fixture / evaluator parity | 10 | 12 | 10 | PA-10, PA-11 |
| Learner pressure (added) | — | 3 | 0 | LP-01..03 |
| Fallback edge cases (added) | — | 4 | 2 | FB-01, FB-02 |
| Age × CEFR (added) | — | 9 | 9 | — |
| **Total** | | **158** | **129** | 29 |

Telemetry rows are **measurements**: a miss there is a detection gap, not a runtime failure.

**A test that only checks for a prompt string is not counted as evidence of model behaviour** (e.g. AI-08, GQ-08).

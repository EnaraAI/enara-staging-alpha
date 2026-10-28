# Hybrid V1 test matrix (offline only)

All tests use synthetic fixtures or golden fixtures exported from the frozen Python modules with synthetic inputs. The
Anthropic SDK constructor and `fetch` are stubbed to throw, so any network attempt fails the test.

## Commands and results (2026-10-26)
| Command | Result |
|---|---|
| `cd backend && npx vitest run test/hybridV1.frozen.test.ts` | **34 passed** |
| `cd backend && npx vitest run test/hybridV1.shadow.test.ts` | **10 passed** |
| `cd backend && npx vitest run` (full backend suite) | **298 passed, 31 files, 0 failed** |
| `cd backend && npx tsc --noEmit` | **clean** |
| `python -m pytest -q tests/benchmarks` | 789 passed, 4 xfailed, **1 failed**: `test_ac_experiment.py::test_pool_is_development_only_and_excludes_graded`. This is pre-existing and unrelated: a stale pool count (346 vs 358) that drifts as calibration answers are consumed. |
| `python -I scripts/benchmarks/diagnostics/export_hybrid_v1_frozen.py --out backend/test/fixtures/hybridV1` | Regenerates the goldens; it checks the frozen source hash first |

## Coverage
| Area | Test |
|---|---|
| Frozen spec hash (`ddcda7fe…`), source hash `a1be3f9c…`, refusal of an altered spec | frozen: *frozen spec* |
| Python-compatible JSON (float repr, escapes, raw_decode, strict strings, NaN) | frozen: *python-compatible JSON* |
| Byte-exact first prompt, repair prompt and request body vs Python | frozen: *prompt rendering* |
| 17 golden parse cases (grid, bounds, bool/str score, contract errors, NOT_FOUND / REPEATED / context, material-error trimming) and `extract_json` cases | frozen: *output parsing* |
| Anchor selection equals Python (both seeds; fewer than K) | frozen: *anchors and blend* |
| Blend on the full grid (eval-v2 0..5 × V6 quarter points): exact, on 0.125, no clipping, deterministic; golden fallbacks | frozen: *anchors and blend* |
| V6 call: single call; one repair with the frozen correction text; second failure labelled; truncation, unparseable, transport, NaN → no repair; oversized prompt → no call | frozen: *V6 grading* |
| Eligibility envelope; config off by default; canary rejected; caps required | frozen: *eligibility…* |
| eval-v2 production policy unchanged (`{version:'eval-v2'}`) | frozen + full backend suite (eval-v2 tests unchanged and passing) |
| Shadow isolation: official attempt deep-equal before and after; no answer text stored | shadow #1 |
| Idempotent rerun: no call, no new record | shadow #2 |
| Frozen anchor set reused per question | shadow #3 |
| Tenant isolation and too few anchors → labelled fallback | shadow #4 |
| Answer that is its own question's anchor → excluded | shadow #5 |
| eval-v2 from a non-frozen model → not eligible | shadow #6 |
| eval-v2 missing → structured non-score, no call | shadow #7 |
| Budget hard stop before exceeding the call cap | shadow #8 |
| Kill switch (env disabled) and school allowlist | shadow #9 |
| Logs without answer text | shadow #10 |

## Not covered (gaps)
- Concurrent workers on the same key are covered by the unique index and the claim logic, but not by a parallel stress
  test.
- Gradebook, analytics and export precision are not applicable: shadow results never reach them. The official contract
  incompatibility is documented as a blocker.
- A live provider call: deliberately not run, since there is no authorization.

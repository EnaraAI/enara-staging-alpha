# Hybrid V1 changelog (local, uncommitted)

## Added (all new files; no existing file modified)
| File | Why |
|---|---|
| `backend/src/services/hybridV1/frozenV6Spec.json` | Frozen V6 spec, exported from the frozen Python and hash-checked at runtime |
| `backend/src/services/hybridV1/pyjson.ts` | Python-compatible JSON writer and `raw_decode` reader, for a byte-exact prompt and reply handling |
| `backend/src/services/hybridV1/v6.ts` | TypeScript port of anchored-holistic v6: render, call, parse, `locate`, one repair, frozen failure semantics |
| `backend/src/services/hybridV1/hybrid.ts` | Frozen combine formula, `pyRound` (half-even), anchor selection, eligibility envelope |
| `backend/src/services/hybridV1/config.ts` | Feature flag, kill switch, shadow-only mode, allowlist, hard caps |
| `backend/src/services/hybridV1/shadow.ts` | Shadow orchestration: reuses the official eval-v2 proposal; isolated writes; budget guard; idempotency |
| `backend/src/services/hybridV1/client.ts` | The only provider client (no SDK retries, 240 s timeout, `trackAiCall` accounting) |
| `backend/src/models/HybridShadowResult.ts` | Isolated `HybridShadowResult` and `HybridAnchorSet` collections |
| `backend/src/scripts/hybridShadow.ts` | Command line; dry run by default |
| `backend/test/hybridV1.frozen.test.ts`, `backend/test/hybridV1.shadow.test.ts` | Offline tests (44) |
| `backend/test/fixtures/hybridV1/*.json` | Golden fixtures from synthetic inputs |
| `scripts/benchmarks/diagnostics/export_hybrid_v1_frozen.py` | Read-only exporter of the spec and goldens |
| `docs/benchmarks/diagnostics/20261028T090000Z-hybrid-v1-production-readiness/*` | This documentation |

## Not changed
- **Production eval-v2 was not altered.** `gradingProposals.ts`, `autoGrading.ts`, `aiJson.ts`, `aiCalls.ts`,
  `featureFlags.ts` and `config/env.ts` are byte-identical (`git diff` on `backend/src` is empty; hashes are in
  `V1_FREEZE_MANIFEST.json`).
- No routes, migrations, prompts, model settings or defaults were changed.
- The frozen Python candidate, the confirmatory artifacts, the ledgers and the reports are unchanged.
- The pre-existing user modifications to `scripts/benchmarks/run_grading_eval.py` and
  `tests/benchmarks/test_additional_datasets.py` were left untouched.

## Note
An empty file named `+~` exists at the repository root (0 bytes, created 2026-10-26 15:42, about when the confirmatory
eval-v2 subprocess started). It is not part of this work. I left it in place; delete it if it is unwanted.

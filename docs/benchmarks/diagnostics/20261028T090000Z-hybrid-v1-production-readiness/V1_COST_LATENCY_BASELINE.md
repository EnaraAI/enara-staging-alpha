# Hybrid V1 cost and latency baseline (historical; no new measurements)

## Sources
| Source | Used for |
|---|---|
| **Confirmatory test aggregates** (`20261028T080000Z-enara-hybrid-confirmatory-v1/analysis/*`) | Aggregate figures only; no per-row protected data was opened for this document |
| **Calibration 100-answer run** (`20261028T060000Z-rubric-engine-v3-anchored-v6`, non-protected) | Per-call latency percentiles |

## Per answer (from these runs)
| Component | Calls per answer | Cost | Latency |
|---|---|---|---|
| V6 | 1.003 (711 calls / 709 answers; 2 repairs) | **$0.0061** per answer, confirmed (test) | Calibration: p50 2.77 s, p95 3.73 s, mean 2.96 s (n=100). Test: mean 2.88 s. |
| eval-v2 (already paid in production) | 2.03 (1,437 / 709; calibration 2.02) | **$0.0401** per answer measured (test); $0.019 per call (calibration) | Calibration per answer: p50 8.76 s, p95 13.52 s; per call p50 8.28 s, p95 12.16 s |
| **Hybrid shadow overhead** (eval-v2 reused, not re-run) | +1.003 V6 calls | **+$0.0061 per eligible answer** | V6 runs after release, off the student path. It adds about 3 s per answer to shadow job time and nothing to student-facing grading. |

If Hybrid ever became official (canary or GA), the total per answer would be about **$0.046** and **3.0 V6 + 8.8 s
eval-v2**. Run in sequence, that is about 12 s p50; run in parallel, about max(eval-v2, V6), roughly 9 s.

## Gaps (not measured; do not assume)
- Production traffic mix, queueing, and provider rate limits under real concurrency.
- V6 latency p50/p95 on the test split (only the mean is reported).
- Anthropic pricing changes after 2026-10-26. `aiCalls.ts` prices `claude-sonnet-5-5` at $2 / $10 per million tokens,
  the same as the frozen adapter.
- The cost of building anchor sets (database reads only) and storage growth of `HybridShadowResult`.

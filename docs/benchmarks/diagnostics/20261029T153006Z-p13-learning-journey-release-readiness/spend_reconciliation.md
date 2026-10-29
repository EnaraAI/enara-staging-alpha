# P13 spend reconciliation (P12 live run)

**Sources:**
- `P12_HARD_CAP_SPEND_LEDGER.json` (cap ledger, written live);
- `P12_CALL_LEDGER.csv`;
- `P12_RUN_RESULT.json` → `reconcile.ledgerFeatures` (ENARA `usage_ledger` rows as exported by the harness);
- `P12_APP_EVENT_LOG.jsonl` (`ai_call` log lines).

No credentials or payloads are reproduced here.

**Pricing basis:** catalogue v1, recomputed independently in this audit from each attempt's reported token counts.
- Opus: $4 input / $20 output per million tokens.
- Sonnet: $2 / $10.
- No cache tokens were reported.

## Per attempt

| # | Started (UTC) | Step | Model (requested = responded) | Input tokens | Output tokens | Recomputed | Cap ledger | Usage ledger | App log | Reserved before | Committed before | Fits cap? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 14:08:51.058 | assessment draft | claude-sonnet-5-5 | 931 | 1,315 | 0.015012 | 0.015012 | 0.015012 | 0.015012 | 0.082723 | 0.000000 | yes |
| 2 | 14:09:00.416 | rubric grading (weak) | claude-opus-5-5 | 1,207 | 529 | 0.015408 | 0.015408 | 0.015408 | 0.015408 | 0.066960 | 0.015012 | yes |
| 3 | 14:09:06.069 | rubric grading (weak) | claude-opus-5-5 | 1,207 | 517 | 0.015168 | 0.015168 | 0.015168 | 0.015168 | 0.066960 | 0.030420 | yes |
| 4 | 14:09:11.638 | tutor | claude-opus-5-5 | 989 | 618 | 0.016316 | 0.016316 | 0.016316 | 0.016316 | 0.085760 | 0.045588 | yes |
| 5 | 14:09:19.414 | reassessment short answer #1 | claude-opus-5-5 | 285 | 120 | 0.003540 | 0.003540 | 0.003540 | 0.003540 | 0.017890 | 0.061904 | yes |
| 6 | 14:09:22.560 | reassessment short answer #2 | claude-opus-5-5 | 285 | 154 | 0.004220 | 0.004220 | 0.004220 | 0.004220 | 0.017890 | 0.065444 | yes |
| 7 | 14:09:25.703 | reassessment short answer #3 | claude-opus-5-5 | 285 | 138 | 0.003900 | 0.003900 | 0.003900 | 0.003900 | 0.017890 | 0.069664 | yes |
| 8 | 14:09:28.598 | rubric grading (strong control) | claude-opus-5-5 | 1,276 | 694 | 0.018984 | 0.018984 | 0.018984 | 0.018984 | 0.067340 | 0.073564 | yes |
| 9 | 14:09:35.715 | rubric grading (strong control) | claude-opus-5-5 | 1,276 | 723 | 0.019564 | 0.019564 | 0.019564 | 0.019564 | 0.067340 | 0.092548 | yes |

## Totals (verified arithmetic)

| Quantity | Value |
|---|---|
| Recomputed from tokens | **$0.112112** |
| Cap ledger `spentUsd` | $0.112112 |
| Per-call CSV, cap-ledger column | $0.112112 |
| Per-call CSV, usage-ledger column | $0.112112 (largest per-row delta 0.000000) |
| App-log `ai_call` cost sum | $0.112112 (9 lines) |
| **Unexplained difference** | **$0.000000** |
| Sum of reservations | $0.490753; the largest single committed-plus-reserved value was $0.159888, far below the $1.00 cap |
| Cap remaining | $0.887888; cap ledger `exhausted: false`, no STOP event |
| Attempts / HTTP 200 / `end_turn` / provider request ids | 9 / 9 / 9 / 9 |
| Retries (validation, transport, tie-break) | 0 |

**Timestamp alignment (verified).** Each app-log `ai_call` line falls 2–14 ms after the matching cap-ledger attempt ends (start + latency). Order, feature, model and cost match one-to-one.

**The reported "$0.112" is supported.** Exactly $0.112112 at catalogue rates.

## What is not independently verifiable

- **`usageLedgerRows = 9` and `p0dReservations = 9`.** These counts were exported by the harness from an in-memory database that no longer exists. The usage-ledger costs agree with the separate app log and cap ledger, which corroborates them. The P0d reservation count is harness-reported only.
- **Invoice-level spend.** No provider usage or invoice access; account-wide spend is unknown. All figures are catalogue estimates.
- **Worst-case reservation correctness for the input side.** It relied on the provider's `count_tokens` result + 10%. The billed input was below the bound on all 9 calls (for example 931 vs 1,089), so the bound held in this run. The guard's refusal path (STOP, refuse later attempts) is verified only by offline unit tests (`backend/test/p12HardCap.test.ts`, 6/6, re-run in this audit as part of 953/953). It was never triggered live.
- **The grading emergency path's interaction with the cap.** It was not exercised live (the P0d grading allowance was never exhausted). The claim that it cannot bypass the cap rests on design: the guard wraps `fetch` under every SDK client.

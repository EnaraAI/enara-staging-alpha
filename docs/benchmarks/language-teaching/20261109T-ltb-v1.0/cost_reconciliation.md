# Cost reconciliation (LTB v1.0)

**Actual cost: $4.99** (provider-reported usage × repo price catalog, summed over every attempt). All attempts were metered, including re-asks; none failed and no retries were needed.

| Part | Model (served) | Attempts | Input tokens | Cache read | Cache write | Output tokens (of which thinking) | Actual cost |
|---|---|---|---|---|---|---|---|
| Tutor (system under test) | `claude-opus-5-5` (219/219; no server-side fallback) | 219 | 389,454 | 34,952 | 514 | 77,815 (19,893) | **$3.1237** |
| Judge | `claude-sonnet-5-5` | 134 (132 planned + 2 re-asks after unparseable output) | 505,266 | 0 | 0 | 85,611 | **$1.8666** |
| Key check | `GET /v1/models` | 1 | — | — | — | — | $0 (free endpoint) |
| **Total** | | **354** | | | | | **$4.9903** |

Prices (repo `priceCatalog.ts`, matching current Anthropic list prices): Opus 5.5 $4 input, $20 output, $0.20 cache read per million tokens; Sonnet 5.5 $2 input, $10 output.

Arithmetic check (tutor): 389,454 × $4/M = $1.5578; 77,815 × $20/M = $1.5563; 34,952 × $0.20/M = $0.0070; cache write 514 tokens = $0.0026. Total $3.1237. It matches the metered figure.

## Against the preflight estimate

| | Estimate | Actual |
|---|---|---|
| Tutor | about $4.50 (range $3–$9) | $3.12 |
| Judge | about $3 (range $2–$6) | $1.87 |
| Total | about $7.50 (range $5–$15) | **$4.99** |

The total came in just under the low end of the range. Reason: replies averaged 355 output tokens against the 600 assumed, and thinking at effort `low` was small (average 91 tokens).

## Controls and limits observed

- Harness caps ($25 tutor, $10 judge) were never reached. The highest single-call output was 626 tokens (tutor) and 844 tokens (judge), against limits of 4,000 and 6,000.
- No HTTP errors, no timeouts, and no gateway retries (`maxAttempts: 2` was never needed).
- The app's local test-spend cap ($35, `ltb-v1-local`) lived only in the throwaway in-memory database, which was deleted at the end of the run. The staging cap, `AI_TEST_SPEND_ID` and every staging or production ledger were untouched.
- Billing account: the user-provided Anthropic API key, used from a 0600 private file. The file was deleted after the run.
- These are provider-usage-based figures, not an invoice. The provider's own console is the final reference.

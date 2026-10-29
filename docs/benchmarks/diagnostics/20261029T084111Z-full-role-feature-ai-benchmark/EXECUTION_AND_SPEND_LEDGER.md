# Execution and Spend Ledger: P7 three-model benchmark

## 1. Preflight

| Gate (spec Phase 1) | Outcome |
|---|---|
| Staging deployment has its own Anthropic key | **No.** Staging has no `ANTHROPIC_API_KEY` and `AI_PAUSED=true`. **No AI call was made against staging, its database or its R2 bucket** |
| Owner authorization for paid calls | **Yes:** in chat, 2026-10-29: "You have the authorization to use Anthropic sdk", within the approved staging budget |
| Where the calls ran | An **isolated local harness** (`backend/src/scripts/benchmark3Model.ts`, uncommitted), with a throwaway in-memory MongoDB, temp upload directory, synthetic data, and no staging/production DB, R2, Vercel or email |
| Key used | The key in the sandbox's local `backend/.env`, loaded into the harness process only; never printed, written or sent anywhere except `api.anthropic.com` |
| Models available | `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5` all listed by `GET /v1/models` |
| Rates verified | Published pricing page, 2026-10-29 (see the cost report §1). The ENARA catalogue matches on input and output |
| P0d budget enforced | Yes, in the gateway: synthetic school policy with monthly $15, daily $6, per-user daily $6, grading allowance $3, enforcement on, intended tools listed |
| Per-call upper bound | Yes. Every attempt reserved `maxInput × in-rate + max_tokens × out-rate` in the hard-cap ledger before it started (aiJson guard). Chat and tutor (no aiJson guard) were reserved by the harness for both possible attempts |
| Grading path | Production `ai_grading` (emergency path) **not used**. A benchmark feature name with the same prompt and validator, under the hard cap |
| Hard experiment envelope | **USD 3.00 total** (below $6/day, $15/month and $6/user/day), concurrency 1, stop when exhausted. Lowered from $4 because the account's other spending today isn't visible |
| Account prepaid / spend limit | Not visible (no Admin API key). The $3 cap is the binding limit |

## 2. Spend

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 | Total |
|---|---|---|---|---|
| Benchmark cases run (incl. 9 superseded grading cases) | 15 | 15 | 15 | 45 |
| Provider attempts (charged calls) | 17 | 16 | 16 | **49** |
| Validation retries (included above) | 2 | 1 | 1 | 4 |
| Input / output tokens | 13,664 / 17,038 | 12,817 / 10,685 | 12,817 / 12,601 | 39,298 / 40,324 |
| Cost at published rates | $0.009886 | $0.132484 | $0.303288 | **$0.445658** |
| ENARA gateway `usage_ledger` (`costInternal`) | $0.009886 | $0.132484 | $0.303288 | **$0.445658** |
| Unpriced or usage-unknown attempts | 0 | 0 | 0 | 0 |

- **Of the total:** valid results $0.384702; superseded grading run (harness defect) $0.060956.
- **No judge or grader-of-grader calls:** scoring is deterministic and free.
- **Hard-cap ledger** (`HARD_CAP_SPEND_LEDGER.json`): cap $3.00, spent **$0.445658**, 55 reservations (49 attempts plus 6 released chat/tutor second-attempt reservations), **0 refused, no STOP event**.
- **Reconciliation:** published-rate estimate = gateway ledger = hard-cap ledger, with **$0.000000 drift**.
- **Invoice:** the provider's invoiced amount was **not** read (no Admin Usage API access). The figures above are estimates from published rates and the reported token usage, and should match the invoice unless the account has special pricing.

## 3. Runs

| Run | UTC | Calls | Result |
|---|---|---|---|
| Mock dry runs (local stub provider) | 08:31–08:39 | 36 + 9 | $0, pipeline verified |
| Live run 1 (all workflows) | 08:40:15 → about 08:45 | 40 attempts | completed; 9 grading results superseded |
| Live run 2 (grading only, corrected) | about 08:45 → 08:46:36 | 9 attempts | completed |

**Remaining envelope after this task:** $2.554 of the $3 cap, unused. Nothing else was authorized or spent, and no ElevenLabs, Anam or other paid service was called.

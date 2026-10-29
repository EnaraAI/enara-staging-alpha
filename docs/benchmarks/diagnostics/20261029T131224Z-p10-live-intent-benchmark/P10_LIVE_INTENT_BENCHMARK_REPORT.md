# P10 live intent benchmark: Claude Haiku 5.5 (analytics intent router)

**Date:** 2026-10-29 · **Authorization:** owner, in chat: "you're authorized to excute all the 3 pending tasks"
**Dataset:** `P10_INTENT_BENCHMARK_DATASET.json` (120 synthetic items, sha256 `255eb915…8db977`), unchanged from the P10 preflight.
**Harness:** `backend/src/scripts/benchmarkIntentRouter.ts --live --authorize-paid`. It runs in-memory MongoDB with synthetic fixtures, the real `/api/educator-chat/ask` endpoint, the real gateway, P0d reservation and usage ledger, concurrency 1, and a model ID checked at run time.

## Verdict

| Gate (from the preflight) | Run 1 (max 300 output tokens) | Run 2 (max 1024, after fix) | Threshold | Run 2 |
|---|---|---|---|---|
| Paraphrase accuracy, model path | 66.7% (32/48) | **81.3% (39/48)** | ≥ 85% | **miss (2 items short)** |
| Per language, all items (EN / MSA / Egyptian) | 93.1 / 84.6 / 59.1% | **94.4 / 92.3 / 86.4%** | ≥ 80% each | pass |
| Refusal / unknown accuracy | 94.1% | **100%** | ≥ 95% | pass |
| Scope violations | 0 | **0** | 0 | pass |
| PII reaching the model | 0 | **0** | 0 | pass |
| Database writes | 0 | **0** | 0 | pass |
| Provider attempts = ledger rows | 77 = 77 | **77 = 77** | equal | pass |
| Spend | $0.013850 | **$0.014743** | ≤ $0.25 | pass |

**Decision:** keep `educator_analytics_ai_router_enabled` **off**. Every safety gate passes. Paraphrase accuracy is 2 items short of the 85% bar. All 9 misses are a safe clarifying question ("which class?", `needs_clarification`), never a wrong report. No phrasing produced the wrong intent (confusion matrix below). Recommended next step, not done here: refine the clarification guidance in the router prompt for general requests such as "my groups" or "my kids" (default to all the caller's classes), then repeat this run (cost about $0.015).

## Finding F-11 (fixed): router output limit cut replies off

Run 1 rejected 25 of 77 model replies as `AI_BAD_OUTPUT`, so the router fell back to "unsupported" or a clarification. A diagnostic re-send of the 18 failed items cost $0.003814; its output is in `run1-max300/router-diagnostic.json`. It showed `stop_reason: max_tokens` on the rejected replies. With `effort: low` the model's reasoning still counts against `max_tokens`. At 300 tokens, some replies were cut off mid-JSON and some were empty. The cut-off text already held the expected intent in nearly every case.

**Fix:** `ROUTER_LIMITS.maxOutputTokens` raised from 300 to **1024** in `backend/src/services/educatorAnalyticsRouter.ts`; the test in `p9AnalyticsRouter.test.ts` was updated. The worst-case P0d reservation per attempt rises from $0.00067375 to about $0.00093 (4,190 input-bound tokens × $0.10/M plus 1,024 × $0.50/M), so 240 attempts cost at most about $0.223, still under the $0.25 cap. The P10 preflight's "300 output tokens / $0.00067375" figures describe the pre-fix code. That historical report is left unchanged.

Run 2 had 77 of 77 replies accepted and 0 `AI_BAD_OUTPUT`.

## Run 2 detail

- **Fast path (fixed patterns):** 26 items, 100%, no model call.
- **Model path:** 94 items, 90.4%.
- **By category:**
  - paraphrase 81.3% (48);
  - fixed-pattern control 100% (12);
  - student by name 100% (15);
  - ambiguous 100% (10);
  - cross-scope 100% (10);
  - unsupported 100% (10);
  - injection 100% (10);
  - invalid dates 100% (5).
- **Misses (all `needs_clarification`):**
  - par-002, 004, 006, 007 (class summary; EN, MSA, Egyptian ×2);
  - par-024, 025 (missing submissions);
  - par-037, 038, 042 (learning gaps).
- **Confusion matrix:** non-zero cells only, expected → got:
  - assessment_trend 9/9;
  - class_performance_summary 5, clarification 4;
  - learning_gap_summary 5, clarification 3;
  - missing_submissions 7, clarification 2;
  - score_distribution 9/9;
  - student_progress_comparison 8/8;
  - student_ranking 8/8;
  - student_report 6/6.
  - No cross-intent confusion.

Intent accuracy does not prove that the reports themselves are correct. Report numbers come from the deterministic tests, which pass 944/944.

## Spend and secrecy

- **This task:** $0.013850 (run 1) + $0.003814 (diagnostic) + $0.014743 (run 2) = **$0.032407**.
- **Key handling:** the key was passed straight from the sandbox `.env` into the process environment. It was never printed or stored, and the results files were checked for key material.
- **Staging:** Vercel staging AI stays paused and both analytics flags stay off.

## Files

- `run1-max300/intent-bench-live-summary.json`, `intent-bench-live-results.json`, `router-diagnostic.json`
- `run2-max1024/intent-bench-live-summary.json`, `intent-bench-live-results.json`

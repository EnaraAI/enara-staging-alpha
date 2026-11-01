# ENARA — AI Spend Control Report

- **Date:** 2026-11-01.
- **No paid calls were made.** No provider console or invoice was read.
- **Prices are list estimates** (`PRICE_CATALOG` v1, `source: list_estimate`).
- **No secret values appear below.**

## 1. Provider inventory

| Provider / tool | Feature keys | Priced? | Reservation before the call |
|---|---|---|---|
| Anthropic | `tutor_chat`, `tutor_voice`, `ai_grading`, `ai_assessment_draft`, `ai_question_regenerate`, `ai_lesson_plan(_section)`, `conversation_exam`, `educator_chat`, `educator_analytics_intent`, `staff_assistant`, `next_steps_note`, `avatar_visual`, `objective_extraction`, `reminder_email`, `weekly_summary` | Yes: tokens (Opus $4/$20, Sonnet $2/$10, Haiku $0.1/$0.5 per 1M; cache write ×1.25) | Yes (gateway). Bounded by tokens, or by the school's per-call ceiling for `trackAiCall` callers |
| ElevenLabs TTS | `tts`, `speaking_exam_tts` | Yes: $0.08 / 1,000 characters | Yes (characters) |
| ElevenLabs realtime STT token | `stt` | **No** (unknown) | Needs a school per-call ceiling; full reservation kept |
| ElevenLabs batch STT | `speaking_exam_stt` | **No → unpriced (P22)** | **Owner ceiling `SPEAKING_EXAM_STT_MAX_USD_PER_REPLY` required, else refused** |
| Anam | `avatar_session` | **No** | **Owner ceiling `ANAM_SESSION_RESERVE_USD` and `ANAM_MAX_SESSION_SECONDS` required, else refused** |
| Orchestrator / ingestion engine | `tutor_chat`, `curriculum_ingestion` | No | Ceiling required (unknown-priced tool) |
| Offline scripts (`candidateV2Live`) | — | own caps | Script-only, `--execute` gated; outside the gateway |

## 2. Cap hierarchy (final authority first)

1. **Environment test-spend cap.**
   - Counter: `test_spend:__environment__`.
   - Cap value: `AI_TEST_SPEND_CAP_USD`, at most `STAGING_MAX_TEST_SPEND_USD` = **$50** (unchanged).
   - Applies to every feature, **grading included**, and ignores pause.
   - It is seeded once from all earlier `test_spend:<ID>` counters. **A new `AI_TEST_SPEND_ID` does not reset it.**
   - The per-ID counter still exists for reporting; both counters are reserved atomically, and a refusal on either releases both.
   - Reset only via `src/scripts/resetTestSpendWindow.ts`, which needs `--approved-by`, `--reconciliation` and `--execute`, archives the counters and writes an audit event. **Not run.**
2. **Pause** (global or per school). Applies to everything except grading.
3. **School budgets** (`OrgBudget`, only when `enforcementEnabled`): daily, monthly, per-user-daily and per-call caps.
4. **Grading allowance, then the emergency overrun** (school-level only). In staging the environment cap above still bounds it.

**Grading at the cap.** There is no reservation, so no provider call and no grade. The proposal is marked failed and retried, and becomes `grading_exception` after 3 runs. TEST-VERIFIED (p22 "applies to grading too").

## 3. Settlement and unknown cost

- **Settlement.** A known cost refunds the unused part. An unknown or unpriced cost keeps the whole reservation as `unknownMicros`, and a persisted alert `ai_unknown_cost_reserved` is raised. Settlement is idempotent (conditional `status: 'reserved'` update).
- **Avatar.** All of a call's reservations settle together (`settleReservationsUnder`).
- **Store failure.** Non-grading calls are refused (`AI_BUDGET_UNAVAILABLE`). Grading records emergency exposure. Under the staging cap, a store failure refuses grading too (`reserveTestSpend` fails closed).
- **Usage ledger.** Append-only, keyed per attempt. Costs are labelled `estimated` or `unpriced`; there is no "invoiced" state, because invoice reconciliation is an operator step.

## 4. Approved synthetic-school limits (not active remotely)

| Limit | Value | Field |
|---|---|---|
| Monthly | $15 | `monthlyCapUsd` |
| Daily | $6 | `dailyCapUsd` |
| Per user per day | $6 | `perUserDailyCapUsd` |
| Grading allowance | $3 | `gradingAllowanceUsd` |
| Enforcement | on | `enforcementEnabled: true` |
| Per-call ceilings | required for unknown-priced tools in use | `maxReservationUsdPerCall` |

The operator sets these through `PUT /api/ai-controls/budgets/:institutionId` (ENARA Admin, audited). See the runbook §5. **Not done in this task.**

## 5. Tests

**Run in this task (provider-free):**
- p22 action 4 and workstream D (5 tests);
- `p20Accounting`, `p6StagingGuard`, `p14_2StagingEntry`, `p14_3StagingStartup`, `usageLedger`, `priceCatalog`, `p0aReviewFixes`, `p0cReviewFixes`.

**NOT RUN (they mock the provider SDK):**
- `p0bGateway`, `p0cMetering`, `p0dBudget`, `p0dHardening`;
- `p14_2GradingTestSpend`, `p14_3TestSpendEnforcement`, `p14_8BlockerFixes`;
- `benchmarkBudget`, `p12HardCap` (fake upstream).

**Not covered:**
- multi-process concurrency against a real cluster (a single in-memory Mongo was used);
- retry storms against a live provider.

## 6. Spend to date

Cumulative staging spend is reported only in earlier dated reports (about $10 by P20, plus P21 about $0.22, plus later session activity). The live counter value is **UNKNOWN**; the operator reads it from `budget_counters` (`test_spend:*`).

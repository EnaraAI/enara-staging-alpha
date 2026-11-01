# Owner decisions — 2026-11-01 (follow-up to the pre-pilot hardening)

| ID | Question | Decision | Applied in code |
|---|---|---|---|
| OD-1 | Cost ceilings for speaking-exam STT and live-avatar calls | **Uncapped** (no per-service ceiling) | `speakingExam.voiceConfigured` no longer requires ceilings. `avatar.controller.requireAnam` no longer refuses. The optional `SPEAKING_EXAM_*` / `ANAM_*` settings still apply if set. The cost stays `unpriced` (never $0). The environment-wide $50 test-spend cap still applies. **Staging note:** under the test-spend cap an attempt needs a positive reservation, so the school's `maxReservationUsdPerCall` for `anam:avatar_session` / `elevenlabs:speaking_exam_stt` must be set, or those calls are refused by the cap guard. This is unchanged behaviour. |
| OD-3 | Lesson videos (unscanned uploads) | **Confirmed:** playable as media | No change |
| J-17 | Tutor blocked only once the attempt starts | **Confirmed** | No change |
| OD-2 | Canonical staging domain | **test.enara.app** | Docs. Operator: `APP_URL`/`FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` must use `https://test.enara.app` |
| OD-5 | Retention | **One month** for conversations, usage ledger, audit events and alerts | `EDUCATOR_CHAT_RETENTION_DAYS = 30` (new conversations). TTL indexes `retention_30d` (30 days) on `usage_ledger.createdAt`, `audit_events.at` and `alert_events.at`. Platform logs (Vercel) are an operator setting. Budget counters (cap enforcement) are not affected. |
| OD-6 | Model for AI drafting | **Sonnet 5.5** | New `ANTHROPIC_DRAFT_MODEL` (default `claude-sonnet-5-5`) for `ai_assessment_draft` and `ai_question_regenerate`. Grading, tutor and lesson plans keep `ANTHROPIC_TUTOR_MODEL`. |
| OD-7 | Pilot school | **4Level1** (owner reply "4leve1"). Named owners for spend, support and alerts: **not yet given**. The audit found 4Level1's classes and learners absent or unknown; they must be created (runbook §4) before the pilot. | — |
| OD-4 | Daily scheduler | **None** (owner decision) | No cron. Grading retries, document-scan retries, retention sweeps, avatar metering sweeps and stale-reservation sweeps therefore run only when triggered in-request (`kickGrading` on page views) or by an operator calling `/api/cron/daily`. MongoDB TTL indexes still apply retention for conversations, ledger, audit and alerts. |
| OD-8 | Key rotation | **No answer yet** | — |

Tests: `p22TeacherTestingFixes` "owner decisions of 2026-11-01 (follow-up)" (3 tests).
Full provider-free suite after these changes: 42 files pass (`p1Seed` re-run once after an in-memory Mongo port collision at start-up, 5/5).

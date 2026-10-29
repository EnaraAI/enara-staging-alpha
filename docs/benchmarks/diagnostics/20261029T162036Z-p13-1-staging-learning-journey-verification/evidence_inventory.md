# P13.1 evidence inventory

No secret values appear here. Environment variables are listed by **name only**.

## Repository (VERIFIED, 2026-10-29T16:20Z)

| Item | Value |
|---|---|
| Remote | `github.com/EnaraAI/enara-staging-alpha` |
| Branch | `staging-alpha` |
| HEAD | `cc8530f171303a035a9a380b076d349f786d2297`, the same as `origin/staging-alpha` |
| Tracked changes | none |
| Untracked before P13.1 (untouched) | `backend/src/scripts/p12HardCap.ts`, `backend/src/scripts/p12LiveJourney.ts`, `backend/test/p12HardCap.test.ts`, `docs/benchmarks/diagnostics/20261029T141743Z-p12-live-e2e/`, `docs/benchmarks/diagnostics/20261029T153006Z-p13-learning-journey-release-readiness/` |
| P13.1 output folder | did not exist before this phase |

## Deployment (VERIFIED, read-only platform metadata, 16:21Z)

| Item | Value |
|---|---|
| Alias | `enara-staging-alpha.vercel.app` → `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4` (`…-5slxrtmq9`), target production, Ready, created 2026-10-29T13:48:23Z |
| Source commit of that deployment | **INFERRED** `cc8530f`. It is a CLI deploy, so Vercel stores no commit metadata. The P13 evidence ties it to an upload folder byte-identical to `git archive cc8530f`. |
| Production env names (20) | `AI_PAUSED`, `APP_URL`, `CORS_ALLOWED_ORIGINS`, `CRON_SECRET`, `DEMO_MODE_ENABLED`, `ENARA_STAGING`, `FRONTEND_URL`, `INGEST_HMAC_SECRET`, `JWT_SECRET`, `MONGODB_URI`, `NODE_ENV`, `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_SECRET_ACCESS_KEY`, `REGISTRATION_INVITE_ONLY`, `REMINDERS_ENABLED`, `RUN_MIGRATIONS_ON_START`, `SERVE_LOCAL_UPLOADS`, `TRUST_PROXY` |
| Preview and development env names | 0 and 0 |
| Absent names (relevant) | `ANTHROPIC_API_KEY`; `ANTHROPIC_TUTOR_MODEL`, `ANTHROPIC_INTENT_MODEL`, `ANTHROPIC_VISUAL_MODEL`, `ANTHROPIC_VOICE_MODEL`, `ANTHROPIC_BASE_URL`; `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL`; `DATABASE_URL`; `ELEVENLABS_API_KEY`, `ANAM_API_KEY` |
| Note | P13 reported 16 names using a narrower text filter. The full count is 20. No conclusion changes: the key and model names are absent in both. |
| `vercel.json` cron schedules | none (from P13; `vercel.json` unchanged at HEAD) |

## Public checks (VERIFIED, unauthenticated, 16:21Z)

| Request | Result |
|---|---|
| `GET /` | 200, HTML, title "Enara \| The Intelligence Layer for Education" |
| `GET /health` | 200, `{status: "ok", service: …}` |
| `GET /ready` | 200, `{status: "ready", checks: {mongo: "ok", postgres: "ok"}}` |

**Reading `/ready` correctly** (`backend/src/app.ts:176-195`):
- `postgres: "ok"` is reported **without any connection** when `DATABASE_URL` is unset and `NODE_ENV` is not `production`. No `DATABASE_URL` name exists in the deployment, so this field does not show that Postgres is up. The P13 summary listed "PostgreSQL healthy" without that qualifier.
- `mongo: "ok"` shows a live connection to the database named by `MONGODB_URI`. It does not show that this is a dedicated staging database.

## Source (read only; nothing executed that could call a provider)

| Path | What it shows |
|---|---|
| `backend/src/scripts/p12LiveJourney.ts` (sha256 `6debf8d81ccb1907…`, untracked) | The P12 entry point. Its header documents `npx tsx src/scripts/p12LiveJourney.ts --live --authorize-paid --out <dir>` (live) and `… --out <dir>` (dry, local stub). It builds the app in-process (`createApp()` + supertest), starts `MongoMemoryServer`, and aborts unless the DB URI is `mongodb://127.0.0.1:<port>/`. **No `vercel.app` reference.** The version that ran live was edited afterwards (one fixture line); the run-time hash was never recorded. |
| `backend/src/scripts/p12HardCap.ts` (sha256 `801dd560891779068…`, untracked) | Wraps `fetch` below every SDK client. In live mode only `api.anthropic.com` is allowed. Reserves the worst case before each attempt. |
| `backend/src/services/aiJson.ts:28-30, 53`; `backend/src/services/directTutorModel.ts:121-123, 240` | Drafts, grading and tutor require `ANTHROPIC_API_KEY`; the model defaults to `anthropicTutorModel` (`claude-opus-5-5`). |
| `backend/src/config/env.ts:226-240, 357-362` | Production mode requires `DATABASE_URL`, `ENARA_API_KEY`, `ENARA_ORCHESTRATOR_URL` and `AI_ENGINE_URL`; none of these names exist, which suggests `NODE_ENV` is not `production` (**INFERRED**; value not read). Model defaults are defined here. |
| `backend/src/controllers/tutor.controller.ts:183-300` | The only non-Anthropic tutor path is the ENARA orchestrator, used only for courses with an `enaraCourseId`. Its URL name is absent on Vercel. |
| `backend/src/config/stagingGuard.ts:47-109` | When `ENARA_STAGING=true`, the app refuses to start unless `MONGODB_URI` *names* the staging database and the R2 bucket names contain "staging". This is a name check, not a host or server check. Whether it is active depends on a value not read. |

## P12 artifacts (VERIFIED, read only, unchanged)

Folder: `docs/benchmarks/diagnostics/20261029T141743Z-p12-live-e2e/`

| File | sha256 (prefix) | Used for |
|---|---|---|
| `P12_HARD_CAP_SPEND_LEDGER.json` | `54b5d54e9418dca7` | 9 attempts; models; request-id presence; run window 14:08:45.378Z–14:11:21.347Z |
| `P12_CALL_LEDGER.csv` | `15d8d96a3f6b62e4` | Per-call costs (cap ledger and usage ledger) |
| `P12_APP_EVENT_LOG.jsonl` | `bc6ee354d810ee32` | 9 `ai_call` lines with feature, model and cost; `grading_failed` (`feedback_leak`) |
| `P12_RUN_RESULT.json` | `5117e20092eccec1` | `mode: live`; isolation block; step kinds and statuses |
| `dry-run/*` | — | The only stub-provider evidence (`providerHost 127.0.0.1:<port>`) |

These hashes equal those recorded in P13, so the artifacts are unchanged since then. No P12 artifact contains a Vercel deployment id or a `vercel.app` URL.

## Prior reports used as context only (not re-verified here)

- `docs/benchmarks/diagnostics/20261029T153006Z-p13-learning-journey-release-readiness/` (P13).
- The P13 combined excerpt supplied with this task.

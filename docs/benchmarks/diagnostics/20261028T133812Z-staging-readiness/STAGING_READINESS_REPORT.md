# ENARA — Same-Server Staging Readiness (Read-Only Discovery)

Branch `feature/conversation-exam`, working tree uncommitted (about 198 entries). This discovery used repository files only. No database, service or provider was contacted; no secret, URI or hostname with credentials is reproduced here. No code changed, so no provenance snapshot was generated.

## Decision

**NO-GO for staging setup and live smoke tests, until the blockers in §9 are resolved.**

The code is ready for a separate staging instance: database, storage, cron and spend controls can all be isolated through configuration. But the target server's layout, the staging database, the bucket and the spend cap don't exist yet, or can't be verified from the repository.

## 1. Current deployment layout (from config)

| Item | Found in repo | Notes |
|---|---|---|
| Backend build/start | `npm run build` → `npm start` (`node dist/index.js`), port 3001; `backend/Dockerfile` (node 20, `NODE_ENV=production`, runs as `node` user) | Same command in Railway (`railway.toml`) and Nixpacks |
| Backend hosting configs | `render.yaml` (Docker, `NODE_ENV=production`, origins for the production domain), `vercel.json` (serverless + daily cron), `wrangler.jsonc` (Cloudflare container), `railway.toml` | **Several hosting targets.** None of them describes "the same physical server" |
| Frontend | `frontend/Dockerfile` → `node dist/server.cjs` on port 3000; proxies `/api/railway/*` and `/uploads/*` to `BACKEND_URL` | `frontend/vercel.json` rewrites to a fixed Vercel backend hostname |
| CI/CD | `.github/workflows/deploy-vercel.yml` deploys on push to `main` / `connect-backend`; `backend/.github/workflows/keep-alive.yml` pings a Render URL every 14 min | Pushing to those branches deploys. A staging setup must not use them |
| Process manager / reverse proxy / systemd / pm2 / nginx | **None in the repo** | **The same-server layout is unverified** |

The physical server, its existing processes, ports, reverse proxy and current databases are not described anywhere in the repository. They must be confirmed by the server owner.

## 2. Database selection

- The backend connects only to `MONGODB_URI` (`src/config/db.ts`). The database is the one named in the URI path; there is no separate DB-name variable, and no `dbName` override.
- The current `backend/.env` URI is set, includes credentials, names a database in its path, and points at a remote, non-local host. **Whether it is production, shared or staging is unverified.** It must not be used for staging.
- `DATABASE_URL` (Postgres, `src/config/postgres.ts`) is required when `NODE_ENV=production`. It is absent from `backend/.env`.
- **Same server, second database:** possible. MongoDB keeps databases separate by name, so the same server or cluster can host another one. Proposed name: **`enara_staging_alpha`**. Use a dedicated database user whose role covers only that database (`readWrite@enara_staging_alpha`), so staging can't reach the production database even if it's misconfigured. Nothing has been created.
- **Missing guard (recommended code change, not made):** nothing checks at startup that a staging process is on a staging database. Proposed guard: `STAGING_EXPECTED_DB=enara_staging_alpha` makes startup fail if the connected database name is different.

## 3. Storage and signed URLs

- Uploads go to **R2** when `R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY` are set, otherwise to the local `UPLOAD_DIR`. All four R2 values are set in `backend/.env`.
- The object key prefix is **hard-coded** (`uploads/<name>`); no prefix setting exists. Staging under a prefix in the same bucket is therefore **not possible**.
- **Required:** a separate bucket (proposed **`enara-staging-alpha-uploads`**) with its own R2 credentials limited to that bucket. Alternatively, a local `UPLOAD_DIR` such as `/srv/enara-staging/uploads`, owned by the staging user, with R2 left unset.
- Signed upload URLs are HMAC-signed with `JWT_SECRET`. A **different `JWT_SECRET`** in staging makes production tokens and signed URLs invalid there, and the other way round.
- Also set separately: `INGEST_HMAC_SECRET`, `CRON_SECRET`.
- `AWS_S3_BUCKET` and the AWS keys are set in `backend/.env` (used by the S3 service and ingestion). Staging must not reuse them; leave them unset or use a staging bucket.

## 4. Runtime configuration (presence only)

Sources checked: `backend/.env` (active local file, not changed) and `backend/.env.example`.

| Variable | backend/.env | Purpose / staging requirement |
|---|---|---|
| `NODE_ENV` | absent | `production` for staging (strict secrets), which also requires `DATABASE_URL` and the orchestrator variables |
| `MONGODB_URI` | **set** (remote, unverified) | Staging: new URI for `enara_staging_alpha` with its own user |
| `DATABASE_URL` | absent | Required in production mode; staging Postgres **missing** |
| `JWT_SECRET`, `INGEST_HMAC_SECRET` | set | Staging needs **new** values |
| `CRON_SECRET` | absent | Without it the cron endpoint refuses every call. Staging needs its own value |
| `CORS_ALLOWED_ORIGINS` | set | Staging: only the staging subdomain |
| `FRONTEND_URL`, `APP_URL` | absent | Staging subdomain (used in emails and links) |
| `ANTHROPIC_API_KEY` | **set** | Required for live tests A/B. A staging-only key or workspace is recommended |
| `ANTHROPIC_TUTOR_MODEL` | absent (default `claude-opus-5-5`) | Optional |
| `ELEVENLABS_API_KEY` | **absent** | Needed for Voice Only; **missing** |
| `ELEVENLABS_EXAM_STT_MODEL` | absent (default `scribe_v2`) | Confirm entitlement |
| `ANAM_API_KEY` | set | **Leave unset in staging.** Avatar exams are not implemented |
| `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL` | set | External services. Staging needs staging endpoints, or isolated values if production mode requires them; **unverified** |
| `R2_*` (4) | set | Staging: separate bucket and credentials |
| `AWS_S3_BUCKET`, `AWS_*` keys | set | Staging: separate or unset |
| `UPLOAD_DIR` | absent (example sets it) | Staging path if R2 is not used |
| `RESEND_API_KEY`, `REMINDERS_ENABLED`, `REMINDER_FROM`, `REMINDER_TEST_RECIPIENT` | absent | Staging: `REMINDERS_ENABLED=false`, or set `REMINDER_TEST_RECIPIENT` so every email goes to one test inbox |
| `AI_PAUSED` | absent (default false) | Global kill switch; start staging with `true` until tests begin |
| `RUN_MIGRATIONS_ON_START` | absent (default: run on start) | Staging: `false`, then run migrations deliberately |
| `DEMO_MODE_ENABLED` | absent | `false` |
| `REGISTRATION_INVITE_ONLY` | absent | `true` for staging |
| `ALPHA_LIVE_TEST_MAX_SPEND_USD` | absent | **Not read anywhere in the code.** It would not cap anything (§7) |

## 5. Feature flags (P0–P6)

All flags are per institution (`Institution.features`), off by default (P6 tests confirm this), and changed only by ENARA admins (`PUT /api/learning/flags`).

Minimum flags for the synthetic test school only:
- **Test A (text):** `educator_chat_enabled` and `documents_workspace_enabled`, or `teaching_workflow_enabled` and `ai_lesson_planning_enabled`.
- **Test B (assessment):** `teaching_workflow_enabled`, `ai_assessment_authoring_enabled`, plus `connected_workflow_enabled` for source-linked drafts.
- **Voice Only:** `teaching_workflow_enabled`, `ai_grading_enabled`, `speaking_exams_enabled`.
- **Never:** `speaking_exam_avatar_enabled`.

Revert by setting each flag back to `false` for that school.

## 6. Cron, callbacks, email and background jobs

- **Cron:** a single `GET /api/cron/daily`. It is triggered by Vercel Cron in `vercel.json`; on another host, by an external scheduler with `Bearer CRON_SECRET`. It runs global sweeps (reminders, evidence, time-to-understand, grading retries, avatar usage, budget reservations, document scans and retention, speaking-transcript retention) on **whatever database the process is connected to**.
  - Isolation therefore comes from (a) the separate staging database and (b) a separate `CRON_SECRET`.
  - Staging must not be scheduled by the production scheduler or reuse its secret. Running no cron at all in staging is acceptable.
- **In-process background work:** grading kicks and curriculum processing run inside each process, against its own database. Isolation comes from the separate database and process.
- **Callbacks:** `POST /api/ingestion/callback` (signed with `INGEST_HMAC_SECRET`). The external engine sends callbacks to the URL configured **on the engine's side**; it isn't controlled from this repository and is **unverified**. Staging needs a separate HMAC secret, and must not register the production engine or orchestrator.
- **Email:** Resend. Disabled unless the key, sender and `REMINDERS_ENABLED=true` are all set. Staging: keep it disabled, or force every message to one test recipient with `REMINDER_TEST_RECIPIENT`.
- **CI:** never push to `main` or `connect-backend` for staging (that auto-deploys to Vercel). The keep-alive workflow targets Render production and does not affect a staging instance.

## 7. Spend ceiling

- `ALPHA_LIVE_TEST_MAX_SPEND_USD` **is not implemented**. Setting it would cap nothing.
- **Supported mechanism:** a P0d budget for the synthetic test school, set by an ENARA admin through `PUT /api/ai-controls/budgets/<test-school-id>` with:
  - `enforcementEnabled: true`;
  - `dailyCapUsd`, `monthlyCapUsd`, `perUserDailyCapUsd` — **amounts need owner approval**;
  - `gradingAllowanceUsd` — amount needs owner approval;
  - `intendedTools` — for example `anthropic:educator_chat`, `anthropic:ai_assessment_draft`, plus `elevenlabs:speaking_exam_stt` and `elevenlabs:speaking_exam_tts` for voice;
  - `maxReservationUsdPerCall` for every unpriced tool listed (the ElevenLabs STT/TTS tools) — **amounts need owner approval**.
- Also keep the global `AI_PAUSED` kill switch, and the per-school pause (`PUT /api/ai-controls/budgets/<id>/pause`).
- The Anthropic models are priced in the catalogue (`priceCatalog`), so their spend is metered. **ElevenLabs STT/TTS are unpriced**, so their spend is recorded as unknown and is not bounded by price.

## 8. Live smoke-test prerequisites

| Test | Prerequisites | Status |
|---|---|---|
| A: text generation (chat or lesson plan) | Isolated staging DB and process; staging Anthropic key; approved P0d budget; synthetic school with minimum flags; synthetic text document (extracted locally, labelled not malware-scanned) | Key present; everything else **missing** |
| B: assessment draft | Same as A, plus `ai_assessment_authoring_enabled` and `connected_workflow_enabled` | **Missing** (as A) |
| Voice Only | Same as A, plus ElevenLabs key and entitlement (batch STT `scribe_v2`, TTS); approved reservation ceilings for the unpriced STT/TTS tools; approved consent wording; HTTPS staging origin (browsers require a secure origin for the microphone); Chrome/Safari/Firefox codec check | **Missing** |
| Voice + Avatar | Not implemented | **Out of scope** |

## 9. Checklist

**Verified from config**
- [x] The backend connects to a single URI; the database comes from the URI path.
- [x] Upload storage is R2 or local; the key prefix is fixed (`uploads/`).
- [x] Upload URL signing depends on `JWT_SECRET`.
- [x] Cron is one endpoint behind a bearer token, and acts on the connected database only.
- [x] Email is off unless explicitly enabled, and can be redirected to one test recipient.
- [x] Migrations run on start unless `RUN_MIGRATIONS_ON_START=false`; there is a lock document, and a failed migration is logged and startup continues.
- [x] Feature flags are per institution, off by default, and ENARA-admin controlled.
- [x] A P0d per-school budget and pause, plus the global `AI_PAUSED`, exist.
- [x] `ALPHA_LIVE_TEST_MAX_SPEND_USD` is not implemented.

**Missing**
- [ ] Staging database `enara_staging_alpha` and its dedicated user.
- [ ] Staging Postgres `DATABASE_URL` (needed in production mode).
- [ ] Staging bucket (or local upload dir) and its credentials.
- [ ] Staging secrets: `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET`.
- [ ] Staging subdomain or port, TLS, origins.
- [ ] ElevenLabs credentials.
- [ ] Owner-approved spend amounts (P0d caps and reservation ceilings).
- [ ] A guard that the staging process is on the staging database (code change not yet approved).

**Unverified**
- [ ] The physical server's layout: process manager, reverse proxy, ports, other running services.
- [ ] Whether the current `MONGODB_URI` is production or shared (treat it as production).
- [ ] Whether the MongoDB server allows a second database and user (needs the DB owner).
- [ ] The external engine's and orchestrator's callback targets and staging endpoints.
- [ ] Provider account entitlements and per-provider spend limits.

## 10. Operator steps for later (not executed)

1. **Server owner:** create a separate OS user and directory, e.g. `/srv/enara-staging`; give it a distinct process name (e.g. `enara-staging-backend`, `enara-staging-frontend`) and distinct ports (e.g. backend 4001, frontend 4000) behind a staging subdomain with TLS; set memory/CPU limits via the existing process manager or container limits.
2. **Database owner:** create database `enara_staging_alpha` and a user limited to `readWrite@enara_staging_alpha`; put that URI in the staging env file only.
3. **Storage:** create bucket `enara-staging-alpha-uploads` with credentials limited to it, or use a staging-only `UPLOAD_DIR`.
4. Create the staging env file from `backend/.env.staging.example`, owned by the staging user with `chmod 600`. Set new secrets, `RUN_MIGRATIONS_ON_START=false`, `AI_PAUSED=true`, `REMINDERS_ENABLED=false`, `REGISTRATION_INVITE_ONLY=true`.
5. Build the backend: `npm ci && npm run build`. Run migrations once on purpose against the staging URI: `npm run migrate`, with the staging env loaded. Confirm the database name before running, and check the `migrations` collection afterwards.
6. Start the staging processes. Seed **only** a synthetic school (`seed4Level1.ts --institution <synthetic-id>`, demo-labelled, never against a non-staging database).
7. As an ENARA admin, set the minimum flags (§5) and the approved P0d budget (§7) for the synthetic school, then set `AI_PAUSED=false`.
8. Run one call per capability. Reconcile each against `usage_ledger` and `/api/usage/report`. Then pause AI again and revert the flags.

## 11. Approvals needed
1. Server owner: confirm the host layout, and approve a separate user, ports or subdomain, and resource limits.
2. Database owner: approve database `enara_staging_alpha` and its dedicated user, plus a staging Postgres.
3. Approve a staging bucket or local upload directory.
4. Owner-approved spend amounts: P0d daily, monthly and per-user caps, the grading allowance, and reservation ceilings for ElevenLabs STT/TTS.
5. A staging Anthropic key (recommended) and ElevenLabs credentials and entitlement.
6. Optionally, approve the small code change for a staging database-name guard.
7. Approve the consent wording for the Voice Only test.

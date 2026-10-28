# ENARA Integrated Alpha — Railway Staging Preflight and Runbook

This is a read-only preflight. Nothing was provisioned, connected or deployed, and no values appear below: `<…>` marks placeholders. It supersedes the Vercel staging proposal in `../ENARA_DEPLOYMENT_INVENTORY_REPORT.md` §4. Use it together with `../20261028T134450Z-staging-preflight/STAGING_SETUP_RUNBOOK.md`.

**Decision: NO-GO for deployment** until the isolation in §7 is verified and the source code to deploy is explicitly approved.

## 1. Proposed topology

A new Railway project **`enara-staging-alpha`**. It is not an environment inside any existing project, and it inherits no variables.

| Component | Proposal | Repository evidence |
|---|---|---|
| Backend service (`enara-staging-backend`) | Root directory **`backend`**. Build and start from `backend/railway.toml` | `railway.toml`: builder `NIXPACKS`, `buildCommand = "npm run build"`, `startCommand = "npm start"`, `healthcheckPath = "/ready"`, timeout 300, restart `ON_FAILURE`. `nixpacks.toml`: `npm install` → `npm run build` → `npm start`. `npm start` is `node dist/index.js` |
| Database | `enara_staging_alpha`, either on an owner-approved existing cluster or in a separate Railway MongoDB service. **Owner decides** the cost and location | `src/config/db.ts`: the database comes only from the `MONGODB_URI` path; the guard requires the exact name |
| File storage | New R2 bucket `enara-staging-alpha-uploads`, with a token scoped to it | `src/services/uploadStorage.ts`: R2 when all four `R2_*` are set, else the local `UPLOAD_DIR`. The `uploads/` key prefix is fixed. Railway's filesystem is ephemeral: local uploads would be lost on redeploy unless a Railway volume is mounted at a staging path. **R2 is recommended** |
| Frontend (optional, later) | Second service, root `frontend`, `frontend/Dockerfile` (`node dist/server.cjs`, port 3000). `BACKEND_URL` = the staging backend's URL | `frontend/server.ts` proxies `/api/railway/*` and `/uploads/*` to `BACKEND_URL`. Unlike the Vercel rewrites, nothing is hard-coded, so this fits Railway cleanly |
| Cron | **None at first** (see §4) | — |

## 2. Verified vs unknown

**Verified from the repository**
- Build and start commands, and the `/ready` health check, all from `railway.toml`. With Option A (`NODE_ENV=development`) and no `DATABASE_URL`, `/ready` returns 200 once MongoDB is connected; the Postgres check counts as ok outside production (`src/app.ts`).
- `PORT` is read from the environment (default 3001), so Railway's injected `PORT` is used.
- `.env` files are git-ignored (`backend/.gitignore`), so a Railway build from git contains none. That satisfies the guard's no-`.env` rule.
- The staging guard is verified by `test/p6StagingGuard.test.ts` (run in this preflight; §8). With `ENARA_STAGING=true`:
  - the database must be exactly `enara_staging_alpha`, and is re-checked after connecting;
  - a loaded `.env` is refused;
  - storage must be a staging bucket or path, and partial R2 settings are refused;
  - the three secrets must be distinct and at least 32 characters;
  - `RUN_MIGRATIONS_ON_START` must be `false`; invite-only registration, no demo mode, and email only to a test inbox;
  - AI and invite-only registration default on;
  - startup fails before listening.
- `tsx` is a devDependency. Nixpacks runs `npm install`, which includes dev dependencies when the build's `NODE_ENV` isn't `production`, so `npm run migrate` and the seed script can run in the service shell.

**Unknown (check in Railway)**
- The account plan, pricing and resource limits.
- Whether the Railway project root picks up `backend/railway.toml` once the root directory is set to `backend`. Expected yes; confirm in the service settings.
- The Nixpacks builder's availability and status on the account (Railway also offers newer builders). The current file pins `NIXPACKS`.
- Existing Railway projects (including the legacy `backend-engine-copy-production`) and their owners. Don't touch them.

## 3. Variable names (no values)

Set on the staging backend service only, typed by hand or from a secret manager. Never use "copy from environment".

| Variable | Requirement |
|---|---|
| `ENARA_STAGING` | `true` |
| `NODE_ENV` | `development` (Option A) |
| `MONGODB_URI` | the `enara_staging_alpha` URI with its dedicated user |
| `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET` | new, distinct, 32+ characters |
| `CORS_ALLOWED_ORIGINS` | **must be set** to the staging frontend origin. Otherwise development mode falls back to `https://enara.app` and localhost origins (`src/config/env.ts`). The guard does not check this yet; see §9 |
| `TRUST_PROXY` | `true` (Railway's proxy) |
| `RUN_MIGRATIONS_ON_START` | `false` |
| `AI_PAUSED` | `true` at first start |
| `REGISTRATION_INVITE_ONLY` | `true` |
| `DEMO_MODE_ENABLED` | `false` |
| `REMINDERS_ENABLED` | `false` (or `true` only with `REMINDER_TEST_RECIPIENT`) |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the staging bucket and its scoped token |
| `SERVE_LOCAL_UPLOADS` | `false` |
| `ANTHROPIC_API_KEY` | a dedicated staging key (owner) |
| `APP_URL`, `FRONTEND_URL` | the staging frontend URL |
| **Leave unset** | `DATABASE_URL`, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ANAM_API_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY` |
| Staging frontend (optional) | `BACKEND_URL` = the staging backend URL; `PORT` from Railway |

## 4. Cron

`railway.toml` defines **no** cron. The daily job in `backend/vercel.json` is Vercel-only and does nothing on Railway.

For the first smoke tests, run **no cron**. The tests don't depend on reminders, retention or grading retries.

If cron is approved later, add a separate Railway cron service in this project that only does:

```
curl -fsS -H "Authorization: Bearer <staging CRON_SECRET>" https://<staging-backend-domain>/api/cron/daily
```

on a daily schedule. It acts only on `enara_staging_alpha`. Never point it at another environment, and never add staging to an existing scheduler.

## 5. Migrations, seed, flags, budget (all manual and later)

1. After the first deploy with AI paused, check `/ready` returns 200 and the logs show no `Staging isolation check failed`.
2. Open the service shell (Railway dashboard or `railway ssh`, owner action) and run:
   - `npm run migrate -- --status`
   - `npm run migrate` (the guard pins the database first)
   - Then check the `migrations` collection.
3. Seed: `npx tsx src/scripts/seed4Level1.ts --institution <synthetic-id> --emit-setup-links`. Development mode is allowed by the script; only `demo_seed` rows, one school.
4. ENARA admin, minimum flags for that school only (`PUT /api/learning/flags`):
   - text test: `educator_chat_enabled` and `documents_workspace_enabled`, or `teaching_workflow_enabled` and `ai_lesson_planning_enabled`;
   - assessment test: `teaching_workflow_enabled`, `ai_assessment_authoring_enabled`, `connected_workflow_enabled`.
5. ENARA admin P0d budget (`PUT /api/ai-controls/budgets/<synthetic-id>`):

```json
{ "enforcementEnabled": true, "monthlyCapUsd": 15, "dailyCapUsd": 6, "perUserDailyCapUsd": 6, "gradingAllowanceUsd": 3,
  "intendedTools": ["anthropic:educator_chat", "anthropic:ai_lesson_plan", "anthropic:ai_assessment_draft"] }
```

   The USD 3 grading allowance is **not** an absolute cap: grading has an emergency overrun path. The smoke tests therefore don't submit student attempts and don't exercise grading.
6. Only with a separate go-ahead: set `AI_PAUSED=false` and redeploy. Run one text call and one assessment draft, and reconcile each with `usage_ledger`, `/api/usage/report` and the budget status (staging runbook §9). Then pause again.

## 6. Rollback

1. Set `AI_PAUSED=true`, or the school pause, and redeploy.
2. Scale the service to 0 or remove its public domain; keep the logs.
3. Keep `enara_staging_alpha` and the bucket for review.
4. Revoke the staging Anthropic key if needed.

No other project is involved.

## 7. Manual owner actions

| Where | Action |
|---|---|
| **Railway** | Check the plan, pricing and usage limits. Create project `enara-staging-alpha` (new, empty). Add the service with root directory `backend` from an **approved source** (see below). Set the variables by hand (§3). Optionally add a generated public domain. Optionally add the frontend service. Set a spend or usage alert if the plan offers one |
| **Database** | Choose the location: an existing cluster (dedicated database plus user `readWrite@enara_staging_alpha`) or a Railway MongoDB service. Approve its cost. Provide the URI only to the Railway variables |
| **R2 (Cloudflare)** | Create `enara-staging-alpha-uploads` and a token scoped to that bucket only |
| **Anthropic** | Issue a staging-only key; optionally set a provider-side spend limit on it |
| **Source control** | Approve what to deploy. The working tree has extensive uncommitted P0–P6 work on `feature/conversation-exam`. Options: (a) approve committing a reviewed set of files to a dedicated branch, e.g. `staging-alpha`, never `main` or `connect-backend` (those trigger the Vercel sandbox deploy), and link only that branch in Railway with auto-deploy off; or (b) an approved one-off `railway up` from a clean export of the approved files, with no `.env` |
| **ENARA admin** | After deployment checks: seed, flags and budget (§5); later, the go-ahead to unpause |

## 8. Checks run in this preflight
- `npx vitest run test/p6StagingGuard.test.ts`: 9/9 passed.
- `git diff --check`: clean.

No remote connections, migrations, deploys or flag changes.

## 9. Remaining blockers
1. The Railway plan and cost haven't been reviewed.
2. The database location and cost haven't been decided, and `enara_staging_alpha` and its user don't exist.
3. The R2 staging bucket and its scoped token don't exist.
4. No staging secrets or staging Anthropic key yet.
5. **Source approval:** which files or commit to deploy, and how (branch vs `railway up`).
6. Recommended small code follow-up, not made in this read-only task: have the staging guard require `CORS_ALLOWED_ORIGINS`, so development mode can't fall back to the `enara.app` and localhost origins.
7. The go-ahead for live calls is separate.

Final: **NO-GO for deployment.**

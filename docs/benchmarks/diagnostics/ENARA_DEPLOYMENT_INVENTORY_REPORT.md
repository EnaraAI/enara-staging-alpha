# ENARA Deployment Inventory (Read-Only Audit)

**Scope.** Repository files, local git refs and the configuration in this checkout only. No platform, database or network was contacted. No secret, token, URI or environment value is reproduced. Vercel project IDs appear only as short prefixes.

**Branch.** `feature/conversation-exam`, uncommitted. Remote: `origin` → `github.com/EnaraAI/enara-sandbox`.

## 1. Most important finding

This repository is a **sandbox copy**, not the production source. `README.md` says:
- `frontend/` was copied from `mohamedsaberelkholy/Enara-Platform` (main @ `8db2052`);
- `backend/` was copied from `EnaraAI/backend-engine` (main @ `6b389e0`).

The deploy names were renamed so a deploy from here "creates new services instead of overwriting the live ones":
- `frontend/wrangler.jsonc`: `winter-cell-33f4` → `enara-sandbox-frontend`;
- `backend/wrangler.jsonc`: `backend-engine` → `enara-sandbox-backend`;
- `backend/render.yaml`: `backend-engine` → `enara-sandbox-backend`.

So:
- The configs here describe **sandbox services, or production services renamed for the sandbox**.
- Production most likely deploys from the two **original repositories**, which this audit cannot see.

## 2. Per-platform tables

### 2.1 Vercel — the only platform this repository deploys to automatically

| # | Field | Backend API | Frontend |
|---|---|---|---|
| 1 | Component | Backend API (serverless) plus the daily cron | Frontend (Vite static app plus rewrites) |
| 2 | Evidence | `backend/vercel.json` (`api/index.js` function, rewrites everything to `/api`, region `arn1`, `maxDuration 60`, `memory 1024`); `backend/api/index.js` → `dist/vercel.js` (`src/vercel.ts`). `.github/workflows/deploy-vercel.yml` matrix `backend` (project `prj_a7Eh…`, team `team_8XNl…`). `docs/PLATFORM_GUIDE.md` §13: "Set in Vercel (project `enara-sandbox-backend`)" | `frontend/vercel.json` (framework vite; rewrites `/api/railway/:path*` and `/uploads/:path*` to the sandbox backend's Vercel host); workflow matrix `frontend` (project `prj_fNUM…`) |
| 3 | Build / start | `npm run build` (tsc); serverless, no start command | `vite build`, output `dist` |
| 4 | Env names | `MONGODB_URI`, `JWT_SECRET`/`JWT_*`, `ANTHROPIC_API_KEY`, `ANTHROPIC_*_MODEL`, `ELEVENLABS_*`, `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `ENARA_DEFAULT_COURSE_ID`, `RESEND_API_KEY`, `REMINDER_FROM`, `REMINDERS_ENABLED`, `REMINDER_TEST_RECIPIENT`, `CRON_SECRET`, `APP_URL`, `TRUST_PROXY`, `RUN_MIGRATIONS_ON_START` (from the PLATFORM_GUIDE §13 list). CI secret: `VERCEL_TOKEN` | Build-time `VITE_API_URL` (optional; defaults to `/api/railway`). The rewrites point at a fixed host, not an env var |
| 5 | Trigger | GitHub Actions on **push to `main` or `connect-backend`** (paths `backend/**`, `frontend/**`, the workflow, `.github/scripts/**`), plus manual dispatch. Runs `vercel deploy --prod` after typecheck, tests, frontend build and a bundle secret scan. Pull requests run checks only. Vercel Cron: `/api/cron/daily` at `0 15 * * *` | Same workflow and branches |
| 6 | URL recorded | `https://enara-sandbox-backend.vercel.app` (PLATFORM_GUIDE; frontend rewrites) | `https://enara-sandbox-frontend.vercel.app` (PLATFORM_GUIDE; default `APP_URL` in `backend/src/config/env.ts`) |
| 7 | Status | **Configured; likely active (UNKNOWN until checked).** The workflow and docs describe it as the live sandbox. Last local commit on `origin/connect-backend`: 2026-10-25 ("Deploy to Vercel without git metadata") | Same |

### 2.2 Render

| # | Field | Backend API |
|---|---|---|
| 1 | Component | Backend API (Docker web service) |
| 2 | Evidence | `backend/render.yaml`: service `enara-sandbox-backend` (renamed from `backend-engine`), `runtime: docker`, `dockerfilePath ./Dockerfile`, `plan: starter`, `healthCheckPath /health`. `backend/.github/workflows/keep-alive.yml` pings `https://backend-engine-vhcz.onrender.com/health` every 14 minutes; the README notes it does **not** run from this repo (only root `.github/` workflows run) |
| 3 | Build / start | `backend/Dockerfile`: `npm ci`, `npm run build`, `node dist/index.js`, port 3001, `NODE_ENV=production` |
| 4 | Env names | Literal non-secret values: `NODE_ENV`, `PORT`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`, `DEMO_MODE_ENABLED`, `DEMO_MODE_PRODUCTION_CONFIRM`, `AWS_REGION`. Set in the dashboard (`sync: false`): `MONGODB_URI`, `DATABASE_URL`, `JWT_SECRET`, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL`, `INGEST_HMAC_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` |
| 5 | Trigger | Not verifiable. No Render deploy hook or workflow in this repo; a Blueprint would deploy from whatever repo and branch it is linked to in Render |
| 6 | URL / domain recorded | `FRONTEND_URL=https://enara.app`; `CORS_ALLOWED_ORIGINS=https://enara.app,https://www.enara.app`. Keep-alive target: `backend-engine-vhcz.onrender.com` (the original `backend-engine` service name) |
| 7 | Status | **UNKNOWN.** The `enara.app` origins and the keep-alive target suggest the **original** `backend-engine` Render service, likely the production backend, deployed from `EnaraAI/backend-engine`. A sandbox `enara-sandbox-backend` Render service exists only if someone created it from this blueprint |

### 2.3 Railway

| # | Field | Backend API (current config) | Legacy backend engine (docs) |
|---|---|---|---|
| 1 | Component | Backend API | Backend engine that the original frontend called |
| 2 | Evidence | `backend/railway.toml`: Nixpacks; `backend/nixpacks.toml` | `frontend/DOCUMENTATION.md` §7 and `frontend/embedding.md` §7 name `https://backend-engine-copy-production.up.railway.app` as the "production microservices backend engine hosted on Railway". `frontend/services/railwayApi.ts` and the `/api/railway/*` path name are leftovers; the README says the frontend previously proxied to a "hard-coded production Railway host" |
| 3 | Build / start | `npm run build` → `npm start` (`node dist/index.js`); health check `/ready`, timeout 300, restart on failure | Unknown |
| 4 | Env names | None declared in `railway.toml` (set in the dashboard) | Unknown |
| 5 | Trigger | Not verifiable (Railway's GitHub link lives in the dashboard) | Unknown |
| 6 | URL recorded | None for this config | `backend-engine-copy-production.up.railway.app` |
| 7 | Status | **UNKNOWN** | **UNKNOWN.** Historically production. The sandbox no longer calls it |

### 2.4 Cloudflare (Workers + Containers)

| # | Field | Frontend container worker | Backend container worker |
|---|---|---|---|
| 1 | Component | Worker fronting the frontend container | Worker fronting the backend container |
| 2 | Evidence | `frontend/wrangler.jsonc`: name `enara-sandbox-frontend` (was `winter-cell-33f4`), main `worker/index.ts`, container `EnaraContainer` from `./Dockerfile`, `max_instances 3`; `frontend/worker/index.ts` | `backend/wrangler.jsonc`: name `enara-sandbox-backend` (was `backend-engine`), container `BackendEngineContainer`, `max_instances 3`; `backend/worker/index.ts` (port 3001) |
| 3 | Build / start | `wrangler deploy` (manual; no script or workflow here). Container: `npm run build` → `node dist/server.cjs`, port 3000 | `wrangler deploy` (manual). Container: Docker as Render |
| 4 | Env names | Worker env: `GEMINI_API_KEY`, `AVATAR_API_KEY`, `BACKEND_URL`; binding `ENARA_CONTAINER` | Binding `BACKEND_ENGINE_CONTAINER`; container env not declared |
| 5 | Trigger | None in the repo (manual `wrangler deploy` only) | None |
| 6 | URL recorded | None | None |
| 7 | Status | **UNKNOWN.** The original `winter-cell-33f4` may be the production frontend on `enara.app` | **UNKNOWN** |

### 2.5 Other

| Item | Evidence | Status |
|---|---|---|
| Cron | Vercel Cron in `backend/vercel.json` → `GET /api/cron/daily` with `Bearer CRON_SECRET` (`backend/src/routes/cron.routes.ts`) | Configured with the Vercel backend |
| Database | `docs/PLATFORM_GUIDE.md`: "MongoDB Atlas, Stockholm". The local `backend/.env` has a remote `MONGODB_URI`; which environment it belongs to is unknown | UNKNOWN |
| Storage | Cloudflare R2 (`R2_*`, PLATFORM_GUIDE) | Configured |
| Postgres | `DATABASE_URL`; PLATFORM_GUIDE: "the sandbox doesn't have" one | Not in the sandbox |
| Git branches (local refs, not fetched) | `origin/main` 2026-10-22, `origin/connect-backend` 2026-10-25, `origin/phase2-elie`, `origin/phase3-teaching`, `origin/claude/codebase-review-kbxqan` 2026-10-27 | Pushing to `main` or `connect-backend` deploys the Vercel sandbox |

## 3. What to check manually in each dashboard

| Platform | Check |
|---|---|
| **Vercel** (team `team_8XNl…`) | Do projects `enara-sandbox-backend` and `enara-sandbox-frontend` exist? What are their latest production deployments and branches? Any custom domains (is `enara.app` attached anywhere)? Is the cron active? Which database host do their env vars use (see names only, then compare with Atlas)? |
| **Render** | Do services `backend-engine` and/or `enara-sandbox-backend` exist? Which repo and branch is each linked to? Is auto-deploy on? Is the custom domain `enara.app` or an API subdomain attached? Is the service suspended or live? |
| **Railway** | Does a project with `backend-engine-copy-production` exist? Which repo and branch? Is it running and receiving traffic? |
| **Cloudflare** | Do workers `winter-cell-33f4`, `backend-engine`, `enara-sandbox-*` exist? Which routes and custom domains (`enara.app`?) do they serve? |
| **DNS (`enara.app`)** | Where do `enara.app` and `www.enara.app` point (Cloudflare, Render, Vercel)? That identifies production |
| **MongoDB Atlas** | Which databases and users exist? Which one does each service's `MONGODB_URI` use? Confirm `enara_staging_alpha` doesn't exist yet |
| **GitHub** | In `EnaraAI/backend-engine` and `mohamedsaberelkholy/Enara-Platform`: their deploy workflows and platform integrations (production pipelines) |

## 4. Safest staging topology (proposal; nothing provisioned)

**Recommended: two new Vercel projects**, separate from the existing sandbox projects. Vercel is the only platform this repository already deploys to, and its build path is tested by CI.

| Piece | Proposal |
|---|---|
| Staging backend | New Vercel project, e.g. `enara-staging-backend`, root `backend/`. **Not added** to `deploy-vercel.yml`. Deployed manually by an operator (`vercel deploy --prod` against that project only), or later by a separate, approved workflow on a dedicated branch (e.g. `staging-alpha`) |
| Staging frontend | New Vercel project, e.g. `enara-staging-frontend`, root `frontend/`. Its `vercel.json` rewrites are hard-coded to the sandbox backend host, so a staging frontend needs its own rewrite target (a small config change for that project, made only with approval). Otherwise its `/api/railway` calls would reach the sandbox backend |
| Database | `enara_staging_alpha` on the existing Atlas cluster, with a user that has `readWrite@enara_staging_alpha` only. The staging guard (`ENARA_STAGING=true`) refuses any other database name |
| Uploads | A new R2 bucket, e.g. `enara-staging-alpha-uploads`, with a token scoped to it. **Required on Vercel**: the filesystem is ephemeral, so a local `UPLOAD_DIR` is not an option there |
| Secrets | New `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET`, set only in the staging project. `.vercelignore` already excludes `.env` and `.env.*`, which also satisfies the guard's no-`.env` rule |
| Mode | Option A: `NODE_ENV=development`, `ENARA_STAGING=true`, `RUN_MIGRATIONS_ON_START=false`; AI paused by default |
| Cron | The staging project inherits `backend/vercel.json`'s cron. It calls **its own** `/api/cron/daily` with its own `CRON_SECRET`, and acts only on `enara_staging_alpha`. Leaving `CRON_SECRET` unset disables it (the endpoint refuses) |
| Budget | P0d for the one synthetic school: monthly USD 15, daily USD 6, per-user daily USD 6, grading allowance USD 3, enforcement on, `intendedTools` = the three Anthropic tools (runbook §8) |
| Existing deployment | Untouched: don't push to `main` or `connect-backend` for staging work, don't add the staging projects to the existing workflow, don't touch Render, Railway or Cloudflare |

**Alternative:** a Render web service from a **copy** of `render.yaml` with a new name. It is riskier: that blueprint carries production origins (`enara.app`) and `NODE_ENV=production`, so editing it in place could affect the live service.

**Same physical server:** none of the configured platforms is a server you manage. If staging must run on a specific machine you operate, that machine isn't described in this repository; the Option A runbook still applies, with a process manager instead of Vercel.

## 5. Risks and uncertainties
- Which platform serves `enara.app` (production) can't be determined from this repo.
- The Vercel workflow deploys the sandbox to **production** for its projects on every push to `main` or `connect-backend`. Merging any PR there deploys, so staging work must stay off those branches.
- `backend/.env.staging.example` is git-ignored (`.env.*` in `backend/.gitignore`) and excluded by `.vercelignore`. It is a local template only unless a `!.env.staging.example` exception is approved.
- The local `backend/.env` database host is unidentified; treat it as production.
- Vercel limits API uploads to about 4.5 MB per request (PLATFORM_GUIDE §14).

## 6. Approvals needed before provisioning
1. Confirm, from the dashboards (§3), which services are live and which one is production.
2. Approve the staging topology (two new Vercel projects, or a Render copy) and project names.
3. Approve the staging frontend's backend rewrite target.
4. Create `enara_staging_alpha` and its least-privilege user; create the staging R2 bucket and token.
5. Generate and set the staging secrets; provide a staging Anthropic key.
6. Apply the approved P0d budget to the synthetic school only, and give a separate go-ahead for live calls.

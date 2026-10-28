# ENARA Staging Alpha — Railway Two-Service Runbook

Local preparation only. Nothing was provisioned, connected, deployed, migrated or seeded. No values appear here; `<…>` marks placeholders. This runbook supersedes §1 (frontend row), §3 and §9.6 of `../20261028T140412Z-railway-staging-preflight/RAILWAY_STAGING_RUNBOOK.md`.

**Decision: NO-GO** until the STOP points below are approved by the owner.

## 1. Topology

New Railway project `enara-staging-alpha` (empty, not an environment of an existing project, with no shared variables).

| Service | Root directory | Config file path (service settings) | Builder | Start | Health |
|---|---|---|---|---|---|
| `enara-staging-backend` | `backend` | `/backend/railway.staging.toml` | Nixpacks, `npm run build` | `npm start` → `node dist/index.js` | `/ready` (300 s) |
| `enara-staging-frontend` | `frontend` | `/frontend/railway.staging.toml` | Dockerfile `Dockerfile.staging` | `node dist/server.cjs` | `/api/health` (120 s) |

The existing `backend/railway.toml` and `frontend/Dockerfile` are unchanged. Railway resolves the config file path from the repository root; confirm the path is accepted in each service's settings.

## 2. Frontend audit (result)

- The SPA is built with `VITE_API_URL=/api/railway` (set in `Dockerfile.staging`), so the browser calls only its own origin.
- `server.ts` proxies `/api/railway/*` and `/uploads/*` to `BACKEND_URL`. There are no hard-coded backend hosts. `frontend/vercel.json` rewrites are not used by Railway.
- With `ENARA_STAGING=true`, `frontend/stagingGuard.ts` refuses to start unless:
  - `BACKEND_URL` is https (or http to `*.railway.internal`);
  - it is not localhost and not one of the existing deployments (enara.app, the Vercel sandbox, the legacy Railway and Render backends);
  - `GEMINI_API_KEY` and `AVATAR_API_KEY` are unset;
  - `NODE_ENV=production`.
- In staging, the open `cors()` is off, and the legacy unmetered `/api/avatar/*` and `/api/gemini/*` routes return 404.
- Vite is imported lazily (development only), so the runtime image needs only production dependencies.
- `PORT` comes from Railway (default 3000).

## 3. Backend audit (result)

- `PORT` comes from the environment.
- `/ready` returns 200 once MongoDB is connected. Under Option A (`NODE_ENV=development`), Postgres isn't required.
- `RUN_MIGRATIONS_ON_START=false` is enforced by the guard. Migrations are a manual, later step.
- The staging guard (`ENARA_STAGING=true`) enforces:
  - the database name `enara_staging_alpha`, checked again after connecting;
  - no `.env` file;
  - a staging bucket or path for storage;
  - distinct secrets of at least 32 characters;
  - invite-only registration, no demo mode, and email only to a test inbox;
  - AI paused by default;
  - an explicit CORS list that includes `FRONTEND_URL`, with no wildcards, no empty entries and no existing-deployment domains.

## 4. Domains and variables (names only)

1. Generate a Railway public domain for each service. This gives `https://<fe>.up.railway.app` for the frontend and `https://<be>.up.railway.app` for the backend.
2. **Backend:**
   - `ENARA_STAGING=true`
   - `NODE_ENV=development`
   - `MONGODB_URI`
   - `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET`
   - `FRONTEND_URL=https://<fe>.up.railway.app`
   - `APP_URL`: the same value
   - `CORS_ALLOWED_ORIGINS=https://<fe>.up.railway.app`: exact origin, no trailing slash, no path
   - `TRUST_PROXY=true`
   - `RUN_MIGRATIONS_ON_START=false`
   - `AI_PAUSED=true`
   - `REGISTRATION_INVITE_ONLY=true`
   - `DEMO_MODE_ENABLED=false`
   - `REMINDERS_ENABLED=false`
   - the four `R2_*` variables
   - `SERVE_LOCAL_UPLOADS=false`
   - **Leave unset:** `DATABASE_URL`, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL`, `AWS_*`, `ANAM_API_KEY`, `ELEVENLABS_API_KEY`, `RESEND_API_KEY`.
   - `ANTHROPIC_API_KEY`: leave unset for the first deploy (AI paused).
3. **Frontend:**
   - `ENARA_STAGING=true`
   - `NODE_ENV=production`
   - `BACKEND_URL=https://<be>.up.railway.app`, or `http://enara-staging-backend.railway.internal:<backend PORT>`
   - **Leave unset:** `GEMINI_API_KEY`, `AVATAR_API_KEY`.
4. Type every value by hand. Never use "copy from service/environment", shared variables or the Railway CLI's `.env` import.

## 5. MongoDB and storage verification (owner, outside this repo)

- **MongoDB:**
  - Create user `<staging-user>` with role `readWrite` on `enara_staging_alpha` only. No `readAnyDatabase`, `dbAdmin` on other databases, or cluster roles.
  - Verify by connecting with that URI from a trusted shell:
    - `db.adminCommand({listDatabases:1})` must fail or list only `enara_staging_alpha`;
    - `db.getSiblingDB('<another db>').getCollectionNames()` must fail with unauthorized;
    - `db.runCommand({connectionStatus:1})` shows only that role.
  - If the network allow-list permits, restrict it to Railway egress.
- **R2:**
  - Create bucket `enara-staging-alpha-uploads`.
  - Create an API token with Object Read & Write scoped to **that bucket only**.
  - Verify: listing another bucket with that token is denied.
  - Never reuse existing R2 or AWS keys.

## 6. Deployment source

Don't assume any branch has the right build. The current HEAD `cef491a` on `feature/conversation-exam` does **not** contain the P0–P6 or staging work: it's uncommitted (211 status entries).

- **Include** (approved P0–P6, conversation exam, staging):
  - `backend/src/**`, `backend/test/**`, `backend/railway.staging.toml`, backend `package*.json` if modified;
  - `frontend/{App.tsx,pages,components,services,worker,tsconfig.json,server.ts,stagingGuard.ts,Dockerfile.staging,railway.staging.toml}`.
- **Exclude:**
  - `artifacts/`, `docs/plans/`, `docs/benchmarks/**` (except optionally the runbooks);
  - `scripts/benchmarks/**`, `tests/benchmarks/**`;
  - the stray `+~` and `backend/+~` files;
  - any `.env*`, `uploads/`, `data/`.
- `backend/.env.staging.example` is git-ignored. It is a template only and not needed in the build.

Proposed commands, **not run** (they need explicit approval):

```
git switch -c staging-alpha            # from current HEAD, keeps working tree
git add backend/src backend/test backend/railway.staging.toml backend/package.json backend/package-lock.json \
        frontend/App.tsx frontend/pages frontend/components frontend/services frontend/worker \
        frontend/tsconfig.json frontend/server.ts frontend/stagingGuard.ts \
        frontend/Dockerfile.staging frontend/railway.staging.toml
git diff --cached --stat               # review: no .env, artifacts, benchmarks
git commit -m "Staging alpha: P0–P6 + Railway staging config"
git push -u origin staging-alpha       # never main / connect-backend
```

In Railway, link both services to `staging-alpha` with **auto-deploy off**, and deploy a specific commit manually.

Alternative: run `railway up` from a clean export of the same file list, with no `.env`.

## 7. Workflows and existing services

- `.github/workflows/deploy-vercel.yml` deploys only on push to `main` or `connect-backend`. For pull requests it runs checks only. Pushing `staging-alpha` triggers nothing.
- `backend/.github/workflows/keep-alive.yml` is not at the repository root, so it doesn't run.
- There are no Railway, Render or Cloudflare workflows.
- None of the new files are referenced by the Vercel, Render or legacy Railway configs.

## 8. Budget and AI (unchanged)

Use the P0d budget for the synthetic school only:
- monthly USD 15;
- daily 6;
- per user per day 6;
- grading allowance 3.

The grading allowance has an emergency overrun path, so it isn't an absolute cap.

Keep `AI_PAUSED=true`. Make no provider calls and run no grading smoke tests until a separate go-ahead.

## 9. Step-by-step with STOP points

1. **STOP 1:** the owner approves the Railway plan and cost, the MongoDB location, and the R2 bucket.
2. The owner creates the database user and the R2 bucket and token, then runs the checks in §5.
   - **STOP 2:** evidence that the scope checks failed as expected.
3. **STOP 3:** the owner approves the source manifest (§6), then the branch is created and pushed.
4. Create the project and both services (§1), with auto-deploy off. Generate both domains.
5. Set the backend variables (§4). Deploy the backend.
   - Expect `/ready` to return 200.
   - The logs must not contain `Staging isolation check failed`.
   - A request with `Origin: https://enara.app` must get no `Access-Control-Allow-Origin` header.
6. Set the frontend variables. Deploy the frontend.
   - `/api/health` returns 200.
   - `/api/railway/health` reaches the staging backend.
   - `/api/gemini/generate` returns 404.
   - The browser network tab shows only the `<fe>` origin.
7. **STOP 4:** owner review of the deployment.
8. Migrations: `npm run migrate -- --status`, then `npm run migrate`, from the backend shell.
9. Seed the synthetic school, set the flags, and set the P0d budget (previous runbook §5).
10. **STOP 5:** approve seeding and flags before step 9.
11. **STOP 6:** a separate approval to add `ANTHROPIC_API_KEY` and unpause.

## 10. Rollback

1. Set `AI_PAUSED=true` and redeploy.
2. Remove the public domains, or scale both services to 0. Keep the logs.
3. Redeploy the previous Railway deployment from its history if a bad build went out.
4. Revoke the staging MongoDB user, the R2 token and any Anthropic key if exposure is suspected.
5. Keep `enara_staging_alpha` and the bucket for review.
6. Only on owner request, delete the `enara-staging-alpha` project. No other project is touched at any step.

## 11. Checks run (local)

| Check | Result |
|---|---|
| Backend vitest | 60 files, 728 tests passed (includes `p6FrontendStaging` 7/7 and `p6StagingGuard`) |
| Backend `tsc --noEmit` | clean |
| Frontend `tsc --noEmit` | clean |
| Frontend `npm run build` | ok; `dist/server.cjs` needs no Vite at runtime |
| `git diff --check` | clean |

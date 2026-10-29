# P13.2 evidence inventory

**Evidence type:**
- **DIRECT:** observed by me in this audit.
- **INFERENCE:** follows from direct evidence plus code logic.
- **REPORTED:** stated in a document or record; not runtime proof.

No secret values were read; none appear here.

## Repository (DIRECT, 16:28Z)

| Claim | Source / command | Type |
|---|---|---|
| Root is the local `enara-staging-alpha` checkout; branch `staging-alpha`; HEAD and `origin/staging-alpha` both `cc8530f171303a035a9a380b076d349f786d2297` | `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse HEAD origin/staging-alpha` | DIRECT |
| No tracked changes. Untracked (preserved): `backend/src/scripts/p12HardCap.ts`, `backend/src/scripts/p12LiveJourney.ts`, `backend/test/p12HardCap.test.ts`, P12, P13 and P13.1 diagnostics folders | `git status --short`, `git diff --stat` | DIRECT |
| Output folder did not exist before | `ls docs/benchmarks/diagnostics` | DIRECT |

## Vercel metadata (DIRECT, names and scopes only, 16:28Z)

| Claim | Command | Type |
|---|---|---|
| Linked project `enara-staging-alpha` (`projectId prj_gBBD…`, `orgId` present) | `.vercel/project.json` (non-secret ids) | DIRECT |
| One visible scope (`mohamedsaberelkholy-7299's projects`) holding one project (`enara-staging-alpha`, latest production URL `https://enara-staging-alpha.vercel.app`) | `vercel teams ls`, `vercel project ls` | DIRECT |
| Alias `enara-staging-alpha.vercel.app` and the team alias → `enara-staging-alpha-5slxrtmq9.vercel.app` | `vercel alias ls` | DIRECT |
| That URL = `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`, target production, Ready, created 2026-10-29T13:48:23Z | `vercel inspect enara-staging-alpha.vercel.app` | DIRECT |
| 20 variable names, every one scoped `Production`: `AI_PAUSED`, `APP_URL`, `CORS_ALLOWED_ORIGINS`, `CRON_SECRET`, `DEMO_MODE_ENABLED`, `ENARA_STAGING`, `FRONTEND_URL`, `INGEST_HMAC_SECRET`, `JWT_SECRET`, `MONGODB_URI`, `NODE_ENV`, `R2_ACCESS_KEY_ID`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_SECRET_ACCESS_KEY`, `REGISTRATION_INVITE_ONLY`, `REMINDERS_ENABLED`, `RUN_MIGRATIONS_ON_START`, `SERVE_LOCAL_UPLOADS`, `TRUST_PROXY`. No Preview or Development names. | `vercel env ls` (name and environment columns only) | DIRECT |
| Absent names: `ANTHROPIC_API_KEY`, model overrides, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY`, `AI_ENGINE_URL`, `DATABASE_URL`, `AWS_S3_BUCKET`, `REMINDER_TEST_RECIPIENT`, `DEMO_MODE_PRODUCTION_CONFIRM`, `ELEVENLABS_API_KEY`, `ANAM_API_KEY` | same | DIRECT |
| Git integration not used for deploys (CLI deploys; no commit metadata) | P13 evidence; `vercel.json` `git.deploymentEnabled` only gates Git-triggered builds | REPORTED (P13) |

## Source (DIRECT reads, HEAD `cc8530f`)

| Claim | Path | Type |
|---|---|---|
| Guard runs only if `ENARA_STAGING` ∈ {1, true, yes} | `backend/src/config/stagingGuard.ts:30-33`; `backend/src/config/env.ts` (`const staging = isStagingMode(source); if (staging) assertStagingIsolation(…)`) | DIRECT |
| Guard conditions listed in the report; host, cluster and production-secret comparisons absent | `backend/src/config/stagingGuard.ts:47-105` | DIRECT |
| The database name is parsed from the URI path only (`mongoDbName`) | `stagingGuard.ts:35-45` | DIRECT |
| The serverless entry builds the app at module load, before any database connection | `api/index.js` → `backend/dist/vercel.js` (source `backend/src/vercel.ts`: `const app = createApp()` at top level; `connectDB()` on first request) | DIRECT |
| `createApp()` calls `getConfig()` first, which loads the config and runs the guard | `backend/src/app.ts:91`; `backend/src/config/env.ts:408-413` | DIRECT |
| After connecting, staging mode re-checks the server-reported database name and disconnects on mismatch | `backend/src/config/db.ts:7-23` | DIRECT |
| Migrations run on connect unless `NODE_ENV=test` or `RUN_MIGRATIONS_ON_START` is exactly `"false"` | `backend/src/config/db.ts:26-36` | DIRECT |
| `serveLocalUploads` defaults to `!isProduction` | `backend/src/config/env.ts:348-352` | DIRECT |
| `aiPaused` and `registrationInviteOnly` default to staging mode | `backend/src/config/env.ts:397-398` | DIRECT |
| Reminders only if `REMINDERS_ENABLED === "true"`; demo defaults false (with a production confirmation rule) | `backend/src/config/env.ts:289, 311-320` | DIRECT |
| Production mode requires `DATABASE_URL`, `ENARA_API_KEY`, `ENARA_ORCHESTRATOR_URL` and `AI_ENGINE_URL`, else startup throws | `backend/src/config/env.ts:226-240` | DIRECT |
| Therefore `NODE_ENV` ≠ `production` on the deployment (names absent, app serving per P13.1) | the above plus P13.1 public checks | INFERENCE |
| `/ready` postgres is `ok` without a connection when `DATABASE_URL` is unset and not in production | `backend/src/app.ts:176-195` | DIRECT |
| `/health` returns a fixed body; `stagingMode` isn't exposed publicly | `backend/src/app.ts:172-174`; `stagingMode` used only in `db.ts` | DIRECT |
| The cron endpoint needs `Authorization: Bearer <CRON_SECRET>` | `backend/src/routes/cron.routes.ts:18-25` | DIRECT |
| No cron schedule in `vercel.json` | `vercel.json` | DIRECT |
| If staging mode is on, a running deployment proves every name-level guard condition (the guard throws at module load and on connect) | the above | INFERENCE (conditional) |

## Repository docs (REPORTED)

| Claim | Path |
|---|---|
| Intended values: `ENARA_STAGING=true`, `NODE_ENV=development`, Atlas `/enara_staging_alpha`, `RUN_MIGRATIONS_ON_START=false`, `AI_PAUSED=true`, `REGISTRATION_INVITE_ONLY=true`, `DEMO_MODE_ENABLED=false`, `REMINDERS_ENABLED=false`, `SERVE_LOCAL_UPLOADS=false`, bucket `enara-staging-alpha-uploads` | `docs/benchmarks/diagnostics/20261029T070000Z-vercel-staging/VERCEL_STAGING_RUNBOOK.md:14-16, 63-75` |
| Dedicated Atlas cluster; `0.0.0.0/0` allowlist owner-approved with safeguards, removed between sessions | same, lines 16, 27, 95 |
| R2 token and Atlas password "pasted in chat" must be rotated before setup | same, line 49 |
| "Option A" (`NODE_ENV=development` + `ENARA_STAGING=true`, no Postgres) approved | `docs/benchmarks/diagnostics/20261028T134450Z-staging-preflight/STAGING_SETUP_RUNBOOK.md:78-81` |

## Own action records (REPORTED by this assistant)

| Claim | Source |
|---|---|
| `AI_PAUSED` changed to `false` and redeployed (this is `dpl_GUdo…`); global pause switch set off; school pause already off | Scratchpad `ENARA_REPORT_2026-10-29.md` §6 (outside the repo); scratch `deploy8.log` |

## Not checked (and why)

| Check | Reason |
|---|---|
| Any variable value, including `ENARA_STAGING`, `NODE_ENV` and switch values | Forbidden: names and scopes only |
| Database identity, cluster, contents; R2 contents or token scope | Forbidden or needs secret values |
| Any application request (public or authenticated) | Not needed for P13.2; authenticated requests forbidden |
| Vercel runtime logs | Not needed; could contain request data |
| Other Vercel scopes or projects, Atlas or Cloudflare dashboards | No access from this CLI or session |

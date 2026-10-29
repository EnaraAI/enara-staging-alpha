# ENARA Staging Alpha on Vercel Hobby: Runbook

The owner chose Vercel Hobby, with all files stored in R2. **Licensing note:** Vercel's Hobby plan is for non-commercial use under Vercel's terms. The owner accepted this risk for a staging-only, synthetic-data environment. Moving to Pro (paid) removes it.

## 1. Topology

One new Vercel project, `enara-staging-alpha`, linked only to `EnaraAI/enara-staging-alpha`:

| Path | Served by |
|---|---|
| everything else | static SPA from `frontend/dist`, built with `VITE_API_URL=/api` (same origin) |
| `/api/*`, `/uploads/*`, `/ready`, `/health` | one Node function, `api/index.js` → `backend/dist/vercel.js` (Express), region `iad1`, 60 s, 1024 MB |

- **Storage:** R2 only. On Vercel (`VERCEL` is set), the staging guard **refuses to start** without all four `R2_*` variables, or with `SERVE_LOCAL_UPLOADS=true`. Nothing is written to the function's filesystem.
- **Database:** MongoDB Atlas Free, `enara_staging_alpha`. One connection is reused per warm function instance; nothing stays running between requests.
- **No cron. No rewrites to any other host.** `git.deploymentEnabled` lets only `staging-alpha` deploy; `main` never does.
- **Railway files** (`railway.staging*.toml`, `Dockerfile.staging*`) stay in the repository, unused by Vercel.

## 2. Vercel limits that matter

| Limit | Effect | Handling |
|---|---|---|
| Request body ~4.5 MB per function call | document and curriculum files that pass through the API above ~4.5 MB fail (HTTP 413), although the app allows 50 MB | use files under 4 MB in staging. Videos are unaffected: they upload straight to R2 with a signed URL. Spoken-exam audio is capped at 3 MB |
| Function duration 60 s | long AI streams would be cut | AI is paused. Re-check before any live AI test |
| Cold starts | the first request after idle takes a few seconds | acceptable for staging |
| No static outbound IP | Atlas needs `0.0.0.0/0` | owner-approved with safeguards (dedicated cluster, scoped user, strong password, TLS, alerts, remove between sessions) |
| Hobby plan terms | non-commercial use only | owner decision, recorded above |

## 3. R2 bucket CORS (needed for video uploads and downloads)

In Cloudflare, go to R2 → `enara-staging-alpha-uploads` → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://<your-project>.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Use the exact production domain of the staging project. No wildcard.

## 4. Steps (owner)

1. **Before you start:** rotate the R2 token and the Atlas password that were pasted in chat.
2. **Create the project:** Vercel → Add New → Project → Import `EnaraAI/enara-staging-alpha`. Then:
   - set **Root Directory** to `./` (the repository root);
   - set **Framework** to **Other**;
   - leave the build and install commands as they are (they come from `vercel.json`);
   - **don't deploy yet** (stop the first build if it starts).
3. **Settings → Git:**
   - set **Production Branch** to **`staging-alpha`**;
   - check that **`main` is not deployed** (`vercel.json` already disables it).
4. **Settings → Domains:** note the production domain, `https://<project>.vercel.app`.
5. **Settings → Environment Variables** (Production only, typed by hand, never imported from another project):

| Variable | Value |
|---|---|
| `ENARA_STAGING` | `true` |
| `NODE_ENV` | `development` |
| `MONGODB_URI` | the Atlas string ending `/enara_staging_alpha?retryWrites=true&w=majority` (encode `@` in the password as `%40`) |
| `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET` | three different values from `openssl rand -base64 48` |
| `FRONTEND_URL`, `APP_URL`, `CORS_ALLOWED_ORIGINS` | `https://<project>.vercel.app` (identical, no trailing slash) |
| `TRUST_PROXY` | `1` (the guard refuses `true`) |
| `RUN_MIGRATIONS_ON_START` | `false` |
| `AI_PAUSED` | `true` |
| `REGISTRATION_INVITE_ONLY` | `true` |
| `DEMO_MODE_ENABLED` | `false` |
| `REMINDERS_ENABLED` | `false` |
| `SERVE_LOCAL_UPLOADS` | `false` |
| `R2_ACCOUNT_ID`, `R2_BUCKET` (`enara-staging-alpha-uploads`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from the rotated bucket-scoped token |
| **Leave unset** | every AI provider key (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ANAM_API_KEY`, `GEMINI_API_KEY`, `AVATAR_API_KEY`), `DATABASE_URL`, `AWS_*`, `RESEND_API_KEY`, `UPLOAD_DIR`, `SERVE_FRONTEND_DIR`, `DB_IDLE_DISCONNECT_MS` |

6. **R2:** add the CORS policy from §3.
7. **STOP for approval**, then deploy: Deployments → Redeploy the latest `staging-alpha` commit, or push to `staging-alpha`.
8. **Checks** (send Claude only the URL):
   - `GET /ready` returns 200 `{"status":"ready"}`;
   - `/` and client routes load the SPA;
   - `POST /api/auth/register` returns 403 `INVITE_ONLY`;
   - `POST /api/gemini/generate` returns 404;
   - a request with `Origin: https://enara.app` gets no `Access-Control-Allow-Origin` header;
   - if the function logs `Staging isolation check failed: …`, fix the named variable (the log never shows values).
9. **Later, each with its own approval:**
   - migrations from a trusted local shell with no `.env` (`npm run migrate -- --status`, then `npm run migrate`);
   - seed the synthetic school, then flags and the P0d budget (15 / 6 / 6 / 3).
   - AI stays paused until a separate go-ahead.

## 5. Rollback

1. Vercel → Settings → Deployment Protection or Pause (or delete the project).
2. Remove the Atlas `0.0.0.0/0` entry and disable the database user.
3. Revoke the R2 token.

Data in Atlas and R2 is kept for review. No existing ENARA deployment is involved.

## 6. Verified locally (no Vercel or remote access)

- The `vercel.json` build command builds the SPA (bundle uses `/api`) and the backend.
- `api/index.js` was called the way Vercel's Node runtime calls it, in staging mode with `VERCEL=1`, against a local MongoDB on an isolated Docker network:
  - `/ready` and `/health` returned 200;
  - registration was refused (invite-only);
  - Gemini returned 404;
  - unsigned upload links were refused;
  - no CORS header for `enara.app`;
  - without R2, the guard refused to start;
  - with `TRUST_PROXY=1`, the rate limiter raised no warnings.
- **Unverified until the first deploy:** the actual Vercel build and function bundling, the routing on Vercel's edge, and the R2 CORS behaviour.

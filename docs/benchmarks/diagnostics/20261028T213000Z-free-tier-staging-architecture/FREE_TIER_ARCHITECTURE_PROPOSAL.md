# ENARA Integrated Alpha — USD 0 Free-Tier Staging Architecture Proposal

Review only. Nothing was provisioned, connected to, deployed or committed. The provider limits below come from public documentation read on 2026-10-28 (sources in §8). Re-check them on the dashboards before acting, because free tiers change often.

Baseline: commit `544c6ec` on `staging-alpha`, plus `../20261028T203644Z-railway-two-service-staging/RAILWAY_TWO_SERVICE_RUNBOOK.md`.

## 1. Conclusion first

**A secure, always-available USD 0/month deployment on Railway Free is not feasible with the current architecture.**

- Railway Free gives **USD 1 per month** in credit after a one-time trial (USD 5, up to 30 days).
- One always-on Node/Mongoose backend at about 0.2–0.3 GB of RAM costs roughly **USD 2–3.5 a month** at Railway's published rates (USD 10 per GB-month of RAM, USD 20 per vCPU-month). That alone is two to three times the credit.
- A second service for the frontend roughly doubles that.
- **Serverless (app sleeping) cannot help.** A service sleeps only after 5 minutes with no outbound packets. The backend's MongoDB driver keeps a connection pool open and sends heartbeats every few seconds, and Railway counts database connections as outbound traffic. So the backend would never sleep.
- **Atlas network security:** Atlas Free supports no private endpoints and no peering. Railway's static outbound IPs are a **Pro-plan** feature. On Railway Free, the only way to reach Atlas is the IP access list entry `0.0.0.0/0`. **This is a security risk and needs your explicit approval** (§5).

The closest workable USD 0 option uses **Render Free** web services for compute, with Atlas Free and R2 free. It is **free but not dependable**:
- services sleep after 15 minutes without traffic, and take about 1 minute to wake;
- the 750 instance hours per month are shared across the whole workspace;
- outbound IPs are shared regional ranges, so the Atlas restriction is weaker than a static IP would give.

It is acceptable only for an intermittent internal alpha, not for always-on use.

## 2. Component evaluation

### 2.1 Backend on Railway Free

| Item | Railway Free (documented) | Impact on ENARA |
|---|---|---|
| Credit | Trial: one-time USD 5, up to 30 days. Then USD 1/month, no rollover | Covers about 1–2 weeks of the trial, then roughly 10 days a month |
| Resources | 0.5 GB RAM and 1 vCPU per service; 0.5 GB volume | RAM is enough (backend about 200–300 MB) |
| Services | about 1 project and 3 services after the trial (third-party source; verify) | 2 services fit, if credit allowed it |
| Networking | an unverified ("Limited") trial restricts outbound traffic and ports | Atlas on port 27017 may be blocked; account verification is required |
| Static outbound IP | Pro only | an exact Atlas allowlist is impossible |
| Sleeping | after 5 minutes with no outbound traffic; open database connections count | the backend never sleeps |
| Volumes on the trial | deleted 30 days after the credit expires | use R2, not a volume (already the plan) |
| When the credit runs out | services stop | the staging backend goes down mid-month |

**Verdict: not viable at USD 0** beyond a short trial window. Railway stays the preferred host only if you later approve Hobby (USD 5/month), which is outside this brief.

### 2.2 MongoDB Atlas Free (M0)

| Item | Limit | Fit |
|---|---|---|
| Storage | 0.5 GB (data plus indexes) | fine for one synthetic school |
| Throughput | 100 operations per second; 500 connections; 10 GB in and 10 GB out per 7 days | fine for alpha. Keep the driver's default pool size |
| Clusters | one free cluster per project | use a **new project** `enara-staging-alpha`, separate from production |
| Network | IP access list only; no private endpoints or peering | see §5 |
| Users | SCRAM password, X.509 or AWS IAM | a dedicated SCRAM user `readWrite@enara_staging_alpha` |
| Backups | optional daily snapshot, 4 kept | enable it |
| Auto-pause | after 30 days with no connections | export the data before long gaps |
| Version | MongoDB 8.0, managed by Atlas | compatible |

**Verdict: viable.** The staging guard already pins the database name and checks it again after connecting.

### 2.3 Cloudflare R2 free tier

The free tier covers 10 GB-month of storage, 1 million Class A and 10 million Class B operations a month, and free egress. It applies to Standard storage only.

- Create the bucket `enara-staging-alpha-uploads` with a token that has Object Read & Write on **that bucket only**.
- Enabling R2 may require a payment method on the Cloudflare account. That is a billing-profile change, even though it costs USD 0 within the free tier. Confirm it with the owner, and set a usage alert.

**Verdict: viable.**

### 2.4 Frontend hosting (must keep `server.ts`, the proxy and the guard)

| Option | Proxy, guard and `BACKEND_URL` kept? | USD 0? | Notes |
|---|---|---|---|
| Railway Free, second service | yes, unchanged | **no**: credit already exceeded | — |
| **Render Free web service (Docker, `Dockerfile.staging`)** | yes: same image, `ENARA_STAGING=true`, `NODE_ENV=production`, HTTPS `BACKEND_URL` | yes | sleeps after 15 minutes; about 1 minute cold start; workspace hours shared with the backend. Bandwidth or build-minute overruns suspend services when no card is on file |
| Vercel Hobby | no: needs serverless rewrites, and the existing `vercel.json` hard-codes the sandbox backend | yes | would mean rewriting the proxy; too easy to cross-wire with the sandbox. **Not recommended** |
| Cloudflare Pages or Workers | no: Express `server.ts` doesn't run as-is | yes | would mean re-implementing the proxy and guard. Not recommended now |
| **Single-service option** (backend serves the SPA) | the proxy becomes unnecessary because everything is same-origin | yes | code change to `backend/app.ts` plus a build step; halves the instance hours. A **follow-up option** only, not in the approved release |

What the proxy does stays the same on Render:
- **Auth:** Bearer token, forwarded.
- **Cookies and CSRF headers:** passed through.
- **Uploads:** multipart bodies streamed to the backend.
- **CORS:** same-origin at the frontend. The backend's guard requires `CORS_ALLOWED_ORIGINS` to equal the frontend's Render origin.
- **Routes:** `/api/gemini` and `/api/avatar` are disabled in staging.

## 3. Candidate architectures

| | A. Railway Free ×2 | B. Render Free ×2 + Atlas M0 + R2 (**recommended for USD 0**) | C. Railway Hobby backend + Render Free frontend (reference) |
|---|---|---|---|
| Monthly hosting | over the USD 1 credit; stops mid-month | USD 0 | about USD 5 or more (Hobby): **outside the brief** |
| Availability | unreliable; outages when credit runs out | sleeps; about 1 minute cold start; hours cap (below) | backend always on |
| Atlas restriction | `0.0.0.0/0` only | Render's published regional outbound ranges (shared) | `0.0.0.0/0` (static IP is Pro only) |
| Code changes | none | none (same image and `Nixpacks` → Render's Node runtime: `npm ci && npm run build`, `npm start`) | none |

**Instance hours under B:**
- Two services awake 24 hours a day would need about 1,488 hours a month, against the 750-hour workspace pool.
- Sleeping and intermittent use keep it within the pool only if each service is awake less than about 12 hours a day on average.
- Use a **new, separate Render workspace**, so the existing Render backend `backend-engine-vhcz` neither shares nor consumes these hours.

## 4. Fit with the existing safeguards

- **Staging guard:** works unchanged on Render.
  - The backend runs with `ENARA_STAGING=true` and `NODE_ENV=development` (Option A).
  - Provide `PORT` from Render.
  - `RUN_MIGRATIONS_ON_START=false`.
  - Variables must be set by hand. Do not attach a `.env` secret file: the guard refuses one.
- **Health checks:** use `/ready` for the backend and `/api/health` for the frontend.
- **Migrations:** `npm run migrate` from the Render shell (owner action at STOP 4). Note that Render Free has **no shell**, so run migrations from a trusted local machine instead, with the staging URI exported in that shell only and no `.env` file present. The guard pins the database.
- **AI:** `AI_PAUSED=true`, and every provider key unset (Anthropic, ElevenLabs, Anam, Gemini, Avatar). The P0d budget is unchanged (15 / 6 / 6 / 3); an ENARA admin sets it later. No AI calls.
- **Branch:** deploy only from `staging-alpha` at `544c6ec`, with auto-deploy off. Never `main` or `connect-backend`.
- **Existing deployments:** none are touched. Use new projects or workspaces at Atlas, Render, Cloudflare and Railway.

## 5. Atlas network access: security trade-off (needs approval)

| Option | Exposure | Available on free tiers |
|---|---|---|
| Static egress IP allowlist (one /32) | minimal | **no** (Railway Pro or a paid egress proxy) |
| Private endpoint or peering | none publicly | **no** (not on M0) |
| Provider's regional outbound ranges (Render publishes them per region) | the cluster is reachable from any tenant in that region's shared range | yes (option B) |
| `0.0.0.0/0` | the cluster is reachable from the whole internet; only authentication protects it | yes (option A or C on non-Pro Railway) |

Required compensating controls for any non-static option:
- a dedicated Atlas project and cluster holding staging data only (synthetic school);
- a user with `readWrite@enara_staging_alpha` only, and a long random password (32+ characters);
- TLS (Atlas default);
- database auditing is not available on M0;
- rotate the password after the alpha;
- delete the access entry when staging is not in use;
- Atlas alerts for connections.

**STOP A:** the owner must explicitly approve either the shared regional ranges (B) or `0.0.0.0/0`. This proposal does **not** recommend `0.0.0.0/0`.

## 6. GO / NO-GO

- **NO-GO** for "Railway Free, secure and dependable, USD 0/month". The credit is insufficient, the backend can't sleep, and there's no static IP.
- **Conditional GO** for **option B** (Render Free ×2, Atlas M0 and R2 free) as an *intermittent* USD 0 alpha, subject to STOP A and the limits in §3. It is not suitable for demos that need instant response or 24/7 availability.
- If availability matters, the minimum paid change is Railway Hobby, roughly USD 5/month. That needs a separate budget decision; it is not proposed here.

## 7. Manual steps (owner; nothing done yet)

1. **STOP 1:** approve option B, a dependable-hosting budget, or neither.
2. **Atlas:**
   - Create a new project `enara-staging-alpha` and a Free cluster in the region closest to the Render region.
   - Create a database user with `readWrite` on `enara_staging_alpha` only.
   - Enable the free backup.
   - Verify the scope from a trusted shell: `listDatabases` must fail or show only that database, and reading another database must return unauthorized.
3. **STOP A:** approve the network access entry: the Render regional outbound ranges, or (not recommended) `0.0.0.0/0`.
4. **R2:**
   - Create the bucket `enara-staging-alpha-uploads` and a token scoped to that bucket only.
   - Confirm whether a payment method is needed; that needs the owner's billing approval.
   - Set a usage notification.
5. **Render:** create a **new workspace**, separate from the one hosting `backend-engine-vhcz`, and connect the repository with only the `staging-alpha` branch and auto-deploy off.
   - **Backend web service:**
     - root directory `backend`, Node runtime;
     - build `npm ci && npm run build`, start `npm start`;
     - health check `/ready`;
     - variables per the two-service runbook §4, with `FRONTEND_URL`, `APP_URL` and `CORS_ALLOWED_ORIGINS` set to `https://<frontend>.onrender.com`;
     - no provider keys, `AI_PAUSED=true`.
   - **Frontend web service:**
     - Docker, root directory `frontend`, Dockerfile `Dockerfile.staging`;
     - health check `/api/health`;
     - `ENARA_STAGING=true`, `NODE_ENV=production`, `BACKEND_URL=https://<backend>.onrender.com`.
   - The frontend guard only refuses the existing sandbox host list, so a new `onrender.com` subdomain is accepted.
6. **STOP 2:** a manual deploy of commit `544c6ec`. Check:
   - `/ready` returns 200;
   - the logs show no `Staging isolation check failed`;
   - the frontend `/api/health` returns 200, `/api/railway/health` reaches the staging backend, and `/api/gemini/generate` returns 404.
7. **STOP 3:** migrations from a trusted local shell (no `.env`), then seed, flags and P0d budget, per the earlier runbooks.
8. **STOP 4:** unpausing AI is a separate go-ahead.

**Rollback:**
- suspend both Render services;
- remove the Atlas access entry and disable the database user;
- revoke the R2 token.

Data is kept for review. No existing deployment is involved.

## 8. Sources (read 2026-10-28)

- Railway free trial: https://docs.railway.com/reference/pricing/free-trial
- Railway plans and resource prices: https://docs.railway.com/reference/pricing/plans
- Railway app sleeping: https://docs.railway.com/reference/app-sleeping
- Railway static outbound IPs (Pro): https://docs.railway.com/networking/static-outbound-ips
- Railway Free service counts (third-party, verify): https://costbench.com/software/developer-tools/railway/free-plan/
- Atlas Free cluster limits: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Render free instances: https://render.com/docs/free

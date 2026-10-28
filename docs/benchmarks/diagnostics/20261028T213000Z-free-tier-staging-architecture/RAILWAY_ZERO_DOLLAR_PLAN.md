# ENARA Integrated Alpha — Railway at USD 0 (adjusted plan)

This adjusts `FREE_TIER_ARCHITECTURE_PROPOSAL.md` so that **Railway is the only compute host and the cost is USD 0**. The code in §5 is now implemented locally (uncommitted). Nothing was provisioned or deployed.

## 1. What "USD 0 on Railway" means

- **Cost is guaranteed to be USD 0.** The Free plan has no payment method. When the credit (USD 5 trial, then USD 1/month) runs out, Railway **stops the services**; it can't bill. Never add a card or upgrade.
- **Availability is the limit, not cost.** The plan below makes the credit last as long as possible. It is still **not always-on**.

## 2. Changes from the two-service plan

| # | Change | Why | Effect |
|---|---|---|---|
| 1 | **One Railway service instead of two:** the backend also serves the built SPA from the same origin | a second always-present container doubles the cost | about half the spend. No proxy hop; CORS is same-origin |
| 2 | **Serverless (app sleeping) ON** | sleeping services stop using compute | pay only while awake |
| 3 | **Idle database disconnect:** close the Mongoose connection after about 4 minutes with no requests, and reconnect on the next request | open MongoDB connections count as outbound traffic and block sleep (Railway docs) | without this, change 2 does nothing |
| 4 | **Memory cap** `NODE_OPTIONS=--max-old-space-size=256`, no cron, `REMINDERS_ENABLED=false` | RAM is the main cost | fewer than about 0.3 GB while awake |
| 5 | **Uploads on R2 (free tier), no Railway volume** | trial volumes are deleted after the credit ends; the Free volume is 0.5 GB | files survive sleeps and redeploys |
| 6 | **Database on Atlas Free, not Railway** | a Mongo container on Railway would use most of the USD 1 by itself | USD 0 for the database |

## 3. Budget estimate (Railway list prices: USD 10 per GB-month of RAM, USD 20 per vCPU-month)

Awake cost at about 0.25 GB of RAM and about 0.05 vCPU average:
- RAM: 0.25 × 10 / 730 h = USD 0.0034 per hour
- CPU: 0.05 × 20 / 730 h = USD 0.0014 per hour
- **Total: about USD 0.005 per hour**

| Period | Credit | Awake time it buys |
|---|---|---|
| Trial (up to 30 days) | USD 5 | ~1,000 h, i.e. effectively always on for the trial month |
| Every month after | USD 1 | **~200 h/month, about 6–7 h/day** if it sleeps the rest of the time |

Each wake is a cold start: the first request can take seconds or return a 502, and the next request succeeds.

**Practical usage:** scheduled test sessions, then idle. Check Railway's usage page weekly. If the credit runs out, the service stays down until the next month, and it still costs USD 0.

## 4. Database access (unchanged risk, still needs approval)

Railway Free has no static outbound IP (Pro only), and Railway publishes no fixed egress ranges. So Atlas can only be reached through the access-list entry **`0.0.0.0/0`**.

**This is a security risk and is not recommended by default.** If you approve it (STOP A), apply all of these:
- a dedicated Atlas project and cluster holding synthetic staging data only;
- a user with `readWrite@enara_staging_alpha` only, with a random password of 32+ characters;
- TLS (Atlas default), and connection alerts on;
- remove the access entry between test sessions, and rotate the password after the alpha.

The staging guard also refuses any other database name.

If you do not approve, there is **no USD 0 Railway option** that reaches Atlas securely.

## 5. Code changes (implemented locally, uncommitted)

All of it is active only with `ENARA_STAGING=true`; production and sandbox behaviour is unchanged.

| File | Change |
|---|---|
| `backend/src/config/stagingSingleService.ts` (new) | `mountStagingFrontend`: serves the built SPA with an `index.html` fallback that never answers `/api`, `/uploads`, `/health`, `/ready` or `/api-docs`. Helmet's CSP is removed only on SPA files (the SPA uses inline scripts and a CDN runtime, as it did behind the frontend server); API responses keep it. `/api/gemini/*` returns 404. `idleDbController`: closes the Mongo connection after `DB_IDLE_DISCONNECT_MS` with no active API request, and reopens it (one shared reconnect) before the next `/api`, `/uploads` or `/ready` request. Static files never reopen it |
| `backend/src/config/db.ts` | `openMongo()` split out of `connectDB()`, so each reconnect re-checks the staging database name |
| `backend/src/config/env.ts` | `SERVE_FRONTEND_DIR` and `DB_IDLE_DISCONNECT_MS` (30 s to 1 h), read only in staging |
| `backend/src/app.ts` | wires both in when configured |
| `frontend/services/railwayApi.ts` | browser base follows `VITE_API_URL` (default `/api/railway` unchanged), so legacy helpers work same-origin |
| `Dockerfile.staging-single`, `railway.staging-single.toml` (new, repository root) | builds the SPA with `VITE_API_URL=/api` and the backend (dev dependencies pruned); runs as `node`; bakes `SERVE_FRONTEND_DIR`, `DB_IDLE_DISCONNECT_MS=240000` and `NODE_OPTIONS=--max-old-space-size=256`; no secrets and no `NODE_ENV`. Health check `/ready` |
| `backend/test/p6SingleService.test.ts` (new, 9 tests) | staging-only switches; build files carry no secrets; SPA fallback never shadows the API; CSP kept on the API; Gemini closed; idle close, hold during a long request, reconnect, a single reconnect under concurrency; no hard-coded `/api/railway` in frontend code |

Verification (local):
- backend tests 736/736 before the `railwayApi` fix, and the new file 9/9 after it;
- backend and frontend `tsc` clean, and the frontend build succeeds;
- the image built from a clean export and ran against a local MongoDB on an internal Docker network:
  - `/ready` returned 200, `/` and client routes served the SPA, `/api/gemini/generate` returned 404;
  - CORS answered only the configured origin, registration was invite-only, and the staging guard passed;
  - after the idle period the app's database connections closed (server count 58 → 5, the remainder not the app's), and the next request reconnected.
- Railway's actual sleep behaviour can only be confirmed after deploy.

## 6. Railway steps (owner, after the code is approved)

1. **STOP 1:** approve this plan and the code work in §5.
2. **STOP A:** decide on the `0.0.0.0/0` Atlas entry with the controls in §4, or stop here.
3. Set up Atlas Free (new project, scoped user, backup on) and R2 (bucket plus scoped token), as in the proposal §7. Run the scope checks.
4. **Railway:** verify the account (a Limited trial restricts outbound ports, so Atlas would fail). **Do not add a card.**
5. Create the project `enara-staging-alpha` with **one** service:
   - repository branch `staging-alpha`, auto-deploy off;
   - root directory: repository root; config file `/railway.staging-single.toml`;
   - **Serverless on**;
   - generate one public domain.
6. Set the variables by hand:
   - `ENARA_STAGING=true`, `NODE_ENV=development`;
   - `FRONTEND_URL`, `APP_URL` and `CORS_ALLOWED_ORIGINS` all set to the service's own `https://<name>.up.railway.app`;
   - `RUN_MIGRATIONS_ON_START=false`, `AI_PAUSED=true`, invite-only registration, demo mode off;
   - the R2 variables, and the memory cap from §2;
   - **all provider keys unset**.
7. **STOP 2:** deploy manually. Check:
   - `/ready` returns 200, and the logs show no staging-guard failure;
   - the SPA loads, and `/api/gemini/generate` returns 404;
   - the service sleeps after about 10 idle minutes (the metrics page shows it).
8. **STOP 3:** migrations from a trusted local shell (no `.env`), then seed, flags and the P0d budget (15 / 6 / 6 / 3).
9. **STOP 4:** unpausing AI is a separate approval.

**Rollback:** remove the domain or delete the service, remove the Atlas access entry, disable the database user, and revoke the R2 token. Existing deployments are never touched.

## 7. GO / NO-GO

- **GO** for the plan, as a USD 0 Railway alpha that is up roughly 6–7 h/day after the trial month.
- It depends on two things:
  - **STOP A** (`0.0.0.0/0`, with controls) or an alternative you choose;
  - approval of the §5 code changes.
- **NO-GO** for any expectation of always-on hosting at USD 0 on Railway.

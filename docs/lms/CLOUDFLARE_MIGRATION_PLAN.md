# Moving ENARA from Vercel to Cloudflare — plan

_23 Nov 2026. **Plan only: waiting for Mohamed's "go".** lms-test first. **test.enara.app stays frozen on Vercel**, and its Vercel project is never touched. No deploy, DNS or secret change happens before the go. Secret names only, never values._

## In three lines
1. **Move the Express backend almost unchanged into a Cloudflare Container behind a thin Worker, and serve the React app as Worker static assets.** A rewrite to plain Workers is not worth it now: mongoose would need version 9, Express would have to go, and the Mongo pooling problem would remain.
2. **It removes Vercel's hard limits:**
   - the 60 s function cap;
   - one Mongo connection pool per cold instance, which caused the Atlas "connection storm" in the 100-user test;
   - daily-only crons on Hobby.
   The cost is similar: about $6–15/month at lms-test traffic, and about $30–75 at 1,000 learners.
3. **Five steps, each with a rollback.** The cutover is a DNS switch of `lms-test.enara.app`, with the Vercel deployment kept warm for 14 days as an instant way back.

## 1. What runs on Vercel today
| Piece | Today |
|---|---|
| Frontend | React 19 + Vite SPA (also the kids and parents sub-apps), static `frontend/dist`, SPA fallback |
| Backend | **One** Node 22 function (`api/index.js` → Express in `backend/src/app.ts`), region iad1, 1 GB, **60 s max** |
| Routes into the function | `/api/*` (about 35 routers, SSE for the tutor and avatar streams), `/lti/*`, `/.well-known/jwks.json`, `/uploads/*`, `/ready`, `/health`, Swagger |
| Files read from disk | `backend/dist`, `data/outcomes`, `data/curricula`, `data/assessment-bench`, swagger-ui, jose |
| Background work | `waitUntil` (`@vercel/functions`) in grading, avatar usage, LLM warm-up, curriculum extraction; LMS grade outbox drain (piggybacks on requests, Mongo lock) |
| Scheduled | No Vercel crons (Hobby plan). A GitHub Action calls `/api/cron/daily` at 04:23 UTC: about 14 jobs in sequence (reminders, weekly summaries, grading sweep, LMS drain, roster sync, Moodle quiz import, parent emails, retention) |
| Heavy or Node-only | mongoose 8 + pg; jose / jsonwebtoken / bcryptjs / Node crypto; multer (in memory) → R2 via the S3 SDK; unpdf; mathjs; QuickJS WASM sandbox (switched off) |
| Domains | `lms-test.enara.app` (this project). `test.enara.app` and `*.vercel.app` belong to the frozen project |
| Previews | None in use |
| Environment variables (names) | About 120, in groups: database (`MONGODB_URI`, `DATABASE_URL`, pool settings), auth (`JWT_*`, `CORS_ALLOWED_ORIGINS`, `INGEST_HMAC_*`), LTI (`LMS_KEK`, `LMS_KEK_PREVIOUS`, `LMS_TOOL_BASE_URL`, `LMS_*` switches), email (`RESEND_API_KEY`, `EMAIL_*`, `PARENT_*`), models (`ANTHROPIC_*`, `TUTOR_LLM_*`, `AI_*`), avatar and speech (`ANAM_*`, `ELEVENLABS_*`, `AZURE_SPEECH_*`), storage (`R2_*`), flags (`ENARA_ENGINE_V2` …), ops (`MAINTENANCE_TOKEN`, `MAINTENANCE_CI_TOKEN`, `CRON_SECRET`, `REQUEST_DEADLINE_MS`). Vercel-only: `VERCEL`, `VERCEL_URL`, `VERCEL_DEPLOYMENT_ID` |
| Already on Cloudflare | The realtime relay Worker `rt.enara.app` (Anam and ElevenLabs WebSockets), and uploads in **R2**. `wrangler` and `@cloudflare/containers` are already dev dependencies |

## 2. Where each piece lands
| Piece | On Cloudflare | Code changes |
|---|---|---|
| SPA | **Workers static assets**, the route Cloudflare now recommends over Pages; SPA fallback set explicitly | Build unchanged |
| Express backend | A **Cloudflare Container** running the existing Node 22 image (`Dockerfile.staging-single` exists), reached through a thin Worker that routes `/api`, `/lti`, `/.well-known`, `/uploads`, `/ready`, `/health` | Replace `@vercel/functions` `waitUntil` with a small shim; the process lives on, so plain background promises work. Keep the 2 min idle disconnect for Mongo off. Read the host from the request, not `VERCEL_URL` |
| SSE streams | Pass through the Worker to the container | None |
| Background jobs (grading, warm-up, usage) | In the container now. Later, **Queues** for retries and spreading load | Shim now; Queues are a later, separate PR |
| Daily cron | A **Cron Trigger** on the Worker calls `/api/cron/daily` in the container (15 min wall time per trigger; the container has no 60 s cap) | None. The GitHub daily job is switched off after cutover |
| LMS outbox drain | Same code. It can run every 5 min from a Cron Trigger instead of riding on requests | Optional |
| Uploads | R2 as today (S3 API). Later possibly an R2 binding | None |
| Postgres (ingestion only) | Unchanged. Hyperdrive is optional (Postgres only) | None |
| QuickJS sandbox | Runs in the container (WASM in Node) | None (switch stays off) |
| Mishkat, DeepSeek (Modal) | Stay on Modal, called over HTTPS | None |
| Realtime relay | Already a Worker | Add `lms-test.enara.app` to its allowed origins (today it lists only test.enara.app and `*.vercel.app`) |

**Does not fit plain Workers:** Express itself, mongoose 8 (Workers need version 9 or later), a long-lived Mongo pool (no persistent process), and 128 MB memory. **All of these fit the Container**, which is why the backend goes there. Nothing in ENARA fits nowhere.

## 3. Databases and services
| Service | What changes |
|---|---|
| **MongoDB Atlas** | **Better:** one long-lived pool per container (set `MONGO_MAX_POOL_SIZE` about 10) instead of one per cold Vercel instance. The fix for the 100-user connection storm comes for free. **IPs:** container egress IPs are not fixed (unverified), so the Atlas allowlist stays as today. Place the container near the Atlas region (US-East today) to keep queries fast |
| **Resend** | None: it is HTTPS. Bulk parent emails could later go through Queues (Resend allows 2 requests/s) |
| **Modal (DeepSeek, Mishkat), Anthropic, Anam, ElevenLabs, Azure Speech** | None: all HTTPS. Keep the 60 s timeout on model calls; the container allows longer if needed |
| **Moodle / LTI 1.3** | **No re-registration** if the domain stays `lms-test.enara.app`: login, launch, JWKS and `.well-known` URLs are unchanged. `LMS_KEK` and `LMS_KEK_PREVIOUS` must be copied **exactly**, or stored tool secrets become unreadable. Moodle's own calls (grade passback, roster) are outbound from us and unchanged |
| **Google Classroom** | The OAuth redirect stays on the same domain; no change |

## 4. CI/CD (same rules)
- **E2E on every PR, unchanged:** Docker and Moodle in GitHub Actions. That stack is not Vercel-specific.
- **Deploy job `lms-deploy-cf.yml`, after a green E2E:**
  1. Guard: the target is the lms-test Worker only; any other script name or domain is refused. test.enara.app stays out of reach.
  2. Merge the PR.
  3. Build the container image.
  4. Apply the flags from `deploy/lms-test.flags.json` as Worker variables.
  5. `wrangler deploy`, and record the previous Worker version.
  6. Wait until `/ready` reports Mongo ok.
  7. Check the site (JWKS has keys).
  8. Run the migrations.
  9. Run the health check (LTI login → launch → grade to the mock LMS).
  10. **On failure, `wrangler rollback`** to the recorded version.
  11. Post one line on the PR.
- **Secrets:** a scoped Cloudflare API token and the account id go in GitHub. App secrets are set in Cloudflare by you (dashboard or `wrangler secret`); the pipeline only sets plain flags, as today.

## 5. Cost per month (compute and hosting only; model, Anam and email costs are unchanged)
| | Vercel | Cloudflare |
|---|---|---|
| **Today, lms-test** | **$0 (Hobby)**. Hobby is meant for non-commercial use and has the 60 s cap; a Pro review was planned before the first school | **About $6–15**: Workers Paid **$5**, plus one *basic* container (¼ vCPU, 1 GiB) always on, about **$7** (mostly memory). Less if it sleeps when idle, at the cost of a few seconds' cold start |
| **1,000 learners** (about 300 requests per learner per day, about 9M per month) | **About $25–45**: Pro **$20/seat** including a $20 credit, plus invocations and active CPU | **About $30–75**: $5, plus 2 *basic* (about $25) up to 2 *standard-1* (½ vCPU, 4 GiB, about $70) containers. Requests stay within the included 10M |

- **Sources:** Cloudflare and Vercel pricing pages as of 23 Nov 2026, read through search excerpts (some limits unverified); re-check before committing.
- **Not a saving:** the gain is in limits and reliability, not money.

## 6. Steps, each with a rollback
| # | Step | Done when | Rollback |
|---|---|---|---|
| 0 | **You:** Workers Paid plan; a scoped API token and the account id as GitHub secrets; app secrets entered in Cloudflare under the same names | I can list secret *names*, not values | Nothing to undo |
| 1 | **Prep PR (no change on Vercel):** `waitUntil` shim, Worker + Container + static-assets config, host handling, relay origin, a guard test that the new pipeline cannot target test.enara.app | E2E green; Vercel deploy unchanged | Revert the PR |
| 2 | **Shadow on a new host, `lms-test-cf.enara.app`:** same lms-test database, but with **cron and LMS drain off** so the two backends never both write scheduled work | Health check, migrations as a dry run, Playwright smoke and a 100-user load test pass on the shadow | Delete the shadow Worker and route; users never saw it |
| 3 | **Pipeline switch:** E2E → deploy to Cloudflare. The Vercel job stays as a manual fallback | Two PRs deploy end to end on the shadow host | Switch the job input back to Vercel |
| 4 | **Cutover of `lms-test.enara.app`:** lower the TTL a day before; point the hostname at the Worker; move the daily cron to a Cron Trigger and switch off the GitHub one; run a real Moodle launch | `/ready`, JWKS, health check, a real LTI launch and a grade passback all pass on the real domain | **DNS back to Vercel** (minutes; that deployment stays warm for 14 days) and re-enable the GitHub cron |
| 5 | **After 14 quiet days:** pause, not delete, the `enara-lms-test` Vercel project. test.enara.app stays exactly as it is | — | Un-pause |

## 7. Risks
- **Container cold start:** a few seconds (Cloudflare gives no current figure). Keep one instance warm on lms-test; the first request after sleep would otherwise be slow.
- **API churn:** the Containers `Container` class is deprecated (maintained to 31 Dec 2026). Build on the new `ctx.container` API.
- **Two backends on one database during the shadow step:** cron and drain must be off on the shadow, which the guard enforces.
- **`LMS_KEK` copied wrong:** stored school secrets break. The health check reads one back before cutover.
- **Atlas access:** container IPs are not fixed, so the allowlist stays wide. Tighten it later (a fixed-egress proxy or Atlas private networking) before real schools.
- **Region:** pin the container near Atlas (US-East). The Worker serves the SPA from the edge, close to Egyptian users.
- **Logs:** Workers logs and container logs replace Vercel's. Set up retention before cutover.

## What you must do yourself
1. Cloudflare account on **Workers Paid**. `enara.app` DNS: confirm it is on Cloudflare; `rt.enara.app` suggests it is.
2. Create a **scoped API token** (Workers, Containers, routes for `enara.app`), and add it and the account id as **GitHub secrets**.
3. Enter the app secrets in Cloudflare under the same names. I provide the list of names and never see the values.
4. Approve the DNS switch at cutover (step 4) and any later DNS change.
5. Your "go" on each step: 1 → 2 → 3 → 4.

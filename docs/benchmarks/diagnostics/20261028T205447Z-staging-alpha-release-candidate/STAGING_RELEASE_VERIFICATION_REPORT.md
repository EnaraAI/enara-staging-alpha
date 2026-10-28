# ENARA Integrated Alpha — `staging-alpha` Release Verification Report

Local verification only: no remote databases, Railway, provider calls or migrations. The Docker checks ran on a local daemon, on an internal network with no outbound access.

**Recommendation: GO to create the branch and commit, after owner approval. NO-GO to deploy** until runbook STOPs 1–3 are approved (`../20261028T203644Z-railway-two-service-staging/RAILWAY_TWO_SERVICE_RUNBOOK.md` §9).

## 1. Reproducibility (clean export)

A clean copy was built as `git archive HEAD` plus exactly the files in `RELEASE_FILES.txt`, in a scratch directory, with no `.env` file and no ignored files.

| Check | Result |
|---|---|
| backend `npm ci` from the lockfile | ok |
| backend `tsc --noEmit` / `npm run build` → `dist/index.js` | ok / ok |
| backend vitest | 60 files: **726 passed, 2 skipped**. The 2 skipped are frontend-process tests that need frontend `node_modules`; they are covered by §2 and by the working-tree run |
| First run, before fixes | 2 failures, both now fixed: missing provenance snapshots (added to the manifest), and `v1GraderCompat` relying on the local `.env` (test fixed) |

The working tree after the fix also passed:
- vitest: **728/728**;
- backend and frontend `tsc`: clean;
- `git diff --check`: clean.

One run made concurrently with the clean-copy suite showed one transient failure. It did not reproduce in three later runs, and was most likely a process-spawn timing issue under load.

## 2. Frontend container (actual image, not just tsc)

| Check | Result |
|---|---|
| `docker build -f Dockerfile.staging` (from the clean export) | **built** `enara-staging-frontend:rc` |
| Starts with valid staging env | `Server listening on http://0.0.0.0:3000`, running as user `node` |
| `BACKEND_URL` = Vercel sandbox backend | exits 1 before listening: "BACKEND_URL must not be a production or shared ENARA backend" |
| `GEMINI_API_KEY` set | refused at startup |
| Production deps only | Vite and tsx are absent from the runtime `node_modules` |
| Built browser bundle | no `vercel.app`, `onrender.com`, `up.railway.app`, `enara.app` or `localhost:3001` URLs; it uses `/api/railway`. Those host names appear only in `server.cjs`, as the guard's refusal list |

**Two sandbox limitations, neither of which changes the Dockerfile:**
1. Docker Hub rate-limited this sandbox (HTTP 429), so the same `node:22-alpine` image was pulled from Google's mirror (`mirror.gcr.io`).
2. The sandbox only allows outbound traffic through its HTTPS proxy, so a local-only base image added the proxy's CA certificate and proxy variables for `npm ci`. The proxy variables were blanked at runtime.

On Railway, the image builds from the unmodified `Dockerfile.staging`, with normal registry access. **Building on Railway itself is unverified until the first deploy.**

## 3. Request routing (frontend → stub staging backend)

Test setup:
- a stub backend reachable as `enara-staging-backend.railway.internal:8080`, which logged every request it received;
- the frontend container with `BACKEND_URL=http://enara-staging-backend.railway.internal:8080`;
- an `--internal` Docker network, so neither container could reach anything outside it.

| Request | Reached | Result |
|---|---|---|
| `GET /api/railway/auth/me` with Bearer token, cookie and `X-CSRF-Token` | stub `/api/auth/me` | 200. Authorization, cookie and CSRF header forwarded; the backend's `Set-Cookie` returned to the browser |
| `POST /api/railway/documents/upload` (multipart, 4 KB) | stub `/api/documents/upload` | 200; the full multipart body was streamed through |
| `GET /uploads/x.png` | stub `/uploads/x.png` | 200 |
| `GET /api/health` with `Origin: https://evil.example` | frontend | 200, no `Access-Control-Allow-Origin` header |
| SPA route `/teaching/dashboard` | frontend | 200, `index.html` |

The stub logged only those three proxied requests. No other host was contacted, and none could be: the network was internal-only.

**How authentication works in this app:**
- It uses a Bearer token kept in `localStorage`. The backend sets no auth cookies and has no CSRF middleware: `cookie-parser`, `res.cookie` and csrf don't appear in `backend/src`.
- The proxy still forwards any cookie or CSRF header unchanged, as the table shows.
- The proxy strips `Origin`, so browser traffic is same-origin at the frontend. The backend's CORS allow-list applies only to direct cross-origin calls.

## 4. Legacy direct-provider routes

The staging container returned **404 "Not available in staging"** for:
- `POST /api/gemini/generate`
- `POST /api/avatar/config` (tested with an SSRF-style `apiEndpoint`)
- `GET /api/avatar/list`
- `POST /api/avatar/session/new`

These handlers are blocked before any provider code runs, and the provider keys they need are refused at startup. The tutor's avatar calls (`avatarFetch`) go through `/api/railway` to the backend's `/api/avatar`, which is metered by the AI Gateway.

Legacy frontend callers:
- `pages/EnaraCreditManagement.tsx` gets the 404 and shows its static fallback report;
- the `services/geminiService.ts` same-origin fallback is not proxied and fails closed.

## 5. Environment guards (review)

| Area | Backend (`ENARA_STAGING=true`) | Frontend |
|---|---|---|
| Mode | `NODE_ENV=development` (Option A), checked by the runbook and the template | `NODE_ENV=production` enforced by the guard; set in `Dockerfile.staging` |
| Database | name must be `enara_staging_alpha`; checked again after connecting | n/a |
| `.env` | a loaded `.env` is refused | none in the image; the build comes from git, where `.env` files are ignored |
| CORS | explicit list required, which must include `FRONTEND_URL`; no wildcards, no empty entries, no existing-deployment domains | open `cors()` disabled |
| Migrations | `RUN_MIGRATIONS_ON_START` must be `false` | n/a |
| Storage | staging bucket or path required; partial R2 settings refused | n/a |
| Secrets | three distinct secrets, each at least 32 characters | provider keys must be unset |
| AI / registration | paused and invite-only by default; email only to the test inbox; demo mode off | legacy provider routes return 404 |
| Budget (P0d, set later by an ENARA admin) | monthly USD 15, daily 6, per user per day 6, grading allowance 3 (not an absolute cap) | — |

Covered by `p6StagingGuard` (14 tests) and `p6FrontendStaging` (7 tests).

## 6. Workflows

`.github/workflows/deploy-vercel.yml` deploys only on pushes to `main` or `connect-backend`; pull requests run checks only. A `staging-alpha` push triggers no deployment. There are no Railway, Render or Cloudflare workflows, and `backend/.github/workflows/keep-alive.yml` isn't at the repository root, so it doesn't run.

## 7. Proposed Git commands (NOT run — require owner approval)

```bash
cd /home/user/enara-sandbox
git switch -c staging-alpha                      # from cef491a; carries the working tree unchanged
git add --pathspec-from-file=docs/benchmarks/diagnostics/20261028T205447Z-staging-alpha-release-candidate/RELEASE_FILES.txt
git add docs/benchmarks/diagnostics/20261028T205447Z-staging-alpha-release-candidate/
git diff --cached --name-only | grep -E '(^|/)\.env|artifacts/|node_modules|/dist/|\+~' && echo "STOP: unexpected file staged"
git diff --cached --stat | tail -1                # expect 175 files
git commit -m "ENARA Integrated Alpha: P0–P6, conversation exam, Railway staging config"
# --- STOP: owner reviews the commit before publishing ---
git push -u origin staging-alpha                  # never main / connect-backend
```

Excluded work stays uncommitted in the working tree: demos, benchmarks, plans and the empty `+~` files.

On Railway, link both services to `staging-alpha` with auto-deploy off, and deploy that exact commit.

## 8. Remaining blockers

1. Owner approval to create, commit and push `staging-alpha`, and a decision on whether to include `docs/plans/`.
2. Runbook STOPs 1–3: Railway plan and cost; the MongoDB staging user and its scope checks; the R2 bucket and its scoped token; staging secrets.
3. Container build and the health check on Railway itself are unverified until the first deploy.
4. Unpausing AI requires a separate go-ahead.

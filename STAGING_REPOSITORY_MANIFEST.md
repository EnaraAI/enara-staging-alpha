# ENARA Staging Alpha: Repository Manifest

| | |
|---|---|
| Approved source | `EnaraAI/enara-sandbox` @ `544c6ec7e8139961a8629fa9abb7a01ef8a67160` (branch `staging-alpha`) |
| Method | `git archive` of that commit (verified blob-for-blob: 1,223 files), then the removals and additions below. Fresh Git history; no original history, branches or remotes |
| Inventory | `REPOSITORY_FILES.txt` (570 paths, including this file) |

## 1. Removed from the approved snapshot (663 files)

| Group | Files | Reason |
|---|---|---|
| `.github/workflows/deploy-vercel.yml` | 1 | deploys the existing Vercel sandbox on `main`/`connect-backend`. **No workflows are included** |
| `backend/.github/workflows/keep-alive.yml` | 1 | pings the existing Render backend every 14 minutes |
| `backend/vercel.json`, `backend/api/index.js`, `backend/.vercelignore`, `frontend/vercel.json`, `frontend/.vercelignore` | 5 | Vercel deployment configs; the frontend rewrites target the sandbox backend |
| `backend/render.yaml` | 1 | existing Render service config |
| `backend/wrangler.jsonc`, `backend/worker/`, `frontend/wrangler.jsonc`, `frontend/worker/` | 5 | Cloudflare Workers configs and entry points (the frontend `tsconfig` already excludes `worker/`) |
| `backend/railway.toml` | 1 | legacy Railway config for the existing service. Staging uses `backend/railway.staging.toml` |
| `backend/hooks/*.sample`, `backend/refs/heads/master` | 15 | stray Git-internal files, not referenced |
| `docs/benchmarks/**` research runs | 494 | benchmark research; not read by the build or tests |
| `scripts/benchmarks/**` | 96 | Python research tooling (one file is kept; see §2) |
| `tests/benchmarks/**` | 44 | Python research tests; not part of the app test suite |

## 2. Kept because tests or operators need them

- `docs/benchmarks/diagnostics/20261029T*-source-provenance/` (11 folders) and `20261028T090000Z-hybrid-v1-production-readiness/` (the V1 freeze manifest): read by `p0cReviewFixes`, `p6Validation` and `candidateV2/v1GraderCompat`.
- `scripts/benchmarks/run_grading_eval.py` (the version at `544c6ec`): hashed by `src/scripts/sourceProvenance.ts`, so the provenance test needs it. It is never run automatically. Run by hand, it drives paid grading through the adapter's `--budget` guard, so don't run it in staging.
- Staging runbooks and release evidence: `20261028T133812Z-staging-readiness/`, `20261028T134450Z-staging-preflight/`, `20261028T140412Z-railway-staging-preflight/`, `20261028T203644Z-railway-two-service-staging/`, `20261028T205447Z-staging-alpha-release-candidate/`, and `ENARA_DEPLOYMENT_INVENTORY_REPORT.md`.
- `.github/scripts/check-bundle-secrets.sh`: a local secret check for the built bundle. It is a script, not a workflow.
- `backend/eval/`, `backend/perf/`: offline developer tools, unchanged. They are not wired to startup or CI, and `elie-tutor-eval` needs an explicit manual run.

## 3. Added after the approved snapshot (reviewed, tested)

| File | Origin | Category | Why / behavior | Verified by |
|---|---|---|---|---|
| `backend/src/config/stagingSingleService.ts` (new) | free-tier work | safe, optional | single-service mode: serves the built SPA (never shadows `/api`, `/uploads`, `/health`, `/ready`); removes CSP only on SPA files; `/api/gemini` returns 404. Idle Mongo disconnect and reconnect so Railway app sleeping can work | `p6SingleService` (9 tests), Docker run |
| `backend/src/config/db.ts` | free-tier work | safe, optional | `openMongo()` split out, so every reconnect re-checks the staging database name | `p6StagingGuard`, `p6SingleService` |
| `backend/src/config/env.ts` | free-tier work | safe, optional | `SERVE_FRONTEND_DIR`, `DB_IDLE_DISCONNECT_MS` (30 s to 1 h). Read **only** when `ENARA_STAGING=true`; unset means no behaviour change | `p6SingleService` |
| `backend/src/app.ts` | free-tier work | safe, optional | wires the two features in only when configured | full suite |
| `frontend/services/railwayApi.ts` | free-tier work | safe, necessary for single-service | the browser base follows `VITE_API_URL` (default `/api/railway` unchanged) | `p6SingleService`, frontend build |
| `Dockerfile.staging-single`, `railway.staging-single.toml`, `.dockerignore` (new, root) | free-tier work | safe, optional | one image: SPA built with `VITE_API_URL=/api` plus backend with dev dependencies pruned; runs as `node`; no secrets or `NODE_ENV` baked in | image built and run locally |
| `docs/.../20261028T213000Z-free-tier-staging-architecture/` | free-tier work | documentation | free-tier options and the USD 0 Railway plan; states the limits honestly | — |
| `backend/staging.env.template` | ignored `backend/.env.staging.example` | documentation | variable names; every secret is blank. Renamed so it is clearly not an env file | inspected |
| `README.md` (rewritten), `.gitignore` (appended), this manifest, `REPOSITORY_FILES.txt` | new | — | repository identity and safety notes | — |

**Effect on the checklist areas:**
- **Not changed:** the staging guards, AI Gateway, usage ledger, P0d budgets (15 / 6 / 6 / 3), AI-pause defaults, auth, cookies, CSRF pass-through, uploads (R2), retries, data retention, cron, grading paths, and the `package.json` and lockfiles.
- **Idle disconnect:** ends process-level database traffic while idle, so Railway can sleep the service. Startup, shutdown and health checks are unchanged.

## 4. Not transferred from the original working tree

| Group | Files | Reason |
|---|---|---|
| `artifacts/demos/` | 210 | demo videos, audio and recordings; no runtime or test dependency |
| `docs/benchmarks/` research (untracked) | 43 | benchmark run outputs |
| `docs/plans/4level1-ai-workspace/` | 7 | excluded from the release by owner decision |
| modified `scripts/benchmarks/run_grading_eval.py`, modified `tests/benchmarks/test_additional_datasets.py`, new `scripts/benchmarks/diagnostics/math_benchmark/run_enara.py` | 3 | research changes; the app doesn't need them. The committed version of `run_grading_eval.py` is kept (§2) |
| `+~`, `backend/+~` | 2 | empty files, referenced by nothing |
| ignored files (`.env`, `.env.local`, `node_modules`, `dist`, `data/`, `.vercel/`, `backend/demo-server.local.ts`, caches) | — | never included |

## 5. Vercel update (second commit, owner decision 2026-10-29)

| File | Change | Verified by |
|---|---|---|
| `vercel.json`, `api/index.js`, `package.json` (new, root) | one Vercel project: SPA built with `VITE_API_URL=/api`, backend as one function (`iad1`, 60 s). No crons, no external rewrites; only `staging-alpha` deploys | `p6VercelStaging`, local build, handler run |
| `backend/src/config/stagingGuard.ts` | on Vercel, refuses to start without all four `R2_*` or with `SERVE_LOCAL_UPLOADS=true` (all files in R2). In staging, refuses `TRUST_PROXY=true` (requires a hop count), because `true` lets clients spoof their IP and bypass rate limits | `p6VercelStaging` (9 tests), `p6StagingGuard` |
| `backend/staging.env.template` | `TRUST_PROXY=1` | — |
| `backend/test/p6VercelStaging.test.ts` (new) | the tests above | full suite 746/746 |
| `docs/benchmarks/diagnostics/20261029T070000Z-vercel-staging/VERCEL_STAGING_RUNBOOK.md` (new) | steps, limits (4.5 MB request body), R2 CORS, rollback | — |

Hobby terms: non-commercial use only. The owner accepted this for staging.

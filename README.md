# ENARA Integrated Alpha: staging deployment source

This private repository is the **isolated deployment source for the ENARA Integrated Alpha staging environment** on Railway. It is not the development repository, and it is never deployed to production.

- **Source:** a clean snapshot of the approved release commit `544c6ec7e8139961a8629fa9abb7a01ef8a67160` (branch `staging-alpha` of `EnaraAI/enara-sandbox`), plus reviewed staging-only changes. This repository does not include the original history. See `STAGING_REPOSITORY_MANIFEST.md`.
- **Deployment:** chosen host is **Vercel Hobby** (one new project linked only to this repository; production branch `staging-alpha`; `main` never deploys). Runbook: `docs/benchmarks/diagnostics/20261029T070000Z-vercel-staging/VERCEL_STAGING_RUNBOOK.md`. There are no GitHub Actions workflows. Deploy only after owner approval. The Railway configs are kept as an unused alternative.
- **Storage:** all files are stored in the R2 bucket `enara-staging-alpha-uploads`. In staging the backend refuses to start without R2, on any host.
- **Unscanned documents (owner decision, 2026-10-29):** files kept as `not_scanned_by_policy` can be downloaded by staff who can see them. The link carries a not-scanned warning and the page asks for confirmation. Pending, failed and infected files are never downloadable. Raw files are never sent to AI.
- **Secrets:** none are stored here. Every credential is set by hand on the Railway service. `backend/staging.env.template` lists the variable names; every secret in it is blank.

## Targets (configuration names; nothing is created by this repository)

| Item | Name |
|---|---|
| Railway project | `enara-staging-alpha` |
| Services (two-service topology) | `enara-staging-backend` (root `backend`, config `/backend/railway.staging.toml`) and `enara-staging-frontend` (root `frontend`, config `/frontend/railway.staging.toml`, `Dockerfile.staging`) |
| **Vercel (chosen)** | root `/`, `vercel.json`: static SPA plus one function `api/index.js` for `/api`, `/uploads`, `/ready`, `/health` |
| Optional single-service topology (USD 0 plan) | root `/`, config `/railway.staging-single.toml`, `Dockerfile.staging-single` |
| Database | `enara_staging_alpha` (user restricted to this database) |
| Upload bucket | `enara-staging-alpha-uploads` (R2 token restricted to this bucket) |

## Safety properties (enforced in code)

- **Backend** (`ENARA_STAGING=true`, `NODE_ENV=development`) refuses to start unless all of these hold:
  - the database is exactly `enara_staging_alpha` (checked again after connecting);
  - no `.env` file is loaded;
  - three distinct secrets of 32+ characters are set;
  - all four `R2_*` are set for a bucket named with `staging` (files are stored only in R2; no local-disk fallback);
  - `RUN_MIGRATIONS_ON_START=false`;
  - CORS is an explicit list that includes `FRONTEND_URL`, with no wildcards and no existing production or sandbox domains.
- **Backend defaults in staging:** AI paused, invite-only registration, demo mode off.
- **Frontend** (`ENARA_STAGING=true`, `NODE_ENV=production`) refuses to start unless `BACKEND_URL` is an HTTPS (or `*.railway.internal`) staging backend that is not localhost and not an existing ENARA deployment. Provider keys must be unset.
- **Frontend in staging:**
  - open CORS is off;
  - the legacy direct Gemini and Avatar routes return 404;
  - the browser calls only its own origin.
- **AI Gateway metering, the usage ledger and P0d budgets are unchanged.** The initial staging budget for the synthetic school is monthly USD 15, daily 6, per user per day 6, grading allowance 3. The grading allowance is not an absolute cap, so don't run grading smoke tests.

## Runbooks

`docs/benchmarks/diagnostics/`:

| Folder | Contents |
|---|---|
| `20261028T203644Z-railway-two-service-staging/` | two-service runbook, STOP points, rollback |
| `20261028T213000Z-free-tier-staging-architecture/` | USD 0 options and their limits |
| `20261028T205447Z-staging-alpha-release-candidate/` | original release manifest and verification |
| `20261029T*-source-provenance/` | provenance snapshots (required by tests) |

## Local checks

```bash
cd backend && npm ci && npx tsc --noEmit && npm run build && npx vitest run
cd ../frontend && npm ci && npx tsc --noEmit && npm run build
```

Tests use an in-memory MongoDB and mocked providers. They make no network or AI calls.

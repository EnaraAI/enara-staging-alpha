# ENARA Integrated Alpha — `staging-alpha` Release Manifest

Prepared 2026-10-28. This is a review document only: no branch was created, nothing was committed, pushed or deployed. The exact file list is `RELEASE_FILES.txt` in this folder (172 paths, plus the 3 files in this folder).

## 1. Base and working tree

| Item | Value |
|---|---|
| Current branch / HEAD | `feature/conversation-exam` @ `cef491a` (none of P0–P6 or the staging work is committed) |
| Working-tree entries | 437 paths with `-uall` (211 entries at directory granularity): 81 modified tracked files, the rest untracked |
| Ignored files relevant to release | `backend/.env`, `.env.local`, `backend/.env.staging.example` (template; not needed in the build), `backend/demo-server.local.ts`, `backend/.vercel/`, `frontend/.vercel/`, `backend/dist/`, `frontend/dist/`, `node_modules/`, `data/`, `backend/eval/results/`, `__pycache__/`. **All stay out** — ignored files are never added by the proposed commands |

## 2. Required files (in `RELEASE_FILES.txt`)

| Group | Paths | Purpose |
|---|---|---|
| Backend source (97) | `backend/src/**` — modified + new | P0a–P0d AI Gateway, metering, usage ledger, price catalogue, budgets; P1 access/accounts/invitations; P2 documents and no-scanner policy; P3 educator chat; P4 speaking exams, connected workflow, outcomes; P5 usage/credits; P6 validation; conversation exam; staging guard (`config/stagingGuard.ts`, `config/env.ts`, `config/db.ts`); migrations (`migrations/index.ts`); seed (`scripts/seed4Level1.ts`); provenance (`scripts/sourceProvenance.ts`) |
| Backend tests (24) | `backend/test/**` (22 new, `phase3.autograding.test.ts` modified, `candidateV2/v1GraderCompat.test.ts` fixed this task) | regression for all of the above |
| Backend deploy config | `backend/railway.staging.toml` | Nixpacks, `/ready`. Existing `railway.toml` untouched |
| Frontend (32) | `frontend/App.tsx`, `pages/**`, `components/**`, `services/**`, `worker/tsconfig.json`, `tsconfig.json`, `server.ts`, `stagingGuard.ts`, `Dockerfile.staging`, `railway.staging.toml` | P1–P5 UI, staging proxy/guard, container |
| Provenance snapshots (11 dirs) | `docs/benchmarks/diagnostics/20261029T*-source-provenance/` | **required by tests**: `p0cReviewFixes` and `p6Validation` read them (a clean export without them fails) |
| Staging docs | `20261028T133812Z-staging-readiness/`, `20261028T134450Z-staging-preflight/`, `20261028T140412Z-railway-staging-preflight/`, `20261028T203644Z-railway-two-service-staging/`, `ENARA_DEPLOYMENT_INVENTORY_REPORT.md`, this folder | runbooks and evidence |

## 3. Dependencies and migrations

- **Dependencies:** no `package.json` / `package-lock.json` changes in backend or frontend. `npm ci` from the committed lockfiles succeeded in a clean export. No new dependency needs approval.
- **Migrations (additive, manual only; `RUN_MIGRATIONS_ON_START=false`):** in `backend/src/migrations/index.ts`, new since HEAD:
  - `2026-10-28-price-catalog-v1`
  - `2026-10-29-avatar-session-retention`
  - `2026-10-29-p0d-budget-indexes`
  - `2026-10-29-p1-account-token-indexes`
  - `2026-10-29-p2-document-indexes`
  - `2026-10-29-p3-educator-chat-indexes`
  - `2026-10-29-p5-usage-indexes`

  The earlier ids are already at HEAD. Run with `npm run migrate -- --status`, then `npm run migrate`, only at runbook STOP 4.

## 4. Excluded (unrelated or local)

| Path | Reason |
|---|---|
| `artifacts/demos/**` (210 files, videos/audio/recordings, demo servers) | demo production material; large binaries; contains demo AI call logs |
| `docs/benchmarks/diagnostics/*` research runs (rubric-engine, AC experiment, concept-state, hybrid confirmatory, math MB1; 44 files) | benchmark research, not runtime |
| `scripts/benchmarks/run_grading_eval.py`, `scripts/benchmarks/diagnostics/math_benchmark/run_enara.py`, `tests/benchmarks/test_additional_datasets.py` | Python benchmark tooling |
| `+~`, `backend/+~` | empty stray files (0 bytes) |
| all ignored files (§1) | secrets, builds, local data |

## 5. Needs owner review (included unless you say otherwise)

1. `docs/plans/4level1-ai-workspace/` (7 planning docs) — **excluded by default**; add if you want the plan versioned with the release.
2. `backend/src/scripts/gradingEvalAdapter.ts` — benchmark adapter; the change (unpriced cost → `null`) is part of P0c and compiles with the rest of `src`. Included.
3. `backend/test/candidateV2/v1GraderCompat.test.ts` — narrow fix made in this task: the test silently depended on the local `backend/.env` for `JWT_SECRET`/`INGEST_HMAC_SECRET`; it now sets test-only values. Included.
4. Legacy frontend code kept as is (tracked, unchanged): `pages/EnaraCreditManagement.tsx` calls `/api/gemini/generate` (404 in staging; falls back to a static report) and `services/geminiService.ts` has a same-origin fallback to `/api/me/tutor/sessions` (not proxied; fails closed). Neither can reach a provider.

## 6. Missing files / broken dependencies

- Found and resolved: the provenance snapshot dirs were required by tests; now in the manifest.
- Found and fixed: the `.env` dependency in `v1GraderCompat`.
- None remaining. A clean export (`git archive HEAD` + `RELEASE_FILES.txt`) installs, type-checks, builds and passes the full suite (see the verification report).

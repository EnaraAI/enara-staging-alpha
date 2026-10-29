# P13.1: staging learning journey verification

**Date:** 2026-10-29 (checks run 16:20–16:25 UTC) · **Repo:** `EnaraAI/enara-staging-alpha` · **Branch:** `staging-alpha` · **HEAD:** `cc8530f` · **Staging:** `https://enara-staging-alpha.vercel.app`

**Mode:** read-only.
- No login and no authenticated requests.
- No provider calls.
- No environment-variable values read.
- No changes to code, config, data, flags or deployments.
- Only this new folder was written.

**Labels:** VERIFIED, INFERRED, NOT VERIFIED, BLOCKED, FAILED.

## Executive summary

**Where P12's live calls ran: a direct provider runner, not the deployed Vercel app (VERIFIED).**
- The P12 entry point (`backend/src/scripts/p12LiveJourney.ts`) builds ENARA's app in-process (`createApp()` + supertest).
- It runs on a throwaway in-memory MongoDB and refuses any other database.
- In live mode, outbound HTTP may reach only `api.anthropic.com`.
- The source has no reference to any `vercel.app` URL. No P12 artifact contains a Vercel deployment id or URL.
- So nothing in P12 can be tied to deployment `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`.

**The deployed app cannot call the provider today (VERIFIED).**
- There is no `ANTHROPIC_API_KEY` in any Vercel environment: production has 20 names; preview and development have none.
- There is no model override, and no orchestrator or AI-engine URL.
- In the code, drafts, grading and tutor all require that key. The only non-Anthropic tutor path (the ENARA orchestrator) has no URL configured.

| Decision | Verdict |
|---|---|
| **P12 isolated learning journey** | **SUPPORTED WITH LIMITATIONS.** The local evidence backs the reported result. 9 real-provider attempts (1 Sonnet, 8 Opus) total $0.112112 in five independent places. The limitations are listed below. |
| **Deployed Vercel staging learning journey** | **NOT VERIFIED.** Its AI-dependent stages are **BLOCKED** on the deployment (no provider key). Nothing has shown the deployed app executing any provider-backed step. |

## Scope and method

What I checked:
- Repository state.
- Read-only source review of the P12 harness and the AI and config code.
- The local P12 artifacts, with hashes and a ledger recomputation.
- Three permitted public GETs (`/`, `/health`, `/ready`).
- Read-only Vercel metadata: alias inspection and variable **names**.

Full details are in `checks.json` (C1–C10) and `evidence_inventory.md`.

**Deliberately not run:**
- Login or any authenticated request (flags, router state, school pause, chat, tutor, assessments, uploads, cron).
- Guessed routes.
- Any provider call or P12 re-run.
- Reading any variable value, including `NODE_ENV`, `ENARA_STAGING`, `AI_PAUSED` and `MONGODB_URI`.
- Database access.
- Provider console or invoice.

## Journey-stage matrix

| # | Stage | Deployed Vercel staging | P12 isolated runner | Evidence | Still needed for the deployed claim |
|---|---|---|---|---|---|
| 1 | Staging deployment serves the app | **VERIFIED** (`GET /` 200; alias → `dpl_GUdo…`, Ready) | n/a | checks C1, C4 | — |
| 2 | Health and readiness | **VERIFIED**, with a caveat: `/health` and `/ready` are 200; `mongo ok` is a live connection; **`postgres ok` does not prove a connection** (reported ok when `DATABASE_URL` is unset and not in production; no such name exists) | n/a | C2, C3; `backend/src/app.ts:176-195` | Database identity: is `MONGODB_URI` a dedicated staging server? (NOT VERIFIED: names don't prove isolation) |
| 3 | Authentication and teacher identity | **NOT VERIFIED** (no login allowed) | Signed test tokens in-process (not a real login) | C7 | An approved synthetic staging test account |
| 4 | Tenant and class scope selection | **NOT VERIFIED** | VERIFIED in-process (other-school assign → 404; analytics scoped to 1 class) | P12 `P12_RUN_RESULT.json` steps 4, 12 | Authenticated cross-school probes on staging |
| 5 | Document and content retrieval | **NOT VERIFIED** | VERIFIED in-process (upload, extract, passage cited; F-10 fallback did not fire) | P12 steps 1–3 | Staging upload to the R2 staging bucket, then retrieval |
| 6 | AI tutor or chat provider call | **BLOCKED** (no `ANTHROPIC_API_KEY`; no orchestrator URL) | VERIFIED real provider (`claude-opus-5-5`, 1 attempt, request id present) | C5, C6; P12 ledger attempt 4 | A provider key on staging (approval), a budget, a test account |
| 7 | Assessment draft generation | **BLOCKED** (no key) | VERIFIED real provider (`claude-sonnet-5-5` via a harness-local override; staging would default to Opus) | C5, C6; P12 attempt 1 | Same as 6, plus a decision on the model setting |
| 8 | Assessment attempt and submission | **NOT VERIFIED** | VERIFIED in-process (deterministic) | P12 steps 5, 10 | Test account and a synthetic class on staging |
| 9 | Autonomous grading and finalization | **BLOCKED** for AI-graded items (no key); deterministic multiple choice NOT VERIFIED | VERIFIED real provider (6 Opus grading attempts); one result held by the feedback-leak safeguard (raw step 10 = FAIL) | P12 attempts 2–3 and 5–9; app log `grading_failed` | Key, test account; a retry scheduler (none in `vercel.json`) |
| 10 | Learning-gap identification | **NOT VERIFIED** | VERIFIED in-process (deterministic; mastery state not captured) | P12 step 8 | Authenticated staging run |
| 11 | Intervention or practice assignment | **NOT VERIFIED** | VERIFIED in-process (intervention 201, start 200) | P12 step 9 | Authenticated staging run |
| 12 | Reassessment | **NOT VERIFIED**; its AI grading **BLOCKED** | PARTIAL in-process (2 of 3 attempts released) | P12 step 10 | As for 9 |
| 13 | Outcome and learning-evidence persistence | **NOT VERIFIED** | VERIFIED in-process, in a throwaway DB that no longer exists | P12 steps 8, 11, 12 | Authenticated staging run with persistent synthetic data |
| 14 | Usage and spend ledger | **NOT VERIFIED** (no deployed calls; staging ledger not readable without login) | VERIFIED: $0.112112 in five places (see below) | C9 | Staging `usage_ledger` read plus a provider-console check after an approved run |
| 15 | Role and feature-flag enforcement | **NOT VERIFIED** (flags, router state and pause need authenticated reads) | VERIFIED in-process for the synthetic school only (router flag off; analytics made 0 provider calls) | P12 step 12; harness source | An authorized read of staging flags (router must stay off) |

**Stub use:** no live-mode stage used a stub. Every provider-backed step shows a real reply: model echoed, provider request id, token usage. The stub provider was used only in `…/p12-live-e2e/dry-run/`, which ran after the live run with a post-fix harness.

## Contradictions and corrections to prior summaries

1. **"LIVE-PROVIDER-VERIFIED" was about the runner.** It meant a real provider was called by an isolated local runner. It does **not** mean the deployed staging app called the provider; it cannot, without a key.
2. **"PostgreSQL healthy" (P13 excerpt) is overstated.** `/ready` reports `postgres: ok` without a connection when no `DATABASE_URL` is set outside production. No such variable name exists. Postgres health is **NOT VERIFIED**.
3. **Variable count.** P13 listed 16 production names; the full list is 20. The relevant absences (key, model overrides) are unchanged.
4. **Deployment ↔ commit** is **INFERRED**, not VERIFIED (CLI deploys carry no commit metadata).
5. **`ENARA_STAGING` presence** does not prove database isolation. The staging guard checks the database *name* in `MONGODB_URI`, and only when the value is true, which was not read.

## Spend

- **P12 historical spend (VERIFIED from local artifacts):** $0.112112. It matches across:
  - a recomputation from token counts at catalogue rates;
  - cap ledger `spentUsd`;
  - per-call CSV (cap column and usage-ledger column);
  - the sum of 9 app-log `ai_call` costs.

  9 attempts = 9 CSV rows = 9 app-log calls; all `ok`; events `start`/`finish` only, no STOP. **Limitations:** the usage-ledger values and P0d reservation count were exported by the harness from a database that no longer exists, and no provider invoice was checked.
- **Deployed-staging spend: none evidenced.** With no key, no provider calls are possible from the deployment (INFERRED from configuration). The staging usage ledger and provider console were not read, so "$0" is **NOT VERIFIED**. P12 spend must not be counted as staging spend.

## P12 limitations (carried forward, unchanged)

- The P12 evidence and harness are untracked (not in GitHub).
- The run-time harness version was never hashed; it was edited after the run.
- The pre-live dry runs were not kept.
- Raw step 10 = FAIL (feedback-leak hold), presented elsewhere as PARTIAL.
- Mastery state was not captured.
- Provider payloads were not retained.

## Smallest safe follow-up for the deployed journey

Every item below needs your **explicit approval**. None was done in P13.1.

| Step | Gated action | Approval needed |
|---|---|---|
| 1 | Authorized **read-only** check of staging flags (router off), school pause and AI pause | Use of a synthetic staging admin or teacher test account |
| 2 | Confirm `MONGODB_URI` points to a dedicated staging database server (by its owner, without exposing the value) | Owner confirmation; no value disclosed |
| 3 | Create a **staging-only** provider key with a **provider-side spend limit** (for example $2) and add it to Vercel production as `ANTHROPIC_API_KEY` | Key creation, environment change, spend budget |
| 4 | Decide the staging model setting (drafts would use Opus by default; Sonnet needs a per-feature setting, which is a code change) | Model decision; code change and deploy if per-feature |
| 5 | Redeploy so the key takes effect | Deployment |
| 6 | Run the journey **over HTTPS against the deployed app** with synthetic data only. Record the deployment id and request ids, and keep the cap and ledgers. | Paid-call budget; authenticated test account |
| 7 | Reconcile the staging `usage_ledger` with the provider console | Read access to both |
| 8 | Optional, before a pilot: add a retry schedule for held gradings (a cron for `/api/cron/daily`) | Config change and deployment |

Until steps 3–7 are done, keep the router off and treat every AI stage on staging as BLOCKED.

## Files in this folder

- `P13_1_REPORT.md`: this file.
- `evidence_inventory.md`: paths, commit and deployment ids, sources.
- `checks.json`: machine-readable checks C1–C10, checks not run, decisions.

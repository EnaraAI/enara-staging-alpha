# P13.2: staging isolation and deployment configuration audit

**Date:** 2026-10-29 (checks 16:28–16:40 UTC) · **Repo:** `EnaraAI/enara-staging-alpha` · **Branch:** `staging-alpha` · **HEAD:** `cc8530f171303a035a9a380b076d349f786d2297` (as expected; equals `origin/staging-alpha`)

**Mode:** read-only.
- Only Vercel metadata, environment-variable **names and scopes**, and repository source and docs were inspected.
- No values were read. No application requests were made (authenticated or otherwise). No provider calls, no database access, no changes.
- The only new files are in this folder.

## Executive summary

**Staging isolation is NOT VERIFIED.** The deployment is the production target of a dedicated Vercel project, `enara-staging-alpha`. It is the only project in the only Vercel scope this CLI can see, and all 20 of its variables are Production-scoped.

Every isolation protection in the code is **conditional**: it runs only when `ENARA_STAGING` is truthy, and that value cannot be confirmed without reading it.
- **The guard checks names, not hosts.** It checks the database name in `MONGODB_URI`, the R2 bucket name, secret length and distinctness, and settings. It never checks the MongoDB host or cluster, or whether secrets differ from production.
- **Several defaults fail open when staging mode is off.** Migrations run on every cold start unless `RUN_MIGRATIONS_ON_START` is exactly `"false"`. Local-upload serving defaults on whenever `NODE_ENV` isn't `production`.
- **AI pause is off.** `AI_PAUSED` was deliberately set to `false` earlier today at the owner's request, and the global pause switch was set off. AI cannot run only because no provider key or path is configured.

**The most useful single fact.** The guard runs at module load and again after the database connects, so a failing guard stops every request. Since the app is serving, **if** an operator confirms that `ENARA_STAGING` is truthy, all name-level guard conditions are proven to hold. That would still leave host, cluster and production-secret separation to confirm.

| Decision | Verdict | Reason |
|---|---|---|
| **Authenticated, non-AI staging smoke tests** | **BLOCKED** | Logged-in requests write data (sessions, records). Which database and storage they write to is unverified: staging-mode boolean, database identity, cluster separation, R2 bucket. This stays blocked until an operator confirms the derived facts below. |
| **AI-dependent staging tests** | **NO-GO** | Everything above, plus: no provider key or path, AI pause is off, no provider-side spend limit, no grading-retry schedule. |

## Evidence summary

| Area | Finding | Status |
|---|---|---|
| Alias → deployment | `enara-staging-alpha.vercel.app` → `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4` (`…-5slxrtmq9`), project `enara-staging-alpha` (`.vercel/project.json` matches), target **production**, Ready, created 13:48:23Z | VERIFIED |
| Projects and scopes | Vercel scopes visible to this CLI: 1 (`mohamedsaberelkholy-7299's projects`). Projects in it: 1 (`enara-staging-alpha`). No other ENARA project is visible here; any real ENARA production lives elsewhere (UNKNOWN). | VERIFIED |
| Variable scopes | 20 names, **all Production-scoped**; Preview 0, Development 0 (see the inventory) | VERIFIED |
| Implication | "Production" here is this staging project's own production target, as the runbook intends ("use the exact production domain of the staging project"). It is not shared with any other project by Vercel scoping. Whether the **values** are staging values is a separate, unverified question. Preview deployments of this project would get no variables. | VERIFIED (scope) / UNKNOWN (values) |
| Guard trigger | `isStagingMode()` = `ENARA_STAGING` matches `1`, `true` or `yes`. Otherwise **no guard runs** and nothing warns. | VERIFIED (source) |
| Guard timing | `backend/src/vercel.ts` calls `createApp()` at module load → `getConfig()` → `loadConfig()` → `assertStagingIsolation()` before any request. `connectDB()` runs on the first request, then re-checks the **server-reported database name** after connecting and disconnects if it is wrong. Migrations run after that check. | VERIFIED (source) |
| What the guard checks | Database name is `enara_staging_alpha` (path of the URI); all 4 `R2_*` set and bucket name contains "staging"; local uploads off; `TRUST_PROXY` not `true`; S3 bucket unset or staging; JWT, HMAC and cron secrets ≥ 32 characters and different **from each other**; CORS is an explicit allowlist with no known production or shared hosts and includes `FRONTEND_URL`; migrations on start `"false"`; invite-only not false; reminders need a test recipient; demo mode off | VERIFIED (source) |
| What it does **not** check | MongoDB **host or cluster**; Atlas project; whether secrets differ from production's; R2 account or ownership (name only); `AI_PAUSED` | VERIFIED (source) |
| `NODE_ENV` | Production mode would refuse to start without `DATABASE_URL`, `ENARA_API_KEY`, `ENARA_ORCHESTRATOR_URL` and `AI_ENGINE_URL` (`env.ts:226-240`). None of these names exist and the app serves, so `NODE_ENV` is not `production` (the runbook intends `development`). | INFERRED (strong) |
| Fail-open defaults | Migrations on start: ON unless exactly `"false"` (`db.ts:29`). Local uploads: default `!isProduction` = ON when not production (`env.ts:348-352`). AI pause and invite-only default ON **only in staging mode** (`env.ts:397-398`). Demo mode defaults OFF. Reminders run only if exactly `"true"`. | VERIFIED (source) |
| Intended values | Runbook `20261029T070000Z-vercel-staging/VERCEL_STAGING_RUNBOOK.md`: `ENARA_STAGING=true`, `NODE_ENV=development`, Atlas Free database `enara_staging_alpha` on a dedicated cluster, bucket `enara-staging-alpha-uploads`, migrations, demo, reminders and local uploads off, invite-only on, `AI_PAUSED=true` | REPORTED (doc), not runtime proof |
| Known deviation | `AI_PAUSED` set to `false` and the global pause set off on 2026-10-29 at the owner's request (scratchpad `ENARA_REPORT_2026-10-29.md` §6; deploy `dpl_GUdo…` is that redeploy) | VERIFIED (own action record) |
| Credential hygiene | The runbook says the R2 token and Atlas password were **pasted in chat** and must be rotated. Rotation status is unknown. | UNKNOWN |
| Network exposure | The runbook records an Atlas `0.0.0.0/0` allowlist (owner-approved, to be removed between sessions). Current state is unknown. | UNKNOWN |
| Cron | `vercel.json` defines no `crons`. `/api/cron/daily` needs `CRON_SECRET`. No scheduler is evidenced. | VERIFIED (file) / UNKNOWN (external schedulers) |
| Provider path | No `ANTHROPIC_API_KEY`, model override, `ENARA_ORCHESTRATOR_URL`, `ENARA_API_KEY` or `AI_ENGINE_URL` names | VERIFIED |

## Deployment safety matrix

| # | Item | Label | Evidence and reason |
|---|---|---|---|
| 1 | Alias maps to the intended project and deployment | **VERIFIED SAFE** | Alias → `dpl_GUdo…` of project `enara-staging-alpha`, the only project in scope, as the runbook intends |
| 2 | Deployment uses a staging-appropriate environment scope | **VERIFIED SAFE** (scope) | Production scope of a dedicated staging project, with no shared or other-project scope. Values are UNKNOWN (items 4–10). |
| 3 | `ENARA_STAGING` guard is guaranteed to execute | **VERIFIED UNSAFE** | The guard is opt-in (`isStagingMode`). If the value is missing or false, it is silently skipped, and no public or metadata signal shows staging mode. Whether it ran on this deployment is **UNKNOWN**. |
| 4 | Mongo database is dedicated to staging | **BLOCKED** | Needs the database name from the URI path (a derived, non-secret fact). It is enforced only if item 3 holds. |
| 5 | Mongo host or cluster isolated from production | **BLOCKED** | Never checked by code. The runbook claims a dedicated Atlas Free cluster (reported). Needs operator confirmation of the cluster or project identity. |
| 6 | R2 bucket dedicated to staging | **BLOCKED** | The name check is conditional (item 3) and name-only. The runbook names `enara-staging-alpha-uploads`. Needs the bucket name and token scope confirmed. |
| 7 | JWT, ingest-HMAC and cron secrets distinct from production | **BLOCKED** | The guard checks distinctness from each other only. Needs operator fingerprint comparison against production. |
| 8 | Startup migrations disabled or demonstrably safe | **UNKNOWN** | Default ON (`db.ts:29`). Safe only if the value is exactly `"false"` (runbook says `false`; the guard enforces it in staging mode). |
| 9 | Local-upload serving disabled or safely isolated | **UNKNOWN** | Default ON when not production (and `NODE_ENV` is inferred not production). Safe only if the value is false (runbook says false; the guard enforces it in staging mode). |
| 10 | Demo mode and invite-only registration safe | **UNKNOWN** | Demo defaults off, but invite-only defaults on only in staging mode. Values not read. |
| 11 | Reminder and cron jobs cannot act on production data | **UNKNOWN** | No Vercel cron schedule (verified). The endpoint is secret-gated. Reminders run only if `"true"`. Any job acts on whatever database item 4/5 resolves to. |
| 12 | AI safely paused, no deployed provider path | **VERIFIED UNSAFE** (pause) / VERIFIED SAFE (no path) | Pause deliberately off since today. No key or path, so no AI can run now. But adding a key would enable AI immediately, with only school budgets as a limit. |
| 13 | PostgreSQL readiness is truthful | **VERIFIED UNSAFE** (misleading) | `/ready` reports `postgres: ok` without a connection when `DATABASE_URL` is unset outside production (`app.ts:176-188`). By design (runbook "Option A"), but the label overstates. |
| 14 | No production data can be mutated by staging requests | **UNKNOWN** | Depends on items 3–7, which are unresolved |

**Critical findings:** items 3, 4, 5, 6 and 7 (isolation unproven), items 8 and 9 (fail-open defaults with unknown values), and item 12 (pause off).

## Derived facts an authorized operator should confirm

Confirm these **without disclosing any secret values**:
1. `ENARA_STAGING` is `true` (boolean).
2. `NODE_ENV` value (non-secret).
3. The database **name** in the `MONGODB_URI` path (expected `enara_staging_alpha`).
4. The Atlas **project and cluster name** behind `MONGODB_URI`, and that it differs from any production cluster.
5. `R2_BUCKET` **name** (expected `enara-staging-alpha-uploads`), and that the R2 token is scoped to that bucket only.
6. For `JWT_SECRET`, `INGEST_HMAC_SECRET` and `CRON_SECRET`: a yes or no on whether each differs from its production counterpart, for example by comparing locally computed SHA-256 prefixes. No values or full hashes shared.
7. Exact values of the non-secret switches: `RUN_MIGRATIONS_ON_START`, `SERVE_LOCAL_UPLOADS`, `DEMO_MODE_ENABLED`, `REGISTRATION_INVITE_ONLY`, `REMINDERS_ENABLED`, `TRUST_PROXY`.
8. That the R2 token and Atlas password pasted in chat earlier **have been rotated**, and the current Atlas network allowlist state.
9. That no external scheduler calls `/api/cron/daily` (or, if one does, its target and frequency).

**Shortcut:** if fact 1 is confirmed, facts 3, 7 (except `REMINDERS_ENABLED` when it is false) and the R2 naming in 5 are already proven by the running deployment, because the guard would otherwise block every request. Facts 4, 6 and 8 still need direct confirmation.

## Minimum next actions (each needs explicit operator approval)

1. **Operator confirmation** of derived facts 1–9 above. Read-only, by the account owner, with no values shared.
2. **Decide whether to re-pause AI** (`AI_PAUSED=true`, plus the global switch) until AI tests are approved. This is an environment change plus a redeploy.
3. If any of facts 1–7 fail: **fix the configuration** before any authenticated test. This is an environment change plus a redeploy.
4. Only after 1 (and 3 if needed): authenticated **non-AI** smoke tests with a synthetic test account. This needs separate approval.
5. AI-dependent tests remain NO-GO until a staging-only key with a **provider-side spend limit**, a model decision, a retry schedule and a paid budget are each approved.

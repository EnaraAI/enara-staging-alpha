# P14.1: Vercel staging gate closure plan

**Date:** 2026-10-29 (17:33–17:50 UTC) · **Repo:** `EnaraAI/enara-staging-alpha` · **Branch:** `staging-alpha` · **HEAD:** `cc8530f171303a035a9a380b076d349f786d2297` (= `origin/staging-alpha`)

**Working tree:** 0 tracked changes. **9 untracked items preserved:** the P12 harness ×3 and the P12, P13, P13.1, P13.2, P13.3 and P14 diagnostics folders. This folder is new.

**Mode:**
- No provider calls, no application requests, no secret values read.
- No external settings changed, no code changes, no commit, push or deploy.
- Sources: repository code and tests at HEAD, plus earlier artifacts:
  - P13.3: `docs/benchmarks/diagnostics/20261029T171132Z-p13-3-runtime-isolation-attestation/`
  - P14: `docs/benchmarks/diagnostics/20261029T172333Z-p14-vercel-live-ai-e2e/`

**Deployment under review:** `enara-staging-alpha.vercel.app` → `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`. It is unchanged since P14 (17:23Z): 20 Production-scoped variable names; no `ANTHROPIC_API_KEY`, model override or email variables.

## Summary

**The blocker list collapses to one keystone code fix plus a handful of operator actions.**

The keystone is to make the staging guard **fail closed** (R-C1). Once staging mode is guaranteed on this deployment, the existing guard already enforces, at startup and on every database connection:
- the staging database name;
- an R2 bucket whose name contains "staging", plus mandatory R2 with no local uploads;
- migrations off, demo off, invite-only on, reminders only with a test inbox;
- distinct secrets of at least 32 characters;
- a safe CORS setup and a proxy hop count.

That leaves only facts **no code can check**:
- the Atlas cluster's identity;
- the R2 token's scope;
- whether secrets differ from production;
- credential rotation;
- the provider-side spend limit.

These need operator attestation or external configuration.

**Two source findings change the cost plan:**
1. **Grading is never refused for budget** (`aiBudget.ts`, policy header lines 22–32). It moves from the ordinary caps to the grading allowance, then to an uncapped emergency overrun. The app cannot enforce a hard $5.
2. **Grading ignores AI pause.** The pause check applies only to non-grading calls (`reserveAiBudget`). This is asserted by `test/p6StagingGuard.test.ts:154`, "grading still runs while AI is paused". Once a provider key exists, any submitted open-response answer can trigger paid grading **even with pause on**.

So the **$5 hard stop must come from the provider side** (a dedicated staging key with a spend limit of $5 or less). Either a code change (R-C2) or a strict test procedure must keep grading inside the pause and caps.

## Step 1: blocker register

| # | Blocker | Current evidence | Status | Exact evidence to close | Closure type |
|---|---|---|---|---|---|
| 1 | Runtime isolation attestation | Only variable names (20, Production-scoped). No operator results returned. | **UNKNOWN** | P13.3 checklist items 1, 1a, 2, 3, 4a–c, 5a–b, 6a–d, 15 returned VERIFIED, as yes/no lines with evidence type and date | Operator attestation |
| 2 | Guard activation; fail-closed weakness | Guard runs only if `ENARA_STAGING` ∈ {1, true, yes} (`stagingGuard.ts:30-33`). No test covers a staging deployment with the flag off (`p6StagingGuard.test.ts`: 14 tests, all with the flag on or explicitly off). | **FAILED** (design) / **UNKNOWN** (runtime activation) | (a) R-C1 implemented, tested and deployed; then (b) item 1a: local guard script "staging mode: on, problems: 0" against the new deployment's values | Code change + owner approval + operator attestation |
| 3 | Atlas cluster/project and database isolation | Guard checks the database **name** only, in the URI path and post-connect (`db.ts:15-21`). Host and cluster are never checked. Runbook claims a dedicated Atlas Free cluster (REPORTED). | **UNKNOWN** | Items 3, 4a, 4b, 4c VERIFIED. Optional R-C3 (cluster pin) turns 4a into a startup check. | Operator attestation (+ optional code + new non-secret variable) |
| 4 | R2 bucket and credential isolation | In staging mode: all four `R2_*` required, bucket name must contain "staging" (`stagingGuard.ts`). Token scope is never checkable by code. | **UNKNOWN** | Items 5a, 5b, 15 VERIFIED | Operator attestation |
| 5 | Production vs staging secret separation; rotation | Guard checks only that the three secrets are long and differ from **each other**. Runbook line 49: the R2 token and Atlas password were pasted in chat and must be rotated. | **UNKNOWN** | Items 6a–6d VERIFIED (private equality test, yes/no) | Operator attestation; external change if rotation is still pending (then a redeploy and re-attestation) |
| 6 | Safe startup, migration, upload, demo, reminder and cron settings | Defaults fail open outside staging mode: migrations ON unless `"false"` (`db.ts:29`); local uploads default ON when not production (`env.ts:348-352`). The guard enforces safe values **only in staging mode**. Email **cannot send** (no `RESEND_API_KEY`/`REMINDER_FROM`: VERIFIED). No Vercel cron (VERIFIED). The secret-gated `/api/cron/daily` includes document retention deletes, but only for schools whose `pilotEndsAt` + retention days have passed (`documentRetention.ts:6-10`). | **UNKNOWN** (runtime) / **FAILED** (design defaults) | Items 7, 8, 9, 10, 11a, 11b, 13 VERIFIED. With R-C1 deployed, 7–10 and 13 become startup-enforced. 11b (no external scheduler) still needs attestation. | Operator attestation (+ R-C1) |
| 7 | Synthetic tenant, accounts, cleanup plan | Synthetic school `enara-staging-school` with teacher, academic manager, workspace admin and ENARA admin accounts exists from earlier setup (REPORTED, own records). **No student or no-access accounts.** Cleanup plan drafted in P14, not approved. | **BLOCKED** | Owner confirms the tenant is synthetic-only; approves creating `P14-` student and no-access accounts (an app write, done later in phase T2); approves the cleanup plan | Owner approval (+ later an authorized write) |
| 8 | Provider-side $5 hard limit | No `ANTHROPIC_API_KEY` on staging. No staging-only key or workspace limit evidenced. | **BLOCKED** | Operator creates a **dedicated staging key** in a workspace whose spend limit is ≤ $5, and confirms (yes/no) the limit amount and that the key belongs to that workspace only | External configuration + owner approval |
| 9 | App-side budget and reservation enforcement; compatible school limits | P0d reserves before every attempt (VERIFIED in source; P12 showed 9/9 reservations in an isolated run). School caps $6/day, $15/month, $3 grading allowance (REPORTED; own authenticated read today). **Grading is never refused** (VERIFIED in source), so the app cannot hold $5. | **FAILED** (as a $5 control) | R-O4 lowers the school caps (daily ≤ $5, monthly ≤ $5, grading allowance $0) **and** either R-C2 (strict budget in staging) or test procedure P-1 (no grading-eligible submissions before the AI phase). Item 8 remains the hard stop. | Owner approval + authorized admin write (+ optional code) |
| 10 | Effective AI pause; procedure for enabling staging-only AI | `AI_PAUSED=false` and global pause off since 2026-10-29 at the owner's request (REPORTED, own records); current values not re-read. Pause does **not** cover grading (VERIFIED in source and tests). The global switch has **no read endpoint**; school pause is readable only by an authenticated ENARA admin; env value not exposed. | **FAILED** (pause off; grading bypass) / **UNKNOWN** (current values) | Operator decision and attestation: env pause state, global switch, school switch. An approved procedure (R-O5) for turning AI on only for the T3 window and back off after. Optional R-C4 (log effective pause booleans) for observability. | Owner approval + external config + operator attestation (+ optional code) |

## Step 2: control effectiveness (from source and tests)

| Question | Answer | Evidence |
|---|---|---|
| Staging startup fails closed when staging identity is missing or invalid? | **No.** Without a truthy `ENARA_STAGING`, nothing runs and nothing warns. With it, the guard fails closed at module load and on connect, before migrations. | `stagingGuard.ts:30-33, 107-110`; `env.ts` (guard call); `vercel.ts`; `db.ts:7-36`; `p6StagingGuard.test.ts:101-127` |
| Database and cluster identity pinned? | **Database name** pinned in staging mode (URI path + server-reported name). **Cluster/project not pinned.** | `stagingGuard.ts:35-45, 54`; `db.ts:15-21` |
| R2 dedicated bucket and least privilege required? | In staging mode: R2 mandatory and bucket name must contain "staging". **Least privilege is not checkable** by code. | `stagingGuard.ts:57-60`; `p6VercelStaging.test.ts:31-52` |
| Startup migrations disabled unless authorized? | Only in staging mode (`"false"` required). The global default is ON. | `db.ts:29`; `stagingGuard.ts` (migrations rule) |
| Serverless refuses unsafe local uploads? | In staging mode, yes (R2 mandatory; `SERVE_LOCAL_UPLOADS` must be false). Otherwise, if no R2 values are set, it falls back to local disk silently. | `uploadStorage.ts:20-46`; `env.ts:243-256`; `p6VercelStaging.test.ts:35-50` |
| Destructive retention jobs gated? | Only by `CRON_SECRET` and by data (a school's `pilotEndsAt` + retention days). No staging-specific gate. No Vercel cron exists. | `cron.routes.ts`; `documentRetention.ts:6-36`; `vercel.json` |
| AI pause safe by default, effective state observable? | Default paused **only in staging mode**. **Grading bypasses pause.** Effective state is not observable without an admin login or database access. | `env.ts:397`; `aiBudget.ts:270-282`; `p6StagingGuard.test.ts:113, 154`; `aiControls.routes.ts` (no global GET) |
| Budget reservations prevent exceeding a cumulative $5? | **No.** Reservations precede every attempt and non-grading calls are refused at the caps, but grading overruns by design. School caps are daily/monthly windows, not a per-run cumulative cap. | `aiBudget.ts:7-32, 296-345`; `p0dBudget.test.ts`, `p0dHardening.test.ts` |

## Step 3: proposed minimal remediations (none implemented; each needs explicit authorization)

### Code changes

| Id | Failure mode | Fix | Files and tests | Risk | Rollback |
|---|---|---|---|---|---|
| **R-C1 (keystone, required)** | A staging deployment starts without the guard if `ENARA_STAGING` is missing or false | In `loadConfig`, when the runtime identifies as the staging project, refuse to start unless `ENARA_STAGING=true`. Signal: Vercel's automatic `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` containing `enara-staging`, or `APP_URL`/`FRONTEND_URL` containing `staging`. | `backend/src/config/env.ts` (+ a helper in `stagingGuard.ts`); new tests in `backend/test/p6StagingGuard.test.ts` (marker + flag off → throws; marker + flag on → existing checks; no marker → unchanged) | Low. Misdetection could block a non-staging deployment containing "staging" in its URL; no such deployment is recorded. | Revert the commit; Vercel instant rollback to `dpl_GUdo…` |
| R-C2 (recommended) | Grading ignores pause and caps, so paid calls are possible beyond $5 | In staging mode only: grading obeys pause (refuse with `AI_PAUSED`) and caps (no allowance or emergency overrun). The attempt goes to `grading_failed` and retries later. | `backend/src/services/aiBudget.ts` (`reserveAiBudget`); tests in `p0dBudget.test.ts` / `p6StagingGuard.test.ts:154` (that test's expectation changes for staging, an intended contract change) | Medium: changes P0d grading semantics in staging. Production is unaffected. | Revert the commit and redeploy |
| R-C3 (optional) | Database host or cluster could be a production cluster with a staging-named database | New non-secret pin `STAGING_MONGO_HOST_SUFFIX`; the guard compares the URI host's suffix (never logged) | `stagingGuard.ts` + tests; a **new Vercel variable** (external change) | Low | Remove the pin and revert |
| R-C4 (optional) | Effective pause is invisible | At cold start, log `{envPaused, globalPaused, stagingMode}` as booleans; optionally an admin-only `GET /api/ai-controls/pause` | `aiBudget.ts` / `aiControls.routes.ts` + tests | Low | Revert |
| R-C5 (optional, low) | Readiness reports `postgres: ok` without a database | Report `not_configured` | `backend/src/app.ts:176-195` + readiness test | Low (monitoring reading the field may change) | Revert |

With R-C1 in place, separate fixes for the migration, upload and demo defaults are **not needed for staging**: the guard enforces them.

### Operator and dashboard actions (external, each needs owner approval)

| Id | Action | Purpose | Risk and rollback |
|---|---|---|---|
| R-O1 | Complete the P13.3 checklist privately; return yes/no lines | Closes blockers 1, 3, 4, 5, 6 (attestation parts) | None |
| R-O2 | Rotate the Atlas password and R2 token if not already done; update Vercel values; redeploy | Closes 5 (6d) | A brief outage if values mismatch; rollback by restoring the previous values |
| R-O3 | Create a dedicated Anthropic staging workspace and key with a hard spend limit ≤ $5 | Closes 8; the only true hard stop | None until the key is installed |
| R-O4 | Lower the staging school's P0d caps (daily ≤ $5, monthly ≤ $5, grading allowance $0) via an authorized admin | Part of 9 | Restore the old caps |
| R-O5 | Approved AI-enable procedure, used only at phase T3. (1) Confirm gates 1–9. (2) Install the R-O3 key in Vercel Production. (3) Set `AI_PAUSED` and the global switch to the planned state. (4) Redeploy. (5) Re-attest the deployment id. (6) Run T3/T4. (7) Remove the key, re-pause, redeploy. | Closes 10 | Rollback: remove the key and redeploy (AI unavailable again) |
| R-O6 | Confirm no external scheduler calls `/api/cron/daily` | Closes 11b | None |
| R-O7 | Approve the tenant, the `P14-` accounts and the cleanup plan | Closes 7 | Cleanup per plan |

## Step 4: deployment-specific test matrix (for later; not executed)

All tests target `https://enara-staging-alpha.vercel.app` (record the deployment id at the start of each phase). The P12 runner, `createApp`/supertest, an in-memory database or direct provider calls are **not** acceptable evidence. Every request records: time, endpoint, HTTP status, request id, latency. Never tokens, cookies or personal data.

| Phase | Test | Prerequisites | Expected | Cost exposure | Cleanup | Stop conditions |
|---|---|---|---|---|---|---|
| **T0 Public** | `GET /`, `/health`, `/ready`; Vercel inspect | None | 200s; deployment id recorded; `postgres: ok` noted as non-proof | $0 | None | Deployment id changed since the last attestation, which means re-attest |
| **T1 Authenticated read-only** | Login as teacher, workspace admin, academic manager, student, no-access; `GET /api/me`; list classes and assessments; one cross-school id probe per role; ENARA-admin read of school budget and pause | Gates 1–7 VERIFIED; R-C1 deployed and re-attested; accounts approved | Correct role and scope; cross-school → 403/404; budget reads ≤ $5 caps | $0. AI is unreachable without a key. Logins write session and audit records. | Disable test sessions afterwards | Any cross-tenant data, any 5xx in auth, a scope wider than expected |
| **T2 Synthetic writes** | Teacher creates a `P14-` assessment (teacher-authored, **multiple choice only**) → publish → assign to the synthetic class → student attempt → submit → deterministic grade → result; upload one synthetic document to R2 | T1 passed; cleanup plan approved; **no key installed** (procedure P-1: no open-response submissions before T3) | All 2xx; grade correct; upload lands in the staging bucket (operator confirms the object name prefix only) | $0. With no key, AI grading cannot run; open responses are avoided anyway. | Delete or archive `P14-` records; delete the R2 object | Any write outside the synthetic school; an unexpected AI attempt (`usage_ledger` row); an R2 path outside the staging bucket |
| **T3 AI calls** | After R-O5: tutor message; `POST /api/assessments/generate` (English); rubric grading English + MSA (one open response each); educator chat analytics (fixed pattern; router OFF), checking names shown to the teacher and redacted to the model (verify via redaction logs, booleans only); learning-intelligence update | T2 passed; R-O3 limit ≤ $5 confirmed; R-O4 caps set; R-C2 deployed **or** P-1 strictly followed; owner go for T3 | Each call 2xx; `usage_ledger` row per attempt; app cost ≤ provider console; names never in the model payload | ≤ $5 total (hard: provider limit). Plan per-call worst case before each call; stop at 80% ($4) of measured spend. | `P14-` records; remove the key and re-pause after the phase (R-O5 step 7) | Provider limit hit; app ledger ≠ attempts; any personal data in the payload; a grading overrun alert; spend ≥ $4 |
| **T4 Full journey** | Initial assessment → gap → intervention + tutor → teacher-authored reassessment → outcomes and analytics, all over HTTPS with persistent records | T3 passed with budget left; owner go | The gap opens and the reassessment is graded; analytics values equal the stored records; pre/post reported as a synthetic observation only | Within the remaining T3 budget | Full cleanup plan; key removed; AI re-paused; counts before and after recorded | Same as T3; any held grading not retried (no scheduler); journey state lost between requests |

## Step 5: decisions

| Phase | Decision | Reason |
|---|---|---|
| T0 public health checks | **GO** | Already safe and unauthenticated; no writes or cost |
| T1 authenticated read-only | **NO-GO** | Blockers 1–7 open; R-C1 not authorized or implemented |
| T2 synthetic writes | **NO-GO** | Above, plus the cleanup plan and accounts not approved |
| T3 AI provider calls | **NO-GO** | Above, plus 8–10: no provider-side limit, the app can't cap grading, pause off and not observable |
| T4 full journey | **NO-GO** | Requires T3 |

**Unresolved blockers:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10. All ten.

**Smallest approval-gated next action:** authorize R-C1 (the keystone fail-closed guard), with its tests, commit and deploy, **and** have the operator complete R-O1 (the P13.3 checklist) against the resulting deployment id. These two together close blockers 1, 2 and most of 6, and make 3–5 short attestations.

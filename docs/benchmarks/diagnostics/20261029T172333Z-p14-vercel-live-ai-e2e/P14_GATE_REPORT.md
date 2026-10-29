# P14 gate report: Vercel live AI end-to-end

**Date:** 2026-10-29 17:23 UTC · **Repo:** `EnaraAI/enara-staging-alpha` · **Branch:** `staging-alpha` · **HEAD:** `cc8530f171303a035a9a380b076d349f786d2297` (= origin)

**Target:** `https://enara-staging-alpha.vercel.app` → `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4` (production target of project `enara-staging-alpha`, Ready, created 13:48:23Z).

**Scope of this run:** gate verification only, as instructed ("First action now").
- No paid calls.
- No authenticated or application requests (only public `GET /health` and `/ready`).
- No variable values read.
- No configuration, code or deploy changes.

**Owner approval recorded:** USD $5 total cap for P14 (2026-10-29). It applies only after every gate passes.

## Result: STOP. Gates 1–5 are not satisfied, so no live test may start.

| Gate | Requirement | Status | Evidence | What is needed |
|---|---|---|---|---|
| **1** Runtime isolation attestation | `ENARA_STAGING=true`; correct `NODE_ENV`; database `enara_staging_alpha` on a dedicated Atlas project/cluster with a least-privilege user and network controls; dedicated R2 bucket, bucket-limited credentials, all four R2 variables set; staging secrets distinct from production; exposed credentials rotated | **BLOCKED** | No operator attestation received. Names only: all expected names exist (20, Production-scoped). Values are unknown. `NODE_ENV` ≠ production is INFERRED from code (P13.3 A13). | Operator returns P13.3 checklist items **1, 2, 3, 4a, 4b, 4c, 5a, 5b, 6a, 6b, 6c, 6d, 15** as VERIFIED |
| **2** Safe switches and guard execution | `RUN_MIGRATIONS_ON_START=false`, `SERVE_LOCAL_UPLOADS=false`, `DEMO_MODE_ENABLED=false`, `REGISTRATION_INVITE_ONLY=true`, `REMINDERS_ENABLED=false`; no external destructive scheduler; guard demonstrably executed | **BLOCKED** | Values not readable. `vercel.json` has no cron (VERIFIED). External schedulers UNKNOWN. **Email cannot send** regardless (`RESEND_API_KEY` and `REMINDER_FROM` absent; VERIFIED). | Operator returns items **1a, 7, 8, 9, 10, 11a, 11b, 13** as VERIFIED. 1a = the local guard script reports `staging mode: on`, `guard problems: 0`. |
| **3** Fix or mitigate the opt-in guard weakness before authenticated or write tests | The guard runs only when `ENARA_STAGING` is truthy (P13.2/P13.3, VERIFIED in source) | **BLOCKED** (needs authorization) | No fix exists in `cc8530f`. A code fix needs separate approval of the change, commit and deploy. | Choose **one**: **(a)** authorize the minimal fail-closed patch below plus a redeploy, then re-attest (gate 6); or **(b)** formally accept an operational mitigation for P14 only: gate-1/2 attestations including 1a, re-attested after any change, with the deployment pinned to `dpl_GUdo…` |
| **4** Staging-only test tenant, accounts, no real data, no email, cleanup plan | Synthetic school and accounts; no production data; no outbound email; cleanup | **BLOCKED** | **Email:** cannot send (VERIFIED by absent names). **Tenant:** synthetic staging school `enara-staging-school` with test accounts for teacher, academic manager, workspace admin and ENARA admin exists from earlier setup (REPORTED, own records; contents not re-read). There is **no student account and no unauthorized-role account on file**. The cleanup plan is drafted below and not yet approved. | Operator confirms the tenant contains only synthetic data; approves creating a synthetic student account and an unauthorized-role account; approves the cleanup plan |
| **5** $5 spend cap enforceable | Hard provider-side limit set and verified; app-side reservation verified; reliable measurement; staging-only key configured by an authorized operator | **BLOCKED** | **No provider key on staging** (VERIFIED: no `ANTHROPIC_API_KEY` name). **App-side caps exceed $5:** staging school budget read earlier today shows daily $6, monthly $15, grading allowance $3, enforcement on (REPORTED, own authenticated read during the unpause task; not re-read). The grading emergency path can continue beyond its allowance, so **app-side controls alone cannot hold $5**. Provider-side limit: UNKNOWN. **AI pause:** reported off since today (env `AI_PAUSED=false`, global switch off). | Operator: **(i)** create a **staging-only** Anthropic key in a dedicated workspace with a **hard spend limit ≤ $5** and confirm it (yes/no); **(ii)** decide whether to lower the school's P0d caps to ≤ $5 (config change; approval); **(iii)** set the key and AI-pause state only after gates 1–4 pass (env change + redeploy; approval). **Do not use** the sandbox `.env` key: it is not a staging-only key with a provider-side limit. |
| **6** Re-check after any change | Deployment id and environment re-verified after any approved change | **VERIFIED (no change so far)** | Same deployment `dpl_GUdo…`, same 20 names, same HEAD as P13.3 | Repeat after any approved change; earlier attestations become invalid for changed settings |

## Proposed minimal fail-closed patch (gate 3a; NOT applied)

**Problem:** a staging deployment with `ENARA_STAGING` missing or false starts without the guard.

**Smallest fix:**
1. In `backend/src/config/env.ts`, before `isStagingMode(source)`, refuse to start when the runtime identifies as the staging project but staging mode is off. Use any one of the non-secret signals Vercel sets automatically: `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` containing `enara-staging`, or `APP_URL`/`FRONTEND_URL` containing `staging`. Error: `"Staging deployment detected but ENARA_STAGING is not true; refusing to start."`
2. Add a unit test in `backend/test/p6StagingGuard.test.ts`. It must cover: a staging marker present with the flag off → throws; a marker present with the flag on → existing checks apply; no marker → unchanged.
3. Optional, same change: make `RUN_MIGRATIONS_ON_START` opt-in, and default `AI_PAUSED` to `true` unless explicitly `false`.

**Process:** this needs **explicit authorization** for the code change, the commit, the push and the deploy. Then gate 6 re-verification, and a re-attestation of items 1/1a.

## Cleanup plan draft (gate 4; needs approval)

- **Tag everything:** every P14 record (users, assessments, attempts, sessions) is created under the synthetic school only, with names prefixed `P14-`.
- **Afterwards:** an authorized admin removes or archives the `P14-` records through existing admin routes, or the owner deletes them in Atlas. Uploaded files are deleted from the staging R2 bucket.
- **Record and verify:** counts before and after are recorded (counts only).
- **Credentials:** test accounts are disabled after the run.

## Re-attestation note

Any approved configuration change (key, pause, caps, patch) creates a new deployment or changes the effective values. Every gate-1/2 attestation must then be repeated against the new deployment id (gate 6).

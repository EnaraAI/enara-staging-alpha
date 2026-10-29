# P14.2: minimum safe Vercel test readiness

**Date:** 2026-10-29 (17:45–18:10 UTC) · **Repo:** `EnaraAI/enara-staging-alpha` · **Branch:** `staging-alpha` · **HEAD:** `cc8530f171303a035a9a380b076d349f786d2297` (= `origin/staging-alpha`, as required)

**Scope:** local code changes, local automated tests and this report.
- Not done: commit, push, deploy, Vercel/Atlas/R2/Anthropic changes, provider calls, authenticated or write requests to the deployed app, secret reads.
- Spend: **$0**. Every provider in the tests is mocked. No spend ledger was produced.

## Result

| Phase | Verdict |
|---|---|
| Public checks (`/health`, `/ready`) on the deployed app | **GO** (unchanged; read-only) |
| Authenticated non-AI tests (Phase 0/1) | **NO-GO** until this change is approved, committed, deployed, and gates A–E and H pass |
| AI tests incl. grading (Phase 2/3) | **NO-GO** until additionally gates F and G pass |

The two code blockers from P14.1 now have a local fix with tests:
1. **The opt-in guard weakness (P14 gate 3).** The Vercel staging entry now refuses to load without staging identity, so the isolation guard always runs there, before any database connection or migration.
2. **No app-side control could hold $5 (P14 gate 5).** A new cumulative test-spend cap holds every AI call, grading included. It is independent of school budgets and of the grading exemption.

These fixes are **not deployed**. The deployed `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4` still runs `cc8530f` without them.

## Step 1: baseline

| Item | Value |
|---|---|
| Branch | `staging-alpha` |
| HEAD / origin | `cc8530f` / `cc8530f` (match) |
| Tracked changes at start | 0 modified, 0 staged |
| Untracked entries at start | 10 (P12 harness ×3, P12/P13/P13.1/P13.2/P13.3/P14/P14.1 diagnostic folders); all preserved |
| Deployment | `enara-staging-alpha.vercel.app` → `dpl_GUdoFwWLBJFK2g4XhYv9ns97WxH4`, Ready, production target (unchanged since P14) |

**Baseline focused run** (before any edit): `env -u ANTHROPIC_API_KEY npx vitest run test/p6StagingGuard.test.ts test/p6VercelStaging.test.ts test/p0dBudget.test.ts test/p0dHardening.test.ts`
- Result: `Tests 35 passed | 25 skipped (60)`. `p0dBudget.test.ts` failed at file level (its 25 tests skipped).
- The same file run alone: `25 passed (25)`.
- It has passed in every combined run since (see Step 5).
- **Classification:** transient file-level start-up failure under parallel load (in-memory MongoDB start), not a code failure.

## Step 2: staging guard fix

**Problem (P13.2/P13.3, VERIFIED in source):**
- The guard ran only when `ENARA_STAGING` was exactly `1/true/yes`.
- A missing, false or misspelt value (`ture`, `on`) silently skipped every isolation check. Migrations then ran by default on the first request.

**Fix (no URL, branch or alias heuristics; no new setting):**

1. **Staging-only entry refuses to load without staging identity.**
   - `backend/src/vercel.ts` is the Vercel function's only backend entry. `api/index.js` describes it as the "Vercel function entry for ENARA staging", and `vercel.json` deploys only `staging-alpha`.
   - It now calls `assertStagingEntry(process.env)` and then `getConfig()` at module load. Both run before `createApp()` and before the first request's `connectDB()` (where migrations run).
   - Missing, false or invalid `ENARA_STAGING` → the function refuses to load. With the flag on, any isolation problem → the full guard refuses to load.
   - The identity is the deployed **code path**, not an environment value. The flag only switches the guard on; isolation is still proven by `stagingProblems()`, never by the flag alone.
2. **Invalid flag values are refused everywhere.**
   - `loadConfig` throws `ENARA_STAGING must be true or false` for any value other than unset, empty, `1/true/yes` or `0/false/no`.
   - Non-staging behaviour is unchanged for unset, empty and false.
3. **A provider key in staging needs the test-spend cap.**
   - `stagingProblems()` adds: `AI_TEST_SPEND_CAP_USD and AI_TEST_SPEND_ID must be set when a provider key is set in staging`.
   - So a staging deployment cannot start with `ANTHROPIC_API_KEY` or `ELEVENLABS_API_KEY` and no cap.

**Error messages** name variables only. The tests check that the password, user, host and secrets never appear.

**Not changed:** `src/index.ts` (local/Docker/Railway). It keeps the opt-in flag, because it serves non-staging runs too. Railway/Docker staging is out of P14 scope.

## Step 3: grading exemption and test-spend cap

### Grading exemption (decision 2.1): preserved, no behaviour change

`reserveAiBudget` still never refuses `ai_grading` for school budget reasons. The order is:
1. ordinary caps;
2. then the grading allowance;
3. then an uncapped, logged `grading_emergency` overrun.

Pauses and settings outages also do not stop grading. Only the exact feature `ai_grading` is exempt.

### Tracking (decision 2.2): unchanged, now tested past the caps

- Every attempt gets an immutable `usage_ledger` row (`feature: ai_grading`, status, units, `costStatus`, `costInternal`).
- An unknown cost is `costStatus: usage_unknown`, `costInternal: null`, never zero. The whole reservation is kept as `unknownMicros`.

### Test-spend cap (decision 2.3): new, `backend/src/services/aiBudget.ts`

- **Settings:** non-secret `AI_TEST_SPEND_CAP_USD` (positive USD) and `AI_TEST_SPEND_ID` (counter name, `[A-Za-z0-9_-]`). Invalid or half-set values → refuse to start. Unset → no effect (existing behaviour).
- **One counter for everything:** `budget_counters/_id = test_spend:<id>`, tenant `__test_spend__` (never listed in school views).
  - It is shared by all schools, users and features, **grading included**.
  - It is stored in the database, so it is cumulative across cold starts and deployments.
- **Order:** the attempt's upper-bound price is reserved atomically on this counter **before** pauses and the school policy (conditional `$inc`, as P0d does).
  - Cap reached → `AI_TEST_SPEND_CAP` (429) before the provider is called.
  - A later school refusal or pause gives the test reservation back.
- **Settlement:**
  - A known cost refunds the unused part.
  - An unknown cost keeps the whole reservation.
  - Stale reservations are kept as unknown exposure by the existing sweep.
  - The ticket carries `testSpend: true`, so settlement does not depend on config.
- **Fails closed for every feature, grading included:**
  - a call without a positive price bound (no catalogue price and no school ceiling);
  - a database write or read failure.
- **Coverage:** every served Anthropic/ElevenLabs/Anam call goes through `reserveAttempt` → `reserveAiBudget` (gateway `meteredMessage`/`meteredStream`, `trackAiCall`, avatar). The only unmetered SDK call sites are offline scripts (`candidateV2Live/*` used by `src/scripts/*`), which are not served.

**Residual limits (stated, not fixed):**
- The cap holds **reserved upper bounds**. If a provider bills more than the bound (the `ai_budget_reservation_exceeded` warning), the counter records the actual, which can exceed the cap by at most that one call's difference.
- An avatar session's test reservation is settled by the sweep as unknown exposure, because `avatarUsage` rebuilds its ticket without the marker. This over-counts and never under-counts.
- The provider-side hard limit (gate F) is still the outer bound.

### Required tests (mocks only)

| # | Requirement | Test (file › name) | Result |
|---|---|---|---|
| 1 | Grading allowed after the ordinary budget is exhausted | `p14_2GradingTestSpend` › 1 (kind `grading_allowance`; provider called) | PASS |
| 2 | Grading allowed after the allowance is consumed | › 2 (kind `grading_emergency`; emergency counter > 0) | PASS |
| 3 | Non-grading denied after exhaustion | › 3 (`AI_BUDGET_EXCEEDED`; provider not called) | PASS |
| 4 | Exemption does not extend to other tools | › 4 (tutor_chat, educator_chat, ai_assessment_draft, ai_question_regenerate, ai_grading_proposal, ai_lesson_plan all refused; `GRADING_FEATURES = ['ai_grading']`) | PASS |
| 5 | Grading usage and attempts recorded in the ledger | › 5 (ledger row `ai_grading`, ok, `estimated`, cost > 0; reservation settled; emergency counter `settledMicros` = cost) | PASS |
| 6 | Unknown grading cost explicit, never zero | › 6 (`usage_unknown`, `costInternal: null`; `unknownMicros` = full reservation > 0) | PASS |
| 7 | Independent global controls still prevent provider calls | › 7 (test cap stops grading with no ledger row; global pause stops non-grading; test reservation returned) | PASS |
| 8 | Cumulative test cap blocks calls when exhausted | › 8 (across features, schools, a cold start; refund/unknown accounting; new id = new counter), › 8b (through the gateway: grading refused once spent, ledger unchanged), plus unbounded, release/replay, school-refusal and sweep cases | PASS |
| 9 | Ordinary reservation failures fail safely | › 9 (school store failure: non-grading `AI_BUDGET_UNAVAILABLE`, provider not called; grading continues as recorded emergency), › 9b (test-cap store failure fails closed for grading too) | PASS |
| 10 | Existing regressions stay covered | Full backend suite (Step 5) | PASS |

Staging-entry tests (`p14_2StagingEntry`, 9 tests):
- flag validation;
- entry identity checks;
- invalid flag in `loadConfig`;
- non-staging config unchanged;
- provider key needs the cap, and cap validation;
- `vercel.ts` refuses to load when the flag is missing, false or invalid, when isolation fails, or when a key is set without the cap. In each case `connectDB` is never called and no values are printed;
- a valid config loads without connecting.

## Files changed and why

| File | Change | Why |
|---|---|---|
| `backend/src/vercel.ts` (+7) | `assertStagingEntry` + `getConfig()` before `createApp()` | Gate 3: the staging entry fails closed and validates before DB connect or migrations |
| `backend/src/config/stagingGuard.ts` (+22) | `stagingFlagProblem`, `assertStagingEntry`; provider key needs the test cap | Invalid or missing identity fails safely; a key cannot run uncapped in staging |
| `backend/src/config/env.ts` (+26/−1) | Refuse an invalid `ENARA_STAGING`; parse `AI_TEST_SPEND_CAP_USD`/`AI_TEST_SPEND_ID` | Same; cap settings validated at start |
| `backend/src/services/aiBudget.ts` (+101/−9) | `reserveTestSpend`; `reserveAiBudget` wraps the unchanged school logic (`reserveSchoolBudget`); settle/release handle the test reservation; new code `AI_TEST_SPEND_CAP` | Decision 2.3, independent of the grading exemption |
| `backend/src/models/OrgBudget.ts` (+2/−2) | Reservation kind `test_spend` | Store test reservations |
| `backend/staging.env.template` (+5) | Names `AI_TEST_SPEND_CAP_USD=`, `AI_TEST_SPEND_ID=` (blank) | Operator reference; no values |
| `backend/test/p14_2StagingEntry.test.ts` (new, 9 tests) | | Step 2 |
| `backend/test/p14_2GradingTestSpend.test.ts` (new, 15 tests) | | Step 3, items 1–9 |

**Untouched:** the grading policy, school caps, pauses, the ledger, the gateway, routes, the frontend and `vercel.json`.

One stale comment remains in `api/index.js`: "The staging guard runs on the first request". It now runs at load. Left as is to keep the diff minimal.

## Step 5: local tests

All run in `backend/` with `env -u ANTHROPIC_API_KEY` (no key in the process; providers mocked).

| Run | Command | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit -p .` | clean |
| New tests | `npx vitest run test/p14_2GradingTestSpend.test.ts test/p14_2StagingEntry.test.ts` | 2 files, **24/24 passed** |
| Focused | `npx vitest run test/p6StagingGuard.test.ts test/p6VercelStaging.test.ts test/p0dBudget.test.ts test/p0dHardening.test.ts test/p0bGateway.test.ts test/p0cMetering.test.ts test/usageLedger.test.ts test/gradingEvalAdapter.test.ts test/gradingPolicy.test.ts test/phase3.autograding.test.ts test/p12HardCap.test.ts test/p14_2GradingTestSpend.test.ts test/p14_2StagingEntry.test.ts` | 13 files, **170/170 passed** |
| Full #1 | `npx vitest run` | 70 files, 972 passed / **5 failed**: see note |
| Full #2 (after fix) | `npx vitest run` | **70 files, 977/977 passed** |
| Full #3 (flake check) | `npx vitest run` | **70 files, 977/977 passed** |

**Note on full run #1:**
- **4 failures in `p0cReviewFixes` were caused by my first version.** Settlement read the app config, which that avatar test runs without. Fixed by carrying `testSpend` on the ticket. The file then passes alone (14/14) and in full run #2.
- **1 failure in `p0bGateway`** ("records the final usage exactly once on normal completion"). It passed in the focused run and in 2 isolated re-runs (18/18) and in full runs #2/#3. Classified as a load flake, not caused by this change.

Frontend: not run (type-check fixes are deferred; no frontend file changed).

## Step 4: operator checklist (gates A–H)

Status key:
- **CODE** = enforced by this change once deployed;
- **OPERATOR** = needs a private attestation (yes/no, no values);
- **UNKNOWN** = not provable from here.

| Gate | Requirement | Status now | What the code now guarantees (after deploy) | Operator action |
|---|---|---|---|---|
| **A** DB isolation | `enara_staging_alpha` on a dedicated Atlas project/cluster, least-privilege user, network controls | **OPERATOR / UNKNOWN** | Database **name** checked at start and on every connect (existing). Not the cluster, user or network | Attest: dedicated project/cluster; user limited to `enara_staging_alpha`; network access restricted; no production data |
| **B** R2 isolation | Dedicated bucket, bucket-scoped token, all four values set | **OPERATOR / UNKNOWN** | All four set, bucket name contains "staging", no local uploads (existing, now always enforced on Vercel) | Attest: bucket used only by staging; token scoped to that bucket; not shared with production/sandbox |
| **C** Secrets | Staging-only, distinct from production; exposed credentials rotated | **OPERATOR / UNKNOWN** | Three app secrets ≥ 32 characters and mutually distinct (existing). Not compared with production | Attest: `JWT_SECRET`, `INGEST_HMAC_SECRET`, `CRON_SECRET`, Mongo user and R2 token differ from production/sandbox; any credential ever shown in a chat or log is rotated |
| **D** Safe switches | `RUN_MIGRATIONS_ON_START=false`, `SERVE_LOCAL_UPLOADS=false`, `DEMO_MODE_ENABLED=false`, `REGISTRATION_INVITE_ONLY=true`, `REMINDERS_ENABLED=false`; no external destructive scheduler | **CODE (after deploy) + OPERATOR** | A serving deployment proves: migrations `false`; local uploads not `true`; demo not `true`; invite-only not `false`; reminders only with a test recipient (and email cannot send anyway: no `RESEND_API_KEY`/`REMINDER_FROM`) | Attest: `REMINDERS_ENABLED=false` explicitly; no external caller of `/api/cron/daily` (it includes retention deletes); `CRON_SECRET` not held by any scheduler |
| **E** Synthetic tenant and accounts, cleanup | Synthetic school only; student and no-access accounts; cleanup plan | **OPERATOR** | Nothing new | Confirm `enara-staging-school` is synthetic-only; approve creating a synthetic student and a no-access account (`P14-` prefix); approve the P14 cleanup plan (tag, remove/archive, R2 delete, counts before/after, disable accounts) |
| **F** Spend control | Dedicated staging key; provider hard limit ≤ $5; app-side cumulative cap; grading exemption does not bypass it | **CODE (after deploy) + OPERATOR** | With a key set, staging refuses to start without `AI_TEST_SPEND_CAP_USD`/`AI_TEST_SPEND_ID`. Every call, grading included, reserves against one cumulative counter and is refused at the cap | Create a staging-only Anthropic key in a dedicated workspace with a **hard spend limit ≤ $5** (attest yes/no); choose the app cap (recommend `AI_TEST_SPEND_CAP_USD=4.50` to leave margin for per-call bound overrun) and `AI_TEST_SPEND_ID=p14`; set them together with the key, only after A–E pass |
| **G** Controlled AI test window | Open and close AI deliberately; no new pause endpoint | **PROCEDURE** | `AI_PAUSED` (env), global switch and school pause stop non-grading. The test cap stops everything including grading | **Open:** set the key, cap, id and `AI_PAUSED=false` in one approved change → redeploy → record the new deployment id → re-attest D/F → run tests. **Close:** remove `ANTHROPIC_API_KEY` (or set `AI_PAUSED=true` *and* rely on the cap for grading) → redeploy → confirm the provider console shows no further usage. A cap reached mid-window ends the window; raising it needs a new approval and a new id |
| **H** Deployment provenance | Deployed code = reviewed commit | **UNKNOWN** | Nothing in code. The current deployment is `cc8530f` without this change | After approval: commit, push to `staging-alpha`, let Vercel build. Record the commit SHA and deployment id; verify in Vercel metadata that the deployment's git SHA equals the reviewed commit. Until then: UNKNOWN |

**Order of operations after approval:**
1. Review and commit this change.
2. Push (Vercel auto-deploys `staging-alpha`).
3. Record the SHA and deployment id (H).
4. Public `/health` 200 then proves the guard passed with staging identity (D partly).
5. Operator attests A, B, C, D-remainder and E.
6. Authenticated non-AI tests may start.
7. For AI: F (key + provider limit + cap), then open the window (G), then AI tests within the cap.

## Step 6: deferred work (not done, by decision 2.4)

- Postgres readiness truthfulness (`postgres: ok` without `DATABASE_URL`).
- Global AI-pause read endpoint; pause observability refactor (logging all three layers at cold start).
- Migration default opt-in for non-staging entries (`src/index.ts`).
- Optional readiness work: Mongo cluster/host pinning, R2 account pinning, cron destructive-job opt-in, refusing local storage on serverless outside staging.
- Frontend type-check fixes.
- `api/index.js` comment update; marking avatar tickets so the test reservation settles directly instead of via the sweep.
- Unrelated refactors and optional hardening.

## Restrictions honoured

- Spend and changes:
  - No commit, push, deploy or Vercel/Atlas/R2/Anthropic change.
  - No provider call; $0.
  - No authenticated or write request to the deployed app.
- Data and secrets:
  - No production data.
  - No secret value read or printed. The tests ran with `ANTHROPIC_API_KEY` removed from the environment.
- Files:
  - No file reset, cleaned or deleted.
  - All untracked files and earlier reports were preserved.
  - This folder is new.

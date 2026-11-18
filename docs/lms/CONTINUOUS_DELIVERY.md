# Continuous delivery to lms-test.enara.app

Status: built and tested locally on branch `claude/lms-cd` (2026-11-18). Not merged, never run against Vercel or lms-test yet. It starts working once the owner has merged it into `lms-test-live`, created the secrets below, and the E2E workflow calls it.

> **Standing rule: test.enara.app (real data) is FROZEN.** This pipeline cannot deploy to it, read it or change it. It talks to exactly one Vercel project (`enara-lms-test`) and one site (`https://lms-test.enara.app`). Both are constants in the code, and the guards below stop the run before anything happens if either one is wrong.

## What runs when

A feature PR whose base is `lms-test-live` runs the LMS E2E workflow (`.github/workflows/lms-e2e.yml`: Moodle in Docker plus Playwright, the full matrix of Moodle 4.5 and latest). That workflow is owned by the E2E work. **If E2E fails, nothing below runs, so nothing is merged or deployed.** When the whole matrix passes, its last job calls `.github/workflows/lms-deploy.yml`:

| Job | What it does | If it fails |
|---|---|---|
| **guard** | Reads the Vercel project `prj_tuRpwEJLz1dEQOj6RSEk2xUpqtIn` through the Vercel API. Its name must be `enara-lms-test`, it must belong to team `team_xbSucLT1roYt4njeB4tRPfKQ`, `lms-test.enara.app` must be one of its domains, and `test.enara.app` must not be. Any other custom domain also stops the run. | Nothing is merged or deployed. |
| **merge** | Merges the PR into `lms-test-live` with a merge commit, using `GITHUB_TOKEN`. Only the exact commit E2E tested is merged: if the PR got a new commit after E2E, the merge is refused. A PR that is closed, has conflicts or is blocked by branch protection is not merged. | Nothing is deployed. |
| **deploy** | 1. Checks out `lms-test-live`. The checkout must contain the merge. If another PR merged in the meantime, its head is deployed, which includes both. 2. Runs the guard again. 3. Records the current production deployment, so it can roll back to it. 4. Writes `.vercel/project.json` with the two ids. 5. Sets the flags from `deploy/lms-test.flags.json` (see below). 6. Runs `npx vercel@65.9.0 deploy --prod --yes --token …`. 7. Checks the new deployment through the API: it must belong to this project, have target production, and not be aliased to `test.enara.app`. If an earlier rollback stopped Vercel from assigning new deployments, it promotes this one. 8. Waits until `https://lms-test.enara.app` answers from the new deployment (`/api/maintenance/status` reports `VERCEL_URL`) and `/ready` says `mongo: ok`. 9. Checks `/.well-known/jwks.json` has a key. 10. Runs `POST /api/maintenance/migrate`. 11. Runs `POST /api/maintenance/health-check/setup`, then `/run`. | If any step fails **after the deploy started**, it rolls back automatically (see below). |
| **report** | Writes one line to `$GITHUB_STEP_SUMMARY` and posts it as a PR comment (with a few details, then the footer). Unless the result is "passed", the run is marked failed. | — |

The result line is one of:

- `<PR title>: deployed to lms-test — passed`
- `<PR title>: deployed to lms-test — rolled back (<reason>)`, where the reason is the first failed step, for example `health check failed at grade_received (no_score_at_mock)`
- `<PR title>: deployed to lms-test — FAILED and the automatic rollback failed too (<reason>)…`, which means a person must look now
- `<PR title>: not deployed to lms-test (<reason>)`, when the guard, the merge, or a step before the deploy stopped the run

Only one deploy runs at a time (concurrency group `lms-test-deploy`). A second one waits. GitHub keeps only one waiting run per group, so if a third arrives, the second waiting one is cancelled. Its PR is already merged and is deployed by the third, which deploys the head of `lms-test-live`. Its comment says "not deployed (…cancelled…)".

## Rollback

If any step after `vercel deploy` fails or times out, the pipeline rolls back to the production deployment recorded in step 3. Failing steps include: the build, the new deployment never serving, `/ready`, the keys, migrations, health setup and the health run.

- **How:** the Vercel API promote call `POST /v10/projects/<id>/promote/<previous deployment id>`, which is Vercel's instant rollback. If that call fails, it falls back to `vercel rollback <previous url>`.
- **Then it waits** until lms-test serves the previous deployment and `/ready` says `mongo: ok`. A previous build from before this pipeline does not report its deployment or know the CI token. In that case the Vercel API must show it as the project's production deployment.
- **Database migrations are forward-only and additive, and are NOT rolled back.** The previous build ignores collections and indexes it does not know. The report says so.
- **Flags stay set** in the Vercel project. The previous deployment keeps the environment it was built with, so the rollback restores the old switches for the running site. The next deploy uses the flags in the manifest again.
- After a rollback, Vercel stops assigning new production deployments by itself. The next pipeline deploy promotes its own deployment explicitly (step 7).

## Health check (built into the app, lms-test only)

The app itself serves a **mock LMS** (an LTI 1.3 platform) under `/api/maintenance/mock-lms/*`, so the check needs nothing outside lms-test. Everything it uses is fake and belongs to the fake school **LT-SCHOOL-A**, with recognisable `health` IDs:

- platform: "Mock LMS (health check)", issuer `https://lms-test.enara.app/api/maintenance/mock-lms`, client id `health-check-mock-lms`, deployment `health-deployment-1`
- course `health-course-1`, activity (resource link) `health-rl-1`, bound to the fake published assessment `LT-AS-HEALTH-CHECK` (one multiple-choice question)
- users `health-teacher-1` (Instructor) and `health-student-1` (Learner), with emails at `@lms-test.example`

Mock LMS endpoints (`backend/src/maintenance/mockLms.ts`):

| Endpoint | What it does |
|---|---|
| `GET /api/maintenance/mock-lms/jwks` | The mock platform's public key. The key pair is made once and stored in `lms_mock_lms_keys`, with the private key encrypted with `LMS_KEK` (the LMS crypto helpers). |
| `GET\|POST /api/maintenance/mock-lms/auth` | OIDC authorization. It takes the tool's login redirect parameters (client id, `redirect_uri` = `<tool>/lti/launch`, `login_hint` = one of the two users, state, nonce) and returns a signed `id_token`, as JSON (`Accept: application/json`) or as an auto-submitting form. **Needs the maintenance Bearer token.** Without it, anyone could sign in to the fake school. |
| `POST /api/maintenance/mock-lms/token` | OAuth2 `client_credentials`. The client assertion must verify against **ENARA's own JWKS** (iss = sub = `health-check-mock-lms`, aud = this URL, at most 10 minutes old). It returns an opaque access token, valid for 1 hour and stored only as a hash (`lms_mock_lms_tokens`, TTL). |
| `GET\|POST /api/maintenance/mock-lms/lineitems`, `GET …/lineitems/health-1/lineitem` | AGS line items. There is one line item. |
| `POST …/lineitems/health-1/lineitem/scores` | AGS score. It records the score in `lms_mock_scores` (30-day TTL). |
| `GET …/lineitems/health-1/lineitem/results` | AGS results: the last score for each user. |
| `GET /api/maintenance/mock-lms/memberships/health-course-1` | NRPS: one teacher, one student. |

The token, AGS and NRPS endpoints are called by ENARA's own LTI code, which never holds the maintenance token. They have the protocol's own checks instead: a client assertion signed by ENARA's key, then the access token.

Health endpoints (maintenance Bearer token):

- `POST /api/maintenance/health-check/setup`: idempotent. Registers the mock platform (active) and its deployment for LT-SCHOOL-A, and creates and publishes `LT-AS-HEALTH-CHECK` once. If LT-SCHOOL-A does not exist, it answers 409 `school_missing_run_seed_first` (run `seed-lms-test` once). It answers `{ok, platformId, deploymentId, assessmentId, …}` with IDs only.
- `POST /api/maintenance/health-check/run`: always HTTP 200 with `{ok, steps: [{name, ok, ms, code?}], ids: {…}}`. It calls the app's **own public URLs** with `fetch`, so Vercel's routing, rewrites and headers are exercised. The steps:

| Step | Checks |
|---|---|
| `setup_present` | LTI on, mock platform registered and active |
| `ready` | `GET /ready` → `checks.mongo == ok` |
| `tool_jwks` | `GET /.well-known/jwks.json` has a key |
| `mock_jwks` | `GET /api/maintenance/mock-lms/jwks` has a key |
| `teacher_lti_login` … `teacher_launch_exchange` | the teacher's launch (binds the activity to the assessment, makes the LMS class and the assignment) |
| `lti_login` | `GET /lti/login?iss=…&login_hint=health-student-1…` → 302 to the mock auth URL, state cookie set |
| `mock_auth` | the mock signs the `id_token` |
| `lti_launch` | `POST /lti/launch` → **303 to `/lms/launch#lt=…`**. A refusal is reported with its reference code, for example `http_401_invalid_signature` |
| `launch_exchange` | `POST /api/lms/launch/exchange` → an ENARA session for the fake student |
| `lms_records` | the LMS course, activity and student exist in LT-SCHOOL-A, and the activity is bound to the assignment the student landed on |
| `nrps_roster` | (only when `LMS_ROSTER_SYNC_ENABLED`) a roster sync through the mock's NRPS: 2 members |
| `keep_assignment_open` | keeps the fake assignment's due date in the future (its only update) |
| `submit_attempt` | as the fake student, starts and submits one attempt with the correct answer. An assignment allows at most 10 attempts. Once the fake student has used them all, no attempt is made: the step is ok with code `attempts_used_resend_last` and the last result is re-sent (a forced re-sync). **Nothing is ever deleted**: the grade ledger is append-only, and only PDPL erasure deletes attempts |
| `grade_send` | the grade job is sent. It may already have been sent inline; otherwise this step drains it. Fails with `grade_passback_off` if passback is off |
| `grade_received` | the mock received the score: FullyGraded, full marks |

The first failed step stops the run, and the steps after it are not listed. The run deletes nothing and touches no data outside LT-SCHOOL-A's `health` entities. The fake health teacher and student are normal ENARA accounts in LT-SCHOOL-A ("Health Teacher (fake)", "Health Student (fake)"), in the LMS class "Health check course (fake)". Like any LMS launch, the run writes LMS audit rows and grade ledger rows for them.

## Guards (why this cannot reach test.enara.app)

1. **Constants, not inputs.** The project id, team id, project name and site (`https://lms-test.enara.app`) are hard-coded in `deploy/lms-test/lib.mjs` and the workflow. No input or environment variable can change them.
2. **The project guard** (job `guard`, and again in `deploy`) refuses to go on unless the project's name is `enara-lms-test`, it belongs to the team, it has `lms-test.enara.app`, it does **not** have `test.enara.app` (compared exactly; `lms-test.enara.app` ends with "test.enara.app"), and it has no other custom domain.
3. **Every Vercel API call** goes through one function that only allows this project's paths (or a deployment lookup), always adds the team id, and checks that any deployment it acts on belongs to this project, has target production and is not aliased to `test.enara.app`.
4. **Every site call** goes through `assertSiteUrl`, which allows https `lms-test.enara.app` only.
5. **The app side.** The maintenance and mock-LMS routes answer 404 unless `MAINTENANCE_ENDPOINTS_ENABLED=true`, `MONGODB_URI` is on the test cluster (host starts `enara-lms-test.`), and a maintenance token of at least 32 characters is set. test.enara.app has none of these.
6. **The flags manifest** may only name feature switches (`LMS_*`, `ENROLLMENT_*`, `GRADE_LEDGER_*`, `MAINTENANCE_ENDPOINTS_*`, `MOODLE_TEST_WS_*`, `PARENT_*` (Parents P1-P5), and nothing that looks like a key, token, password or address), with short plain values, for project `enara-lms-test`, target production.
7. **No secret is printed.** Tokens come only from GitHub secrets (masked by Actions), are only sent as headers, and are never echoed. Untrusted PR text (the title) reaches scripts only through environment variables. The health run returns IDs and codes, never names, emails or tokens.

Limits: the guards protect against mistakes. They do not protect against a malicious PR. A PR that edits `.github/workflows/` or `deploy/` runs its own version in its own E2E run. Review changes to those paths (a CODEOWNERS rule for them is a good idea), and keep `VERCEL_TOKEN` scoped to the team that owns enara-lms-test.

## Flags: `deploy/lms-test.flags.json`

The manifest lists the env switches each feature needs on lms-test. Before every deploy, `cli.mjs apply-flags` reads the project's variables through the Vercel API and, for the **Production** target only:

- creates a switch that is missing, as a **plain** variable for Production;
- corrects one whose value differs. If that entry is shared with Preview or Development, the log says so;
- leaves equal ones alone;
- **never removes a variable** and **never reads or writes a Sensitive one** (it is reported as `skip_sensitive`).

The current set is what is already on lms-test according to the LMS and multi-class notes: `LMS_LTI_ENABLED`, `LMS_DEEP_LINKING_ENABLED`, `LMS_GRADE_PASSBACK_ENABLED`, `LMS_ROSTER_SYNC_ENABLED`, `GRADE_LEDGER_ENABLED`, `ENROLLMENT_DUAL_WRITE`, `ENROLLMENT_SHADOW` and `MAINTENANCE_ENDPOINTS_ENABLED`, all `"true"`. The other multi-class switches (`ENROLLMENT_READ_FROM`, `ENROLLMENT_MULTI_CLASS`, the archive switches, Q7 and Q8) are listed under `notManaged` with the reason. The notes do not record them as on, and the pipeline does not turn them on without the owner's OK. **A feature PR that needs a new switch on lms-test adds an entry** (`{name, docs, flags}`). When it passes E2E, the deploy turns the switch on.

## What the owner must create once

1. **GitHub secret `VERCEL_TOKEN`**: a Vercel token for the team that owns enara-lms-test (Vercel › Account Settings › Tokens; scope it to that team).
2. **GitHub secret `LMSTEST_MAINTENANCE_TOKEN`**: a random string of 40 or more characters that you make up, for example `openssl rand -base64 36`.
3. **The same value in Vercel**: project **enara-lms-test** › Settings › Environment Variables › `MAINTENANCE_CI_TOKEN`, type **Sensitive**, environment **Production**. This is the pipeline's own token. It works alongside `MAINTENANCE_TOKEN`, and either can be changed without the other.
4. Merge `claude/lms-cd` into `lms-test-live`. The guard and report jobs run the scripts from `lms-test-live`, so they must be there. A deploy by hand is not needed: the first pipeline deploy brings the app code that accepts `MAINTENANCE_CI_TOKEN`, serves the mock LMS and reports its deployment. A rollback to an older build without that code is still confirmed, through the Vercel API.
5. Repository › Settings › Actions › General › Workflow permissions: let workflows ask for write permissions. If `lms-test-live` has branch protection, it must let the `github-actions` merge go through once the required E2E checks have passed.
6. Already true on lms-test, so check only: `MAINTENANCE_ENDPOINTS_ENABLED=true`, `LMS_LTI_ENABLED=true`, `LMS_GRADE_PASSBACK_ENABLED=true`, `LMS_TOOL_BASE_URL=https://lms-test.enara.app`, `LMS_KEK` set, the fake seed run (school `LT-SCHOOL-A`), and no Vercel deployment protection on the production domain.

## How the E2E workflow calls it

Add this as the final job of `.github/workflows/lms-e2e.yml`. Replace `e2e` with the name of the E2E matrix job, and list every job that must pass:

```yaml
  deploy:
    needs: [e2e]
    if: github.event_name == 'pull_request' && github.base_ref == 'lms-test-live' && success()
    permissions:
      contents: write        # merge into lms-test-live
      pull-requests: write   # merge + result comment
    uses: ./.github/workflows/lms-deploy.yml
    with:
      pr_number: ${{ github.event.pull_request.number }}
      pr_title: ${{ github.event.pull_request.title }}
    secrets: inherit
```

`needs` on the matrix job waits for every matrix leg, and `success()` requires all of them to pass. The `permissions` block is needed: a called workflow can never have more permissions than its caller job. `secrets: inherit` passes `VERCEL_TOKEN` and `LMSTEST_MAINTENANCE_TOKEN`. PRs from forks get no secrets, so they never deploy. `workflow_dispatch` runs of the E2E workflow do not deploy.

## Files

| File | What |
|---|---|
| `.github/workflows/lms-deploy.yml` | The reusable workflow (guard, merge, deploy with rollback, report) |
| `deploy/lms-test/cli.mjs` | The steps (Vercel API, site checks, flags, rollback, report). Node 20+, no dependencies |
| `deploy/lms-test/lib.mjs` | Constants and the pure rules (guards, flag plan, result line) |
| `deploy/lms-test/*.test.mjs` | `node --test deploy/lms-test/lib.test.mjs deploy/lms-test/cli.test.mjs`, against a fake Vercel API and a fake site (no network) |
| `deploy/lms-test.flags.json` | The flags manifest |
| `backend/src/maintenance/guards.ts` | The maintenance switch, test-cluster check and the two tokens |
| `backend/src/maintenance/mockLms.ts` | The mock LMS |
| `backend/src/maintenance/healthCheck.ts` | Health setup and run |
| `backend/test/maintenanceHealthCheck.test.ts`, `backend/test/maintenanceLmsTest.test.ts` | Backend tests |

Run the pipeline steps by hand (read-only ones first):

```sh
export VERCEL_TOKEN=…  LMSTEST_MAINTENANCE_TOKEN=…   # never commit or echo these
node deploy/lms-test/cli.mjs guard
node deploy/lms-test/cli.mjs current-production
node deploy/lms-test/cli.mjs apply-flags --dry-run
node deploy/lms-test/cli.mjs check-site
node deploy/lms-test/cli.mjs maintenance setup && node deploy/lms-test/cli.mjs maintenance run
```

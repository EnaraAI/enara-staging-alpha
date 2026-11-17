# LMS Phase 1a: LTI 1.3 core

Status: **built and tested locally** (2026-11-17), branch `claude/lms-phase1a` (from `claude/multi-class-enrollment`). **Not deployed, no migration run, every flag still off.** With `LMS_LTI_ENABLED` unset the site behaves exactly as before (tested).

Phase 1 was split by the owner: **1a** (this) and **1b** (Dynamic Registration, the platform-storage postMessage flow, the failures view).

## What was built

| Part | Where |
|---|---|
| OIDC third-party login, `GET`/`POST /lti/login` | `integrations/lms/adapters/lti13/oidc.ts` (`oidcLogin`), `http.ts` |
| Resource-link launch, `POST /lti/launch`, full validation (every case in plan §4.1) | `adapters/lti13/oidc.ts` (`oidcLaunch`) |
| Error codes and the plain error page (code shown as "Reference") | `adapters/lti13/errors.ts`, `http.ts` |
| Platform JWKS (jose remote key set, refetch on unknown `kid`) | `adapters/lti13/jwks.ts` |
| `lti13` provider registered (capabilities from preset + scopes) | `adapters/lti13/index.ts`, `registry.ts` |
| LMS domain service: user, context, class + group, enrollment, resource link | `core/domainService.ts` |
| Signed one-time launch token (no cookies needed) | `core/launchToken.ts`, model `lms_launch_tokens` |
| Seats, alerts, billing flag, optional hard cap | `core/seats.ts`, model `lms_org_settings` |
| Admin API (manual "Add LMS", approval, deployments, seats) and session exchange | `integrations/lms/admin/routes.ts`, mounted at `/api/lms` |
| Frontend: landing page `/lms/launch`, "Open in new tab" bar, "LMS connections" page | `frontend/pages/LmsLaunch.tsx`, `frontend/pages/LmsConnections.tsx`, `App.tsx`, `components/Layout.tsx` |
| Migration `2026-11-17-lms-phase1a-indexes` (2 new collections + a platform index) | `backend/src/migrations/index.ts` |

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `GET`/`POST /lti/login` | the LMS (browser) | OIDC login initiation. Stores SHA-256 of state and nonce (10 min), sets a per-state cookie, redirects to the platform's auth URL |
| `POST /lti/launch` | the LMS (browser form post) | Validates the `id_token`, provisions, issues a one-time token, `303` to `/lms/launch#lt=…` |
| `GET /lti/jwks`, `GET /.well-known/jwks.json` | the LMS | ENARA's public keys (Phase 0) |
| `POST /api/lms/launch/exchange` | public | One-time token → normal ENARA session (`{ token, user, launch }`). A second use → `410 LAUNCH_TOKEN_USED` |
| `POST /api/lms/launch/handoff` | signed-in LMS accounts | A fresh one-time link for "Open in new tab" |
| `GET /api/lms/status` | school admin, ENARA admin | Tool URLs to paste into the LMS, presets, whether approval is needed |
| `GET /api/lms/platforms`, `POST /api/lms/platforms` | school admin (own school), ENARA admin (all; `institutionId` required on create) | List / register an LMS by hand |
| `POST /api/lms/platforms/:id/approve` | ENARA admin | Approve (or switch back on); pending deployments become active |
| `POST /api/lms/platforms/:id/disable` | school admin (own), ENARA admin | Switch off; launches stop |
| `POST /api/lms/platforms/:id/deployments` | school admin (own), ENARA admin | Add a deployment ID (a school admin's waits for approval) |
| `POST /api/lms/deployments/:id/approve` | ENARA admin | Approve one deployment |
| `GET /api/lms/seats` | school admin (own), ENARA admin (`?institutionId=`, or the list of flagged schools) | Seats used, limit, over-limit, billing flag |
| `PUT /api/lms/seats` | ENARA admin | `seatLimit` (or `null`), `hardCap`, `clearBillingFlag` |

All of them are the app's normal `404 NOT_FOUND` unless `LMS_LTI_ENABLED` is on **and** the LMS config is valid.

## Flags and settings

| Name | Default | Notes |
|---|---|---|
| `LMS_LTI_ENABLED` | off | Everything above is inert while off |
| `LMS_TOOL_BASE_URL` | unset | **`https://lms-test.enara.app`** for testing (never `test.enara.app`) |
| `LMS_KEK` | set in Vercel (Phase 0) | Also derives the launch-token signing key (HKDF) |
| `LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL` | **true** | New. A school admin's connection starts `pending` until an ENARA admin approves it |

Seat limits and the hard cap are per school in `lms_org_settings` (set by ENARA admins), not env vars. No limit is set by default.

## How it behaves (decisions applied)

- **Identity** is (platform, LMS `sub`), never email. A new LMS person gets a new ENARA account with a reserved address `<lms user id>@lms.enara.test` (never emailed; the email code skips `.test`). The LMS's name and email stay in `lms_users`. A school A person and a school B person with the same LMS ids never meet.
- **Context → class + group** on the first launch: a `CourseInstance` (visibility `student`, no curriculum, no CEFR) and its own `Batch`. Race-safe: simultaneous first launches create one (tested with 3).
- **Learners** → `enroll({ scope: 'class', source: 'lms', lmsContextId })` (decision 1:C: a second course is a second class enrollment), and also `$addToSet CourseInstance.studentIds`, so the old reads (still the default until multi-class steps 5–7) and `enrollment:check` agree. **Teachers** → the class's `instructorIds`. Re-launch is idempotent.
- **Roles** use the Phase 0 role map. LMS Administrator → teacher unless the platform has `allowAdminRole` (off; no UI for it yet). Mentor → refused and logged (`observer_not_supported`). Unknown roles → student with a warning. **An existing account never changes role from a launch.** A student account opened with an Instructor (or admin) role is refused with `student_as_instructor` ("…ask your school administrator…"); other mismatches are `role_conflict`. The reverse (staff opening as a learner) is a **student preview**, below (owner decision L1, 2026-11-17).
- **No third-party cookies needed.** The launch ends with a `303` to `/lms/launch#lt=<token>`. The token is a 2-minute HS256 JWT (key derived from `LMS_KEK`), single use server-side, in the URL fragment (never sent to a server or in a Referer). The SPA exchanges it and keeps the session in `sessionStorage` (per tab; works in Safari/Chrome partitioned frames).
- **Cookieless launches (decision 2:A).** The login sets `lti_st_<hash>` (`SameSite=None; Secure; HttpOnly; Partitioned`). If the launch brings that cookie: normal. If the browser sends **no** state cookie at all: allowed on the single-use server-side state, audited with code `cookieless`, counted in `lms_platforms.cookielessLaunchCount`, and the landing URL carries `c=1`. If the browser sends **other** state cookies but not this one: refused (`state_cookie_mismatch`, the login-CSRF signature).
- **"Open in new tab"**: a slim bar in every LMS session shown inside a frame; also the landing page offers it when the browser blocks storage in the frame. It mints a fresh one-time token (`/launch/handoff`); tokens are never reused.
- **Frame headers**: only `/lti/*` responses drop `X-Frame-Options`; error pages send `Content-Security-Policy: frame-ancestors 'self' <platform origins>` (or `https:` when the platform is unknown; they carry no data or actions). Every other route keeps today's headers (tested on `/health`). The SPA on Vercel is static and sends no frame header, so `/lms/launch` can be framed. (The Express single-service staging runtime adds `SAMEORIGIN` to the SPA; it is not used for LMS.)
- **Who can connect (decision 3:A)**: school admins for their own school, `pending` until an ENARA admin approves (setting above). ENARA admins' connections are active at once. Teachers, academic managers, students: 403. Another school's rows: 404. Pending/disabled connections never fetch the platform's JWKS.
- **Seats**: one seat per distinct (non-demo) student in the school, counted when a launch would create a **new** student. Over the limit: launch allowed, `overLimit` and `billingFlaggedAt` set, school admins emailed at most once a day (plain `sendEmail` + `emailLayout`; no Resend template was added, see "Not done"), audit `seats.over_limit`, shown on the LMS connections page. `hardCap` (default off) refuses new students (`seat_limit_reached`); existing ones still get in. Two simultaneous first launches can both take the last seat under a hard cap (documented overrun ≤ concurrency).
- **Audit**: every login, launch (ok/warn/fail with code), session exchange, handoff, registration, approval, disable and seat event goes to `lms_audit_log`, IDs and codes only (tests check no name or email lands there).
- **Grades (Phase 3)**: nothing is sent. The resource link stores the AGS `lineitem` URL and the context stores the `lineitems` and NRPS URLs, so grade data stays keyed by **resource link + line item + LMS user**, never by class. Grades go to a real school only after the grader meets the **ESL6 accuracy bar** (plan §6).
- **Subjects**: nothing in 1a assumes a language course; no CEFR anywhere.

## Student preview (owner decision L1, 2026-11-17)

A Moodle teacher using **Switch role to → Student**, or any ENARA teacher or admin whose LMS identity is already linked to their staff account, who opens the activity with a **Learner** role gets a **preview of the student view**. Nothing is saved.

- **Detection** (`findStudentPreview` in `core/domainService.ts`, called by the launch before anything is provisioned): the launch maps to student AND the LMS person (platform + `sub`) is already linked in `lms_users` to an ENARA account whose role is `teacher` or `admin` (same school, active). What we rely on: as far as we know Moodle (4.x `mod/lti`) sends **no** "role switched" flag in an LTI 1.3 launch (to be confirmed in runbook step 9: the audit row's `detectedBy` shows which signal fired); a switched teacher arrives with the same `sub` and `…/membership#Learner` as the only role, so the linked staff account is the signal. Also honoured: the LTI system role `http://purl.imsglobal.org/vocab/lti/system/person#TestUser` (sent by some platforms for their own test students; Moodle does not send it). A TestUser linked to a staff account → preview; a TestUser **not** linked to staff → refused (`test_user_not_supported`, nothing created; ENARA never makes an account for a test student). Limitation: a teacher whose **first ever** launch is already switched to student cannot be told apart from a real student and is created as a student; open the activity once as teacher first (runbook step 9).
- **Nothing is written for a preview launch**: no Student, no class enrollment (`class_enrollments` or `CourseInstance.studentIds`), no seat check or count, no `lms_enrollments` row, no context/class/group or resource link (the existing class is shown if a teacher launch already made it; otherwise the preview has no class), no `lms_users` update, no change to the account (role, studentId, token version), no platform launch counters, and no grade/outbox job. The only rows are the one-time launch token and the audit row.
- **Session**: the one-time launch token row has `preview: true` and `enaraRole: 'student'` (the view); the exchange returns the staff account's normal session user (role unchanged) with `launch.preview: true`, and the ENARA access token carries the claim **`pv: true`**. The exchange refuses a preview token if the account is no longer teacher/admin. "Open in new tab" from a preview stays a preview.
- **Read-only, server side** (`auth.middleware.ts`): any request with a `pv` token other than GET/HEAD/OPTIONS is refused **403 `LMS_PREVIEW_READ_ONLY`** "Preview as student — nothing is saved." (attempts, tutor sessions and messages, lesson completion, progress/learning events, diagnostics, settings, and staff writes alike). Allowed writes: `POST /api/auth/logout` and `POST /api/lms/launch/handoff`. Student-only reads (`requireStudent`) answer **403 `LMS_PREVIEW_NO_STUDENT_DATA`** (a preview has no student record), so the student pages show their empty states.
- **Frontend**: the landing page opens the **student portal** for a preview (the account's role is not changed); a yellow **"Preview as student — nothing is saved"** banner is always on top. The preview lives in this tab's `sessionStorage` only and does not change the portal a normal sign-in reopens.
- **Audit**: event **`preview_launch`** (outcome ok), IDs only: `lmsUserId`, `enaraUserId`, `staffRole`, `detectedBy` (`staff_account` | `test_user`), `deploymentId`, `contextId`, `resourceLinkId`, `enaraClassId`, `cookieless`. `lms.session` and `lms.handoff` rows carry `preview`.
- **Phase 3 note**: grade jobs must never be created for a preview. Today no code creates them and a preview session cannot write anything; the Phase 3 enqueue should also check that the attempt belongs to a real student.

## Validation (plan §4.1) and the codes you will see

Login: `missing_parameters`, `invalid_target_link_uri`, `unknown_platform`, `ambiguous_platform`, `platform_pending`, `platform_disabled`, `platform_misconfigured`.
Launch: `state_missing`, `state_invalid` (unknown, used or expired), `state_cookie_mismatch`, `id_token_missing`, `invalid_signature`, `unknown_kid` (after a JWKS refetch), `jwks_unavailable`, `invalid_alg` (none/HS256), `invalid_iss`, `invalid_aud`, `invalid_azp` (array `aud` without/with wrong `azp`), `token_expired`, `missing_iat`, `iat_in_future` (60 s skew), `nonce_invalid` (replay or missing), `invalid_version`, `unsupported_message_type` (deep linking is Phase 2), `missing_deployment`, `unknown_deployment`, `deployment_pending` (incl. auto-created ones on trusted platforms), `invalid_target_link_uri`, `anonymous_launch` (no `sub`), `missing_roles` (absent or empty), `missing_context`, `missing_resource_link`, `observer_not_supported`, `institution_suspended`, `role_conflict`, `student_as_instructor`, `test_user_not_supported`, `account_disabled`, `account_conflict`, `seat_limit_reached`.

## Tests

- New `backend/test/lms/phase1a.test.ts` (**42 tests**, 6 of them the student preview) with a local mock LTI 1.3 platform `backend/test/lms/mockPlatform.ts` (its own RSA keys, a JWKS server on 127.0.0.1, id_token signing). No network. Covers: login; teacher and student happy paths; session exchange and single use; idempotent re-launch; second course → second class enrollment; cookieless (logged + counted); 3 simultaneous first launches; role mapping and role conflict (`student_as_instructor`); student preview (teacher → learner and admin → learner: no student, enrollment, seat, outbox, `pv` claim and `preview` flag; writes refused 403 in preview, handoff stays preview; TestUser linked/unlinked; normal student launch unchanged; tenant isolation); every negative case above; key rotation picked up via JWKS refetch; frame headers; handoff; the admin API with pending/approval, the approval setting off, validation, duplicates; role sweep (teacher/manager/student/anonymous refused); tenant isolation; seats (alert once, billing flag, hard cap); flags off = 404 and no writes; the migration twice.
- Updated: `test/lms/phase0.test.ts` (the registry now holds `lti13`; one HTTP test got a 60 s timeout because the first app import takes >5 s on a loaded machine), `test/multiClass/step1.test.ts` (the LMS domain service is now an allowed writer of enrollments, as the multi-class plan intends).
- `test/lms/vercelRuntime.test.ts` passes: no static `jose` import in `src` (only `import type`).
- Results (2026-11-17): `npx tsc --noEmit -p .` clean (backend and frontend). `test/lms` 66/66 (phase1a 36, phase0 28, vercelRuntime 2). `test/lms` + `test/multiClass` + `p15StaffRouting` all pass; `multiClass/step2` passes alone but its 10 s `beforeAll` (first import of the whole app) can time out on a loaded machine.
- Results after merging multi-class (tip `6d79f0ac`) and adding the student preview (2026-11-17): `tsc` clean (backend and frontend); `test/lms` + `test/multiClass` 23 files, 217/217 (phase1a 42, phase0 28, vercelRuntime 2). Full backend suite: 2,365 passed, 17 failed (12 files). The same 12 files rerun alone on the multi-class tip without Phase 1a fail the same 16 tests (elie e2e/sprint4, p14_2 x2, p14_8, p19 C1b, p20 tutor-message budget, p2Documents x2, p3EducatorChat, phase0 upload links x2, phase3 autograding x3, phase3 e2e); the other two (p20 "journey pages", p24SignInHistory) pass when rerun alone on this branch (index-build and load timing). None is in LMS or multi-class code.
- Earlier (before the merge): full backend suite with defaults: 2,207 passed, 15 failed, 19 files failed. The machine was heavily loaded (load average about 20 on 4 cores): importing the app alone took 6–10 s, so several files' 10 s `beforeAll` hooks timed out. The same set rerun on the base commit (`7aaee244`, no Phase 1a) failed the same way (14 tests, 11 files), and an A/B timing of the app import showed no difference between base and branch. No failure is in LMS or multi-class code.

## Moodle (MoodleCloud) runbook — for the owner, later

Test site: **https://lms-test-enara.moodlecloud.com**, course **"ENARA Test Course"** (short name `ENARATEST`), users **teacher.test** (Teacher) and **student.test** (Student). ENARA test base URL: **https://lms-test.enara.app** (never `test.enara.app`).

### 0. Before the first test (needs the owner's OK)

1. Deploy this branch to the lms-test Vercel project.
2. Env vars there: `LMS_LTI_ENABLED=true`, `LMS_TOOL_BASE_URL=https://lms-test.enara.app`, `LMS_KEK` (already set), leave `LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL` unset (true).
3. Run `npm run migrate` once against the lms-test database (Phase 0 and Phase 1a LMS indexes).
4. Check `https://lms-test.enara.app/.well-known/jwks.json` shows one RSA key. Note the ENARA **school ID** the Moodle site belongs to.

### 1. Register ENARA in Moodle (manual LTI 1.3)

Signed in to MoodleCloud as the site admin:

1. **Site administration › Plugins › Activity modules › External tool › Manage tools**.
2. Click **"configure a tool manually"**.
3. Fill in:
   - Tool name: `ENARA (test)`
   - Tool URL: `https://lms-test.enara.app/lti/launch`
   - LTI version: **LTI 1.3**
   - Client ID: leave as Moodle generated it
   - Public key type: **Keyset URL**
   - Public keyset: `https://lms-test.enara.app/.well-known/jwks.json`
   - Initiate login URL: `https://lms-test.enara.app/lti/login`
   - Redirection URI(s): `https://lms-test.enara.app/lti/launch`
   - Custom parameters: empty
   - Tool configuration usage: **Show in activity chooser and as a preconfigured tool**
   - Default launch container: **Embed, without blocks**
   - Supports Deep Linking: **off** (Phase 2)
   - Services: IMS LTI Assignment and Grade Services **"Use this service for grade sync and column management"**; IMS LTI Names and Role Provisioning **"Use this service to retrieve members' information as per privacy settings"**; Tool Settings **"Do not use this service"**. (Phase 1a calls none of them; this only makes Moodle send the URLs ENARA stores for Phases 3–4.)
   - Privacy: Share launcher's name **Always**; Share launcher's email **Always**; Accept grades **Always**.
4. **Save changes**.
5. On the tool's card in Manage tools, click the **"View configuration details"** icon (the list icon). Copy these values: **Platform ID**, **Client ID**, **Deployment ID**, **Public keyset URL**, **Access token URL**, **Authentication request URL**.

Expected: the tool card shows "ENARA (test)", and the details page shows Platform ID `https://lms-test-enara.moodlecloud.com`, Authentication request URL `https://lms-test-enara.moodlecloud.com/mod/lti/auth.php`, keyset URL `.../mod/lti/certs.php`, token URL `.../mod/lti/token.php`, a Client ID and a Deployment ID (usually `1` or a small number).

### 2. Add the LMS in ENARA

Signed in to `https://lms-test.enara.app` as an **ENARA admin** (sidebar **LMS connections**; it only appears when `LMS_LTI_ENABLED` is on):

| ENARA field | Paste from Moodle |
|---|---|
| LMS type | Moodle |
| School ID | the test school's ID |
| Platform ID (issuer) | Platform ID — exactly, no trailing slash added |
| Client ID | Client ID |
| Deployment ID(s) | Deployment ID |
| Authentication request URL | Authentication request URL |
| Public keyset URL | Public keyset URL |
| Access token URL | Access token URL |

Click **Add LMS**. Expected: the connection appears **active** (an ENARA admin's own connection needs no approval) with the deployment **active**. To also test the approval flow, add it as the test school's **school admin** instead: it appears **pending**; then sign in as ENARA admin and click **Approve**.

### 3. Test runbook

Add the activity once (as admin or teacher.test): open **ENARA Test Course › Turn editing on › Add an activity or resource › ENARA (test)**, name it `ENARA launch test`, **Save and display**.

| # | Do | Expected | Screenshot |
|---|---|---|---|
| 1 | Sign in as **teacher.test**, open ENARA Test Course › ENARA launch test | ENARA opens inside Moodle on the **Teaching Dashboard** (staff portal), with a dark bar "Opened from your LMS · Open in new tab". No ENARA sign-in screen | the Moodle page with ENARA inside |
| 2 | ENARA admin › LMS connections | Launches = 1, "(0 without cookies)" | the connection card |
| 3 | Sign in as **student.test** (another browser or private window), open the activity | ENARA opens inside Moodle on the **student Home** (the new class has no content yet: activities come with Phase 2 deep linking) | the Moodle page with ENARA inside |
| 4 | Cookieless: in **Safari**, or Chrome with third-party cookies blocked (Settings › Privacy › Third-party cookies › Block), open the activity as student.test | It still opens. LMS connections shows the "without cookies" count went up by 1 | the connection card counts |
| 5 | In that frame click **Open in new tab** | A new tab opens `lms-test.enara.app`, signed in as the same student, outside Moodle | the new tab |
| 6 | Re-launch: open the activity again as student.test and as teacher.test | Same ENARA accounts (same names); no second class; the school's student count (ENARA Students page, or LMS connections › Seats) is unchanged; launch count +2 | the Seats line |
| 7 | Optional: set Moodle's launch container to **New window** and launch | ENARA opens in a new window, signed in | — |
| 8 | Optional negative: ENARA admin › LMS connections › **Switch off**, then launch | Error page "This LMS connection has been switched off", Reference `platform_disabled`. Click Approve ("Switch on again") afterwards | the error page |
| 9 | Student preview: as **teacher.test** (after step 1, so the teacher account exists), in ENARA Test Course use the user menu › **Switch role to… › Student**, then open the ENARA activity | ENARA opens the **student Home** with a yellow banner **"Preview as student — nothing is saved"**. Nothing is saved: ENARA Students page and LMS connections › Seats unchanged, teacher.test is still a teacher on the Teaching Dashboard next time, `lms_audit_log` has a `preview_launch` row. Trying any action that saves shows "Preview as student — nothing is saved". Use **Return to my normal role** in Moodle afterwards | the Moodle page with the banner |
| 10 | Optional negative: as **student.test**, if your Moodle lets you give student.test a teacher role in another course, open an ENARA activity there | Error page "Your ENARA account is a student account… ask your school administrator…", Reference `student_as_instructor` | the error page |

If any launch fails, the page shows **"Reference: <code>"**; send that code (it is also in `lms_audit_log`). Nothing personal is in it.

### saltire.lti.app (later)

saltire's **Platform** emulator can act as Moodle: register it in ENARA with LMS type **Other LTI 1.3 platform**, its issuer, client ID, deployment ID, auth URL and JWKS URL from its "Security model" page; set its tool URLs to the same four ENARA URLs as above. Use it to send the odd cases (no context, deep-linking message, Mentor role); each should show the matching Reference code.

## Not done (1b or later)

- **1b**: Dynamic Registration; the platform-storage postMessage flow (`lti_storage_target`); the admin failures view (the audit rows are already there).
- `/api/lms` routes are not yet in the `p7RoleMatrix` / `p14_9TenantIsolation` sweeps (those run with the flags off, so they see 404s); `phase1a.test.ts` has its own role and tenant sweep for them with the flags on.
- The seat alert email uses `sendEmail` + `emailLayout`, not a Resend template (`sendTemplate` needs a new template pushed to Resend by the owner).
- No UI for `allowAdminRole` or role overrides (both off/empty; data only).
- Deep linking, grades, roster: Phases 2–4.

## Decisions needed

1. **Role conflict — decided (L1, 2026-11-17).** Student → Instructor: keep refusing, with a clear "ask your school administrator" message (`student_as_instructor`). Staff → Learner: a read-only student preview (section above).
2. **What counts as a seat.** Implemented as every live student in the school (manual and LMS), per Q1. If seats should count LMS learners only, it is one function (`countSeats`).
3. **The test school** on lms-test that the MoodleCloud site belongs to (its ENARA school ID), and the owner's OK for step 0 (deploy, env vars, migration).

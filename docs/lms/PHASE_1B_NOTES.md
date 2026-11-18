# LMS Phase 1b, part A: one-URL "Connect Moodle" (Dynamic Registration)

Status: **built and tested locally** (2026-11-18), branch `claude/lms-1b-a` (from `71e4e6de`, Phase 2b). **Not deployed, no migration run, no flag changed.** Everything is behind `LMS_LTI_ENABLED` (off = the app's normal 404). Work happens on **lms-test only**; test.enara.app stays frozen (standing rule, `IMPLEMENTATION_PLAN.md`).

Part A is plan items 1–3 (registration link, Dynamic Registration, safety) plus owner notes 1 and 2. Part B (platform storage `postMessage`, the Problems view) is separate.

Owner decisions applied: **R1** an ENARA admin's link connects **active**, a school admin's link **pending** (while `LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL` is on, the default); **R2** 7 days, single use; **R3** a second registration of the same Moodle for the same school keeps both and warns "already connected"; **R4** the tool is named **"ENARA"**, or **"ENARA (<school name>)"** when that Moodle already has an ENARA connection for another school.

## What was built

| Part | Where |
|---|---|
| Model `lms_registration_codes` (`LmsRegistrationCode`) | `integrations/lms/models/registration.ts` |
| Code create / find / reserve / finalize / release / revoke | `integrations/lms/core/registrationCode.ts` |
| Dynamic Registration (tool side) | `integrations/lms/adapters/lti13/dynamicRegistration.ts` |
| `GET /lti/register/:code` page (success and error pages, the close message) | `adapters/lti13/http.ts` (`ltiRegister`), `routes.ts` |
| New error codes | `adapters/lti13/errors.ts` |
| Admin API: create / list / revoke links | `integrations/lms/admin/routes.ts` |
| Frontend: "Connect Moodle (one URL)" | `frontend/pages/LmsConnections.tsx`, `frontend/services/apiService.ts` |
| Logs: the code and the registration token are redacted | `middleware/requestContext.ts` (`logPath`), `utils/logging.ts` |
| Migration `2026-11-23-lms-phase1b-registration` (new collection's indexes only) | `backend/src/migrations/index.ts` |
| Mock Moodle: openid configuration + registration endpoint | `backend/test/lms/mockPlatform.ts` |
| Tests (23) | `backend/test/lms/phase1b.test.ts` |

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `POST /api/lms/registration-links` | ENARA admin (`institutionId` required, any school); school admin (own school only) | Makes a link. Returns `{ link, url, expiresInDays: 7, connectionWillBe: 'active' \| 'pending' }`. `url` = `${LMS_TOOL_BASE_URL}/lti/register/<code>` is returned **once**; only the code's SHA-256 is stored |
| `GET /api/lms/registration-links` | ENARA admin (all, or `?institutionId=`); school admin (own school) | The links (`unused`, `used`, `revoked`, `expired`, made/used dates, the connection made, failed attempts and the last error code). Never the code or its hash |
| `POST /api/lms/registration-links/:id/revoke` | same as list (another school's link: 404) | Cancels an unused link (409 if already used or cancelled) |
| `GET /lti/register/:code?openid_configuration=…&registration_token=…` | the LMS (Moodle opens it in its Manage tools page) | LTI Dynamic Registration 1.0. HTML page (EN + AR); posts `{subject:'org.imsglobal.lti.close'}` to `window.opener \|\| window.parent` |

Teachers, academic managers and students: 403. Signed out: 401.

## How a registration runs

1. **The code.** 32 random bytes, base64url (43 characters), in the URL path. Unknown, malformed or revoked → `registration_code_invalid`; used → `registration_code_used`; expired → `registration_code_expired`. Nothing is called before these checks.
2. **Parameters.** `openid_configuration` is required (else `registration_missing_parameters`). It must be **https** (plain http is accepted only to `localhost`/`127.0.0.1` outside production, the same rule as every LMS URL in ENARA, for the tests), have no fragment, and in production must not point at a private, loopback or link-local address (`registration_insecure_url`).
3. **Reserve, then finalize** (the "consumed atomically only on success" rule). A registration takes a few seconds (two calls to the LMS), so the code is first **reserved** for this one attempt: a single atomic `findOneAndUpdate` sets `reservedUntil` (2 minutes) and a `reservationId`, only if the code is unused, unexpired and not reserved. A second browser opening the same link meanwhile gets `registration_in_progress` and makes no call. When the LMS accepts the registration, the code is **finalized** (`status: 'used'`, atomic, only by the holder of the reservation) **before** the connection is stored, so a link cancelled during the attempt never makes a connection. On **any failure** (bad configuration, the LMS refused, timeout) the reservation is **released**: the code stays usable for a retry, `failedAttempts` and `lastErrorCode` are kept, nothing is stored. Why not "consume at the end only": two simultaneous attempts would both register ENARA in Moodle (two Moodle tools) before one of them lost.
4. **The platform's configuration**: GET, `Accept: application/json`, 5 s, no redirects, at most 64 KB, must be JSON with `issuer`, `authorization_endpoint`, `registration_endpoint`, `jwks_uri`, `token_endpoint` (else `registration_openid_invalid`), all https (else `registration_insecure_url`).
5. **Issuer check** (spec §3.4 and §3.5.1): the configuration URL must be the issuer followed by a path, so **same origin, and the URL's path is under the issuer's path** (`https://m.example/moodle` matches `https://m.example/moodle/mod/lti/openid-configuration.php`, not `/moodle2/…`). This is the spec's rule; for an issuer without a path (MoodleCloud) it is exactly "issuer = the configuration URL's origin". Else `registration_issuer_mismatch`.
6. **Platform family**: `lti-platform-configuration.product_family_code == 'moodle'` → vendor `moodle`, else `generic`. For Moodle, a missing `registration_token` is refused before any POST (`registration_missing_parameters`; the spec makes the token optional, but Moodle always sends one and refuses without it). Moodle's token is a JWT; if its `scope` is `reg-update` (the admin clicked **Update** on Moodle's "existing tools for this domain" page), ENARA refuses (`registration_update_not_supported`) before sending anything, so an existing ENARA tool in Moodle is never rewritten (R3: nothing is replaced).
7. **Register**: POST JSON to `registration_endpoint` with `Authorization: Bearer <registration_token>` (10 s, no redirects, 64 KB reply). A non-2xx reply, a timeout or a reply without `client_id` → `registration_failed` (the HTTP status is in the audit row; the reply body is never stored).
8. **Store** for the code's school: `lms_platforms` (provider `lti13`, vendor, `issuer`, `clientId` from the reply, `authLoginUrl` = `authorization_endpoint`, `authTokenUrl` = `token_endpoint`, `keysetUrl` = `jwks_uri`, `tokenAudience` = `authorization_server` when given, `scopes` = the reply's `scope` or what was asked, `registeredVia: 'dynamic'`, `createdBy` = the link's maker, status per R1) and `lms_deployments` from the reply's `lti-tool-configuration.deployment_id` (same status). A reply without `deployment_id` (an LMS that deploys separately): `autoCreateDeployments: true`, so the first launch records the deployment as pending for approval.
9. **Reply page** (EN + AR plain text): "ENARA is registered. Click Activate in Moodle." (plus "ENARA will approve this connection…" when pending, and an "already connected" note for R3). It posts the spec's close message after 5 s or on **Close**; Moodle then closes its dialog and shows the new tool as **Pending**, with **Activate**.

A `client_id` the LMS already gave ENARA for **another** school is never moved: `registration_conflict` (code not used). The same `client_id` again for the **same** school (an LMS that re-registers in place): the existing connection is kept and the code is linked to it, audited as `registration.duplicate_lms` with code `same_client_id`.

### Error codes (shown as "Reference" on the page, also in `lms_audit_log` as `registration.failed`)

| Code | HTTP | When |
|---|---|---|
| `registration_code_invalid` | 404 | unknown, malformed or cancelled link |
| `registration_code_used` | 410 | the link was already used |
| `registration_code_expired` | 410 | older than 7 days |
| `registration_in_progress` | 409 | another attempt with the same link is running |
| `registration_missing_parameters` | 400 | no `openid_configuration`, or (Moodle) no `registration_token`; also a link opened directly in a browser |
| `registration_insecure_url` | 400 | the configuration URL, the issuer or an endpoint is not https (or a private address in production) |
| `registration_openid_invalid` | 502 | the configuration could not be fetched or read (timeout, non-2xx, not JSON, too big, fields missing) |
| `registration_issuer_mismatch` | 400 | the issuer is not the start of the configuration URL |
| `registration_update_not_supported` | 400 | Moodle's "Update" was chosen instead of "Register as a new external tool" |
| `registration_failed` | 502 | the LMS refused the registration (non-2xx), timed out, or sent no `client_id`; the link still works |
| `registration_conflict` | 409 | the LMS returned a `client_id` that ENARA already has for another school |

### Frame and security headers

`/lti/register/*` drops `X-Frame-Options` and sends `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-<random>'; frame-ancestors 'self' https:; base-uri 'none'; form-action 'none'` (any https origin may frame it: the platform is unknown until the code and its configuration are checked; the page carries no data or actions), `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. The only script is the close message, by nonce.

### Secrets

- The **registration token** is used once as the Bearer header and never stored, logged or audited. The **code** is stored only as SHA-256.
- The request log (`logPath`) now writes `/lti/register/[REDACTED]` for these URLs (path code and query token), and the logger's link redaction also covers `registration_token=`. Vercel's own platform request log is outside the app's control; the code is single use and the token is Moodle's 1-hour single-use token.
- Tests check that neither the token nor the code appears in `lms_audit_log`, `lms_registration_codes`, `lms_platforms`, `lms_deployments` or console output.

### Audit events (`lms_audit_log`, IDs and codes only)

`registration.link_created` (ok: `registrationId`, `createdByRole`, `willBe`), `registration.link_revoked`, `platform.registered` (ok: `via: 'dynamic'`, `status`, `registrationId`, `deploymentCreated`, `deepLinking`, `reused`, `productVersion`), `registration.failed` (fail, code above: `registrationId`, `httpStatus`/`reason` when relevant), **`registration.duplicate_lms`** (warn, code `already_connected` or `same_client_id`: `registrationId`, `newPlatformId`, `existingPlatformIds`). The Problems view (part B) reads these rows; `registration.duplicate_lms` is its "already connected" item.

## What ENARA asks Moodle for

```json
{
  "application_type": "web",
  "response_types": ["id_token"],
  "grant_types": ["implicit", "client_credentials"],
  "initiate_login_uri": "<tool>/lti/login",
  "redirect_uris": ["<tool>/lti/launch"],
  "client_name": "ENARA" | "ENARA (<school name>)",
  "logo_uri": "<tool>/favicon.svg",
  "jwks_uri": "<tool>/.well-known/jwks.json",
  "token_endpoint_auth_method": "private_key_jwt",
  "scope": "…/lti-ags/scope/lineitem …/lineitem.readonly …/result.readonly …/score …/lti-nrps/scope/contextmembership.readonly",
  "https://purl.imsglobal.org/spec/lti-tool-configuration": {
    "domain": "<tool host>",
    "target_link_uri": "<tool>/lti/launch",
    "description": "ENARA lessons, practice and assessments. Grades are sent to the gradebook.",
    "claims": ["iss", "sub", "name", "given_name", "family_name", "email"],
    "messages": [
      { "type": "LtiResourceLinkRequest", "target_link_uri": "<tool>/lti/launch" },
      { "type": "LtiDeepLinkingRequest", "target_link_uri": "<tool>/lti/launch", "label": "ENARA", "placements": ["ContentArea"] }
    ]
  }
}
```

The Deep Linking message is sent only while `LMS_DEEP_LINKING_ENABLED` is on (a picker that would refuse every request is not offered). Without it, a Moodle admin can still tick "Supports Deep Linking" by hand later.

## Owner note 2: which Moodle settings the registration can set (research)

Source: Moodle `mod/lti` on GitHub, branches `MOODLE_401_STABLE`, `MOODLE_405_STABLE` and `MOODLE_500_STABLE` (the registration code is identical in 4.1, 4.5 and 5.0 apart from a type hint):

- [`mod/lti/classes/local/ltiopenid/registration_helper.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/classes/local/ltiopenid/registration_helper.php) — `registration_to_config()` (registration → tool settings), `config_to_registration()` (the reply), `validate_registration_token()`
- [`mod/lti/openid-registration.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/openid-registration.php) — the registration endpoint (new tools are created **Pending**)
- [`mod/lti/openid-configuration.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/openid-configuration.php) — Moodle's configuration (`product_family_code: 'moodle'`, `messages_supported` with Deep Linking placement `ContentArea`, issuer = `$CFG->wwwroot`, no `authorization_server`)
- [`mod/lti/startltiadvregistration.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/startltiadvregistration.php) — "Add LTI Advantage": the "existing tools for this domain" choice, the registration token (JWT, 1 hour, scope `reg` or `reg-update`)
- [`mod/lti/locallib.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/locallib.php) — constants, `content_item_to_form()` (deep-linked items), [`mod/lti/mod_form.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/mod_form.php) (per-activity "Accept grades" checkbox), [`mod/lti/lib.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/lib.php) (activity chooser), [`mod/lti/lang/en/lti.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/lti/lang/en/lti.php) (labels)
- Spec: [LTI Dynamic Registration 1.0](https://www.imsglobal.org/spec/lti-dr/v1p0)

| Moodle tool setting (label) | Owner wants | From the registration? | What Moodle sets |
|---|---|---|---|
| Tool name | "ENARA" / "ENARA (school)" | **yes**, `client_name` | as sent |
| Tool URL, Tool domain | ENARA launch URL | **yes**, `target_link_uri`, `domain` (Moodle refuses the registration if they differ) | as sent |
| Tool description, Icon URL | — | **yes**, `description`, `logo_uri` | as sent |
| LTI version, Client ID, Public key type, Public keyset, Initiate login URL, Redirection URI(s) | — | **yes** | LTI 1.3, a new client ID, Keyset URL, ENARA's JWKS, login and launch URLs |
| Custom parameters | none | yes (`custom_parameters`) | none (ENARA sends none) |
| **Supports Deep Linking (Content-Item Message)** | on | **yes**: any `LtiDeepLinkingRequest` message | on; **Content Selection URL** = that message's `target_link_uri` (`label`, `placements` are ignored) |
| **IMS LTI Assignment and Grade Services** | on | **yes**, scopes | `lineitem` → **"Use this service for grade sync and column management"** (score/result/lineitem.readonly alone → "grade sync only") |
| **IMS LTI Names and Role Provisioning** | on | **yes**, `contextmembership.readonly` | **"Use this service to retrieve members' information as per privacy settings"** |
| Tool Settings service | off | yes (its scope) | off (not asked) |
| **Share launcher's name with the tool** | Always | **yes**, claims `name`/`given_name`/`family_name` | **Always** |
| **Share launcher's email with the tool** | Always | **yes**, claim `email` | **Always** |
| **Accept grades from the tool** | **Always** | **no** — any AGS scope gives a fixed value | **"Delegate to teacher"** → **set to Always by hand** |
| **Default launch container** | Embed, without blocks | **no** (fixed by Moodle) | **"Embed, without blocks"** — already what we want. Since 4.3 deep-linked items cannot change it either |
| **Tool configuration usage** | in the activity chooser | **no** (fixed) | **"Show as preconfigured tool when adding an external tool"** → ENARA is **not** in the activity chooser → **set by hand** to "Show in activity chooser and as a preconfigured tool" (or, Moodle 4.3+, per course: course **More › LTI External tools**, "Show in activity chooser") |
| Tool state | — | **no** (spec §3.7: the platform admin activates) | **Pending** → the Moodle admin clicks **Activate** |
| Restrict to category (4.3+) | per school when one Moodle serves two schools | **no** | none → set by hand (see below) |

What "Delegate to teacher" means in practice (`mod_form.php`, `locallib.php content_item_to_form()`): for a site tool, each activity form shows an "Accept grades from the tool" checkbox, **unchecked by default**; but an item added through the ENARA picker **with a line item** (quizzes, tests, practice) is created with grades accepted. Items without a line item (the course link, page links) get no grade column at all. So "Delegate" would make the "Grade › Type: None" step for ungraded links unnecessary, at the cost of activities added by hand (not through the picker) having grades off unless the teacher ticks the box. The owner's decision (18 Nov) is **Always**, so the guide tells the school admin to set it by hand. **Owner, optional:** if you prefer Delegate (no manual step, no empty grade columns for links), say so and only the guide changes.

## Owner note 1: one Moodle site, two schools

- Each school gets its own Moodle tool (its own client ID and deployment) and its own ENARA connection. `lms_platforms` is unique on (issuer, client ID), so the same Moodle issuer can have connections for School A and School B.
- **Login** picks the connection by issuer **and** client ID. Moodle always sends `client_id` in the login request. Without it, two connections on one issuer are refused as `ambiguous_platform` (unchanged; tested).
- **People**: identity is (connection, LMS `sub`). The same Moodle person launching from a School B course gets a **separate School B ENARA account** (a new `lms_users` row for School B's connection, a new ENARA user and student). The reserved address is `<lms_users id>@lms.enara.test`, and that id is random and unique per (connection, person), so School B's address can never equal or reuse School A's account. Nothing in the launch looks a person up by email or by `sub` alone (all lookups are by connection + `sub`; checked).
- **Courses**: `lms_contexts` is unique on (connection, course id), so the same Moodle course id gives a separate ENARA class in each school. Class enrollments carry the school.
- **Services**: AGS and NRPS service tokens use the connection's own client ID (client assertion `iss`/`sub`) and are cached per connection (`lms_access_tokens` keyed by platform and scopes).
- Tested: two registrations from one mock Moodle (two client IDs); the same `sub` and course id launch in both; separate accounts, emails, student ids, contexts and classes; the School B student has no School A enrollment and cannot read School A's class (API refused); both relaunch into their own accounts; service tokens per client ID and per connection.
- **In Moodle**, the second school's admin must choose **"Register as a new external tool"** when Moodle says there are existing tools for this domain (Moodle warns "It is not recommended to have multiple external tools under the same domain"; for two schools it is intended). Both ENARA tools are site tools, so a teacher could pick the other school's tool by mistake; the names differ (R4), and on **Moodle 4.3+** each tool can be limited to its school's course category (**Restrict to category**). Activities keep the tool they were created with (the deep-linking return never changes the activity's tool), so a School B activity always launches with School B's client ID.

## Tests

`backend/test/lms/phase1b.test.ts` (23 tests, mock Moodle on 127.0.0.1, no network): link API (create once/hash only, list without codes, roles, tenant isolation, revoke once); ENARA-admin link → active connection and deployment, close page, CSP nonce, launch works, second use refused; school-admin link → pending, `platform_pending`, approval; approval setting off → active; the request body (scopes, claims, messages, URLs, Bearer token, JSON); Deep Linking flag off → no DL message; unknown/malformed/expired/revoked codes; http/ftp/garbage configuration URLs; issuer mismatch (other origin, other path), code released and still usable; issuer and private-host rules (unit); missing token / configuration; LMS refuses (400, wrong token 401) → `registration_failed`, nothing stored, code not used, retry works; Moodle "Update" token refused; two simultaneous attempts → one connection; `registration_conflict`; flags off → 404; R3 duplicate (both kept, warn row, both launch); R4 names; no token or code in audit, rows or logs; two schools on one issuer (accounts, emails, classes, enrollments, API isolation, relaunch, service tokens); login ambiguity; the migration twice.

Results (2026-11-18): backend `npx tsc --noEmit -p .` clean; `npx vitest run test/lms --testTimeout=60000`: **16 files, 304 tests passed**; `test/p22TeacherTestingFixes.test.ts` + `test/multiClass`: 26 files, 206 passed. Frontend `npx tsc --noEmit` clean.

## MoodleCloud check (owner, about 15 minutes; lms-test only)

Needs: this branch deployed to lms-test, `npm run migrate` against the lms-test database (adds the `lms_registration_codes` indexes), `LMS_LTI_ENABLED` and `LMS_DEEP_LINKING_ENABLED` on.

1. As an ENARA admin on lms-test, **LMS connections › Connect Moodle (one URL)**: School ID = Test School B, **Create Moodle link**, copy it.
2. In MoodleCloud as site admin: **Site administration › Plugins › Activity modules › External tool › Manage tools**, paste the link in **Tool URL**, **Add LTI Advantage**. Moodle will say there are existing tools for this domain (your School A tool): click **Register as a new external tool**. Expect the page "ENARA is registered. Click Activate in Moodle." and a card **ENARA (Test School B)**, Pending. Click **Activate**.
3. Do "School admin: after connecting" in `TEACHER_GUIDE.md` (Tool configuration usage, Accept grades = Always). Optional: open the tool's settings and check the table above (Deep Linking on, services, privacy, Embed without blocks).
4. ENARA **LMS connections**: the new connection is **active**, "connected with a link", one deployment, School B.
5. Create **Enara School B Course**, add **ENARA (Test School B)** with **Select content**, launch as teacher.test and student.test. School A's course still works as before.
If anything fails, the page shows a Reference code (table above).

## Not done (part B or later)

- Platform-storage `postMessage` flow (`lti_storage_target`) and the Problems view (part B; the audit rows above are ready for it).
- No email of the link (Step 2 onboarding); the admin copies it.
- `registration_client_uri` / registration access token from the reply are ignored (ENARA does not update registrations).
- Moodle sends no `authorization_server`, so the token audience stays the token URL (as today).
- `/api/lms/registration-links` is not yet in the `p7RoleMatrix` / `p14_9TenantIsolation` sweeps (they run with the flags off); `phase1b.test.ts` has its own role and tenant checks.

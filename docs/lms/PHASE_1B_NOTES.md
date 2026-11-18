# LMS Phase 1b notes

Phase 1b is built in two parallel parts (registration in one branch, platform storage and the Problems view in `claude/lms-1b-b`). Each part keeps its own sections below so the file merges cleanly.

Standing rule: all work is on **https://lms-test.enara.app** only; test.enara.app stays frozen (no deploy, migration, flag change or read) until Mohamed reopens it.

<!-- ===================== Part B: platform storage + Problems view ===================== -->

## Platform storage

Status: built and tested locally (2026-11-18), branch `claude/lms-1b-b`. Not deployed. No migration needed (new optional fields only, no new index).

### What it is

1EdTech's draft specs "LTI Client Side postMessages", "LTI Platform Storage" and "LTI OIDC Login with LTI Client Side postMessages" let a tool keep the OIDC `state` and `nonce` in the **platform's own page** (through `window.postMessage`) instead of in a cookie. A platform that supports it adds **`lti_storage_target`** (the name of the frame to talk to, or `_parent`) to the OIDC login request. Today, when the browser drops ENARA's state cookie inside the LMS frame, the launch is still allowed on the single-use server state and counted as **cookieless** (Phase 1a, decision 2:A). Platform storage is the safer replacement for those launches: it proves the launch finishes in the browser that started it.

### The flow

```
LMS frame                         ENARA /lti/login                      LMS auth                 ENARA /lti/launch                ENARA /lti/launch/verify
---------                         ----------------                      --------                 -----------------                ------------------------
login (with lti_storage_target) -> state row (+ storageTarget),
                                   state cookie (as before),
                                   200 page: put_data
  <- lti.put_data state_<state>=<state>, nonce_<nonce>=<nonce>
  -> acks (or 3 s timeout)
                                   page goes on to the auth URL ->     id_token form post ->    cookie came back? normal launch.
                                                                                                 no cookie: check the id_token,
                                                                                                 park it (encrypted, 2 min) behind a
                                                                                                 one-time handle, 200 page: get_data
  <- lti.get_data state_<state>, nonce_<nonce>
  -> values (or error / timeout)
                                                                                                 page form-posts state, handle,
                                                                                                 r=ok|missing|unavailable, s, n  ->  compare hashes, use the
                                                                                                                                     parked id_token once, then the
                                                                                                                                     normal launch (303 to /lms/launch)
```

- **Login** (`GET`/`POST /lti/login`): when the request has a valid `lti_storage_target` (`_parent` or a frame name, `[A-Za-z0-9_.:-]{1,100}`) and `LMS_PLATFORM_STORAGE_ENABLED` is not `false`, the state row records `storageTarget` and the response is a small page instead of the 302. The page sends `lti.put_data` for `state_<state>` = state and `nonce_<nonce>` = nonce (the spec's example keys), waits for both acknowledgements (or 3 seconds), then goes on to the platform's auth URL (the same URL the 302 would have used). **The state cookie is still set**: a browser that keeps it never needs the storage. Without `lti_storage_target`: exactly as before (302).
- **Launch** (`POST /lti/launch`): with the state cookie (or other state cookies, which still give `state_cookie_mismatch`) nothing changes. With **no** state cookie and a login that used storage: the id_token is fully checked first (signature, issuer, audience, times, azp, nonce); a bad token is refused at once and its state used up. A good one is **parked on the state row**, encrypted with `LMS_KEK` (AES-GCM, AAD bound to the state hash), behind a 32-byte one-time handle of which only the SHA-256 is kept, for at most 2 minutes (`heldAt`, `holdHash`, `idTokenEnc`, `select: false`). The response is a page that sends `lti.get_data` for both keys and form-posts `state`, `h` (handle), `r`, `s`, `n` to **`POST /lti/launch/verify`**.
- **Verify** (`POST /lti/launch/verify`): finds and deletes the row by state hash **and** handle hash in one atomic step (single use), then:
  - `r=ok` and the values hash to the stored state and nonce hashes → the launch continues, bound by storage: **not cookieless**, `lms_platforms.storageLaunchCount` +1, audit `lti.launch` with `refIds.binding = 'storage'`.
  - `r=ok` with other values, or `r=missing` (the storage answered `key_not_found`) → refused **`storage_mismatch`** (same meaning as `state_cookie_mismatch`: the sign-in did not start in this browser).
  - `r=unavailable` (no storage frame, an error other than `key_not_found`, answers from another origin, or no answer within 3 seconds) → **falls back to the cookieless path** (allowed, counted in `cookielessLaunchCount`, landing URL `c=1`), audit `lti.launch` outcome `warn` with code **`storage_unavailable`**.
  - A wrong or reused handle, or a hold older than 2 minutes → `state_invalid`. A held state can never be launched again through `/lti/launch`.
- The rest (deployment, claims, preview, picker, provisioning, the one-time launch token) is the same code as before (`completeLaunch` in `oidc.ts`).

### Why the id_token is not re-posted through JavaScript

The page that talks to the storage only ever holds the state, the nonce (both already known to whoever started the login) and a one-time handle. The id_token, which carries the person's name and email, stays on the server, encrypted, for at most 2 minutes, and is deleted as it is used. If the page posted the id_token back, any script error or extension on the page would see it, and the verify endpoint would have to re-check a token that could be swapped. The handle is useless without the state, and vice versa; both are single use.

### Security notes

- `postMessage` goes only to the **origin of the platform's OIDC auth URL** (the spec's `targetOrigin`), never `*`; only responses from that origin with a `message_id` the page sent are read (spec: "The tool MUST validate that the response comes from the OIDC Authorization URI origin").
- Target frame: `_parent` → the parent window (or the opener for a new window); otherwise `parent.frames[name]` (spec: `frameName === "_parent" ? parent : parent.frames[frameName]`).
- The pages are framed only by the platform's origins (`frame-ancestors`), run **one static script allowed by its SHA-256 hash** (`script-src 'sha256-…'`, no `unsafe-inline`), keep `default-src 'none'`, `base-uri 'none'`; the login page has `form-action 'none'`, the launch page `form-action <LMS_TOOL_BASE_URL>`. Per-request data is a JSON data block (`<script type="application/json">`, `<`, `>` and `&` escaped), which CSP does not run.
- The fallback is no weaker than today: a storage that does not answer gives the same cookieless launch as a browser that drops the cookie (decision 2:A). A storage that answers but does not hold the keys is refused.
- Nothing personal is logged. Audit rows: `lti.login` `refIds.storage` (true/false when the platform asked), `lti.storage_check` (ok), `lti.launch` `refIds.binding` and code `storage_unavailable`, refusals `storage_mismatch`.

### Settings

| Name | Default | Notes |
|---|---|---|
| `LMS_PLATFORM_STORAGE_ENABLED` | `true` | Kill switch. Platform storage is used only when the platform sends `lti_storage_target`; `false` ignores it (cookie / cookieless as before). |

New optional fields: `lms_oidc_state.storageTarget`, `heldAt`, `holdHash`, `idTokenEnc` (the row keeps its 10-minute TTL index; a hold shortens it to 2 minutes); `lms_platforms.storageLaunchCount` (shown on the connection card as "N through the LMS page storage" when above 0). No index, no migration.

### Does Moodle send `lti_storage_target`? (research, 2026-11-18)

**No. Moodle 4.1 to 5.1 (and `main`) do not send it**, so with Moodle this flow does not run and launches behave exactly as in Phase 1a (cookie, else cookieless).

- Moodle builds the OIDC login request in `lti_build_login_request()` (`mod/lti/locallib.php`; `public/mod/lti/locallib.php` from 5.1). Checked on GitHub for `MOODLE_401_STABLE`, `MOODLE_403_STABLE`, `MOODLE_404_STABLE`, `MOODLE_405_STABLE`, `MOODLE_500_STABLE`, `MOODLE_501_STABLE` and `main`: the parameters are only `iss`, `target_link_uri`, `login_hint`, `lti_message_hint`, `client_id`, `lti_deployment_id`. The string `lti_storage_target` does not appear in that file on any of these branches.
- No Moodle tracker issue implementing LTI platform storage was found; the related Moodle issues are about Dynamic Registration's `postMessage` (MDL-74288: no `targetOrigin`; MDL-73779). The Moodle plugin "LTI Message Handler" (`ltisource_message_handler`) only handles `lti.frameResize`-style messages, for Moodle 3.4–3.7.
- Platforms that do send it: Canvas (it also answers `lti.capabilities` with the frame name, e.g. `post_message_forwarding`). Anthology Learn documents that it does not append it to the registered login URL.
- So for Moodle the cookieless count on the connection card stays the measure. If Moodle adds it later, nothing needs to change in ENARA.

Sources: [1EdTech LTI Platform Storage (draft)](https://www.imsglobal.org/spec/lti-pm-s/v0p1), [LTI Client Side postMessages (draft)](https://www.imsglobal.org/spec/lti-cs-pm/v0p1), [LTI OIDC Login with LTI Client Side postMessages (draft)](https://www.imsglobal.org/spec/lti-cs-oidc/v0p1), [Moodle `mod/lti/locallib.php` (5.0)](https://github.com/moodle/moodle/blob/MOODLE_500_STABLE/mod/lti/locallib.php), [Canvas: using window.postMessage in LTI tools](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_window_post_message), [Anthology: OIDC login without cookies](https://docs.anthology.com/docs/lti/core/poidc-login-lti_storage_target), [MDL-74288](https://tracker-old.moodle.org/browse/MDL-74288).

### Tests (`backend/test/lms/phase1b.test.ts`)

The pages' script is run for real (Node `vm`) against a simulated platform window with a storage frame that keeps keys per tool origin and answers like the spec (`key_not_found`, errors, silence, a wrong origin). Covered: login without `lti_storage_target` (302, unchanged); with it (the page, CSP with the script's real hash, frame-ancestors, the two `lti.put_data` messages to the platform origin only, the auth URL, the state row and audit); `_parent`; a silent storage at login; an invalid target name and the kill switch; launch with the cookie (normal); launch without the cookie → page → verify → signed in, not cookieless, counted as storage, id_token never in the page and stored encrypted, single use; a sign-in started in another browser (`storage_mismatch`); wrong values and a wrong handle; no answer / wrong origin / error → cookieless fallback with `storage_unavailable`; no storage frame; a bad id_token refused before any page; a held state launched again; an expired hold; missing fields; LMS off = 404.

## Problems view

Status: built and tested locally (2026-11-18), branch `claude/lms-1b-b`.

**`GET /api/lms/problems?days=1|7&institutionId=`** (default `days=1`; anything else is 400).

| Who | Sees |
|---|---|
| ENARA admin | every school, including rows with no school (an unknown LMS); `?institutionId=` narrows to one school; each row lists its school IDs |
| School admin | their own school only (`?institutionId=` is ignored) |
| Teacher, academic manager, student, parent | 403 |
| Signed out | 401 |
| LMS off | the app's normal 404 |

Answer:

- `problems`: `lms_audit_log` rows with outcome `fail` or `warn` in the window, grouped by **code and event**: `count`, `failCount`, `warnCount`, `severity`, `area` (launch, sign_in, grades, roster, registration, seats, other), `firstSeen`, `lastSeen`, `platformIds` and `contextIds` (IDs only, sorted, at most 10 each, with the total counts), and `help`.
- `open.deadGradeJobs`: grade jobs in status `dead` now (whatever their age), grouped by their last error code. `open.failedRosterSyncs`: courses whose **last** roster sync failed, grouped by error code. (Both are also in the audit when they happen; these lists show what is still broken.)
- `help`: `{ known, en: { what, fix }, ar: { what, fix } }` from a fixed table in code (`core/problemHelp.ts`): every `LtiErrorCode` (the type forces it to be complete), `cookieless`, `storage_unavailable`, `storage_mismatch`, the session codes (`account_unavailable`, `role_not_supported` / `lms_role_not_supported`, `preview_not_staff`, launch-token and "Open in new tab" codes), current-class codes, seats, the grade codes (`not_eligible`, `lineitem_gone`, `no_line_item`, `timeout`, `network`, `no_token_url`, …, and the HTTP families `token_http_NNN`, `lineitems_http_NNN`, `lineitem_create_http_NNN`, `score_http_NNN`, `results_http_NNN`, `memberships_http_NNN` with the status filled in), the roster codes, and **`registration.duplicate_lms`** ("Already connected…"). Lookup order: the exact code, then `<event area>.<code>` (an audit row with event `registration.*` and code `duplicate_lms` finds `registration.duplicate_lms`), then the HTTP family, else a generic text that names the code (`known: false`). Arabic is simple Modern Standard Arabic with Western digits.

**Frontend**: a **Problems** section in LMS connections (`frontend/pages/LmsProblems.tsx`): Last 24 hours / Last 7 days, a school ID filter for ENARA admins, each group with Failed/Warning, area, Reference code, count, last seen, what happened, what to do, connection and course IDs; then "Still open now" (dead grade jobs, failed roster syncs). The staff app has no UI language setting, so like the activity picker the section opens in **Arabic when the browser language is Arabic**, English otherwise, with an EN / العربية switch (right-to-left in Arabic; dates with Western digits). No names anywhere.

**Tests** (`phase1b.test.ts`): permissions (ENARA admin, school admin, teacher/manager/student 403, signed out 401, bad `days` 400); school isolation (a school admin asking for another school still gets their own; no other school's IDs, no school-less rows); ENARA all schools and one school; grouping and counts (fail vs warn, first/last seen, ok rows never shown, the 24 h and 7 day windows, rows older than 7 days never shown, ID lists capped at 10 with totals); dead grade jobs and failed roster syncs per school; texts in both languages for every row; `registration.duplicate_lms` says "already connected"; unknown codes; no names; LMS off 404; and a table test: every `LtiErrorCode` and the required grade/roster/registration/binding codes have English and Arabic texts, the Arabic is Arabic script with no Eastern Arabic digits.

**For the registration branch (merge note)**: write the "already connected" case to the audit with outcome `warn`, event `registration.<something>` and code `duplicate_lms` (or code `registration.duplicate_lms`); add any other registration codes to `OTHER_HELP` in `core/problemHelp.ts` (until then they show the generic text with their code).

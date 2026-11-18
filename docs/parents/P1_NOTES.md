# Parents P1: parent access setting, usage, code-first entry

Branch `claude/parents-p1` → `lms-test-live`. lms-test only (test.enara.app frozen). Plan:
`PARENTS_P1_P5_PLAN` (owner decisions of 18 Nov 2026 are binding). Flow overview: [SIGN_UP_FLOW.md](SIGN_UP_FLOW.md).

## Switches (default off; with both off the site behaves exactly as before)

| Switch | What | lms-test |
|---|---|---|
| `PARENT_SETTINGS_ENABLED` | per-school parent access (Off / Free), usage events + nightly rollup, the Parents page/cards, "Provided by <school>" instead of the mock plan | on (`deploy/lms-test.flags.json`) |
| `PARENT_CODE_SIGNUP_ENABLED` | code-first entry, the remembered device, the secret-code warning on the code page | on |

`deploy/lms-test/lib.mjs` now accepts the `PARENT_` prefix (test in `lib.test.mjs`: `PARENT_*` switches pass,
secret-looking names such as `PARENT_TOKEN_SECRET`, `PARENT_API_KEY`, `PARENT_INVITE_URL` are still refused).
`PARENT_EMAILS_ENABLED` stays unmanaged (P4).

## What each person sees

- **ENARA admin**: sidebar **Parents**: every school with its parent access (Free / Off, a select; the paid
  option is not built, D2), parents linked, active parents (7 and 30 days), most-used screens (30 days). EN/AR.
  Every change is audited (`parent_access_changed`, from/to, IDs only).
- **School admin**: sidebar **Parents**: the school's Parents card (same numbers) and the access setting,
  read-only ("set by the ENARA team"). Teachers never see it.
- **Parent**:
  - `/parents` (signed out): **Enter the code from the school** (code-first). Preview ("Is this your child?
    Laila M. at School A"), then **Yes, open ENARA Parents**: no account, password or Google step. Above it:
    **Already have an account? Sign in with your email first** (the existing sign-in; passwordless email
    sign-in comes in P2). The secret-code warning (EN/AR): "This code is secret. Anyone who has it can see your
    child's data. Don't share it. The school can unlink a parent at any time." And before going in: "This
    device will remember you … without an email, if you lose this device or sign out, ask the school for a new
    code."
  - The device remembers the parent: reloads, expired session tokens and a cleared session all reopen the
    portal (device token → fresh session token).
  - **Add another child** (the + chip and Account): the next child's code; same account; children may be at
    different schools. The secret-code warning is shown there too.
  - Account: **Provided by <school>** per school, "Free for you" (no mock price). A code-only account gets a
    note, and **Sign out** asks first ("you will need a new code from the school").
  - A school set to **Off**: that school's children disappear (with a short notice); children at other schools
    stay. Back to **Free**: they are back (the link was never ended).

## Design

- **Access setting**: `Institution.parentPortal.access` (`off` | `free`; unset = free, D1), read only in
  `parents/schoolAccess.ts`. Enforced in the one gate (`service.requireLearner`, 403 `PARENT_SCHOOL_ACCESS_OFF`),
  in `listLearners` (left out, `hiddenBySchool` count) and on redeem/preview (a code for an Off school makes no
  link; not counted as a wrong code). Links are not ended (switching back restores them).
- **Code-first account** (`parents/codeSignup.ts`): role `parent`, a placeholder address on
  `code.parents.enara.invalid` (reserved: never emailed, cannot sign in; reset emails are refused), a random
  password nobody knows, `ParentProfile.signIn = 'code'`. The code is redeemed through the same `confirmCode`
  (single use, school/archive checks, audit). If the redeem fails the empty account is removed. Public routes
  `POST /api/parents/start/preview`, `POST /api/parents/start` (per-IP limiter, 30 / 15 min).
- **Remembered device** (`parents/deviceSession.ts`, `parent_device_sessions`): 32 random bytes, shown once,
  stored as a SHA-256 hash, 180 days sliding (TTL index). `POST /api/parents/device/session` exchanges it for
  a normal session token (per-IP limiter). It stops working on sign-out anywhere (bound to `User.tokenVersion`),
  on `POST /api/parents/device/sign-out`, or at expiry. The app retries a request once after a 401 with the
  device token, and `/parents` resumes from it when no session is stored. The token is never in a URL or log.
- **Usage** (`parents/usage.ts`, `parent_usage_events`): one row per parent, school, (child), day and event
  name, with a count; IDs and dates only; TTL 13 months (D10). Logins (any sign-in by a parent through the
  sign-in log, and device resumes), screens (home, progress, activity, controls, report, account), features
  (share_report, controls_changed, link_child, guardian_role). Nightly rollup in `/api/cron/daily`
  (`parent_usage_daily`: per school and Cairo day: active parents, logins, linked parents, screens, features;
  13 months). The cards read live counts. PDPL: student erasure deletes the student's usage events
  (`studentErasure` list); `deleteParentUsage` removes a parent's (used by the P2 merge).
- **API**: `/api/parents-admin/status|schools|schools/:id/access` (404 with the switch off; admin and
  enara-admin; only enara-admin may PUT).
- **Migration** `2026-11-26-parents-p1`: indexes of the three new collections (checks the 13-month TTL).

## Tests

- `backend/test/parentsP1.test.ts`: switches off = no change; code-first (preview, start, single use, no empty
  account left, hash-only device token, IDs-only audits); device session (exchange, wrong token, logout
  everywhere, device sign-out); add another child across schools; account plan and sign-in method; access
  Off/Free (only ENARA admin, value check, audit, hides one school only, link kept, codes refused without
  lockout); usage (right school, IDs only, counts, parent password login); rollup distinct parents and
  idempotent; 13-month TTL indexes; cards scope; PDPL erasure.
- `backend/test/codeEmailTemplates.test.ts`: the promoted parent emails.
- `deploy/lms-test/lib.test.mjs`: the `PARENT_` prefix.
- E2E `e2e/tests/10-parents-p1.spec.ts` (see SIGN_UP_FLOW.md). The E2E workflow now also runs for
  `claude/parents-*` branches; `scripts/up.sh` also stops if parent emails are on without capture.

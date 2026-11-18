# Parents P2: class code sheets, email sign-in, merge on a verified email

Branch `claude/parents-p2` → `lms-test-live`. lms-test only (test.enara.app frozen). Flow overview:
[SIGN_UP_FLOW.md](SIGN_UP_FLOW.md). P1: [P1_NOTES.md](P1_NOTES.md).

## Switches (default off; ON for lms-test in `deploy/lms-test.flags.json`)

| Switch | What |
|---|---|
| `PARENT_CODE_TOOLS_ENABLED` | class code sheets (print, CSV, revoke one / by class), teachers issuing codes for their own classes when the school allows it (D3, default no), the school's code expiry (1-60 days, default 7) |
| `PARENT_EMAIL_SIGNIN_ENABLED` | "Add your email" with a 6-digit code, passwordless email sign-in, the merge of two parent accounts on a verified email |

## What each person sees

- **School admin**, sidebar **Parents**:
  - **Parent code settings**: how long codes last (days, 1-60) and "Teachers may issue codes for their own classes". Audited.
  - **Class code sheets**: every class with its active students and unused codes. **Print parent codes** makes one
    new code per active student (archived students are skipped) and shows a sheet ONCE: student, class, code,
    expiry. The sheet has **Print** (print view: the sheet only) and **Download CSV** (made in the browser). It
    carries the secret-code warning and "Never enrol parents in Moodle courses with ENARA activities." in English
    and Arabic. No QR code. A **reprint** first warns: "Codes already printed for this class will stop working."
    It then makes new codes and revokes the class's unused ones (owner decision 4). **Revoke this class's codes**
    stops all of them.
- **Teacher**: the same sheets for their own classes only, once the school allows it (otherwise no Parents page).
- **ENARA admin**: unchanged from P1 (access and usage).
- **Parent**:
  - Home shows **"Add your email to get notifications and sign in on any device."** with the warning "Without an
    email, if you lose this device or sign out, you will need a new code from the school." It can be dismissed
    and comes back the next time the app opens, until an email is added. The parent types the email, gets a
    6-digit code by email and types it. Account shows the email (Confirmed) and **Change email**.
  - Sign-in page: **Already have an account? Sign in with your email first** opens **Sign in with your email**:
    email → 6-digit code → in, and this device is remembered. "Sign in with a password instead" stays for
    existing password accounts (g).
  - If the email already belongs to another parent account: **"This email already has an account with another
    child. Merge them?"** (naming that account's children). **Merge accounts** keeps every child, consent,
    setting and history in the account that has the email. The device continues as that account, and the other
    account is disabled.

## Rules and design

- **Codes by email** (`parents/emailSignin.ts`, `parent_email_codes`): 6 digits, 10 minutes, at most 5 tries (then
  dead), one use. A new request replaces the old code. At most one request a minute and 5 an hour per address
  and purpose, plus a per-IP limiter (60 / 15 min on `/api/parents/email`). Only hashes are stored: the email as
  SHA-256, the code salted with its row ID. Emails `parent-email-verify` and `parent-sign-in-code` (approved
  18 Nov) have no link at all; `sendParentTemplate` refuses a link carrying the code. They are sent through the
  email safety path (`email/testInbox.ts`): on lms-test every one goes to the test inbox with `[lms-test]` and the
  "Test copy" line, under the daily ceiling. They are transactional and gated by this switch, not by
  `PARENT_EMAILS_ENABLED` (P4).
- **Sign-in start** always answers `{ sent: true }`: no account enumeration. A code is only mailed for an active
  parent account with that address. Reserved or code-only placeholder addresses are refused. An address of a
  staff or student account is refused for "Add your email".
- **Merge** (`mergeParentAccounts`): only with the 10-minute ticket that a successful code verification issued,
  for exactly that pair of accounts, used once. What moves:
  - links, with their role, consent, controls and end history; if both accounts have the same child, the active
    link wins and the other row's ID is kept in the audit;
  - redeemed codes;
  - usage events.
  The merged-away account: disabled, `tokenVersion` bumped, device sessions revoked, `ParentProfile.mergedInto`.
  Audited as `parent_accounts_merged` (IDs only). Never a merge without that verification.
- **Class sheets** (`parents/codeTools.ts`): `ParentLinkCode.classId/batchId`; one audit row per batch
  (`parent_codes_batch_created`, counts only). The sheet response is `Cache-Control: no-store`. A school with
  parent access Off issues no sheet. Another school's class, or a teacher outside their class: 403. Teachers
  when the school has not allowed them: 403 `TEACHER_CODES_OFF`.
- **Code expiry**: `Institution.parentPortal.codeTtlDays`, used by every code the school issues (single codes
  too). 7 days with the switch off.
- **E2E capture**: in the Docker stack (`LMS_EMAIL_CAPTURE`, never on lms-test) a code email is recorded, not
  sent, and the code is kept for 15 minutes in `parent_captured_codes`. The suite reads it with the
  token-protected `POST /api/maintenance/parent-email-code` (body `{ email, purpose }`; 404 without capture). Not
  written at all without capture.
- Migration `2026-11-27-parents-p2`: indexes of `parent_email_codes`, `parent_captured_codes`,
  `parent_link_codes.classId`.

## Tests

- `backend/test/parentsP2.test.ts` (12):
  - switches off;
  - add your email: no link, 5 tries, replacement, the 1-a-minute and 5-an-hour limits, staff and reserved
    addresses refused, hashes only, IDs-only audits;
  - email sign-in: no enumeration, wrong code, remembered device;
  - merge: offer, foreign or invalid ticket refused, links/usage/codes moved, merged account and devices dead,
    single-use ticket, same-child conflict;
  - settings: 1-60, admin only, audited, applied;
  - sheets: active students only, no codes in audits or listings, reprint revokes, revoke one or by class,
    teacher rules, Off school.
- E2E `e2e/tests/11-parents-p2.spec.ts`: the owner's scenario (one parent, two children in two schools, a second
  device, the email merge), plus the class code sheet with its reprint warning, the CSV, teachers' access and
  the captured emails.

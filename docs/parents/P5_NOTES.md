# Parents P5: CSV invitations

Branch `claude/parents-p5` → `lms-test-live`. lms-test only (test.enara.app frozen).

## Switches

- `PARENT_CSV_INVITES_ENABLED`: default off; ON for lms-test in `deploy/lms-test.flags.json`.
- Each school's own **"Invite parents with a CSV file"** setting: default off. The school admin turns it on in
  Parents → Parent settings.

## What the school admin sees (Parents → "Invite parents (CSV)")

1. Upload a CSV with these columns: `student_ref, parent_email, parent_name (optional), language (en/ar,
   optional)`. `student_ref` is the ENARA student ID or the Moodle user ID (the LMS user ID the launches
   carry), never an email (D5). The file is read in the browser and sent as text; it is never stored.
2. **Check the file** marks every row: OK, bad email (also reserved domains), unknown student (another school's
   student reads as unknown too, so nothing is revealed), archived, duplicate, or missing value. Addresses are
   shown masked (`s•••@domain`). **Nothing is created or sent.**
3. **Send …**: the server checks the text again. Then, for each OK row, a new code (the school's expiry) and an
   invitation. **Rows with the same parent email become ONE `parent-invite` email** listing each child's first
   name, school and code. The codes are only in that email: never in a link, never shown to the admin. The email
   goes through P4's path: on lms-test the test inbox, `[lms-test]` and the ceiling; never twice. One audit row,
   counts only.
4. **Invitations**: student, masked address, status (sent, redeemed, expired, revoked), **Resend** (a new code; the
   old one stops working; a new email for that child) and **Revoke**.

## Parents

- No email binding (owner decision e, D6 dropped). Any parent redeems the code (code-first or signed in).
- When that parent adds an email (P2), the invited address is pre-filled as a **suggestion**, and they can
  change it.

## Data and PDPL

- `parent_invites`: IDs, the address **hidden** (`select: false`, used only to resend; masked in the list) with a
  SHA-256 hash for grouping, the code's ID (never the code), the batch, and redeemed-by. Kept 13 months (TTL).
  **Erased with the student.** A permanently deleted student no longer exists, so they can never be invited
  (unknown).

## Tests

- `backend/test/parentsP5.test.ts` (7):
  - the CSV reader;
  - the switches (404 / school setting / school admin only);
  - preview: every status, masked addresses, nothing created or sent, Moodle user ID, other school unknown;
  - confirm: ONE email per address (case-insensitive) with both codes in the body, Arabic per row, codes never
    in links or in the response, one audit row;
  - the suggestion after a code-only redeem;
  - the list: sent, redeemed, expired, revoked, resend, revoke, other school 403;
  - PDPL erasure.
- E2E `e2e/tests/14-parents-p5.spec.ts`: the setting; the preview (6 rows: 2 OK for one parent, unknown,
  duplicate, bad email, another school); confirm makes ONE captured, redirected email; revoke and resend; no
  code in any URL.

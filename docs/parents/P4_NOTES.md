# Parents P4: parent emails through the email safety path

Branch `claude/parents-p4` → `lms-test-live`. lms-test only (test.enara.app frozen).

## Switch

`PARENT_EMAILS_ENABLED` (default off; ON for lms-test in `deploy/lms-test.flags.json`). It already existed, and P4
wires it.

## Emails and triggers (`parents/parentEmails.ts`)

| Template (approved 18 Nov) | Sent when | School switch (D11 default) |
|---|---|---|
| `parent-link-confirmed` | a code is redeemed and the link is active (to a parent with an address) | on |
| `parent-link-ended` | the school unlinks the parent, or the student is archived or left the school (incl. LMS: left all classes). **Not** when the parent unlinks themself, **not** after a PDPL deletion (owner decision 2) | on |
| `parent-new-results` | a result becomes visible to the parent under the P3 rule: released (an automatic release counts), or finalized for an "immediately" school. **At most one per child per day** | **off** |
| `parent-weekly-summary` | **one email per parent**, a section per child, for the week that ended (Saturday–Friday). Sent by the daily job once Sunday 18:00 Cairo has passed (with lms-test's 06:23 daily run, that is Monday morning). Also "Share this week → Email" (that child's section, on demand) | on, and the parent can turn it off |
| `parent-invite` | "Send code by email" on a student (P5: CSV invites) | — |

- **Recipients**: the parent's own account address. A code-only account has no address, so it gets no email
  (and "Share → Email" asks the parent to add one first). An invite goes to the address the school typed.
- **The parent's own on/off** (Account): weekly summary by email, new results by email.
- **The school's switches**: the staff Parents page → Parent settings → "Emails to parents" (school admin).
  Audited.
- **The two buttons #22 blocked on staging** ("Send code by email", "Share this week → Email"): with
  `PARENT_EMAILS_ENABLED` on they are no longer blocked. They now send the approved templates (`parent-invite`,
  `parent-weekly-summary`) instead of the older `enara-parent-consent` / `enara-weekly-progress`.

## Safety (all through `deliverRendered` → `email/testInbox.ts`, PR #22)

- On lms-test: ONE copy to the test inbox, `[lms-test]` in front of the subject, the "Test copy: this email was
  for …" line, the 300-a-day ceiling (held above it, with one alert). In the E2E stack: captured, never sent.
- **Never twice**: `parent_email_sends.key` per event (`confirmed:<link>:<code>`, `ended:<link>:<endedAt>`,
  `results:<parent>:<child>:<day>`, `weekly:<parent>:<weekStart>`, `invite:<codeId>`, `share:<link>:<minute>`).
  A failed send is tried again by a later event with the same key, at most 3 times. Rows hold IDs, the
  template, the outcome and a code only: no address, no subject, no body. They are kept 13 months and erased
  with the student (PDPL).
- Values are HTML-escaped in the body (names are typed by people); subjects are plain text. Each email names
  only the parent's own child (first name). Codes are in the body only, and a link carrying a code is refused.
- An email problem never fails the event that triggered it (redeem, unlink, release, …).
- Maintenance (test database only, token-protected): `POST /api/maintenance/parent-weekly` (`{ force: true }` runs
  the weekly step on any day; still once per parent per week) and `GET /api/maintenance/parent-emails` (the
  send rows).

## Tests

- `backend/test/parentsP4.test.ts`:
  - switch off: nothing is sent and the staging block stays;
  - confirmed: once, escaped, nothing for code-only parents, the school switch;
  - ended: sent for a school unlink and an archive; not sent for the parent's own unlink or a PDPL deletion;
  - new results: off by default, released only, one per child per day, the parent's opt-out;
  - weekly: one email per parent with two children in two schools, once per week, "not yet" before Sunday
    evening, the school switch and the opt-out;
  - Share → Email;
  - invite: the code in the body only, the secret-code warning, the school's expiry;
  - the settings validation.
- E2E `e2e/tests/13-parents-p4.spec.ts`: the switches on the Parents page; confirmed, invite, new results (one per
  day), the weekly summary (one per parent), Share → Email (button enabled), link ended (school unlink only);
  every parent email of the run is captured and redirected.

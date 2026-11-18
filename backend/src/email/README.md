# Transactional email (Resend templates)

The HTML source of every email is `templates/<alias>.html` (+ subject/variables in `<alias>.json`).
`sendTemplate` renders that HTML in code and sends it as `html` (it does **not** send by Resend template id).
The same files are pushed to Resend so its dashboard, preview and "send test" show them.
The single source of truth for aliases, ids and variables is [`templateRegistry.ts`](./templateRegistry.ts).

Sender: `The Enara Team <noreply@test.enara.app>` (`EMAIL_SENDER`).

| Alias | Resend id | Variables |
|---|---|---|
| enara-welcome | 4f7c1ade-5991-4ebe-a300-aa5a5b4db313 | NAME, ACTION_URL |
| enara-verify-email | ef72353a-9930-4670-b68a-42c30986e8ad | NAME, ACTION_URL, EXPIRES_IN |
| enara-password-reset | 15397fc6-acaa-453d-a103-b80d9e0f6394 | NAME, ACTION_URL, EXPIRES_IN |
| enara-parent-consent | 57ebb3c9-2cb5-4ab5-aea6-1c4baba3952b | NAME, CHILD_NAME, LINK_CODE, ACTION_URL, EXPIRES_IN |
| enara-lesson-reminder | f6972409-d9e9-4bec-9c99-c6c41b573221 | NAME, LESSON_TITLE, ACTION_URL |
| enara-weekly-progress | 879509b9-d69b-4c01-8b7f-26d01be2e15e | NAME, CHILD_NAME, LESSONS_DONE, OUTCOMES_MASTERED, TIME_SPENT, PRACTICE_TIP, ACTION_URL |
| enara-assessment-results | 732d6b7a-77cb-4c51-be8f-22278fb4e70f | NAME, CHILD_NAME, TEST_NAME, SCORE, LEVEL, SUMMARY, ACTION_URL |
| enara-class-invitation | 4fc89699-5d97-40e1-8c9f-906c2846f97d | NAME, TEACHER_NAME, CLASS_NAME, ACTION_URL, EXPIRES_IN |

> **Status:** all 8 templates were pulled from the test.enara.app Resend account on 2026-11-16
> and are in `templates/`. Edit them here and push with `push-templates.ts --confirm`.

## Pull / edit / push

Run from the repo root with `RESEND_API_KEY` exported (never commit it; `.env` is gitignored):

```bash
npx tsx scripts/email/pull-templates.ts            # writes templates/<alias>.html + <alias>.json
# edit templates/<alias>.html (and subject/from/variables in <alias>.json)
npx tsx scripts/email/push-templates.ts            # dry run: lists what would change, exits 1
npx tsx scripts/email/push-templates.ts --confirm  # PATCH /templates/{id} then POST /templates/{id}/publish
npx tsx scripts/email/push-templates.ts --confirm enara-welcome   # only some aliases
npx tsx scripts/email/bundle-templates.ts          # REQUIRED after any edit: regenerates templatesBundle.ts
```

**Always re-run `bundle-templates.ts` after editing a template.** The runtime (Vercel functions) cannot read
`templates/`, so `sendTemplate` uses the generated [`templatesBundle.ts`](./templatesBundle.ts)
(alias → `{ subject, fallbacks, html }`). A test checks the bundle matches the files byte-for-byte, so a stale
bundle fails CI. `push-templates.ts` still updates Resend, but only for previews/dashboard — sending ignores it.

`<alias>.json` holds `id`, `name`, `subject`, `from` and `variables` (`key`, `type`, `fallback_value`).
When adding or renaming variables, update `templateRegistry.ts` too — `sendTemplate` types follow it.

## Logo

Templates reference the **hosted** logos, so Resend's preview and test button show them:
`https://assets.enara.app/email/enara-logo.png` (black, transparent) and
`https://assets.enara.app/email/enara-logo-white.png` (white, swapped in under `prefers-color-scheme: dark`;
Apple Mail, iOS/macOS Outlook, Outlook.com; Gmail keeps the black one). Both live in the Cloudflare R2 bucket
`enara-email-assets`.

On send, `sendTemplate` replaces those two URLs with `cid:enara-logo` / `cid:enara-logo-white` and attaches both
PNGs inline (from `logoInline.ts`, base64 of `assets/*.png`), so real emails show the logo even in clients that
block remote images (Roundcube, Outlook desktop, many school mail systems).

To change the logo: replace `assets/enara-logo*.png`, regenerate `logoInline.ts` (a test checks they match),
and re-upload the hosted copies.

## Links (ACTION_URL is built in code)

Callers never pass `ACTION_URL` for aliases that have a page in the app: they pass link params and
[`links.ts`](./links.ts) builds the URL from `getConfig().appUrl` (`APP_URL`, trailing slashes trimmed,
params URL-encoded). Without an app URL `sendTemplate` returns `{ ok: false, code: 'missing_app_url' }` and sends nothing.

| Alias | Caller passes | ACTION_URL |
|---|---|---|
| enara-welcome | – | `${APP_URL}/` |
| enara-weekly-progress | – | `${APP_URL}/` |
| enara-password-reset | `token` | `${APP_URL}/reset-password?token=…` |
| enara-class-invitation | `token` | `${APP_URL}/accept-invitation?token=…` |
| enara-assessment-results | `assessmentId` | `${APP_URL}/?assessment=…` |
| enara-lesson-reminder | `courseId` | `${APP_URL}/?course=…` |
| enara-verify-email | `ACTION_URL` (caller-supplied) | no page in the app yet |
| enara-parent-consent | `LINK_CODE` (shown in the body only) | `${APP_URL}/parents/link` (never carries the code) |

When a page for email verification exists, add it to `TEMPLATE_LINKS` in `links.ts`.

**Parent link codes are never in a URL** (P0 item 4, owner decision D15): `enara-parent-consent` shows the
code in the body (`LINK_CODE`, no fallback, so an empty code fails as `unfilled_placeholder`), and its
button opens `/parents/link` with no parameters. As a second check, `sendTemplate` refuses
(`code_in_url`) any email whose links carry an `ENR-XXXX-XXXX` code or the given `LINK_CODE`.
The `LINK_CODE` change is in the repo copy of the template only; the copy hosted in Resend is not
updated until the owner approves a push (sending renders the repo copy, so this does not affect sends).

**Reserved recipients** (P0 item 4): `sendTemplate` refuses any recipient on `.test`, `.example`,
`.invalid`, `.localhost`, `example.com`/`.net`/`.org` or `lms.enara.test` (and their subdomains), and an
address without a domain: `{ ok: false, code: 'reserved_recipient' }`, nothing sent, and only the code is
logged (`email.send_template_refused`, never the address). See [`reservedRecipients.ts`](./reservedRecipients.ts).

## Sending

```ts
import { sendTemplate } from './email/sendTemplate';

const result = await sendTemplate('enara-password-reset', user.email, {
  NAME: user.name, EXPIRES_IN: '30 minutes', token,
}); // { ok: true, id } | { ok: false, code, message }
```

Rendering follows Resend: `{{{VAR}}}` is inserted raw, `{{VAR}}` HTML-escaped (the current templates only use
triple braces). A missing/empty value uses the variable's `fallback_value` from `<alias>.json`; the subject is
filled the same way. If any placeholder remains after filling, the call returns `{ ok: false, code: 'unfilled_placeholder' }`.

Variables are type-checked per alias (template variables minus `ACTION_URL` plus the link params above;
all required, no extras) and re-checked at runtime. Failures are logged
with alias + error code/message only (email addresses are scrubbed). The Resend client is created lazily from
`RESEND_API_KEY`; without it the call returns `{ ok: false, code: 'missing_api_key' }`.

Test email (from `backend/`, key exported, to an inbox you own):

```bash
npx tsx -e "import('./src/email/sendTemplate').then(m => m.sendTemplate('enara-welcome', 'you@example.com', { NAME: 'Test' })).then(console.log)"
```

## Account emails

`services/accountTokens.ts` sends the password reset (`enara-password-reset`, expiry from `PASSWORD_RESET_TTL_MS`)
and staff invitation (`enara-class-invitation`, expiry from `INVITATION_TTL_MS`) through `sendTemplate` when
`RESEND_API_KEY` is set (still skipping `.test` addresses and honouring `REMINDER_TEST_RECIPIENT`). Without the key
the previous inline-HTML `sendEmail` path runs unchanged.

## LMS and parent emails (`lms/`, `parents/`: sent from code, not Resend-hosted)

Two sets of emails are rendered and sent from code only. They are **not** in `templates/` or
`TEMPLATE_REGISTRY`, and are never pushed or published to Resend:

- [`lms/`](./lms): LMS emails (owner decisions D1, D4, D5, D11), rendered with the bundle and sent by the
  LMS email service `sendLmsEmail` (below; `sendLmsTemplate.ts` is the plain renderer/sender it shares code
  with), only when `LMS_EMAILS_ENABLED`, `REMINDERS_ENABLED` and `RESEND_API_KEY` are all set.
- [`parents/`](./parents): parent emails, sent only by `sendParentTemplate`
  ([`sendParentTemplate.ts`](./sendParentTemplate.ts)), and only with `PARENT_EMAILS_ENABLED=true`.

**Sending LMS emails:** LMS code never calls `sendLmsTemplate` directly any more: every LMS email goes through
`sendLmsEmail` (`integrations/lms/core/lmsEmail.ts`: gates, idempotency, recipients, the lms-test inbox redirect,
`EMAIL_SUBJECT_PREFIX` and the daily cap, the E2E capture). Which event sends which template:
[`docs/lms/LMS_EMAILS.md`](../../../docs/lms/LMS_EMAILS.md). Parent emails send nothing unless
`PARENT_EMAILS_ENABLED=true` (default off; no caller yet).

Each template is one file per language: `<alias>-en.html` / `<alias>-ar.html` with `<alias>-en.json` /
`<alias>-ar.json` (Arabic is `<html lang="ar" dir="rtl">`, Tahoma, Latin tokens in `<span dir="ltr">`).
Ops emails (`lms-ops-*`, to the ENARA team) are English only (D4). The send alias is the file name, e.g.
`sendParentTemplate('parent-invite-ar', to, vars)`.

`<alias>-<lang>.json` holds what the bundle uses, `subject` and `variables[]` (`key`, `fallback_value`),
plus catalogue metadata the bundler ignores: `status` (`approved`) and `approvedOn`, `alias`, `language`,
`number` (plan number), `group`, `recipient`, `trigger`, `delivery`, `frequency`, a FAKE `sample` per
variable and optional `preview_variants`.

Both senders share [`sendBundledTemplate.ts`](./sendBundledTemplate.ts) and render like `sendTemplate`:
`{{{VAR}}}` raw, `{{VAR}}` HTML-escaped, a missing/empty value uses `fallback_value`, hosted logos become
inline `cid:` attachments. They refuse (nothing sent) a reserved recipient (`reserved_recipient`), a variable
mismatch (`invalid_variables`: every template variable is required, no extras), a leftover placeholder
(`unfilled_placeholder`), a link carrying an `ENR-XXXX-XXXX` code or the given `LINK_CODE` (`code_in_url`, D15)
and a missing key (`missing_api_key`). Logs carry the alias and code only.

LMS emails never carry a student name (no `CHILD_NAME` / `STUDENT_NAME` / `LEARNER`), and no link in any of
these emails carries a token, code or key; `ACTION_URL` is built by the caller from the app URL and opens
a sign-in page. Every LMS template except 12a/12b/12c is wired to its event (docs/lms/LMS_EMAILS.md); `lms-invite-connect`
("Send email" on the onboarding invite) links to `${APP_URL}/?page=lms-status`, never the Moodle link or its code.

Re-bundle after editing any of them (writes `lms/lmsTemplatesBundle.ts` and `parents/parentTemplatesBundle.ts`;
`test/codeEmailTemplates.test.ts` checks the bundles match the files, every sample renders with no `{{`
left, Arabic is right-to-left, ops emails are English only and links carry no codes):

```bash
npx tsx scripts/email/bundle-lms-templates.ts
```

| # | Alias | Languages | Recipient | Trigger | Variables |
|---|---|---|---|---|---|
| 1 | lms-invite-connect | en, ar | School admins (the named admin) | ENARA admin sends the LMS onboarding invite ("Send email", onboarding step 2) | NAME, SCHOOL_NAME, EXPIRES_ON, ACTION_URL, REFERENCE_CODE |
| 2a | lms-invite-expiring | en, ar | School admins (the invited admin) | New code needed: daily cron, invite open and expiring within 3 days, not yet reminded | NAME, SCHOOL_NAME, EXPIRES_ON, ACTION_URL, REFERENCE_CODE |
| 2b | lms-invite-expired | en, ar | School admins (the invited admin) | New code needed: daily cron, invite past its expiry and unused | NAME, SCHOOL_NAME, EXPIRED_ON, ACTION_URL, REFERENCE_CODE |
| 3 (also 4b) | lms-connection-active | en, ar | School admins | platform.registered with status 'active', and platform.approved (also when switched back on) | NAME, SCHOOL_NAME, LMS_NAME, ACTION_URL, REFERENCE_CODE |
| 4a (also E3) | lms-connection-pending | en, ar | School admins | platform.registered with status 'pending'; deployment.registered pending; deployment auto-created pending at launch (E3 uses ITEM) | NAME, ITEM, ACTION_URL, REFERENCE_CODE |
| 4c | lms-connection-rejected | en, ar | School admins | New code needed: ENARA admin 'Reject' with a reason from a fixed list; new status 'rejected' | NAME, LMS_NAME, REASON, FIX, ACTION_URL, REFERENCE_CODE |
| 5 | lms-connection-check-failed | en, ar | School admins | New code needed: 'Check connection' (on save, on demand, daily) plus a daily scan of lms_audit_log fail codes per platform | NAME, LMS_NAME, CHECKED_AT, CAUSE, FIX, ACTION_URL, REFERENCE_CODE |
| 6 | lms-connection-switched-off | en, ar | School admins (ops see it in the E5 digest) | platform.disabled (a "disconnect/delete" would need new code) | NAME, SCHOOL_NAME, LMS_NAME, DATE, BY_ROLE, ACTION_URL, REFERENCE_CODE |
| 7 | lms-key-problem | en, ar | School admins (ops see it in the E5 digest) | Audit fail codes jwks_unavailable, unknown_kid, invalid_signature (lti.launch/lti.login) and token_http_400/401 on grade or roster calls | NAME, LMS_NAME, FIRST_SEEN, FAILED_COUNT, PROBLEM, FIX, ACTION_URL, REFERENCE_CODE |
| 8 | lms-grade-sync-digest | en, ar | School admins | Daily cron after the lmsGrades drain: grade jobs that became 'dead' in the last 24 h, excluding held LMS_VALUE_DIFFERS jobs | NAME, SCHOOL_NAME, LMS_NAME, DATE, FAILED_COUNT, RETRYING_COUNT, COURSES_AFFECTED, TOP_REASON, ACTION_URL, REFERENCE_CODE |
| 9 | lms-roster-sync-failed | en, ar | School admins | roster.sync outcome 'fail' from nightly/launch/cron (not manual, not busy/skipped) | NAME, SCHOOL_NAME, LMS_NAME, FAILED_COURSES, COURSE_NAME, REASON, FIX, ACTION_URL, REFERENCE_CODE |
| 10a | lms-seats-warning | en, ar | School admins | New code needed: threshold check after checkSeatForNewStudent updates seatsUsed (PERCENT = 80 or 90) | NAME, SCHOOL_NAME, PERCENT, SEATS_USED, SEAT_LIMIT, SEATS_LEFT, ACTION_URL |
| 10b | lms-seats-over-limit | en, ar | School admins (ops get E2) | markOverLimit -> alertSchoolAdmins (audit seats.over_limit); replaces the inline English email in seats.ts | NAME, SCHOOL_NAME, SEATS_USED, SEAT_LIMIT, ACTION_URL |
| 11 | lms-adoption-weekly | en, ar | School admins | New code needed: Monday run inside /api/cron/daily (next to sendWeeklySummaries) | NAME, SCHOOL_NAME, LMS_NAME, WEEK_OF, COURSES_CONNECTED, NOT_STARTED, ACTIVE, GRADES_SENT, GRADES_FAILED, ACTION_URL |
| 12a | lms-data-export-ready | en, ar | The requesting school admin | New code needed: PDPL data export per school or per course. Never attaches the file, never a signed download URL | NAME, SCOPE, EXPIRES_ON, ACTION_URL, REFERENCE_CODE |
| 12b | lms-deletion-received | en, ar | The requesting school admin and the other school admins | New code needed: data deletion request intake | NAME, SCOPE, STUDENT_COUNT, RECEIVED_ON, DUE_BY, ACTION_URL, REFERENCE_CODE |
| 12c | lms-deletion-completed | en, ar | The requester and the school admins | After permanentlyDeleteStudent for request-based or per-school / per-course deletions (new code); not for single on-screen deletes (D9) | NAME, SCOPE, COMPLETED_ON, STUDENT_COUNT, RECORDS_REMOVED, RESULTS_ANONYMISED, FILES_PENDING, ACTION_URL, REFERENCE_CODE |
| 13 | lms-teacher-welcome | en, ar | That teacher (only with the opt-in address confirmed on first launch, D2) | lti.launch with refIds.createdUser:true and role teacher | NAME, COURSE_NAME, LMS_NAME, ACTION_URL |
| 14 | lms-students-not-started | en, ar | Teachers (opt-in, D2) | Weekly cron over notStartedStudents(context) per teacher's courses; needs LMS_ROSTER_SYNC_ENABLED | NAME, NOT_STARTED, COURSE_LABEL, ACTION_URL |
| 15 | lms-activity-may-be-deleted | en, ar | Teachers of the class (opt-in, D2); admins see the same list on the grades page | lineItemGoneAt set during a grade send (404/410), or stale (30 days without launch or result) | NAME, ACTIVITY_COUNT, COURSE_LABEL, LMS_NAME, ACTION_URL |
| 16 | lms-grade-changed-in-lms | en, ar | Teachers of the class (opt-in, D2) | grade.lms_changed with result 'flagged'; needs GRADE_LEDGER_ENABLED + passback | NAME, LMS_NAME, CHANGED_COUNT, COURSE_LABEL, ACTION_URL |
| 17 | lms-newer-attempt-waiting | en, ar | Teachers of the class (opt-in, D2) | grade.kept_released (owner decision G2) | NAME, WAITING_COUNT, COURSE_LABEL, ACTION_URL |
| 18 | lms-ops-school-connected | en | ENARA ops (LMS_OPS_EMAILS) | platform.registered (active) / platform.approved | SCHOOL_NAME, INSTITUTION_ID, LMS_NAME, REGISTERED_VIA, DEPLOYMENTS, BY_ROLE, PLATFORM_ID, ACTION_URL |
| 19 | lms-ops-approval-needed | en | ENARA ops (LMS_OPS_EMAILS) | platform.registered pending, deployment.registered pending, deployment auto-created at launch | SCHOOL_NAME, INSTITUTION_ID, LMS_NAME, ITEM, WAITING_SINCE, PLATFORM_ID, ACTION_URL |
| 20 | lms-ops-error-spike | en | ENARA ops (LMS_OPS_EMAILS) | New code needed: throttled count of lms_audit_log outcome 'fail' per school on each fail write | SCHOOL_NAME, INSTITUTION_ID, LMS_NAME, WINDOW, FAIL_COUNT, TOTAL_COUNT, TOP_CODE, TOP_CODE_COUNT, FIRST_AT, ACTION_URL, REFERENCE_CODE |
| E1 | lms-seats-hard-cap | en, ar | School admins (ops see it in the E5 digest) | seats.hard_cap (student refused with seat_limit_reached) | NAME, SCHOOL_NAME, SEATS_USED, SEAT_LIMIT, REFUSED_COUNT, ACTION_URL |
| E2 | lms-ops-billing-flag | en | ENARA ops (LMS_OPS_EMAILS) | billingFlaggedAt first set (seats over the limit) | SCHOOL_NAME, INSTITUTION_ID, SEATS_USED, SEAT_LIMIT, HARD_CAP, FLAGGED_ON, ACTION_URL |
| E4 | lms-ops-key-rotation-due | en | ENARA ops (LMS_OPS_EMAILS) | New code needed: daily check of lms_tool_keys (a 'next' key older than 24 h not yet promoted, or no 'active' key) | KEY_STATE, ACTIVE_SINCE, NEXT_SINCE, ACTION_URL |
| E5 | lms-ops-daily-digest | en | ENARA ops (LMS_OPS_EMAILS) | Daily cron: pending approvals > 24 h, billing flags, dead grade jobs (all schools), unknown-LMS launches, cookieless share, roster failures, key problems, switch-offs | DATE, PENDING_OVER_24H, BILLING_FLAGS, DEAD_JOBS, ROSTER_FAILED, KEY_PROBLEMS, SWITCHED_OFF, UNKNOWN_LMS_LAUNCHES, COOKIELESS_TOP, ACTION_URL |
| E6 | lms-roster-removals-skipped | en, ar | School admins | roster.removals_skipped warn, codes roster_truncated / empty_roster | NAME, COURSE_NAME, LMS_NAME, REASON, ACTION_URL |
| P1 | parent-invite | en, ar | Parent (email given by the school: single code or CSV invite) | School sends a parent link code (single, or CSV invitations P5) | NAME, CHILD_NAME, SCHOOL_NAME, LINK_CODE, EXPIRES_IN, ACTION_URL |
| P2 | parent-link-confirmed | en, ar | Parent | A parent link becomes active (any source) | NAME, CHILD_NAME, SCHOOL_NAME, ACTION_URL |
| P3 | parent-link-ended | en, ar | Parent | The school unlinks the parent, or the student is archived / leaves (link kept as "ended", D8) | NAME, CHILD_NAME, SCHOOL_NAME |
| P4 | parent-weekly-summary | en, ar | Parent | Weekly schedule (Sunday evening, Cairo); opt-out | NAME, CHILD_NAME, WEEK_LABEL, MINUTES_DONE, GOAL_MINUTES, LESSONS_DONE, OUTCOMES_MASTERED, CEFR_LEVEL, STATUS_LINE, PRACTICE_TIP, ACTION_URL |
| P5 | parent-new-results | en, ar | Parent | A result becomes visible to the parent (per the school's grades setting; default after teacher review, D7) | NAME, CHILD_NAME, TEST_NAME, CLASS_NAME, SCORE, LEVEL, ACTION_URL |

All of them were approved by the owner on 2026-11-18 except #1 (`lms-invite-connect`, built and approved
with the onboarding work). The From address of every email is `EMAIL_SENDER` (env) when set, else the
default above (D11).

## Previews and drafts

Render every LMS and parent email to PNG with its FAKE sample values (no network, no Resend; logo inlined;
Tahoma mapped to an installed Arabic font; also checks placeholders, right-to-left text and links):

```bash
node scripts/email/render-previews.mjs --out /tmp/email-previews   # PNGs, contact sheets, INDEX.md
```

New, not-yet-approved emails go in `drafts/lms/` or `drafts/parents/` (outside every bundle, so no code
path can send them): `<alias>-en.html`, `<alias>-ar.html` and one bilingual `<alias>.json` (`languages`,
`subject.{en,ar}`, `variables[].{key, fallback_value.{en,ar}, sample.{en,ar}}`, recipient, trigger,
delivery, frequency). `render-previews.mjs` renders them too. On approval, split the JSON into
`<alias>-<lang>.json`, move the pair into `lms/` or `parents/`, add `status`/`approvedOn` and re-bundle.

**Parent emails for the new sign-up flow (owner: "Approve all", 18 Nov 2026; promoted from drafts):**

| Template | What |
|---|---|
| `parent-email-verify` (new) | 6-digit code to confirm the email a parent adds in the portal (10 min, one use). No link at all |
| `parent-sign-in-code` (new) | 6-digit passwordless sign-in code. No link at all |
| `parent-weekly-summary` (replaced) | ONE weekly email per parent, a section per child (`CHILD_SECTIONS`, an HTML block built by code with every value escaped; `CHILDREN_NAMES` in the subject) |
| `parent-invite` (replaced) | code-first steps, the secret-code warning, one row per child with its code (`CHILD_CODES`, built by code) so a CSV group is one email |

`sendParentTemplate` refuses a link that carries `LINK_CODE`, a 6-digit `CODE`, or anything shaped like a
parent link code (`code_in_url`). `parent-email-verify` and `parent-sign-in-code` are sent by `parents/emailSignin.ts` (Parents P2, behind
`PARENT_EMAIL_SIGNIN_ENABLED`, through the same safety path). The other parent emails are sent by
`parents/parentEmails.ts` (Parents P4, `PARENT_EMAILS_ENABLED`): which event sends which, the school and parent
switches and the never-twice log are in `docs/parents/P4_NOTES.md`.

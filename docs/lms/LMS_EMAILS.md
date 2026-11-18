# LMS emails: the approved templates wired to events (lms-test)

Status: **built and tested locally** (2026-11-18), branch `claude/lms-email-drafts`. Nothing is sent unless
`LMS_EMAILS_ENABLED`, `REMINDERS_ENABLED` and `RESEND_API_KEY` are all set. Templates: `backend/src/email/lms/`
(approved 2026-11-18, `backend/src/email/README.md`). Plan and decisions: `LMS_EMAIL_TEMPLATES_PLAN.md`,
owner decisions D1-D14 of 18 Nov 2026.

## One way out: `sendLmsEmail` (`integrations/lms/core/lmsEmail.ts`)

| Rule | How |
|---|---|
| Gates | `LMS_EMAILS_ENABLED=true` and `REMINDERS_ENABLED=true` and `RESEND_API_KEY` (or `LMS_EMAIL_CAPTURE=true`, E2E stack only). Off: nothing is sent or recorded; the triggers are not even scheduled. |
| Recipients | School admins (`role: admin`, active, of the school; before anyone accepted the school admin invitation, the school's contact), opted-in teachers (D2), `LMS_OPS_EMAILS` (D4). Never students or parents, never a `*.test` address (LMS-made accounts), no other reserved address (`.example`, `.invalid`, ...) unless it is a redirected test copy. |
| Language | The school's `emailLanguage`, else Arabic for Egypt, else English (D1). Ops emails English only (D4). |
| Never twice | `lms_email_log.key` is unique per (event key, recipient). A failed email is retried at most 3 times; a held one never. Digests use a per-day key (one per recipient or per connection per Cairo day). Windows ("once per 24 h", "72 h", "7 days", "once per attempt") are atomic claims in `lms_email_claims`. |
| Test inbox (lms-test) | With `REMINDER_TEST_RECIPIENT`: ONE copy per event goes to that inbox only (never to the real recipients), with a "Test copy: this email was for ..." line naming them. |
| Subject prefix | `EMAIL_SUBJECT_PREFIX` (lms-test: `[lms-test]`, a space is added) in front of every LMS subject. Unset in production. |
| Daily cap (lms-test) | With `REMINDER_TEST_RECIPIENT`: at most `LMS_TEST_DAILY_CAP` (default 20, 0 = no cap) emails per Cairo day to the inbox (atomic counter `cap:<day>`). Above it the email is **held** (recorded in `lms_email_log`, status `held`, code `daily_cap`, not sent), except the ops daily digest (E5), which always goes and says `cap hit: N held back (template n, ...)`. |
| Values | Every value is HTML-escaped; reasons/fixes are code-owned sentences (`lmsEmailText.ts`); Latin tokens in Arabic stay left-to-right. No student names or per-student values (D3). No token, code or key in a link. |
| Records | `lms_email_log`: key, template, language, status, code, subject, ids, Cairo day. Never an address, a name or the body. `GET /api/maintenance/lms-emails` (test site only) lists them with today's cap use and held counts. |

## Triggers

| # | Template | Trigger | Where |
|---|---|---|---|
| 1 | `lms-invite-connect` | "Send email" on the onboarding invite (now through `sendLmsEmail`: redirect, prefix, cap; a held one answers 429 `LMS_EMAIL_HELD`) | `core/onboarding.ts` |
| 2a / 2b | `lms-invite-expiring` / `-expired` | Daily: the onboarding's current link, invite sent, unused and expiring within 3 days / expired unused in the last 7 days. Once per link. To the school contact (and admins) | `core/lmsEmailDaily.ts` |
| 3, 4b | `lms-connection-active` | Audit `platform.registered` (active) or `platform.approved`. Once per activation | `core/lmsEmailEvents.ts` |
| 4a, E3 | `lms-connection-pending` | `platform.registered` pending; `deployment.registered` pending (school admin); a launch that auto-created a pending deployment. Once per connection / deployment | events |
| 4c | `lms-connection-rejected` | New: `POST /api/lms/platforms/:id/reject` `{ reason }` (ENARA admins, pending only, reasons `values_mismatch`, `already_connected`, `school_not_confirmed`; status `rejected`; "Approve" can still switch it on later). Button + reason list on LMS connections | `admin/routes.ts`, events |
| 5 | `lms-connection-check-failed` | The automatic connection check went from OK (or never run) to failed. Once per connection and cause per 24 h | `core/connectionCheck.ts` -> events |
| 6 | `lms-connection-switched-off` | `platform.disabled`. Once per switch-off | events |
| 7 | `lms-key-problem` | 3 failures with `jwks_unavailable`, `unknown_kid`, `invalid_signature`, `token_http_400/401` within 60 min for a connection. Once per connection per 24 h | events |
| 8 | `lms-grade-sync-digest` | Daily: grades that became dead in 24 h (not the held `lms_value_differs`), per connection | daily |
| 9 | `lms-roster-sync-failed` | Daily: `roster.sync` failed in 24 h (not `manual`), per connection; the same course + code not again for 72 h | daily |
| 10a | `lms-seats-warning` | A new seat taken: 80 % and 90 % once each per seat limit; again after the limit changes or usage drops under 75 % | `core/seats.ts` -> events |
| 10b | `lms-seats-over-limit` | Over the limit (existing once-a-day `lastAlertAt` claim). **Replaces the inline English `sendEmail`** (D13) | seats |
| 11 | `lms-adoption-weekly` | Monday (Cairo): per active connection, skipped with no launches and no change for 2 weeks | daily |
| 12a, 12b, 12c | export / deletion | **Not wired** (see below) | |
| 13 | `lms-teacher-welcome` | The teacher said yes to Enara emails (D2). Once per teacher ever | `admin/routes.ts` -> events |
| 14 | `lms-students-not-started` | Monday: per opted-in teacher; a course at most 3 weeks in a row, then only when its count rises. Needs `LMS_ROSTER_SYNC_ENABLED` | daily |
| 15 | `lms-activity-may-be-deleted` | Daily: line item gone (404/410) in 24 h; Monday: 30 days stale. Once per link and reason; per opted-in teacher | daily |
| 16 | `lms-grade-changed-in-lms` | Daily: `grade.lms_changed` in 24 h (grade ledger), per opted-in teacher | daily |
| 17 | `lms-newer-attempt-waiting` | Daily: `grade.kept_released`, once per attempt, per opted-in teacher | daily |
| 18 | `lms-ops-school-connected` | With 3. Once per connection | events |
| 19 | `lms-ops-approval-needed` | With 4a / E3, then a daily reminder while still pending. At most once per item per day | events, daily |
| 20 | `lms-ops-error-spike` | >= 20 failures and >= 30 % of a school's LMS events in 60 min (checked at most once a minute per school). Once per school per 6 h | events |
| E1 | `lms-seats-hard-cap` | A student refused at the hard cap. Once per school per 24 h | seats |
| E2 | `lms-ops-billing-flag` | The billing flag set (once per flag) | seats |
| E4 | `lms-ops-key-rotation-due` | Daily: a `next` signing key older than 24 h, or no active key while a connection is active. Once per state per day | daily |
| E5 | `lms-ops-daily-digest` | Daily, after the others, only when a row is non-zero or something was held. Always sent (past the cap). New row "Test inbox daily cap (lms-test)" (`CAP_NOTE`) | daily |
| E6 | `lms-roster-removals-skipped` | Daily: `roster.removals_skipped` (`roster_truncated`, `empty_roster`). Once per course + code per 7 days | daily |

Immediate emails run in the background after the response (`runInBackground`, Vercel `waitUntil`): they never delay
or break a request. The audit-driven ones listen to `writeLmsAudit` (`setLmsAuditListener`).

## The daily run (lms-test has no scheduler)

The digests run inside `GET /api/cron/daily` (step `lmsEmails`, at most 15 s; the ops digest always runs). Weekly
items run on Mondays, Cairo time. lms-test has no Vercel cron (by design): the daily route runs when it is called
with `Authorization: Bearer $CRON_SECRET` (`docs/lms/PHASE_4_NOTES.md`). Running it twice a day sends nothing new.

## Teacher emails: opt-in on the first launch (D2)

A teacher who opens ENARA from Moodle sees "Email me Enara updates?" once, with the address Moodle shared
(`lms_users.email`) pre-filled. Yes (with the address they confirm or change) stores it in `lms_email_optins` and
sends the welcome; No stores no address. No answer = no teacher email. `GET/POST /api/lms/email-optin`
(teachers with an LMS link only; `{ state: 'off' }` when LMS emails are off). Frontend: `components/LmsEmailOptIn.tsx`.

Email links: `?page=lms` (school admins: LMS connections) and `?page=class-assignments&class=<id>` (teachers) now open
those pages; the `filter` parameter is ignored by the app for now (the class page opens unfiltered).

## Not wired: 12a, 12b, 12c (proposal)

- **12a `lms-data-export-ready`, 12b `lms-deletion-received`** need a PDPL data export per school or course and a
  deletion-request intake. Neither exists, and neither is a small endpoint (an export job, its stored file behind
  sign-in with an expiry, a request record with a due date and a review step).
- **12c `lms-deletion-completed`**: today the only deletion is a single student's on-screen "Delete permanently",
  and owner decision D9 says single deletes do **not** get this email (on-screen result + audit only). It is for
  request-based and per-school / per-course deletions, which do not exist yet.
- Proposal: one `lms_pdpl_requests` collection (`kind: export | deletion`, scope school / course, requester, status
  `received -> running -> done`, due date, counts, file key with expiry); school admins create a request on LMS
  connections; ENARA ops run it (deletion = `permanentlyDeleteStudent` for each student in scope, counts summed);
  12b on create, 12a / 12c on done (the hooks exist as templates; ACTION_URL `?page=lms&export=<id>` /
  `&deletion=<id>`, sign-in required, never a signed URL or the file).

## Env (lms-test)

| Variable | Value |
|---|---|
| `LMS_EMAILS_ENABLED` | `true` (flags manifest) |
| `REMINDERS_ENABLED` | `true`. It is also the switch of the older reminder and weekly-summary emails (`services/emailService.ts`), which send only when `REMINDER_FROM` is set too: **leave `REMINDER_FROM` unset on lms-test** so only LMS emails (capped) reach the test inbox |
| `RESEND_API_KEY` | the Resend key (Sensitive, by hand) |
| `REMINDER_TEST_RECIPIENT` | the owner's test inbox (by hand; never in the repo) |
| `EMAIL_SUBJECT_PREFIX` | `[lms-test]` |
| `LMS_TEST_DAILY_CAP` | `20` (default when unset) |
| `LMS_OPS_EMAILS` | the ops mailbox(es), comma list (by hand) |
| `EMAIL_SENDER` | optional, the From address (D11) |
| `APP_URL`, `CRON_SECRET` | already set |
| `LMS_EMAIL_CAPTURE` | never on lms-test (E2E stack only) |
| `PARENT_EMAILS_ENABLED` | leave unset (parent emails come with Parents P1-P5) |

Migration `2026-11-25-lms-emails` (additive): indexes of `lms_email_log`, `lms_email_claims`, `lms_email_optins`,
and `{ event: 1, createdAt: 1 }` on `lms_audit_log`.

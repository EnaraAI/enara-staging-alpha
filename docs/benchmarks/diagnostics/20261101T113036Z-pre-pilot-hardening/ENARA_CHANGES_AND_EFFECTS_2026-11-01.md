# ENARA staging: changes and their effects (1 November 2026)

## Release

| | |
|---|---|
| Live on | `test.enara.app` (also `enara-staging-alpha.vercel.app`) |
| Deployment | `dpl_4hQwNexc1fbnzWc35E8ozL5n71FS` |
| Commits | `2619887` and `9806f3c` on `claude/codebase-review-kbxqan` |
| Pull request | draft, [EnaraAI/enara-staging-alpha#1](https://github.com/EnaraAI/enara-staging-alpha/pull/1) |
| Rollback target | `dpl_Hw32FB6bvgv7bXoh6awf62o9JgLb` |
| Checks before going live | 16 of 16 passed |
| Not changed | environment variables, feature switches, budgets, DNS. No database migrations and no paid AI calls. |

## Files and downloads

- **Unscanned originals cannot be downloaded.** The original file of any document that has not been malware-scanned clean can no longer be downloaded by anyone, staff included.
  - *Effect:* there is no scanner, so in practice no uploaded document can be downloaded today. Teachers read the text through **Sources** in Documents, which now shows "Original not downloadable (not scanned)". Students no longer see those files in course materials.
- **Lesson videos still play.** They are treated as media (your decision).
  - *Effect:* video lessons work as before.
- **Download links are tied to one school and expire after 15 minutes** (previously up to 6 hours).
  - *Effect:* a link copied from another school does not work. Old links stop working sooner, and pages fetch fresh ones automatically.
- **New uploads are stored under the school's own name prefix.** One school can no longer attach, open or delete another school's file through a course, a video upload or a "remove file" request.
  - *Effect:* this closes a cross-school loophole found during the work. Files uploaded before today keep their old names; a cleanup is listed for the operator.
- **Download links never appear in logs.**
  - *Effect:* someone reading the logs cannot reuse a link.

## Student privacy and AI

- **No individual student data reaches the AI in the school analytics assistant.** It now sends school totals only: no names, scores or risk flags. Student names typed into a question are removed before it is sent.
  - *Effect:* the assistant can still answer school-level questions. For a particular student it points staff to the Educator Chat student report, which shows real names and never uses the AI.
- **Only school admins can use that assistant.** Academic Managers and ENARA Admins are refused, and the assistant button no longer appears for them or for teachers.
  - *Effect:* Academic Managers keep their read-only insight pages.
- **AI assessment drafts now use Sonnet 5.5** (your decision). This covers drafts and question regeneration. Grading, the tutor and lesson plans are unchanged.
  - *Effect:* drafting quality should match the benchmark that recommended it, at a lower cost per draft.
- **Arabic AI assessment drafting is switched off.** The Arabic option is gone from the builder and the server refuses such requests.
  - *Effect:* teachers can still write Arabic assessments themselves. The Arabic tutor, chat, lesson plans and grading are untouched.

## AI spending

- **The $50 staging AI cap now counts everything spent on staging,** across every spend window so far. Starting a new window no longer resets it.
  - *Effect:* the cap can no longer be bypassed by changing a setting. Spend from earlier windows already counts against the $50.
- **Grading stays inside the $50 cap.** If the cap is reached, no grade is invented and no AI call is made; the submission waits and is retried later.
- **Speaking-exam transcription and live-avatar calls are no longer recorded as costing $0.** Their cost is shown as "not priced", and the money held for each call is not handed back.
  - *Effect:* reports no longer understate this spend.
- **Speaking exams and live-avatar calls have no per-call ceiling** (your decision). The $50 environment cap still applies.
  - *Effect on staging:* each call still needs the school's per-call reservation limit set, or the cap refuses it. Speaking exams are unavailable anyway, because ElevenLabs is not configured on staging.
- **Live-avatar charges are settled together.** The money held for one avatar call (start, language switches) is settled at the end of the call.
  - *Effect:* spend figures stay tidy instead of clearing two days later.

## Grading and results

- **"Held until I release them" is now a real option** in the assignment form.
  - *Effect:* teachers can hold midterm or final results and release them when ready. Automatic release remains the default.
- **The dashboard and Educator Chat now calculate "average score" the same way.** Only final grades count, the latest one per student and assignment, over the last 90 days. Missing work never counts as zero.
  - *Effect:* the two screens now show matching averages. Dashboard numbers may differ from yesterday's because drafts, duplicates and ungraded work are no longer averaged in.

## Accounts and access

- **School admins have a new People page.** It is for inviting teachers, academic managers and students, copying a one-time invitation link, revoking invitations, and disabling or re-enabling accounts.
  - *Effect:* schools can manage their own accounts without an operator. A disabled person is signed out immediately.
- **New-account pages exist.** Invitation and password-reset links now open working pages, and "Forgot password?" sends a reset request.
  - *Effect:* new staff can set their own passwords. Email is not configured on staging, so invitation links are copied from People for now.
- **Suspending a school blocks its users immediately,** including people already signed in. Previously only new sign-ins were blocked.
- **The API documentation is always password-protected.** Previously it was open whenever no password was set.

## Records, alerts and retention

- **An audit log records important admin actions.** It covers permission changes, account and school status, AI budgets and pauses, feature switches, document deletion and results-release settings. It cannot be edited or deleted by the app.
  - *Effect:* there is now a trail of who changed what.
- **Alerts are now saved.** They cover the spend cap or budget limits being reached, unknown costs, grading problems, server errors and failed background jobs.
  - *Effect:* they are kept, but **nobody is notified automatically**, because no alert channel is set up. Someone needs to check them.
- **One-month retention** (your decision) applies to new Educator Chat conversations, usage records, the audit log and alerts. Older records are deleted automatically.
  - *Effect:* the usage and audit history is only available for the last 30 days; spend caps are not affected.
- **No scheduler** (your decision).
  - *Effect:* grading retries, document re-checks and cleanup jobs only run when a page triggers them or someone runs the daily job by hand.
- **The `/ready` status check reports more detail.** It now shows which services are configured, without revealing any secrets.

## Testing

- **Automated tests:** 451 tests in 42 files pass locally. That includes 34 new tests and a complete synthetic learning journey: assessment, grading, mastery, the gap, intervention, an unassisted re-test, measured progress (0% to 100%), and a report whose chart and table agree.
- **Not run:**
  - 48 test files that simulate the AI provider (your rule);
  - accessibility checks;
  - load tests;
  - live AI checks.

## Still open

| Item | What's needed |
|---|---|
| Key rotation | Your decision on rotating the keys previously pasted in chat |
| 4Level1 as the pilot school | It needs classes and students, and named owners for spend, support and alerts |
| Domain settings | `APP_URL`, `FRONTEND_URL` and `CORS_ALLOWED_ORIGINS` should point to `https://test.enara.app`; not checked or changed |
| Before a pilot with real students | A privacy and legal review, an accessibility check, a backup and restore test, and an alert channel |

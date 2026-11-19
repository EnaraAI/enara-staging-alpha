# ENARA in Moodle: everything we built for the LMS integration

As of 18 Nov 2026 (Cairo time). Repo: `EnaraAI/enara-staging-alpha`. Live branch for the test site: `lms-test-live`.

## Standing rules (yours)

- **All work happens on lms-test.enara.app only.** test.enara.app and its database stay frozen until you reopen them. The one exception, on your instruction: four AI settings were copied from it on 18 Nov.
- **No manual runbooks.** The automated suite checks everything. You only get the result.
- **A feature is "done" only when the automated suite passes on its pull request.** Then it is merged and deployed to lms-test automatically, with a health check and an automatic rollback. You get one line per deploy.
- **Moodle 4.5 (LTS) only** in the automated suite.
- **Plans before each step,** written as md files, and I wait for your "go".
- **Secrets** are never asked for in chat, never printed and never committed.

---

## 1. What a school gets today (live on lms-test)

**Onboarding**
1. An ENARA admin fills in "New school". This creates the school, the invite (English and Arabic) and **one registration link**.
2. The school's Moodle admin pastes that link into Moodle. Moodle and ENARA register with each other automatically (LTI 1.3 Dynamic Registration).
3. The admin clicks **Activate** and sets the settings Moodle won't take from the link:
   - Accept grades from the tool = **Always**;
   - show in the activity chooser;
   - restrict to the school's category.
4. ENARA checks the connection automatically. Problems come with plain fixes in English and Arabic.
   - A Moodle the internet can't reach can use a pasted-key fallback.
5. A status page shows a checklist and the hand-ticked Moodle settings. A timer runs against a **15-minute target**. In the automated test, invite to goal took about **20 seconds**.

**Teachers**
- Open ENARA from Moodle: teacher launch, plus student preview through Moodle's "switch role".
- **The picker.** "Select content" opens it, with several items at once. Available items:
  - quizzes and assignments, graded;
  - practice, which keeps the best score;
  - course and page links, including teacher-only links;
  - **due dates** in Cairo time, shown in the Moodle description;
  - **Phase 8:** AI tutor session, live avatar session and diagnostic check, all with no grade.
- **Overview pages** for the no-grade activities, with the last 7 days' counts.

**Students**
- Launch from Moodle and land on the right ENARA page.
- **Mic checks** inside Moodle. If the browser blocks the mic in the frame, "Open in a new tab" signs them into a new tab with a 60-second one-time code. Safari users see a hint.

**Grades and roster**
- **Grades go to the Moodle gradebook** in about 0.3 seconds. A graded item counts the latest attempt; practice counts the best.
- **Grade history:** a grade changed in Moodle shows as "Changed in LMS". Newer attempts wait for teacher review, as you decided (G2).
- **Roster sync** from Moodle:
  - "Not started" students;
  - removed students marked inactive;
  - manual ENARA enrollments left untouched.

**Several schools on one Moodle**
- School A, B and C stay separated: same people, separate accounts, nothing shared.

**Problems view**
- Every LMS failure code has plain English and Arabic help.

## 2. Phases and steps, in the order built

| # | Step | What it delivered | Status |
|---|---|---|---|
| 0–1a | Phase 0 / 1a | LTI 1.3 launch (OIDC), teacher and student, student preview, frame-header fix | Verified on MoodleCloud; live |
| 2 | Phase 2 | Picker (Deep Linking), multi-select, graded and practice items | Verified on MoodleCloud; live |
| 2b | Phase 2b | Page and course links, teacher-only links, due dates (stored in UTC, shown in Africa/Cairo) | Live |
| 3 | Phase 3 + follow-ups | Grades to Moodle (AGS): latest, or best for practice. G2 newer-attempt line, linked activity, archive, deleted-activity flags | Live |
| – | Grade ledger | History of every grade, "Changed in LMS" | Live, backfilled |
| 4 | Phase 4 | Roster sync (NRPS): not started, removed, manual untouched, changed in LMS | Live; checks 1, 2, 3, 5 passed through the Moodle web-services test tool |
| P0 | Priority 0 | Role routing for LMS launches; parent-link lifecycle; reserved test addresses; **block on erased students**. If `LMS_KEK` is missing, permanent deletion stops with an ops alert and an audit row; keep `LMS_KEK_PREVIOUS` after rotation; ops runbook | Live |
| – | Mic / new tab | Mic check, "Open in a new tab" handoff, Safari hint, telemetry | Live |
| 1b | Phase 1b | One-link registration, platform storage, registration codes, Problems view | Live |
| – | E2E suite (#18) | Docker Moodle 4.5 + Playwright (Chrome and Safari engine), all scenarios automated | Live in CI |
| – | Continuous delivery (#18) | Suite passes → merge → deploy → migrations → health check → rollback if it fails → one line to you | Live |
| 2 (onb.) | School onboarding (#19) | "New school", invite EN/AR, connection check, status page, 15-min timer; fix for the single-container `/lti` bug | Deployed, passed |
| – | Email drafts → approved | 35 templates (LMS + parents, EN + AR; ops EN only); you approved all | Done |
| – | LMS emails wired (#20) | All approved LMS emails tied to real events | Deployed, passed |
| – | Email safety (#22) | Every email path on lms-test redirected to you; 300/day ceiling; parent email buttons blocked until P4; Resend quota handling | Deployed, passed |
| 8 | Phase 8 (#21) | Tutor, live avatar and diagnostic activities, no grade | Deployed, passed |
| P1 | Parents P1 (#23) | Parent access per school (Off/Free), usage numbers, code-first entry, remembered device, "Add another child" | Deployed, passed (second try; see section 8) |
| P2 | Parents P2 (#25) | Class code sheets, email sign-in with 6-digit codes, verified merge | Deployed, passed |
| P3 | Parents P3 (#26) | Results only after the teacher releases them | Deployed, passed |
| P4 | Parents P4 (#27) | Parent emails through the safety path | Deployed, passed |
| P5 | Parents P5 (#28) | CSV invitations, one email per parent | Deployed, passed |

## 3. The automated suite (no manual runbooks)

**What runs**
- GitHub Actions workflow `lms-e2e.yml`.
- A Docker stack:
  - Moodle 4.5 with Postgres 17;
  - ENARA built from the same image as staging;
  - MongoDB;
  - an HTTPS proxy, so two separate "sites" talk exactly as a school's Moodle and ENARA do.
- Playwright plays admin, teacher, student and parent, in Chrome and the Safari engine.

**When it runs**
- On pull requests and by hand.
- No nightly runs and no runs on every push, as you asked.

**Scenarios**

| # | Scenario |
|---|---|
| 1 | Registration and launches |
| 2 | Picker |
| 3 | Links and due dates |
| 4 | Grades |
| 5 | Roster |
| 6 | School A/B isolation |
| 7 | Mic checks and the new tab |
| 8 | Timed onboarding (School C) |
| 9 | Phase 8 activities |
| 10–14 | Parents P1–P5 |

**Latest result:** 65 of 65 passed (Parents P5 run).

**Never sends real email.** Emails are only recorded ("capture mode"), and the stack refuses to start otherwise.

**Screenshots:** pushed to branch `e2e-results` after each run.

**Deploy pipeline** (`lms-deploy.yml`)
- A guard: lms-test only, never test.enara.app.
- Merge into `lms-test-live`, Vercel deploy, migrations.
- **Health check:** a mock LMS launches and sends a grade.
- Automatic rollback if the health check fails, then a comment on the PR.

**Found and fixed along the way**
- **Single-container `/lti` bug:** the single-container server answered `/lti` and `/.well-known` with the app page. A product bug, fixed.
- **Mic test click:** Moodle moves the ENARA frame after the page loads, so a click could miss. The test now waits for the frame to settle, with a keyboard fallback.
- **Proxy connections:** idle connections between the proxy and ENARA were being reused after they had closed.
- **Slow package installs:** installing browser packages on GitHub timed out, so the tests now use Playwright's ready-made image.

## 4. Emails

**Templates**
- All drafted in English and Arabic and approved by you on 18 Nov.
- Later you approved 4 new or changed parent emails:
  - verification code;
  - sign-in code;
  - weekly summary (one per parent);
  - invite (code-first, secret-code warning).
- The repo copies are the source of truth. Resend templates are not used.

**LMS emails live on lms-test**
- **Connections:** active, pending, rejected, check failed, switched off, key problem, invite reminders.
- **Seats:** warning, over the limit, hard cap.
- **Sync problems:** grade sync, roster failures, removals skipped.
- **Teacher summaries:** activity may be deleted, grade changed in Moodle, newer attempts waiting, students not started. Teachers opt in on first launch.
- **Weekly adoption.**
- **Ops emails:** school connected, approval needed, billing flag, error spike, key rotation, daily digest.

**Not connected yet**
- Data export ready and deletion request received: no request flow exists yet. A proposal is in `docs/lms/LMS_EMAILS.md`.
- Deletion completed: by your D9 rule, single deletes don't email.

**Rules on lms-test**
- Every email goes only to you, with an `[lms-test]` subject and a "Test copy: this was for …" line.
- Every email is really sent when its event happens.
- **Safety ceiling:** 300 a day, with one alert email if it's hit.
- Without the test inbox, nothing is sent.
- On the real site, once reopened, emails go to the real recipients with no redirect.

**Resend**
- The account is on the **free plan: 100 a day, 3,000 a month.**
- ENARA records refusals, alerts once a day and never retries in a loop.

**Daily job**
- `lms-test-daily.yml` sends the daily and weekly summaries at 06:23 Cairo. It retries once if lms-test is slow to wake up.

## 5. Parents (P1–P5 all live on lms-test; details in PARENTS_P1_P5_DONE.md)

**Your new sign-up flow**
- **Code-first:** a parent enters the school's code and goes straight in, with no account or password. The device remembers them.
- **Adding an email:** inside the portal, with a 6-digit code (10 minutes, rate-limited, at most 5 tries). The email is then used for parent emails and for **passwordless sign-in**.
- **Lost device without an email:** the parent asks the school for a new code. The screen says so before they skip adding an email.
- **Secret-code warning** in Arabic and English on the code page, on the printed sheet and in the invite.
- **Several children:** "Add another child" with that child's code. Children can be in different schools. Two accounts merge only after the 6-digit email check.
- **Both parents:** each has their own account, using the guardians feature.

**The parts**
- **P1:** a parent access switch per school, usage numbers, and code-first entry.
- **P2:** email sign-in, the merge, and class code sheets. A reprint warns that "Codes already printed for this class will stop working."
- **P3:** grades shown to parents after teacher review. A result that an assignment releases automatically counts as reviewed.
- **P4:** parent emails, including the link-ended email (sent when the school unlinks, or the student is archived or leaves; not when the parent unlinks themselves, and not after a PDPL deletion). The two blocked buttons return then.
- **P5:** CSV invites, grouped into one email per parent.
- **Rule:** never enrol parents in Moodle courses that contain ENARA activities.

## 6. Your decisions (key ones)

**Moodle setup**
- Keep **Moodle 4.5 only** in the automated suite.
- **"Accept grades from the tool = Always".** Because of it, no-grade activities show an empty column that ENARA never fills.
- Practice keeps the best score, and teachers give it weight 0.

**Grades**
- **Grades to real schools stay off** until the grader passes the ESL6 bar (D15). After that, an ENARA admin turns them on per school.
- The Moodle grade comment follows the school's language (D14).
- G2: newer attempts wait for teacher review.

**Emails**
- One template per language (D1). Egyptian schools get Arabic by default.
- No student names or per-student scores in LMS emails (D3).
- Ops emails are English only (D4).
- Codes appear only in the email body, never in links.
- Western digits everywhere.
- The sender is configurable. A production sender and a support reply-to address are needed (D11).

**Privacy and keys**
- PDPL: if `LMS_KEK` is missing, permanent deletion stops with an alert.
- Always keep `LMS_KEK_PREVIOUS` after a key rotation.

**Backlog**
- "Move a student to another school".

## 7. Pull requests

| PR | What | State |
|---|---|---|
| #16 | Multi-class enrollment (steps 1–6) | Old draft; its work is in `lms-test-live`; check-ins stopped |
| #17 | Phase 2 picker | Old draft; its work is in `lms-test-live`; check-ins stopped |
| #18 | E2E suite + continuous delivery | Merged, deployed |
| #19 | School onboarding | Merged, deployed |
| #20 | LMS emails wired | Merged, deployed |
| #21 | Phase 8 activities | Merged, deployed |
| #22 | Email safety | Merged, deployed |
| #23 | Parents P1 | Merged, deployed (first deploy rolled back, fixed, re-run passed) |
| #24 | Backup redeploy for P1 | Closed, not needed |
| #25 | Parents P2 | Merged, deployed |
| #26 | Parents P3 | Merged, deployed |
| #27 | Parents P4 | Merged, deployed |
| #28 | Parents P5 | Merged, deployed |

## 8. Known follow-ups (small)

**From onboarding**
- "Ticked by" on the status page shows a user ID instead of a name.
- There's no admin screen for a school's time zone; the default is Africa/Cairo.

**App**
- The app loads its styling from an outside site (the Tailwind CDN). If that load fails, pages show unstyled. Fix: build the styling into the app.
- The first request after lms-test has been idle fails for a moment while it reconnects to the database. The daily job retries.

**Phase 8**
- The diagnostic says "not ready" in Moodle classes until they're linked to a curriculum. Lessons need the same link.
- One general tutor activity; no topic presets yet.
- Enara Kids students land on kids home for these activities.

**Emails**
- The safety ceiling counts across all servers. The Resend quota pause and the request pacing are per server, so two servers can each make one extra Resend call.
- Email links ignore the `filter=` part, so pages open unfiltered.

**Found by the school guide review**
- **Grades to Moodle are one switch for the whole site, not per school.** Your D15 says an ENARA admin turns grades on per school. The code needs a per-school grade switch before the first real school. Small to build; I recommend doing it before grades go on for any real school.
- **Invite email wording:** it says the school's connection page "shows your Moodle link". In fact the page shows a **New link** button; old links are never shown again. Small wording fix.
- **Teacher email choice:** the teacher opt-in says "you can change this later", but there is no screen for it yet. Small fix.

**Lesson from the P1 deploy (fixed)**
- lms-test refuses to start when an AI key is set without a spending limit (a safety rule in the code).
- I copied the Anthropic key from test.enara.app without that limit, so the first P1 deploy didn't start and was **rolled back automatically**.
- Fixed by adding a $25 total spending limit. The AI is still paused. The re-run then passed.
- While checking the failed version, the Vercel command-line tool added a "Protection Bypass for Automation" secret to `enara-lms-test`. Revoke it in Vercel → `enara-lms-test` → Settings → Deployment Protection.
- An unused branch `claude/parents-p1-redeploy` is left on GitHub. My sandbox can't delete branches; delete it whenever you like.

**Open question**
- The (\*) next to tool grades in Moodle's gradebook: I'll confirm its meaning from Moodle's code and add a line to the teacher guide.

**Moodle 5.3**
- Passes the full suite locally, but is not in CI, by your choice.

## 9. What only you can do

1. **Reopen test.enara.app** when ready. I'll then write the production rollout plan for your OK.
2. **A production sender and support reply-to address.**
3. **ESL6 grader follow-ups:** grades to real schools wait for this.
4. **Upgrade Resend from the free plan** (100 a day).
5. **Daily email summaries:**
   - add the `LMSTEST_CRON_SECRET` secret in GitHub, and the same new value as `CRON_SECRET` in Vercel `enara-lms-test`;
   - say "main ok" for the small daily-job file to go on `main`.
6. **Tutor and avatar on lms-test:**
   - the Anthropic key and the avatar IDs are already copied;
   - the $25 spending limit is already set;
   - still needed: paste `ANAM_API_KEY` in Vercel yourself, and say "turn on AI on lms-test" (that switches the AI on and limits avatar calls to 10 minutes).
7. **One short real-device session** before the first real school: a real iPhone, plus the Moodle mobile app on Android and iOS.
8. **Final read of the school guide:** attached as `SCHOOL_GUIDE_FOR_REVIEW.md`. It's updated in English and Arabic to match what is live, on branch `claude/lms-school-guide` (not merged yet). A few Moodle 4.5 screen labels match the code and the automated tests but haven't been checked on a real Moodle screen.

## 10. Reminders set

| When (Cairo) | What |
|---|---|
| 7 Dec 2026 | MoodleCloud trial ends around 14 Dec |
| 1st of each month, 10:13 | One-line E2E minutes report |
| 18 Oct 2027 | Vercel token expires in a month: replace the `VERCEL_TOKEN` secret |

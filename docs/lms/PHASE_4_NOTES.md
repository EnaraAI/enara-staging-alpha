# LMS Phase 4: roster sync (LTI Advantage NRPS)

Status: **built and tested locally** (2026-11-18), branch `claude/lms-phase4` (from the Phase 3 tip `b5bb3ec6`). **Not deployed, migration not run, every flag still off.** With `LMS_ROSTER_SYNC_ENABLED` unset nothing calls the LMS's roster service, nothing is synced, and the new routes are the normal 404 (tested).

Scope: the owner's plan (items 1–7) plus the owner's binding changes of 2026-11-18 (seats start at the first launch; a sync changes only what it owns; one hook for the grade ledger).

## What was built

| Part | Where |
|---|---|
| NRPS client: service token (scope `contextmembership.readonly`, the AGS token code and encrypted cache), memberships GET, `Link: rel="next"` paging (bounded), same-origin next links only, 8 s per call, https only, error codes only | `integrations/lms/adapters/lti13/nrps.ts` (reuses `ags.ts`: `serviceToken`, `agsFetch`, `safeUrl`, `httpFailure`, now exported) |
| Diff and apply, triggers, the switched-first-launch check, views | `integrations/lms/core/roster.ts` |
| Hook for the grade ledger (no-op today) | `integrations/lms/core/rosterHooks.ts` (`afterRosterSync(context, outcome)`, called once at the end of every sync that read the LMS) |
| Seats: not-started students take no seat; dropped LMS students leave the count; archived students are not seats | `core/seats.ts` (`countSeats`, `notStartedLmsStudentIds`, `droppedLmsStudentIds`, `seatView.notStarted`) |
| Seat and hard cap at the first launch of a synced student; instructors the LMS added are remembered | `core/domainService.ts` (`checkSeatAtFirstLaunch`, `addedInstructor`; `createEnaraAccount` exported for the sync) |
| Launch: NRPS role check before a new student is made; teacher launch starts a sync when the last one is older than 24 h | `adapters/lti13/oidc.ts` |
| Endpoints (per course) | `integrations/lms/admin/routes.ts` (`/api/lms/contexts…`) |
| Nightly step and cron route | `routes/cron.routes.ts` (`lmsRoster` in `/api/cron/daily`, new `/api/cron/lms-roster`) |
| Teacher's class roster: "Not started" and "Sync roster now" | `controllers/teaching.controller.ts` (`lms`, `students[].lmsNotStarted`), `frontend/pages/teaching/TeachingDashboard.tsx` |
| LMS connections: courses and rosters panel, not-started list, seats line | `frontend/pages/LmsConnections.tsx`, `frontend/services/apiService.ts` |
| Flag | `config/env.ts` (`LMS_ROSTER_SYNC_ENABLED`), `core/flags.ts` (`roster`) |
| Model fields (no migration needed for fields) | `lms_contexts`: `rosterSync` (last attempt, trigger, outcome, counts, last error code/time), `rosterSyncLeaseUntil`; `lms_enrollments`: status `invited`, `firstLaunchAt`, `lastSeenAt`, `endedAt`, `addedInstructor` |
| Migration `2026-11-19-lms-phase4-indexes` (additive, **not run**) | `migrations/index.ts`: `lms_contexts (status, lastRosterSyncAt)` for the nightly pick |
| Audit sanitiser fix | `core/audit.ts`: keys ending in `Id`/`Ids` (e.g. `contextId`, which contains "text") were silently dropped; they are now kept. Values are IDs. |

## How a sync works

1. **Read the roster.** `GET <context_memberships_url>?limit=100` with `Accept: application/vnd.ims.lti-nrps.v2.membershipcontainer+json` and the bearer service token (`POST <Access token URL>`, `grant_type=client_credentials`, our signed client assertion, `scope=https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly`; cached encrypted in `lms_access_tokens`; a 401 refreshes it once). The memberships URL is the one the launch's NRPS claim gave (`lms_contexts.nrpsUrl`, saved at every launch since Phase 1a). Every `Link: <…>; rel="next"` page is followed, up to 50 pages, 5,000 members and about 60 % of the run's time. A next link to another origin is refused (`memberships_next_other_origin`): the token only goes to the platform that issued the URL.
2. **Match** each member by **LMS user id** (connection + NRPS `user_id` = the launch's `sub`). Never by email.
3. **Removals first** (only from a complete list): a membership this course has (`lms_enrollments` active or not started) whose person is no longer listed, or is listed with status `Inactive`/`Deleted`:
   - student: the class enrollment becomes `inactive` with `endedAt` (`endEnrollment`), and the id leaves `CourseInstance.studentIds` (the old-field dual write, as the launch adds it) — **only when that class enrollment is the LMS's own** (`source: 'lms'` and `lmsContextId` = this course);
   - teacher: removed from the class's instructors **only when the LMS added them** (`lms_enrollments.addedInstructor`);
   - the `lms_enrollments` row becomes `inactive` with `endedAt`.
   The account, the student record, attempts, grades and the enrollment rows are **kept**.
   Nobody is removed when the list is incomplete (an error, or cut by the bounds: `roster_truncated`) or when the LMS returns **no** active member while ENARA has some (`empty_roster`); the sync is then `partial` with that code.
4. **Adds and updates** (people with an account first, then new people, at most 150–200 new accounts a run, within the time budget; the rest is `deferred` → `partial`, `more_next_run`, done next run):
   - **New learner**: an ENARA student account exactly as a launch would make it (address `<lms user id>@lms.enara.test`, never emailed, never the LMS email; the LMS name and email stay in `lms_users`), an active class enrollment in the course's ENARA class via `enroll()` (`scope: 'class'`, `source: 'lms'`, `lmsContextId`), the id in `CourseInstance.studentIds`, and an `lms_enrollments` row with status **`invited` = "not started"** (`source: 'nrps'`). **No seat** (below).
   - **New instructor**: a teacher account as a launch would make it, added to the class's instructors (`addedInstructor: true`). LMS Administrators map as in the launch (teacher unless the connection allows admin); admin accounts are not added to instructor lists (as the launch does).
   - **Re-added** (row inactive): reactivated: `active` if they had launched, else `invited` again; `enroll()` reactivates the same class enrollment row (one row per student and class; the dates show the history).
   - **Role conflicts are handled as the launch does: an account never changes role.** A student account listed as Instructor (`student_as_instructor`) or a staff account listed as Learner (`staff_as_learner`), a disabled or archived account (`account_disabled`), or an account of another school (`account_conflict`): **left unchanged**, counted in `conflicts`, audited `roster.member_conflict` with the code.
   - Mentors and `TestUser` members are ignored (`ignored`), as at launch.
5. **Record**: `lms_contexts.lastRosterSyncAt` (when the roster was read and applied), `rosterSync` (`outcome` ok/partial/failed, `trigger`, `members`, `pages`, `added`, `reactivated`, `removed`, `unchanged`, `conflicts`, `ignored`, `deferred`, `instructorsAdded`, `instructorsRemoved`, `lastErrorCode`, `lastErrorAt` — the last error stays visible after a later success). Audit `roster.sync`. Then `afterRosterSync()` (ledger hook).
6. **One sync per course at a time**: a 2-minute lease on `lms_contexts` (`rosterSyncLeaseUntil`), across instances. A second sync answers `busy` (409 on the button).

### Ownership (owner decision 2)

A sync changes **only what this course of this LMS connection added**:
- class enrollments with `source: 'lms'` **and** this course's `lmsContextId` — never `manual` or `google` ones, never another course's or another connection's;
- instructors the LMS added (a launch or a sync, recorded only when the add really changed the list) — never instructors assigned inside ENARA;
- `lms_enrollments` rows of this course only (rows are per course, courses per connection).

A manual ENARA student placed in the LMS course's class is never touched. An LMS student who is also in the class through a manual group membership stays in the class after the LMS drops them (only the LMS membership ends). Tested for each case.

### Seats (owner decision 1)

- One seat per **live** student per school (not demo, not archived), however many classes or courses.
- **A synced student who has not started takes no seat.** The seat starts at their **first launch**: such an account can only be used through an LMS launch (reserved address, random password), so the first launch is the earliest real activity in ENARA. The seat check runs at that moment, **before** anything of the launch is written: over the limit → allowed, alert, billing flag (as Phase 1a); **hard cap reached → the launch is refused with `seat_limit_reached`** and the student stays synced and listed as not started.
- A student whose every LMS membership ended, and who has no other active membership (no active group or class enrollment, no group, not in any class list), **leaves the count**. Re-added → counts again (not a new student, so the hard cap does not apply).
- Re-syncs never double count (same LMS person → same account).
- `GET /api/lms/seats` returns `notStarted` beside `seatsUsed` and `lmsStudents` (LMS students who take a seat); LMS connections shows "Not started: N … not counted as seats".

"Not started" (seats) = a student account linked only to LMS identities that never launched (`lms_users.lastLaunchAt` unset). A launch that was refused before any account existed (e.g. the hard cap) leaves no "started" mark: the sync clears it.

### The first launch already switched to student (owner item, plan item 6)

Before a Learner launch makes a student for an LMS person **with no ENARA account yet**, and only when roster sync is on:
- ENARA asks the course's roster for that person (`GET memberships?role=…membership#Instructor`, at most 3 pages and about 6 s; when the platform ignores the role filter the pages are scanned for the person).
- Listed as **Instructor (or other staff)**: a **student preview** — their staff (teacher) account is made and linked as a teacher launch would, then the usual preview: no student, no seat, no enrollment, no grade, the yellow "Preview as student — nothing is saved" banner, read-only session. Audit `preview_launch` with `detectedBy: 'nrps'`.
- Listed as a learner, or not listed: today's behaviour (a student). Audit `preview_check` `nrps_not_staff`.
- NRPS cannot answer (no memberships URL, the connection has no NRPS, a token or memberships error, the person not found within the bound): today's behaviour, audit `preview_check` `nrps_unavailable` with `refIds.reason` (`no_memberships_url`, `nrps_not_allowed`, `no_token_url`, `token_http_400`, `memberships_http_500`, `timeout`, `not_found_in_pages`, …).
- After any successful sync, every LMS instructor of the course already has a linked staff account, so a switched launch is a preview through the Phase 1a rule (`detectedBy: 'staff_account'`) without any earlier teacher launch and without an NRPS call.

## When it syncs

| Trigger | What |
|---|---|
| **Teacher launch** | After the response (`waitUntil`, `runInBackground`), when the course's last sync is older than **24 h** (or never), at most one try an hour after a failure; budget 40 s, 200 new accounts. Learner launches never sync. Audit `lti.launch` carries `rosterSyncStarted` |
| **Nightly** | `GET /api/cron/daily` (CRON_SECRET) step `lmsRoster`, after `lmsGrades`: courses of active connections not synced for **20 h**, oldest first, up to 25 courses, with what is left of a 50 s window (at most 20 s; skipped under 5 s), so the whole daily run stays under 60 s. Courses not reached go first the next night. Runs when `daily` is in `LMS_DRAIN_TRIGGERS` (default). Note: staging has no Vercel cron by design (p6VercelStaging); the daily handler runs when the operator's scheduler calls it |
| **Cron route** | `GET /api/cron/lms-roster` with `Authorization: Bearer <CRON_SECRET>`: the same as nightly with a 40 s budget, for a future frequent scheduler (cheap: only courses older than 20 h). The normal 404 unless `cron` is in `LMS_DRAIN_TRIGGERS` |
| **"Sync roster now"** | `POST /api/lms/contexts/:id/roster/sync`, in the request, budget 25 s, 150 new accounts; 30 s between clicks per course (429), 409 while one runs |

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `GET /api/lms/contexts` | school admin (own school), ENARA admin (all, or `?institutionId=`); `?platformId=` filters | Per LMS course: `title`, `label`, `enaraClassId`, `rosterAvailable` (the launch gave a memberships URL), `lastRosterSyncAt`, `sync` (outcome, trigger, counts, `lastErrorCode`, `lastErrorAt`), `students` (`active`, `notStarted`, `inactive`) |
| `GET /api/lms/contexts/:id/roster` | school admin (own), ENARA admin, a teacher of the course's ENARA class | The course view and `notStarted: [{ lmsUserId, studentId, name, listedSince }]` (up to 500) |
| `POST /api/lms/contexts/:id/roster/sync` | the same | Runs the sync; `{ outcome, context }`. `outcome.status`: `ok`, `partial` (with `code`: `more_next_run`, `roster_truncated`, `empty_roster`), `failed` (with the error code) |
| `GET /api/teaching/classes/:classId/roster` (changed) | as before | adds `lms: { contextId, rosterAvailable, lastRosterSyncAt, lastOutcome, lastErrorCode, notStarted } | null` and `students[].lmsNotStarted` for an LMS course's class (only when roster sync is on) |
| `GET /api/lms/seats` (changed) | as before | adds `notStarted` |
| `GET /api/cron/lms-roster` | scheduler with CRON_SECRET | See the table above |

All roster routes are the app's normal **404** unless `LMS_LTI_ENABLED` **and** `LMS_ROSTER_SYNC_ENABLED` are on with a valid LMS config. Another school's course, or a course a teacher does not teach: 404. Academic managers and students: 403; anonymous: 401; a student-preview session: 403 (read-only).

## Audit (`lms_audit_log`, IDs and codes only)

`roster.sync` (`trigger`, `contextId`, `enaraClassId`, all counts; code `more_next_run` / `roster_truncated` / `empty_roster`, or the failure code), `roster.removals_skipped`, `roster.member_added` (`lmsUserId`, `enaraUserId`, `role`, `createdAccount`, `addedInstructor`), `roster.member_reactivated` (`started`), `roster.member_removed` (`reason`: `not_in_lms` | `inactive_in_lms`, `classEnrollmentEnded`, `instructorRemoved`), `roster.member_conflict` (code), `preview_check` (`nrps_not_staff`, `nrps_unavailable` + `reason`), `preview_launch` (`detectedBy: 'nrps'`). Tests check that no name or email lands in audit rows or in `lms_contexts.rosterSync`.

## Flags and settings

| Name | Default | Notes |
|---|---|---|
| `LMS_ROSTER_SYNC_ENABLED` | **off** | New. Needs `LMS_LTI_ENABLED`. Off: no NRPS call anywhere (sync, launch role check), no routes, no nightly step, no "not started" in the teacher roster |
| `LMS_DRAIN_TRIGGERS` | `inline,piggyback,targeted,daily` | `daily` also runs the nightly roster step; `cron` also opens `/api/cron/lms-roster` |
| `CRON_SECRET` | already set | Also protects `/api/cron/lms-roster` |

The connection needs its **Access token URL** (as for Phase 3), and the Moodle tool needs **IMS LTI Names and Role Provisioning** on (runbook step 1).

## Decisions and deviations

1. **Role conflicts in a sync change nothing** (as a launch changes nothing): a student account listed as Instructor keeps its student membership; a staff account listed as Learner keeps its instructor place. Counted and audited; an ENARA admin decides.
2. **Not-started rows use a new `lms_enrollments` status `invited`** (plus `firstLaunchAt`); the grade outbox only sends for `active` learners, so nothing changes there. A not-started student cannot submit anyway (they cannot sign in without a launch).
3. **No NRPS "differences" link**: every sync reads the full list (simpler, and the only way to detect removals reliably; Moodle does not offer differences).
4. **Seats exclude archived students** (`Student.archivedAt`) as well — "live" students only. Phase 1a counted them.
5. **A switched first launch detected by NRPS makes the staff account** (a teacher, as a teacher launch would). Nothing else is written (no student, seat, enrollment, class or link).
6. **Bounds**: 50 pages / 5,000 members / ~60 % of the budget per read; new accounts per run 200 (launch, nightly, cron) or 150 (button). A school with a very large course may need several runs; it is `partial` with `more_next_run` until done.
7. **The sanitiser fix** in `core/audit.ts` means Phase 1a/3 rows now also keep `contextId` (it was dropped because "conTEXTId" matched the PII filter).

## Tests

- New `backend/test/lms/phase4.test.ts` (**18 tests**) with the mock platform extended (`test/lms/mockPlatform.ts`: `GET /memberships/<course>` with `limit`/`from` paging and `Link: rel="next"`, statuses `Active`/`Inactive`/`Deleted`, the `role` filter (on/off), injected HTTP statuses, an other-origin next link, recorded requests; all on 127.0.0.1):
  - NRPS: `Link` parsing; token scope, media type and bearer; 3 pages read; a failing page and an other-origin next link → failed with the code, nobody removed; an empty roster removes nobody;
  - teacher launch older than 24 h syncs in the background, a fresh one does not, a learner launch never does;
  - new learners: reserved address (never the LMS email), class enrollment `source: 'lms'` + `lmsContextId`, `studentIds`, `invited`; listed on `/contexts/:id/roster` and marked on the teacher's class roster; **seats unchanged**;
  - first launch: same account, `active` with `firstLaunchAt`, **seat +1**, no NRPS check for an existing account, re-syncs never double count;
  - removed and `Inactive`: class enrollment `inactive` with `endedAt`, out of `studentIds`, account and records kept, audit reasons; the started student's seat goes; re-add reactivates (active / invited) with one class enrollment row;
  - role changes: new instructor (teacher account, instructors, `addedInstructor`), student listed as Instructor (unchanged, `student_as_instructor`), teacher listed as Learner (no student, `staff_as_learner`), sync-added instructor removed, **ENARA-assigned instructor kept**, a sync-linked teacher's switched launch is a preview;
  - ownership: a manual ENARA student in the LMS class stays; the same student with a manual group membership stays in the class (only the LMS membership ends); a manual class row is not touched; a **second LMS connection** of the same school is untouched;
  - hard cap: a new member is still synced (not started), their **first launch is refused** `seat_limit_reached` (nothing marked started), a seated student still gets in, raising the limit lets them in (+1), re-syncs never double count;
  - switched first launch: NRPS lists Instructor → preview (staff account, no student, no seat, no enrollment, no context, audit `detectedBy: 'nrps'`, `role` filter used, writes refused); also when the platform ignores the role filter; a real student's first launch is a normal student (`nrps_not_staff`); NRPS 500 and no memberships URL → today's behaviour with the reason audited;
  - nightly: `/api/cron/daily` `lmsRoster` syncs courses older than 20 h (trigger `nightly`, last-sync time moves), fresh ones are skipped, not run without `daily`; `/api/cron/lms-roster` 404 / 401 / 200;
  - "Sync roster now": school admin, ENARA admin, the course's teacher yes; another teacher 404; manager and student 403; anonymous 401; school B 404 both ways; 429 too soon; 409 while one runs;
  - flags off: no NRPS call, no sync, routes 404, no `lmsRoster` in the daily run, no `lms` in the teacher roster;
  - no names or emails in `lms_audit_log` or `rosterSync`; the migration twice.
- Updated: `test/multiClass/step1.test.ts` (the roster sync is an allowed writer of `lms` enrollments, as the multi-class plan §3 intends).
- Results (2026-11-18): `npx tsc --noEmit -p .` clean (backend and frontend). `test/lms` + `test/multiClass`: 31 files, 331 tests, all pass (phase4 18); `multiClass/step5.attendance` "another school's enrollment" failed once in the combined run and passes alone (timing). Full backend suite: 2,427 passed, 16 failed — exactly the 16 known pre-existing failures (elie e2e/sprint4, p14_2 x2, p14_8, p19 C1b, p20 tutor message, p2Documents x2, p3EducatorChat, phase0 upload links x2, phase3 autograding x3, phase3 e2e) — plus two files that did not start (`p21Orchestrator`, `security`: in-memory Mongo port clash), which pass when rerun alone (57/57).

## MoodleCloud runbook (for the owner)

Site **https://lms-test-enara.moodlecloud.com**, course **"ENARA Test Course"** (`ENARATEST`), users **teacher.test** and **student.test**. Tool **"ENARA (test)"** (Client ID `8yxn89ieexJUTws`, deployment `1`). ENARA test site **https://lms-test.enara.app**, school **LT-SCHOOL-A** (fake data).

### 0. Before the test (ENARA side; needs the owner's OK)

1. Deploy this branch to the lms-test project.
2. Env var on lms-test: `LMS_ROSTER_SYNC_ENABLED=true` (keep `LMS_LTI_ENABLED=true`, `LMS_TOOL_BASE_URL=https://lms-test.enara.app`; leave `LMS_DRAIN_TRIGGERS` unset).
3. Run `npm run migrate` against the lms-test database (adds `2026-11-19-lms-phase4-indexes`).
4. ENARA admin › LMS connections: the Moodle connection has the **Access token URL** `https://lms-test-enara.moodlecloud.com/mod/lti/token.php` (already needed for Phase 3). A **"Courses and rosters"** box now shows under the connection.
5. For the teacher view in step 4b: LT-SCHOOL-A has the **teaching workflow** feature on (Teaching dashboard visible to teacher.test).

### 1. (a) Make sure Moodle offers its roster to ENARA

1. Sign in to MoodleCloud as the site admin.
2. **Site administration › Plugins › Activity modules › External tool › Manage tools**.
3. On the **ENARA (test)** card click the **gear (Edit)** icon.
4. Open **Services**. Set **IMS LTI Names and Role Provisioning** to **"Use this service to retrieve members' information as per privacy settings"**. (If it already says so, nothing to change.)
5. Open **Privacy**: **Share launcher's name with tool: Always** (so ENARA shows real names in the not-started list). Email can stay as it is: ENARA never uses it to match anyone.
6. **Save changes**.
7. As **teacher.test**, open **ENARA Test Course › ENARA graded quiz** (or any ENARA activity) once. This launch gives ENARA the course's roster address and, because the course was never synced, starts the first sync in the background.

Expected: ENARA opens as usual. After ~10 s, ENARA admin › LMS connections › Courses and rosters shows **ENARA Test Course** with "Last roster sync <now> · ok (launch): … added …". Screenshot: the Moodle Services section, and the ENARA course line.

If the line says "The LMS did not offer its roster service…", step 4 was not saved, or the activity was opened before it: open it again as teacher.test.

### 2. (b) A new student who never launches → "not started"

1. Site admin: **Site administration › Users › Accounts › Add a new user**.
   - Username `student.new1`; Choose an authentication method **Manual accounts**; untick "Generate password and notify user" and set a **New password** (any);
   - First name `Test`, Last name `Newstudent`, Email address `student.new1@example.com`;
   - **Create user**.
2. **ENARA Test Course › Participants › Enrol users**: search **Test Newstudent**, **Assign role: Student**, **Enrol users**.
3. Do **not** sign in as this student.
4. ENARA (LT-SCHOOL-A admin or ENARA admin) › **LMS connections › Courses and rosters › ENARA Test Course › Sync roster now**.

Expected: green "Roster synced."; the course line shows **1 not started** more (e.g. "2 active · 1 not started · 0 left") and "ok (manual): 1 added"; **Show not started (1)** lists **Test Newstudent**. The Seats box: the students/seats number is **unchanged**, and "Not started: 1 … not counted as seats". Screenshot: the course line with the list open, and the Seats box.

Optional: sign in as student.new1 and open the ENARA activity once: the line moves to "… active · 0 not started" and Seats goes up by 1.

### 3. (c) Unenrol (or suspend) a student → inactive, history kept

Use `student.new1` (or student.test if you want to see a student with results; it can be re-enrolled after).

1. **ENARA Test Course › Participants**, row **Test Newstudent**:
   - **unenrol**: the **trash (Unenrol)** icon in the Status column › **Unenrol**; or
   - **suspend**: the **cog (Edit enrolment)** icon › Status **Suspended** › **Save changes**.
2. ENARA › LMS connections › **Sync roster now**.

Expected: "ok (manual): … 1 removed"; the course line "… 1 left". The student is no longer in the course's class roster, but the account, results and grades are still there (an ENARA admin can still open the student). Moodle leaves suspended people out of its roster, so both ways show as removed. **Re-enrol** (or set Status back to **Active**) and sync again: "1 back" (reactivated), no new student made. Screenshot: the course line after each sync.

### 4. (d) The button

a. As the LT-SCHOOL-A admin: LMS connections › Courses and rosters › **Sync roster now** (done in 2 and 3). Clicking twice within 30 s shows "A sync just ran for this course. Try again in a minute."

b. As **teacher.test** inside Moodle (ENARA opened from the activity): **Teaching dashboard › ENARA Test Course**. Under the title: "From your LMS · roster synced <time> · N not started" and a **Sync roster now** link; not-started students have a yellow **Not started** tag next to their name. Click **Sync roster now**: a "Roster synced" message. Screenshot: the class roster with the tag.

### 5. (e) The nightly sync

Staging has no automatic scheduler. The nightly step runs whenever `/api/cron/daily` is called with the CRON_SECRET. At least **20 h** after the last sync of the course (e.g. the next morning), run from your own terminal (the secret stays with you):

```
curl -s -H "Authorization: Bearer $CRON_SECRET" https://lms-test.enara.app/api/cron/daily
```

Expected: the JSON has `"lmsRoster": { "contexts": 1, "ok": 1, … }`. LMS connections shows ENARA Test Course with **"Last roster sync <the time you ran it> · ok (nightly)"**. A second call right after says `"contexts": 0` (fresh courses are skipped). Screenshot: the course line.

### 6. (f) Seats stay one per student

1. LMS connections › **Seats** before step 2: note the number.
2. After step 2 (not started): **unchanged**, "Not started: 1".
3. After student.new1 launches once: **+1**, "Not started: 0".
4. Sync roster now two more times: **unchanged** (no double count).
5. After step 3 (unenrolled, and not in any other ENARA class or group): **−1**. Re-enrolled and synced: back **+1**.

### 7. Manual ENARA enrollment is never touched (owner decision 2)

1. In ENARA as the **LT-SCHOOL-A admin**, add an existing ENARA student (one who is **not** in Moodle) to the LMS course's class: **Students** (Student management) › that student › **Commit & Assign Courses** (the "Commit Courses for Student" window) › tick **ENARA Test Course** › **Save Enrollment**. (Any other way an admin assigns a student to a class works the same.)
2. LMS connections › **Sync roster now**.

Expected: the sync reports nothing removed for that student; the student is still in the class (Teaching dashboard › ENARA Test Course lists them, without a "Not started" tag). Screenshot: the class roster.

### 8. Optional: first launch already switched to student

1. Site admin: create `teacher.new1` (as in step 2, email `teacher.new1@example.com`) and enrol them in ENARA Test Course as **Teacher**. Do **not** open ENARA as them, and do **not** sync.
2. As teacher.new1: **Switch role to… › Student**, open the ENARA activity.

Expected: the yellow **"Preview as student — nothing is saved"** banner; no new student in ENARA; Seats unchanged. (If a sync ran between 1 and 2, the same happens through the linked account.) Screenshot: the banner.

### What I (ENARA side) will check after the run

On the lms-test database (IDs only):
- `lms_contexts` for ENARATEST: `nrpsUrl` = `https://lms-test-enara.moodlecloud.com/mod/lti/services.php/CourseSection/<course>/bindings/<n>/memberships`, `lastRosterSyncAt`, `rosterSync` (`trigger`, `outcome: ok`, counts matching each step, no `lastErrorCode` or an explained one).
- `lms_access_tokens`: a row with `scopesKey` = the NRPS scope, `tokenEnc` starting `lk1.`.
- `lms_enrollments` for student.new1's `lms_users` row: `invited` (step 2) → `active` with `firstLaunchAt` (if launched) → `inactive` with `endedAt` (step 3) → back.
- `class_enrollments` for that student and the course class: one row, `source: 'lms'`, `lmsContextId`, `inactive` + `endedAt` after step 3, `active` after the re-add; the manual student of step 7: `source: 'manual'`, still `active`.
- `users`: student.new1's address is `<lmsu…>@lms.enara.test`, not `student.new1@example.com`.
- `GET /api/lms/seats` as the LT-SCHOOL-A admin: `seatsUsed`, `notStarted` matching step 6.
- `lms_audit_log`: `roster.sync` (one per sync, trigger launch / manual / nightly), `roster.member_added`, `roster.member_removed` (`reason: not_in_lms`), `roster.member_reactivated`; for step 8 `preview_launch` with `detectedBy: nrps` (or `staff_account`); no names or emails anywhere.

## Not done / later

- The grade ledger's LMS-result check is not wired: `core/rosterHooks.ts` `afterRosterSync()` is the one call site (a no-op).
- `/api/lms/contexts…` are not in the `p7RoleMatrix` / `p14_9TenantIsolation` sweeps (flags off there); `phase4.test.ts` has its own role and tenant sweep.
- A student **erased** (PDPL permanent delete) while still enrolled in Moodle is created again by the next sync (as their next launch would). A suppression list needs a decision.
- No UI for the bounds; no per-course "pause sync".
- Not tested live: MoodleCloud (runbook above), Moodle 4.5 LTS / latest (Phase 7).

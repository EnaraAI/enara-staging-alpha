# Multi-class step 6: archiving and safe delete (notes)

**Status:** built and tested on fake data only. Nothing deployed, no switch
turned on anywhere. Decisions: `PLAN.md` §10 (deleted groups, archiving) and
decision C (archive students, permanent delete for data-deletion requests).

## Switches

Both off by default. With both off every endpoint answers exactly as before
(tested, see "Switches off" below).

| Switch | Default | Effect |
|---|---|---|
| `ENROLLMENT_GROUP_ARCHIVE` | `false` | Deleting a group or class that still has active students is refused (409). Archive / restore groups and classes. "Students without an active group" list. Archived groups and classes hidden from the normal lists. |
| `ENROLLMENT_STUDENT_ARCHIVE` | `false` | Archive / restore students (the normal action). `DELETE /api/students/:id` becomes "delete permanently": admins only, typed confirmation. Archived students hidden from the normal list and seat count. |

The two are independent. On lms-test they are meant to run with the dual write
on (`ENROLLMENT_DUAL_WRITE`), as the rest of the multi-class work.

## One rule behind every action

Archiving keeps the **old fields and `class_enrollments` in agreement**, so the
step 4 shadow keeps 0 mismatches and the backfill dry run stays `inSync`:

- it clears the old field (`Student.batchId`, or the class's `studentIds`)
  **and** ends the matching active enrollments (`status: 'inactive'`,
  `endedAt`, `endedBy`);
- it first writes an `archive` record on the archived row with exactly what it
  changed (IDs only), so a restore puts back only that;
- it deletes nothing: the student, group and class records, the ended
  enrollment rows (history with dates), attempts, grades, reports and parent
  links all stay.

## Groups and classes (`ENROLLMENT_GROUP_ARCHIVE`)

**Block delete.** `DELETE /api/batches/:id` and `DELETE /api/course-instances/:id`
answer **409** when there are active students:

```json
{ "error": { "code": "GROUP_HAS_STUDENTS", "message": "Move or remove the students first.",
             "details": { "activeStudents": 2, "byGroupField": 2, "byEnrollment": 2, "canArchive": true } },
  "message": "Move or remove the students first." }
```

- **Group:** active (not archived) students whose `Student.batchId` is the
  group, or who have an active group enrollment in it.
- **Class:** `CLASS_HAS_STUDENTS`, counting explicit members (`studentIds`, existing
  and not archived), members of the class's group (old field or enrollment, the
  membership rule) and active class enrollments. A class whose group has
  students is therefore refused too; archive it instead.
- An empty group or class is deleted exactly as before.

**Archive / restore a group:** `POST /api/batches/:id/archive`, `.../restore`.
- **Archive:** `archivedAt`/`archivedBy`, `archive: { memberIds, fieldMemberIds, enrollmentIds, studentCount }`;
  members' `batchId` cleared and `studentCount` lowered; group enrollments
  ended. The members become "students without an active group" (reason
  `group_archived`). The group's classes are not archived (they keep their
  explicit members); archive them separately if wanted.
- **Restore:** puts back only members who still exist, are not archived and
  have no group now; reactivates only the enrollment rows the archive ended.
  Others are reported in `notReturned` with `moved` / `archived` / `deleted`.
- **History view:** `GET /api/batches/:id/history`: every membership row with
  status and dates, and the members at archive time.

**Archive / restore a class:** `POST /api/course-instances/:id/archive`, `.../restore`.
Explicit members are taken off `studentIds` and their class enrollments
ended; visibility becomes the existing `'archived'` value (the previous one
is kept and restored), so every student view (student-visible classes only)
hides it on both read paths. Group members are untouched (they are members
through the group).

**Lists.** `GET /api/batches`, `GET /api/course-instances` hide archived rows;
`?includeArchived=true` shows all, `?archived=only` shows only archived ones
(history). A student can't be placed in an archived group (409
`GROUP_ARCHIVED`), nor added to an archived class (409 `CLASS_ARCHIVED`).

**Students without an active group:** `GET /api/students/without-active-group`
(school admin: own school; ENARA admin: all, or `?institutionId=`). Active
students for whom neither `Student.batchId` nor an active group enrollment
points at a group that exists in their school and is not archived. Each row has
a reason: `group_deleted` (points at a deleted group, the case the churn burst
found), `group_archived`, `group_in_other_school`, `no_group`. Read-only:
nothing is deleted or changed. Placing a student (choosing a group) removes
them from the list.

**Real site later.** The backfill dry-run report keeps `doesNotFit.groupMissing`,
`alreadyMatchingDeletedGroup` and `doesNotFit.classMemberMissing`, and now also
has `studentsWithoutActiveGroup` (`count`, `byReason`, up to 200 items with IDs
and reasons only). It is information only and never affects `inSync`.

## Students (`ENROLLMENT_STUDENT_ARCHIVE`, decision C)

**Archive:** `POST /api/students/:id/archive`.
- **Account closed:** the student's login accounts get `status: 'disabled'` (no
  sign-in) and `tokenVersion` is raised (open sessions end). Those are the
  accounts linked by `studentId`, or not yet linked with the same email in
  the same school.
- **Out of every roster:** `batchId` cleared (group count lowered), removed
  from every class list, every active enrollment ended.
- **Not counted:** not in the seat count, not in the normal student list.
- **Kept:** grades, attempts, reports, parent links and history.
- **Restore:** `POST /api/students/:id/restore` reopens exactly the accounts
  the archive closed. It puts back the group and classes that still exist and
  are not archived (others are listed in `skipped`), and reactivates only the
  enrollment rows the archive ended. A membership that had already ended
  before the archive stays ended (tested).

**Lists and history.** `GET /api/students` hides archived students;
`?archived=only` or `?includeArchived=true` show them. `GET /api/students/:id`
still reads an archived student (history and reports). An archived student
can't be given a group or class (409 `STUDENT_ARCHIVED`).

**Seat count (Q1, one seat per student).** There was no measured seat count:
the price simulator takes the number of students as an input. New:
`GET /api/usage/seats` (billing permission) gives
`{ seatBasis: 'students', seats, archivedExcluded }`: the school's students
minus archived ones. It only exists while the switch is on.

**Delete permanently.** With the switch on, `DELETE /api/students/:id`:
- **Who:** school admins and ENARA admins only. Other roles get 403, and
  another school gets 404.
- **Confirmation:** the body must be `{ "confirm": "DELETE <studentId>" }`,
  otherwise 400 `CONFIRMATION_REQUIRED`, which also tells the admin to archive
  instead.
- **Effect:** removes the student from every reference (list below), works
  for active and archived students, and returns the counts per collection.
- **Audit:** `student.deleted_permanently`, with IDs and counts only.

### Permanent delete: what is removed, anonymised and kept (PDPL, final)

The owner's Egypt PDPL decisions (2026-11-17) are built in. All of it is
still behind `ENROLLMENT_STUDENT_ARCHIVE`: with the switch off, `DELETE` is the
old delete and nothing below happens (tested).

**Removed from lists / counts (no ghosts, tested):** every class list
(`CourseInstance.studentIds`), group and class archive records, the group count
(when still active), `Assignment.studentIds` and `Assignment.extensions`.
These IDs are unique across schools, so they are pulled everywhere.

| Data | What happens | Why |
|---|---|---|
| `Student` record; login accounts (`User`, by `studentId`, or unlinked with the same email in the school) | **Deleted** | the person |
| `password_resets`, `sign_in_events` (by user ID or email), pending student `invitations` | **Deleted** | |
| `reminder_logs` (sent-email log: address, subject), by address, student or account | **Deleted** | new |
| `class_enrollments` (history too), `parent_learner_links`, `parent_link_codes`, `student_class_choices` | **Deleted** | `student_class_choices` new |
| LMS: `lms_users` of the student's accounts (LMS name and email), their `lms_enrollments` and unsent `lms_grade_sync_jobs`; `google_connections` | **Deleted** | new; `lms_audit_log` is not touched |
| `assessment_attempts` with a final score (`submitted` and graded, `finalized` or `released`) | **Anonymised and kept** (P1, below) | school totals |
| `assessment_attempts` without a final score (open, abandoned, still grading, drafts) | **Deleted** | nothing final to keep |
| Attempts on assessments made for this student only (`Assessment.studentId`), and those assessments | **Deleted** | a group of one cannot be anonymous |
| `grading_proposals` of kept attempts | **Anonymised and kept**: structured score only | P1 |
| `grading_proposals` of deleted attempts | **Deleted** | |
| Experimental `hybridshadowresults` (answer hashes) of the student's attempts, `hybridanchorsets` using them | **Deleted** | derived from the answers |
| Free text the student wrote: answers, essays, written responses, drafts, appeals; feedback, explanations, strengths/improvements that quote them | **Deleted** (whitelist: anything not listed as kept is dropped) | P1 |
| Transcripts: speaking-exam conversation turns, `avatar_sessions`, `learner_language_profiles`, `diagnostic_sessions` | **Deleted** | P1 |
| Tutor conversations: `tutor_sessions`, `tutor_messages`, `tutor_faces`, `student_tutor_choices` | **Deleted** | P1 |
| Audio recordings | **None stored.** Speaking exams and pronunciation scoring transcribe audio in memory and do not keep it; tutor voice is streamed. Checked in the code: the only stored files linked to a student are photos | P1 |
| Photo files (`photoKey`, `pendingPhotoKey`) in storage (R2 or local) | **Deleted**, best effort: a failure is counted and its key listed (`files.failedKeys`, also in the audit record) for a retry | P1 |
| Learning records: `learning_events`, `learning_evidence`, `learning_interventions`, `lesson_progress`, `objective_retention_states`, `pedagogical_decisions`, `review_items`, `student_misconceptions`, `student_objective_mastery`, `mastery_history`, `study_plans`, `teaching_episodes`, `time_to_understand`, `attendance_records`, `student_credits` | **Deleted** | profiling and derived data, not scores |
| `safety_alerts` about the student | **Kept** (`subjectDeleted: true`, `sessionId` removed), school and ENARA admins only, purged after `SAFETY_ALERT_RETENTION_DAYS` | P2 |
| `ai_calls` | **Anonymised**: `studentId`, `userId` removed | |
| `usage_events` | **Anonymised**: `studentId` removed, `userId` = `'erased'` | |
| `budget_reservations` | **Anonymised**: `userId` removed | |
| `usage_ledger` | **Kept unchanged**: bare student/user IDs (and old attempt IDs in `refs`); append-only; 30-day TTL | P3 accepted |
| `audit_events` | **Kept unchanged**: the student ID, including the deletion record (IDs and counts, no names); append-only; 30-day TTL | P4 accepted |
| Parent's own account and profile | **Kept** (another person; only the link is removed) | |
| Staff free text that may name the student (educator chat, lesson plans, documents) | **Not searched** | as before |

**P1: what a kept (anonymised) result holds.**
- **Kept:** score, total and max points, status, grading status, item
  (question) IDs, correct/incorrect, points, max points, method, criterion
  scores, original points; started/submitted/finalized/released times, time
  spent, late flag; assessment, version and assignment IDs (the assignment gives
  the class); school; origin.
- **Replaced:** `studentId` becomes `anon_<random UUID>`, one per deleted
  student, generated at random (not derived from the student ID). It is not
  returned, logged or audited, so nothing maps it back. The attempt and its
  proposals get new random IDs (`att_anon_…`, `gp_anon_…`), so the old attempt
  IDs that the usage ledger keeps (P3) match nothing. `updatedAt` is left as
  it was, so no field dates the deletion. A result that was `finalized` but
  not released is stored as `released`: with no student it would otherwise
  wait in teachers' release queues for ever.
- **Dropped:** everything else, by whitelist (`services/anonymisedResults.ts`):
  answers, question text, explanations, feedback, strengths/improvements,
  overall feedback, transcript turns, speaking details, appeals, drafts, the
  grading history (actors and reasons), errors and the learning-update flags.
- **Grading proposals of kept attempts:** criterion, level and points stay;
  evidence quotes, rationale, feedback and explanations are removed.

**P1: reports and analytics (`MIN_GROUP_SIZE_FOR_ROWS = 5`).**
- **The rule:** a deleted student's kept result is never shown as its own row
  in a class or group with fewer than 5 students, counting live and anonymised
  students. There, only aggregates. Live students' rows are unchanged.
- **Assessment results** (`GET /api/assessments/:id/attempts`): kept results
  count in `assigned`, `submitted`, the average, highest and lowest scores and
  the per-question correct rates. So these are the same before and after the
  delete (tested).
  - `summary.anonymisedStudents` and `summary.anonymisedRowsShown` appear only
    when there are some.
  - With 5 or more students, each one is a row named "Deleted student", with
    no email.
- **Assignment** (`GET /api/assignments/:id`): the roster stays the class's
  live students.
  - A new `anonymisedResults` block (only when there are some) gives
    `students`, `graded`, `averageScore`, `rowsShown` and `rows` (empty under 5).
- **Grading queue and grading actions:** kept results are not work items. They
  are left out of the queue, and opening or changing one answers 404 (review,
  release, regrade, correct, appeals). "Release all" skips them.
- **Class analytics** (educator analytics, learning analytics, outcomes, the
  teaching overview, speaking-exam list): these already count only the
  class's current members, as for withdrawn students. Anonymised results are
  therefore never shown per student there and not counted there either
  (unchanged).
- Student-, parent- and per-student views look results up by a real student,
  so an anonymous ID never matches.

**P2: safety alerts.** Alerts about the deleted student are kept as they
were (category, action, detector, review state, excerpt, the original
student ID), marked `subjectDeleted: true`, without the deleted tutor
session's ID. They are not linked to the anonymous ID.
- **Who sees them:** `GET /api/students/deleted-safety-alerts` (switch on),
  school admins (own school) and ENARA admins (all, or `?institutionId=`).
  Teachers and students get 403; parents have no link any more. The student
  management page shows them in "Safety alerts kept after deletion" (admins
  only, hidden when there are none).
- **Retention:** `SAFETY_ALERT_RETENTION_DAYS` (default 730 = 2 years,
  placeholder until legal confirms), counted from the alert's `createdAt`.
- **Purge:** `npm run pdpl:retention` is a dry run (it reports what is due).
  `-- --apply` deletes kept alerts of deleted students older than the
  retention. Alerts of live students are never touched. It is safe to run on a
  schedule (`services/pdplRetention.ts`, `runPdplRetention({ apply })`).
- **Excerpt (decision to confirm):** the alert's excerpt is the student's
  own words (e.g. a phone number they typed). It is kept because the alert
  is kept for safeguarding. To drop it as well, unset `excerpt` in the
  erasure (one line).

**P3/P4 (accepted as is).** `usage_ledger` keeps bare student and user IDs,
and `audit_events` keep the student ID (no names or PII). Both are append-only
and expire after 30 days by their own TTL. The deletion audit record holds IDs
and counts only, never the anonymous ID.

**P5: logs and backups (`DATA_LOG_RETENTION_DAYS`, default 30, placeholder).**
What the app itself stores in MongoDB:

| Collection | Personal data | Retention now |
|---|---|---|
| `sign_in_events` | email, user ID, full IP, browser | TTL = the setting (was a fixed 30 days). Index name stays `retention_30d` |
| `reminder_logs` | email address, subject | TTL = the setting (**was 90 days**) |
| `ai_calls` | user, student and request IDs on cost records | kept 180 days for cost totals (TTL unchanged); the person links are removed after the setting by `npm run pdpl:retention` (dry run by default) |
| `alert_events` | none (attempt IDs, routes) | 30 days, unchanged (OD-5) |
| `audit_events` | actor and target IDs | 30 days, append-only, **not touched** (P4) |
| `usage_ledger` | student/user IDs | 30 days, append-only, **not touched** (P3) |
| `lms_audit_log` | LMS | **not touched** |
| `rate_limits` | limiter keys | expire at the end of each window |
| `avatar_sessions`, `educator_conversations` | session transcripts, staff chat | their own retention TTLs, unchanged |
| `usage_events` | user/student IDs | billing records, not a log: unchanged |
| `demo_sessions` | hashed IP of demo visitors | not a log: unchanged (no TTL; listed for the owner) |

- **Migration `2026-11-17-pdpl-data-log-retention`** (new). It moves the two
  TTL indexes to the setting with `collMod` (no rebuild) and is idempotent.
  **It has not been run anywhere.** It runs with the other migrations
  (`npm run migrate`, or at start-up where `RUN_MIGRATIONS_ON_START` is not
  `false`).
- **Models** use the same setting for new databases. Until the migration has
  run, MongoDB keeps the old 90-day email-log index, and Mongoose logs an
  index-options conflict at start-up (harmless).
- **The email log** only stops a second "assignment published / results
  released" email for the same student and event. 30 days is far longer than
  any re-send window.
- **Outside the app:**
  - **Database backups** are MongoDB Atlas snapshots, set in Atlas, not in
    this code. Set the snapshot retention to the same placeholder (30 days) in
    Atlas. A deleted student stays in backups until they expire.
  - **Application logs** (Vercel / host logs) hold IDs, not names. Their
    retention is set at the host.

## Switches off: nothing changes

`test/multiClass/archive.off.test.ts`:
- **New routes:** with both switches off they answer byte for byte what the
  same path answered before this step. Each new route is mounted behind
  `onlyWhen(switch)`, which skips to the route that matched before.
- **Deletes:** a group with students is deleted and `Student.batchId` is left
  pointing at it (the old behaviour). A class with students is deleted. A
  student delete needs no confirmation and leaves the login account (the
  old behaviour).
- **Lists:** they ignore `archived` / `includeArchived`, and rows carrying
  `archivedAt` are listed as before.
- **Writes:** writes against such rows are not blocked.
- **No extra database calls:** measured with the mongoose debug hook. The
  guards and list filters make no database call while off. Deleting a group
  does `batches.findOne` and `batches.deleteOne`, as before.
- **Switches on, nothing archived yet:** student, group and class lists, a
  student record, a class roster and a student's class list are byte-identical
  to off.

**Additive response fields:**
- Student, group and class rows carry `archivedAt`/`archivedBy`/`archive` only
  once archived. Rows that were never archived are unchanged.
- The backfill report gains `studentsWithoutActiveGroup` (requested).

**Turning a switch off after archiving:**
- Archived rows show up again in the lists, because nothing filters them.
- Their state stays as the archive left it: no group or classes, accounts
  closed.
- Restore them (switch on) before turning the switch off, or leave it on.

## Burst script (lms-test)

`src/scripts/lmsTestBurst.ts` reads `GET /api/students/archive-settings`. A 404
means the step isn't deployed or both switches are off. `--with-archive`
refuses to run unless a switch is on. The new kinds act only on burst-created
groups and students, never on seeded or protected ones.

- **`temp_group` (group switch):**
  - deleting the new group with its 2 students must answer 409 `GROUP_HAS_STUDENTS`;
  - it is then archived: `enrollmentsEnded` 2 and `studentsUnplaced` 2;
  - the group history must show 2 ended memberships.
- **`restore_group`:** a burst group archived earlier is restored. Every member
  must be back or reported.
- **`archive_student`, `restore_student`.**
- **`delete_permanent`:** a burst student, active or archived. Afterwards
  `GET /api/students/:id` must be 404.
- **`delete_student` and the cap:** use the confirmed permanent delete.
- **After every batch:** the existing checks still apply (shadow: no new
  mismatches or errors; backfill dry run `inSync`). The "students without an
  active group" list must equal the active students without a group in the
  active group list. The report's `studentsWithoutActiveGroup` count is logged.

The script now exports `main()` and runs it only when started as a script.
`test/multiClass/archive.burst.test.ts` runs the whole burst end to end:
- against a local app and an in-memory database (fetch stubbed, no network,
  the maintenance endpoints answered by the same services);
- 4 batches, every kind including all archive kinds;
- every check clean.

It has **not** been run on lms-test (no deployment without Mohamed's OK).

## Files

- **Backend services:**
  - `services/archive.ts`: rules, group/class/student archive and restore,
    unplaced list, seat count;
  - `services/studentErasure.ts`: permanent delete (PDPL P1/P2);
  - `services/anonymisedResults.ts`: what a kept result holds (whitelists),
    the random anonymous IDs, `MIN_GROUP_SIZE_FOR_ROWS` and the small-group rule;
  - `services/pdplRetention.ts` and `scripts/pdplRetention.ts`
    (`npm run pdpl:retention`, dry run by default): kept-alert purge (P2),
    AI call person links (P5), the admin alert list;
  - `services/enrollmentBackfill.ts`: report field.
- **Controllers and routes:**
  - `controllers/archive.controller.ts`: handlers, route guards, list filter;
  - additive lines in `routes/student.routes.ts`, `routes/batch.routes.ts`,
    `routes/courseInstance.routes.ts`, `routes/usage.routes.ts`;
  - one filter line each in the three list controllers.
- **Models and config:**
  - `archivedAt`/`archivedBy`/`archive` on `Student`, `Batch`,
    `CourseInstance`;
  - `config/env.ts`: `archive.group` / `archive.student`, `retention`;
  - `config/retention.ts`: `SAFETY_ALERT_RETENTION_DAYS` (730),
    `DATA_LOG_RETENTION_DAYS` (30);
  - `AssessmentAttempt.anonymised`, `SafetyAlert.subjectDeleted`; TTLs of
    `SignInEvent` and `ReminderLog` from the setting;
  - migration `2026-11-17-pdpl-data-log-retention` (not run anywhere).
- **Reports (PDPL P1):** `controllers/assessment.controller.ts` (assessment
  results), `controllers/assignments.controller.ts` (`anonymisedResults`),
  `controllers/grading.controller.ts` (queue, actions, release all).
- **Frontend:**
  - `components/ArchivePanels.tsx`: "Students without an active group",
    "Archived students", "Archived groups and classes", the
    permanent-delete prompt;
  - `pages/StudentManagement.tsx`: Archive / Delete permanently;
  - `pages/CurriculumCenter.tsx`: Archive buttons, and the 409 refusal
    offers to archive;
  - `components/ArchivePanels.tsx` also: "Safety alerts kept after deletion"
    (admins, hidden when empty) and the updated permanent-delete wording;
  - `services/apiService.ts`.
- **Tests:** `test/multiClass/archive.{helpers,off,groups,students,isolation,burst,pdpl}`.

## Tests

| File | What |
|---|---|
| `archive.off.test.ts` (7) | switches off: new routes absent, old delete/list behaviour, no extra DB calls; on-but-unused reads identical |
| `archive.groups.test.ts` (11) | block delete (old field, enrollment only, class explicit / via group), empty deletes; archive/restore group (enrollments ended, history, lists, unplaced list, counts, consistency), member moved meanwhile; archive/restore class (student views, lists, guards); unplaced list reasons, scope, nothing deleted; backfill report count |
| `archive.students.test.ts` (6) | archive/restore (account, sessions, rosters, seats, lists, grades, parent link, history; exact restore); permanent delete needs role + confirmation; no ghosts (active and archived student) |
| `archive.isolation.test.ts` (2) | other school's admin gets 404 on every action; school B data byte-identical after A's actions; per-school lists and seats |
| `archive.burst.test.ts` (1) | the lms-test burst end to end, locally |
| `archive.pdpl.test.ts` (6) | PDPL: kept result anonymised (random ID, new IDs, whitelisted fields, proposals without quotes), aggregates identical before/after, live rows unchanged, anonymised row shown in a class of 5; every collection in the database searched for the student ID, user ID, email, their text and the old attempt ID (only the usage ledger, audit trail and kept alert, as decided); the anonymous ID appears nowhere else; small class (3, then 4 with two deletions): aggregates only; two deletions give unrelated IDs; not in the grading queue, 404 on grading actions; failed photo deletion reported with its key; kept alerts: admins only, purge dry run / apply / setting, live alerts untouched; P5 migration (90 → 30 days, setting, idempotent, index name kept) and AI call person links (dry run / apply); switch off: old delete, attempts and alerts untouched, reports identical, new route absent |

Every archive test ends with a consistency check: backfill dry run in sync and
every class roster equal on the old and new paths.

### Results (2026-11-17, with the PDPL decisions)

**Type-check:** `npx tsc --noEmit -p .` is clean for the backend and the
frontend. `vite build` passes.

**`npx vitest run test/multiClass --hookTimeout 60000 --testTimeout 60000`:**
21 files, 151 tests, all pass. That includes the 6 PDPL tests.
- Use `--hookTimeout 60000` on a busy machine. The step 2 setup hook and its
  demo-template test sit close to vitest's 10 s and 5 s defaults when many
  files run in parallel; they pass alone and on a quiet run.

**Full backend suite, defaults (switches off), on a loaded machine:** 185 files,
2386 tests, 17 failed tests in 12 files.
- **None is new.** These are the failures already known on the base:
  - AI providers unreachable: test-spend cap (2), Anam switch, P20 AI-path
    budget, ELIE e2e and sprint 4 loops, phase 3 end to end;
  - upload signing (phase0, 2) and the document scan gate (p2Documents, 2);
  - the P19 per-IP limiter reproduction;
  - p3 educator chat isolation;
  - phase3 autograding 11, 14 and 15.
- **Rechecked alone:**
  - p24 sign-in history (its setup hook had timed out at 10 s) passes alone.
  - p20 "journey pages" passes alone; the P20 AI-path test still fails alone,
    as on the base.
  - phase3 autograding 11, 14 and 15 fail in the same way with this step's
    grading controller, models and config put back to the base versions, so
    they do not come from this change.

**Not run anywhere:** the migration `2026-11-17-pdpl-data-log-retention`, the
retention script, and the permanent delete on lms-test or production.

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

### Permanent delete: what is removed and what is kept

**Removed from lists / counts (no ghosts, tested):**
- `CourseInstance.studentIds`: every class.
- `CourseInstance.archive.memberIds` and `Batch.archive.memberIds` / `fieldMemberIds`: archive records.
- `Batch.studentCount`: lowered by one when the student was still active in a group.
- `Assignment.studentIds` and `Assignment.extensions` entries for the student.

These IDs are unique across schools, so they are pulled everywhere.

**Deleted (the student's personal records):**
- **Student and logins:** the `Student` record; the student's login accounts
  (`User`: linked by `studentId`, or unlinked with the same email in the same
  school, so a sign-in can't re-create the student); `password_resets` and
  `sign_in_events` of those accounts (by user ID or email); pending student
  `invitations` for that email in that school.
- **Memberships and parents:** `class_enrollments` (all rows, history
  included); `parent_learner_links` and `parent_link_codes`.
- **Grades and work:**
  - `assessment_attempts`, and the `grading_proposals` of those attempts;
  - assessments made for this student only (`Assessment.studentId`);
  - `attendance_records`.
- **Learning records:** `diagnostic_sessions`, `learner_language_profiles`,
  `learning_events`, `learning_evidence`, `learning_interventions`,
  `lesson_progress`, `objective_retention_states`, `pedagogical_decisions`,
  `review_items`, `student_misconceptions`, `student_objective_mastery`,
  `mastery_history`, `study_plans`, `teaching_episodes`,
  `time_to_understand`.
- **Tutor and safety:** `tutor_sessions`, `tutor_messages`, `tutor_faces`,
  `student_tutor_choices`, `avatar_sessions`, `safety_alerts`,
  `student_credits`.
- **Photos:** uploaded photo files (`photoKey`, `pendingPhotoKey`), best
  effort; a storage failure is counted in the reply and logged.

**Anonymised (kept for the school's totals, link to the person removed):**
- `ai_calls`: `studentId` and `userId` removed.
- `usage_events`: `studentId` removed; `userId` set to `'erased'` (the field is required).
- `budget_reservations`: `userId` removed.

**Kept unchanged:**
- **`usage_ledger`:** append-only by design (`models/UsageLedger.ts` refuses
  updates and deletes). Its rows keep the student and user IDs, which no longer
  point at any record. The reply counts them (`kept.usage_ledger_rows_with_ids`).
- **`audit_events`:** append-only. Records of actions by or on the student,
  including the deletion record (IDs and counts, no names).
- **The parent's own account and parent profile:** a different person, who may
  have other children. Only the link is removed.
- **Not searched:** free text written by staff (educator chat conversations,
  lesson plans, uploaded documents) that may mention the student by name.
- **Outside the database:** application logs (IDs only) and database backups.

**For the owner to confirm (PDPL):**
1. **Grades and attempts are deleted** (personal records; the instruction was
   to delete when unsure). If school records law requires keeping grades,
   they can be anonymised instead.
2. **`safety_alerts` are deleted.** A safeguarding duty may require keeping
   them for a period.
3. **`usage_ledger` keeps the IDs** (append-only). Anonymising them needs a
   dedicated, audited ledger operation; decide whether that is required.
4. **`audit_events` keep the student ID**, including in the deletion record.
5. **Backups and logs:** retention rules for them (outside the app).

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
  - `services/studentErasure.ts`: permanent delete;
  - `services/enrollmentBackfill.ts`: report field.
- **Controllers and routes:**
  - `controllers/archive.controller.ts`: handlers, route guards, list filter;
  - additive lines in `routes/student.routes.ts`, `routes/batch.routes.ts`,
    `routes/courseInstance.routes.ts`, `routes/usage.routes.ts`;
  - one filter line each in the three list controllers.
- **Models and config:**
  - `archivedAt`/`archivedBy`/`archive` on `Student`, `Batch`,
    `CourseInstance`;
  - `config/env.ts`: `archive.group` / `archive.student`.
- **Frontend:**
  - `components/ArchivePanels.tsx`: "Students without an active group",
    "Archived students", "Archived groups and classes", the
    permanent-delete prompt;
  - `pages/StudentManagement.tsx`: Archive / Delete permanently;
  - `pages/CurriculumCenter.tsx`: Archive buttons, and the 409 refusal
    offers to archive;
  - `services/apiService.ts`.
- **Tests:** `test/multiClass/archive.{helpers,off,groups,students,isolation,burst}`.

## Tests

| File | What |
|---|---|
| `archive.off.test.ts` (7) | switches off: new routes absent, old delete/list behaviour, no extra DB calls; on-but-unused reads identical |
| `archive.groups.test.ts` (11) | block delete (old field, enrollment only, class explicit / via group), empty deletes; archive/restore group (enrollments ended, history, lists, unplaced list, counts, consistency), member moved meanwhile; archive/restore class (student views, lists, guards); unplaced list reasons, scope, nothing deleted; backfill report count |
| `archive.students.test.ts` (6) | archive/restore (account, sessions, rosters, seats, lists, grades, parent link, history; exact restore); permanent delete needs role + confirmation; no ghosts (active and archived student) |
| `archive.isolation.test.ts` (2) | other school's admin gets 404 on every action; school B data byte-identical after A's actions; per-school lists and seats |
| `archive.burst.test.ts` (1) | the lms-test burst end to end, locally |

Every archive test ends with a consistency check: backfill dry run in sync and
every class roster equal on the old and new paths.

### Results (2026-11-17)

**Type-check:** `npx tsc --noEmit -p .` is clean (backend). Frontend:
`tsc --noEmit` and `vite build` pass.

**`npx vitest run test/multiClass`:** 17 files, 104 tests, all pass. That is
the 27 new archive tests plus every step 1–5 test.
- Use `--hookTimeout 60000` on a busy machine. The step 2 setup hook and its
  demo-template test sit close to vitest's 10 s and 5 s defaults when many
  files run in parallel; they pass alone and on a quiet run.

**Full backend suite, defaults (switches off):** 22 failed tests and 12 files
whose `beforeAll` timed out at 10 s. The machine was heavily loaded: the
suite ran in parallel with other test runs and another session.

**Recheck:**
- The 26 affected files were rerun with `--hookTimeout 120000`, on this
  branch and on the base commit (`7aaee244`, sources checked out
  temporarily).
- **Branch:** 17 failing tests. **Base:** 18 failing tests.
- **The same failures on both:**
  - AI providers unreachable: test-spend cap, Anam switch, P20 AI-path budget,
    ELIE / phase 3 end-to-end loops;
  - upload signing (phase0) and the document scan gate;
  - the P19 per-IP limiter reproduction;
  - p3 educator chat isolation;
  - p0c avatar heartbeat;
  - phase3 autograding 11, 14 and 15.
- **No failure is new.**
- `p20QueryBudget` "journey pages" failed on the base run only. It
  measures round trips and is unaffected (the switch-off guards make no
  database calls).
- The server-side-render UI tests (educatorAnalytics, learnerAgeBand,
  p10NamedStudents) now pass because the frontend dependencies were installed
  in this worktree. They were part of the earlier "~21 known failures".

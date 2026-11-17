# Multi-class step 6: turn on multi-class (notes)

**Status:** built and tested on fake data only. Nothing deployed, no switch
turned on anywhere. Plan: `PLAN.md` §4 step 6 and the approved answers in §9.
Group/class archiving and delete-blocking (§10) are built separately and are
not part of this step.

## The switch

| Switch | Default | Effect |
|---|---|---|
| `ENROLLMENT_MULTI_CLASS` | `false` | Turns on multi-class: the admin "Groups and classes" panel, the student class switcher, class labels for parents, and the Q1–Q9 answers below. |

It **only takes effect** when `ENROLLMENT_DUAL_WRITE=true` **and** all seven
step 5 features are in `ENROLLMENT_READ_FROM`
(`student_app,teacher_rosters,assessments,analytics,profile_context,credits,attendance`).
Otherwise it is treated as off and `enrollment_multi_class_ignored` is logged
once (with the missing features and the dual-write state). Extra memberships
live only in `class_enrollments`, so every read must come from there, and the
main group must keep being mirrored by the dual write.

`GET /api/multi-class/status` (any signed-in user) returns `{ multiClass }`;
the screens use it to decide whether to show anything new.

### Who is a "multi-class student"

A student whose active memberships **the old fields cannot express** and who
has **at least two** memberships: two or more groups, or a class membership
that exists only in `class_enrollments` (not in that class's `studentIds`) on
top of another membership. Everyone else is single-class exactly as today:
one group and its classes, plus classes that list them in their own
`studentIds` (fixture student `a3` is in two classes this way and stays
single-class). Q2, Q3, Q4, Q6 and Q9 change answers **only** for multi-class
students (`services/multiClass.ts`, `multiClassStudentIds` / `isMultiClassStudent`).

## What was built, per question

### 1. Admin: add a student to another group or class, and remove them

- Routes (`routes/multiClass.routes.ts`, mounted at `/api/multi-class`), school
  admins (their school) and Enara admins (the student's own school):
  - `GET /students/:id/enrollments`: main group, every group, every class with
    how the student is in it (`via: group | class`) and whether it can be
    removed here.
  - `POST /students/:id/enrollments { scope: 'group'|'class', targetId }`:
    `enroll(... source: 'manual')`; idempotent; re-adding reactivates the row.
  - `DELETE /students/:id/enrollments/:scope/:targetId`: `endEnrollment(status
    'removed')`; the row is kept as history.
- `Student.batchId` stays the **main group** (still written, for the main group
  only, by the student record and the step 2 dual write). Extra groups and
  extra classes live **only** in `class_enrollments`.
- Refused: removing the main group (409 `PRIMARY_GROUP`, change it on the
  student record); removing a class that lists the student in its own
  `studentIds` (409 `CLASS_ROSTER`, remove on the class); a second group for a
  student with no main group (409 `NO_PRIMARY_GROUP`).
  Since the follow-ups (S3): adding to an archived group or class (409
  `GROUP_ARCHIVED` / `CLASS_ARCHIVED`) or for an archived student (409
  `STUDENT_ARCHIVED`), so the service never makes an invalid extra.
- Tenant isolation: another school's group/class → 404
  `ENROLLMENT_TARGET_NOT_FOUND`; another school's student → 404; teachers and
  students → 403. Every change is audited (`student_membership_added` /
  `_removed`, IDs only).
- Frontend: `components/StudentGroupsPanel.tsx` (list, add, remove), opened
  from a new "Groups and classes" item in the student menu of
  `pages/StudentManagement.tsx`, shown only when the switch is on. The
  StudentManagement change is additive (an import, two state lines, one menu
  item, one modal line).

### Q1. One seat per student

Nothing to change: seats and school totals count `Student` records. Tested:
the credits summary `studentCount`, the analytics overview `totals.students`
and the school learning analytics `studentsTotal` are unchanged when a student
joins a second group and a third class.

### Q2. Student app: last class used, switcher only with 2+ classes

- `GET /api/multi-class/me/classes`: `{ enabled, showSwitcher, current,
  currentSource, classes }`. `current` is the class stored as last used (or
  `all`), else the class whose enrollment started most recently.
- `PUT /api/multi-class/me/classes/current { classId | 'all' }`.
- Opening a course (`GET /api/me/courses/:id`) records it as the last class
  used (multi-class students only). Stored in the new `student_class_choices`
  collection (one row per student; appears on first write, no migration).
- Frontend: `pages/StudentDashboard.tsx` shows a row of class chips ("All my
  classes" + each class) only when `showSwitcher`; the chosen class drives the
  resume card and the course tiles. Single-class students: `showSwitcher:
  false`, nothing rendered, nothing stored (tested).

### Q3. Parents: one view, activity labelled by class

For a child who is multi-class (and in 2+ classes):
`/api/parents/learners/:id/activity` labels each session `class: {id, name} |
null` (from the session's course), `/progress` labels each result (its
assignment's class, else a class of the assessment's group), both add
`classes: { items, filter }` and accept `?classId=` to filter the list. The
calendar, level, skills and totals stay the whole child. Every other child:
the reply is unchanged (no `class`, no `classes`, `classId` ignored).
Frontend: `parents/shared.tsx` `ClassFilter` (shown only with 2+ classes) and
labels in `parents/screens/Activity.tsx` and `Progress.tsx` (English and Arabic
strings added).

### Q4. Teachers: own class work plus the shared learner profile

For a multi-class student viewed by a **teacher** (school and Enara admins are
never restricted; single-class students never restricted):
- `GET /api/teaching/students/:id/profile`: classes, assignments/submissions
  and results only from the teacher's own classes (a result counts when it is
  on an assignment of their class, on an assessment their class also set
  (Q6), or on an assessment given to their class's group); interventions by
  another staff member or tied to another class are hidden; the 30-day
  activity counts only events of their classes or of no class. Adds
  `classScope: { restricted: true, classIds }`. Mastery, misconceptions,
  pathway and teaching approach (the shared learner profile) are unchanged.
- `GET /api/learning/students/:id/timeline` and `/interventions`: same rule.
- `GET /api/teaching/students/:id/study-plan` (staff view): items filtered the
  same way, history omitted, `classScope` added.
- Not filtered (shared learner profile, by design): mastery, knowledge map,
  diagnostics, misconceptions, pathway, recommendations, retention, teaching
  impact. Attendance is already per class. Teachers have no per-student tutor
  session list (sessions show only as counts in the activity summary, filtered
  above).

### Q5. Per-student profile, per-class reports, school totals once

Already true: level, CEFR and mastery are stored per student; grades,
assignments, attendance and course reports are per class. Tested: a student in
two groups is counted in each group's analytics row, once in the school totals,
and appears in each of their three class reports. CEFR remains limited to
language courses as today (no change needed).

### Q6. Both groups' assessments; the same one once; one result for both

- Group assessments (`Assessment.batchId`): the student's groups are read
  together, so each assessment comes back once (tested with both groups).
- The same assessment set as an assignment in two of a multi-class student's
  classes: `/api/me/assignments` shows it **once** (the one already worked on,
  else the earliest due; `alsoInClassIds` names the other classes), the study
  plan lists it once, and opening or starting the hidden one opens the kept
  one, so attempts never double up (`ATTEMPT_LIMIT_REACHED` on either id after
  one submission; one attempt row).
- One result counts for both classes: staff assignment detail
  (`/api/assignments/:id`), the teaching overview/class statuses and the
  learner profile show the other class's attempt for that student
  (`sharedAttempts`; only students who are multi-class and currently in both
  classes; never across schools).

### Q7. Attendance

No new code: with `attendance` in `ENROLLMENT_READ_FROM` the roster comes from
enrollments. Tested: the multi-class student is on each class roster with
`ENROLLMENT_ATTENDANCE_FIX` on (group classes), and on an added class's roster
even with it off (an explicit class enrollment).

### Q8. Age band

Not built (decision pending: no child/teen/adult age boundaries exist in the
code). The existing fallback applies: a student in several groups with no band
of their own gets the youngest group band (tested: teen + child → child).

### Q9. AI credits by class

`GET /api/credits`: for each multi-class student, `groupIds` and
`usageByClass` (last 30 days of settled use: each use credited to the class of
its tutor/avatar session's course, or to a class id stored directly as the
session id, else "No class"). Every other row is unchanged. Frontend:
`pages/AICredits.tsx` adds a "Students in several classes" table on the
classes view, only when such rows exist. Since S7 (below), a use whose session
recorded its class is credited to that class.

## Follow-ups (owner decisions 2026-11-17: S3–S7)

All behind the existing switches; every default is unchanged. With
`ENROLLMENT_MULTI_CLASS` off nothing below reads or writes anything new,
except S7, which only records a field.

### S3. The consistency check reports extras separately and validates them

The backfill dry run (`planBackfill`: `npm run enrollment:backfill`, the
maintenance endpoint, and the lms-test burst's STOP condition) used to report
every step 6 extra membership as a conflict (`activeNotInOldFields`), so
`inSync` turned false as soon as anyone was given a second group.

- **Marker.** `class_enrollments.extraVia: 'multi_class'` is set when the
  multi-class service (admin "add to group/class") creates or reactivates a
  row. Any other writer that reactivates the row (the dual write, e.g. the
  class's own list taking the student) clears it. An already active row is
  returned unchanged (re-adding an existing drift row does not relabel it).
- **Rows from before the marker** (legacy rule). `createdBy`/`source` cannot
  tell them apart from drift: the dual write also writes `source: 'manual'`
  with the acting admin as `createdBy`. So an unmarked row counts as an extra
  only when the audit trail has a `student_membership_added` event (written by
  the multi-class service for every add) for the same student, scope and
  target, in the same school. Audit rows are kept 30 days; step 6 has never
  been switched on outside tests, so no deployed database has unmarked extras.
  The report counts them in `extraMemberships.legacyUnmarked`.
- **Report.** Active rows the old fields cannot hold are split:
  - extras (marked, or legacy) go to `extraMemberships`;
  - everything else stays a conflict (`conflicts.activeNotInOldFields`), as before.
  ```json
  "extraMemberships": {
    "valid": 2,
    "invalid": { "count": 1, "targetMissing": 1, "studentInactive": 0, "otherSchool": 0, "targetArchived": 0,
                 "items": [{ "studentId": "…", "scope": "group", "targetId": "…", "reason": "targetMissing" }] },
    "legacyUnmarked": 0
  }
  ```
  An extra is **valid** when its group/class exists, is in the student's
  school (and the row's), is not archived (`archivedAt`, or a class with
  visibility `archived`), and the student exists and is not archived. One
  reason per invalid row, checked in this order: `targetMissing`,
  `studentInactive`, `otherSchool`, `targetArchived`. IDs and counts only.
- **`inSync`** is true only with nothing to create or reactivate, no conflict
  and **no invalid extra**. Valid extras never affect it.
- **Burst** (`src/scripts/lmsTestBurst.ts`): reads `GET /api/multi-class/status`;
  when multi-class is in effect (`--with-multi-class` requires it) three
  more kinds run, never on protected students:
  - `add_extra_group`: a student with a main group joins a second seeded group;
  - `add_extra_class`: a student joins a class (not archived) outside its list;
  - `remove_extra`: one of the removable extras made by this run is removed.
  Each add is checked on the student's membership list. After every batch the
  log has `consistency.extraMemberships` (valid, invalid by reason), and the
  burst STOPS on any invalid extra (as on any conflict). The "students without
  an active group" check now counts an extra group as placing a student. With
  multi-class off the burst runs exactly as before (`log.multiClass: false`).

### S4. Group counts count every active member

While multi-class is in effect, a group's count is every **active** member:
students whose main group it is (`Student.batchId`) plus students with an
active group enrollment in it (extra groups), **each student once**. Archived
students and rows of another school never count (`services/groupCounts.ts`).

- **Stored:** `Batch.studentCount` is recomputed for the groups concerned after
  every membership change: student create, group change and delete; multi-class
  add/remove of a group; group archive/restore; student archive/restore;
  permanent delete. (The old `$inc` still runs first; the recount overwrites it.)
- **Reported:** `GET /api/batches`, `GET /api/batches/:id` and
  `GET /api/curriculums/:id/batches` report the live count, so groups not
  touched since the switch went on are right too. The analytics overview's
  per-group `students` already counted enrollments (Q5) and agrees.
- **Off:** no read and no write; the stored value is reported as before.
- **Undo:** `enrollment:multi-class-undo --confirm` recounts the groups whose
  extra rows it ended (forced, because the switch is off by then), back to
  main-group members.
- Turning the switch on replaces a stored count that had drifted (e.g. typed in
  on the group form) with the real count in the replies.

### S5. Roster chips show students in extra classes

`GET /api/course-instances`, `GET /api/course-instances/:id` and the replies
of update / assign / remove student add `extraStudentIds` while multi-class
is on: the students in the class through an added class membership (not on
its own `studentIds`). It comes from the same `class_enrollments` class rows
the `teacher_rosters` roster reads (`enrollmentReads.enrollmentOnlyClassMembers`),
school-scoped, existing and non-archived students only, ordered by start date.
The field is present only when non-empty, so single-class data gives
byte-identical replies on and off (tested). `pages/CurriculumCenter.tsx` shows
them after the class's own chips, in another colour, counts them in
"Students", and their X removes the extra membership through
`DELETE /api/multi-class/students/:id/enrollments/class/:classId`. Members
through the group are not chips, as before. Off: unchanged.

### S6. Runbook: turning multi-class OFF

Always through `npm run enrollment:multi-class-undo`: **dry run, review,
`--confirm`, in that order**. Never switch off without it: the step 5 reads
keep showing extra memberships while their rows are active.

**Before** (switch still on):
1. `npm run enrollment:backfill` (dry run, add `-- --institution ID` for one
   school): note `inSync`, `conflicts.activeNotInOldFields.count` and
   `extraMemberships` (`valid`, `invalid`). Expected: `inSync: true`, no
   conflict, no invalid extra. Anything else: stop and investigate first.
2. `npm run enrollment:multi-class-undo` (dry run): note `groups`, `classes`,
   `students`. Review: `groups + classes` should equal `extraMemberships.valid`.
   The undo's own rule is structural (an active group row that is not the
   student's `batchId`; an active `manual` class row not on the class's list),
   so a difference means drift rows that it would also end: look at them first.
3. On the real database (PLAN §9): Mohamed's OK and a full backup first.

**Switch off:**
4. Set `ENROLLMENT_MULTI_CLASS=false` and restart/redeploy. Check
   `GET /api/multi-class/status` → `{ "multiClass": false }` (the admin
   add/remove routes now answer 404, so no new extras appear).
5. `npm run enrollment:multi-class-undo` (dry run) again: same counts as in
   step 2 (review again if not).
6. `npm run enrollment:multi-class-undo -- --confirm`: `ended` must equal
   `groups + classes` from step 5. Rows become `inactive` with an end date;
   nothing is deleted. Group counts of the touched groups are recounted.

**After:**
7. `npm run enrollment:multi-class-undo` (dry run): `0 / 0 / 0`.
8. `npm run enrollment:backfill` (dry run): `inSync: true`,
   `extraMemberships.valid: 0`, `invalid.count: 0`, no conflict.
9. Spot checks: a formerly multi-class student's `GET /api/me/courses` lists
   only their old classes and `GET /api/multi-class/me/classes` is
   `{ enabled: false }`; `GET /api/batches` counts are main-group members.
10. Turning multi-class on again later does not bring the ended rows back:
    re-add them in the admin panel.

On lms-test the same order applies; the burst can be re-run without
`--with-multi-class` afterwards (it reports `multiClass: false`).

### S7. The class is stored on each tutor session

`TutorSession.classId` = the class (CourseInstance) the session happened in,
set at creation **whether or not multi-class is on** (`services/sessionClass.ts`):
tutor chats (`POST /api/me/tutor/sessions`), intervention chats, live-call
transcripts (avatar), and assignment handoffs (the assignment's class).

- **Rule:** among the student's own classes, in the session's school: the
  class whose id is the session's course id; else the one class with that
  `courseId`; when two or more share it, the student's current class choice
  (Q2 switcher) if it is one of them, else the first in class order (what the
  old mapping picked). No course: no class.
- **Tenant isolation:** a class of another school is never stored (the class
  list is the student's school, and each class's school is checked again).
- **Cost:** the tutor-session page already read the student's classes in the
  same request (memoised), so no extra query (P20 budget "tutor session" 13,
  unchanged); one more read only when two classes share the courseId.
- **Credits (Q9, multi-class on only):** a use whose session recorded a class
  is credited to that class; a class the student has since left gets its own
  row (named from the class record in the student's school); a class that no
  longer exists there, or a session of another student, never counts as
  recorded. Sessions without `classId` (all sessions before this change) keep
  the old mapping. The session replies (`GET /api/me/tutor/sessions/:id`)
  now include `classId` when set (additive field).
- Parents' activity labels (Q3) still use the course mapping; they could use
  `classId` the same way (not asked).

## Undo (summary)

Switch `ENROLLMENT_MULTI_CLASS=false`, then the undo script, exactly as in the
runbook (S6) above:
```
npm run enrollment:multi-class-undo                       # dry run, counts only
npm run enrollment:multi-class-undo -- --institution ID   # one school
npm run enrollment:multi-class-undo -- --confirm          # end them
```
It sets `inactive` (with an end date) on every active group row that is not
the student's `Student.batchId`, and every active `manual` class row the
class's own `studentIds` does not hold. Rows are kept. Tested: exactly the
two extra rows end, the student's classes return to the old answer, and the
touched groups' counts return to main-group members.

## Tests

All in `backend/test/multiClass/`, on the step 5 fixture (`step5.helpers.ts`)
plus `step6.helpers.ts`.

| File | Tests | What |
|---|---|---|
| `step6.switch.test.ts` | 4 | Off by default (status false, admin routes 404, students `{enabled:false}`, nothing written); ignored with a single warning unless dual write + all seven features; **switch on vs off, byte-identical JSON** for 229 replies over the whole single-class fixture (every student page incl. assignments and study plan, teacher profiles/interventions/timeline/study plans/rosters/attendance/assignment detail, credits, analytics overview and student reports, age bands, school analytics, parents progress/activity/home), including a student in two classes the old way with a result on an assessment both classes set (not folded, not shared); single-class students get no switcher and nothing is stored. |
| `step6.admin.test.ts` | 11 | List, add (group and class), idempotent re-add, remove (history kept, reactivation), refusals (main group, class roster, no main group, bad body), tenant isolation both ways (other school's group/class 404, other school's admin 404), teachers/students 403, Enara admin limited to the student's school, audit rows. |
| `step6.behaviour.test.ts` | 24 | A student in 2 groups and 3 classes against Q1–Q9 (above), Q4 in both directions (teacher 1 vs teacher 2) plus admin and a single-class student unchanged, Q6 dedupe (shown once, one attempt via the hidden id, no second attempt, the result shown to both teachers), staff and student study plans, and the undo. |
| `step1.test.ts` | updated | The import guard now also allows `services/multiClass.ts`, and checks its writes are behind the switch. |
| `step6.consistency.test.ts` | 8 | S3: fixture in sync with an empty extras section; extras made through the admin routes are marked, valid, not conflicts; the marker follows the writer (re-add marks again, a dual-write reactivation clears it); unmarked drift is still a conflict; legacy rule (audit event in the same school and for the same target only); each invalid kind (target missing, other school's class, archived group, archived class, archived student, deleted student) counted by reason and listed, `inSync` false; a row of school A pointing at a school B student; school B's report unaffected; the service refuses archived students, groups and classes. |
| `step6.burst.test.ts` | 2 | S3: the lms-test burst locally with multi-class (and both archive switches) on: every kind incl. `add_extra_group`, `add_extra_class`, `remove_extra`, every batch in sync with valid extras and no conflict, rows marked; an extra whose group was deleted STOPS the burst at batch 1 (`targetMissing`). |
| `step6.groups.test.ts` | 10 | S4: off reports the stored count (list, one group, curriculum's group list); on reports live counts; an extra member counts in both groups once, also when the extra becomes the main group and back; removal, new and deleted students (both groups); archived students and rows of another school never count; school B unaffected; the undo recounts after the switch is off. S5: on with no extras byte-identical to off; `extraStudentIds` on the list, one class, assign and remove replies; a student moved onto the class's own list stops being an extra; removing the extra; off never shows it; chips equal the teacher_rosters roster; another school's or an archived student is never a chip. |
| `step6.sessions.test.ts` | 7 | S7: off, the class is recorded (class id, plain course id, shared courseId → first, no course → none); shared courseId follows the Q2 choice (`cX1`, `cX2`, "all" → first), a class id always wins; an assignment handoff records the assignment's class; tenant isolation (another school's class id, a session claimed for another school, a drifted row to another school's class, the API refusal; nothing stored); credits: two classes sharing a courseId credited by recorded class, an old session keeps the old mapping; a left class gets a named row, a forged other-school class and a deleted class go to No class, another student's session never counts as recorded; switch off: no `usageByClass`. |
| `archive.burst.test.ts` | updated | Uses the shared `burst.helpers.ts`; checks the burst sees multi-class off. |

Results (2026-11-17):
- `npx tsc --noEmit -p .` (backend): clean. `npx tsc --noEmit -p .` (frontend): clean.
- `npx vitest run test/multiClass`: 15 files, 116 tests, all pass (steps 1–6).
  `step2.test.ts` can time out in its `beforeAll` (MongoMemoryServer start,
  10 s hook limit) when the machine is busy; it passes alone and on a re-run.
  This is not new.
- Full backend suite with defaults: see "Full suite" below.
- Frontend: no frontend test runner exists (frontend modules are tested from
  the backend suite, e.g. `parentsPortal.test.ts`, which passes).

Follow-ups (S3–S7) results (2026-11-17):
- `npx tsc --noEmit -p .`: clean in `backend` and in `frontend`.
- `npx vitest run test/multiClass --hookTimeout 60000 --testTimeout 60000`:
  24 files, 172 tests, all pass (the four new step6 files, 27 tests, plus
  every earlier multi-class test).
- Full backend suite (defaults, `--hookTimeout 60000`): 2371 tests, 18 failed.
  - 17 fail the same way on the base commit `6d79f0ac` or are in the known
    list above: `p20QueryBudget` AI path, `p3EducatorChat` isolation,
    `p19Resilience` C1b, `p14_2GradingTestSpend` (2), `p14_8BlockerFixes`
    GAP-1, `phase3.autograding` 11/14/15, `usageLedger` migration,
    `lms/phase0` JWKS, `phase0` upload signing (2); and `p2Documents` scan gate
    (2), `phase3.e2e`, `elie.e2e`, `elie.sprint4`, re-run alone on this branch
    and on `6d79f0ac` (same 5 failures on both).
  - `multiClass/step5.random`: MongoMemoryServer "port already in use" at
    start under load; passes alone.
  - The P20 journey budgets pass unchanged (tutor session 13).
  - **No new failure.**

## Full suite

Two runs of the whole backend suite with every switch at its default
(2,313–2,315 tests), on a busy machine:

| Run | Failed tests | Files failing only in `beforeAll` (10 s hook timeout, MongoMemoryServer start) |
|---|---|---|
| 1 (before the last study-plan change) | 16 | 0 |
| 2 (final code) | 15 | 16 |

The known baseline is about 21 failures. Every failing test was checked
against a copy of the parent commit (`7aaee244`, run from a scratch copy of
the tree with the same `node_modules`):
- **Same failures on the parent commit**: `p20QueryBudget` "tutor message on
  the AI path", `p3EducatorChat` "conversations are per user and per school",
  `p19Resilience` C1b, `p14_2GradingTestSpend` (2), `p14_8BlockerFixes` GAP-1,
  `phase3.autograding` 11/14/15, `usageLedger` price-catalog migration,
  `lms/phase0` HTTP inert (network-blocked providers, upload signing, timing,
  as in the step 5 baseline).
- **Load only (pass when re-run alone, several times)**: `p20QueryBudget`
  "counts the P20 journey pages" (the failing run counted `createIndexes`
  commands from cold start; alone it gives exactly the budgets: dashboard 10,
  courses 7, assignments 7, next-steps 12, lesson 7, tutor session 13, tutor
  message 17, attempt start 8, with no multi-class reads), `demoPortal`,
  `p1FinalGaps`, `maintenanceLmsTest` (a 5 s test timeout on the first
  request), and every `beforeAll` hook timeout (including `multiClass/step2`).

**No new failure.** With the switch off, the step 6 code makes no database
reads at all (every entry point returns before its first query), which the
P20 query counts confirm.

## Decisions needed / not done

1. **Dual write is also required** for the switch to take effect (stricter
   than "all seven features"): without it, a change of main group would not
   reach `class_enrollments`, which every read now uses.
2. **Definition of multi-class student** (above). It keeps today's behaviour
   for everyone the old fields can describe, including students in several
   classes through one group plus class lists.
3. ~~The consistency check reports extras as conflicts~~: done (S3).
4. ~~`Batch.studentCount` counts main-group members only~~: done (S4).
5. ~~Roster chips don't show extra classes~~: done for `CurriculumCenter`
   (S5). `StudentManagement` has no class roster chips; its class lists are
   unchanged.
6. **Turning the switch off does not hide existing extra memberships** from
   the step 5 reads: follow the runbook (S6).
7. **Q8** (age from birth date) is not built: no age boundaries exist.
8. ~~Two classes sharing a `courseId`~~: sessions now store their class
   (S7). Sessions from before keep the old mapping (the first class); parents'
   activity labels still use the course mapping.
9. Not built here, by instruction: group/class archiving and delete-blocking
   (§10).

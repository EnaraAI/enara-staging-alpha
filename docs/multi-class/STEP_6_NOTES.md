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
classes view, only when such rows exist.

## Undo

1. Set `ENROLLMENT_MULTI_CLASS=false`: the new screens and Q2–Q9 behaviours
   stop at once.
2. **Then run the undo script**, because the step 5 reads still see extra
   memberships while they are active:
   ```
   npm run enrollment:multi-class-undo                       # dry run, counts only
   npm run enrollment:multi-class-undo -- --institution ID   # one school
   npm run enrollment:multi-class-undo -- --confirm          # end them
   ```
   It sets `inactive` (with an end date) on every active group row that is not
   the student's `Student.batchId`, and every active `manual` class row the
   class's own `studentIds` does not hold. Rows are kept. Tested: exactly the
   two extra rows end and the student's classes return to the old answer.

## Tests

All in `backend/test/multiClass/`, on the step 5 fixture (`step5.helpers.ts`)
plus `step6.helpers.ts`.

| File | Tests | What |
|---|---|---|
| `step6.switch.test.ts` | 4 | Off by default (status false, admin routes 404, students `{enabled:false}`, nothing written); ignored with a single warning unless dual write + all seven features; **switch on vs off, byte-identical JSON** for 229 replies over the whole single-class fixture (every student page incl. assignments and study plan, teacher profiles/interventions/timeline/study plans/rosters/attendance/assignment detail, credits, analytics overview and student reports, age bands, school analytics, parents progress/activity/home), including a student in two classes the old way with a result on an assessment both classes set (not folded, not shared); single-class students get no switcher and nothing is stored. |
| `step6.admin.test.ts` | 11 | List, add (group and class), idempotent re-add, remove (history kept, reactivation), refusals (main group, class roster, no main group, bad body), tenant isolation both ways (other school's group/class 404, other school's admin 404), teachers/students 403, Enara admin limited to the student's school, audit rows. |
| `step6.behaviour.test.ts` | 24 | A student in 2 groups and 3 classes against Q1–Q9 (above), Q4 in both directions (teacher 1 vs teacher 2) plus admin and a single-class student unchanged, Q6 dedupe (shown once, one attempt via the hidden id, no second attempt, the result shown to both teachers), staff and student study plans, and the undo. |
| `step1.test.ts` | updated | The import guard now also allows `services/multiClass.ts`, and checks its writes are behind the switch. |

Results (2026-11-17):
- `npx tsc --noEmit -p .` (backend): clean. `npx tsc --noEmit -p .` (frontend): clean.
- `npx vitest run test/multiClass`: 15 files, 116 tests, all pass (steps 1–6).
  `step2.test.ts` can time out in its `beforeAll` (MongoMemoryServer start,
  10 s hook limit) when the machine is busy; it passes alone and on a re-run.
  This is not new.
- Full backend suite with defaults: see "Full suite" below.
- Frontend: no frontend test runner exists (frontend modules are tested from
  the backend suite, e.g. `parentsPortal.test.ts`, which passes).

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
3. **The dual-write consistency check** (`enrollment:backfill` dry run, used
   by `lmsTestBurst.ts` as its STOP condition) reports step 6 extras under
   `conflicts.activeNotInOldFields`, so `inSync` turns false once anyone is
   given a second group or an added class. Before turning step 6 on in
   lms-test, the burst's check should exclude those rows (or count them
   separately). Not changed here.
4. **`Batch.studentCount`** still counts main-group members only (it is an old
   field); extra members are not counted there. Group sizes in reports come
   from enrollments.
5. **Extra classes are not in `CourseInstance.studentIds`**, so screens that
   still draw class rosters from `studentIds` (the roster chips in
   `CurriculumCenter`/`StudentManagement` course lists) do not show them; the
   step 5 reads (rosters, attendance, analytics) do.
6. **Turning the switch off does not hide existing extra memberships** from
   the step 5 reads: run the undo script (above).
7. **Q8** (age from birth date) is not built: no age boundaries exist.
8. When two of a student's classes share the same `courseId`, a tutor session
   (which stores the course id) is credited/labelled to the first of them.
9. Not built here, by instruction: group/class archiving and delete-blocking
   (§10).

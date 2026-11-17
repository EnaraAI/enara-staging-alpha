# Multi-class step 5: reads switched feature by feature (notes)

**Status:** features 1–7 built and tested on fake data only. Nothing deployed,
no switch turned on anywhere. Plan: `STEP_5_PLAN.md`.

## Switches

All off by default.

| Switch | Default | Effect |
|---|---|---|
| `ENROLLMENT_READ_FROM` | empty | Comma list of features that read membership from `class_enrollments`: `student_app`, `teacher_rosters`, `assessments`, `analytics`, `profile_context`, `credits`, `attendance`. Remove a name to switch that feature back. An unknown name is logged once and ignored. |
| `ENROLLMENT_ATTENDANCE_FIX` | `false` | Q7: group-only students appear on the attendance roster. Has an effect only when `attendance` is in the list. |
| `ENROLLMENT_AGE_FROM_BIRTHDATE` | `false` | Q8: **has no effect yet** (see "Q8" below). |

All switched reads go through `backend/src/services/enrollmentReads.ts`, which
is the only new importer of the enrollment service (the step 1 guard test
checks this). Every enrollment read is school-scoped: by the class's school,
the student's school or the assessment's school, and rows from another school
are dropped even when the query covers several schools (Enara admin views).
A student or class without a school has no enrollments (the backfill skips
them), so the new path returns none for them.

**Step 4 shadow:** each shadow check runs only on the old path. When a feature
is on, its shadow check is skipped (tested for `class_roster`,
`pedagogy_roster` and `analytics_course`). With every feature off, the shadow
code runs exactly as in step 4.

**The API still returns `batchId` and `studentIds` as today.** With a feature on,
a `batchId` shown on a row (credits, analytics students, impact rows) is the
student's active group enrollment; for a single-group student that is the same
value.

## Features

### 1. `student_app` (commit e8806be0)

The student's classes, course tree, dashboard and "assessments for my group".
Changed in this round: the teacher check below now uses its own switch; a
student without a school reads no enrollments; the student's enrollment rows
are read once per request (`enrollmentReads.studentTargets`), not once for the
classes and again for the groups.

### 2. `teacher_rosters`

- **What switched:** "who is in this class" (`learningAccess.classStudentIds`,
  used by teaching rosters and overview, assignments, speaking exams, insights,
  outcomes, teaching notifications and educator analytics `withMembers`); the
  time-to-understand roster (`learningPedagogy.controller`); "may this teacher
  read this student" (`resolveStudentForRead`: the teacher teaches one of the
  student's classes, same visibility filter, sort and limit of 100).
- **Order:** the old roster is the class's `studentIds` in their order, then the
  group's members in database order. The new roster gives the same order:
  members listed in `studentIds` first in that order (only the order reads
  `studentIds`; membership comes from enrollments), then the others by
  `Student._id`. The old group read returns students in index/natural order,
  which is insertion order; `_id` order equals insertion order for documents
  created by the app. The randomised test checks exact order on 200 schools.
- **Files:** `services/learningAccess.ts`, `services/studentCourseService.ts`
  (`getEnrolledInstances(studentId, feature)`, memo key per source),
  `controllers/learningPedagogy.controller.ts`, `services/enrollmentReads.ts`
  (`classRosterFromEnrollments`).
- **Tests:** `test/multiClass/step5.teacher_rosters.test.ts` (8): rosters for 5
  classes, overview, learner profiles for 7 students (allowed via group,
  explicit and a deleted group's class; refused for no class and other school)
  as teacher, admin and the other school's admin; TTU analytics by course and
  school-wide; assignments list and detail; educator analytics class scope;
  `classStudentIds` exact order; shadow skipped; switch back; drift; isolation.

### 3. `assessments`

- **What switched:** the students reached by an assessment given to a group
  (`GET /api/assessments/:id/attempts`): the group's active members in the
  assessment's school instead of `Student.batchId`.
- **Files:** `controllers/assessment.controller.ts`, `enrollmentReads.groupMemberIds`.
- **Tests:** `step5.assessments.test.ts` (3): 6 assessments (group, second group,
  one student, deleted group, missing group, other school) as both school
  admins and the teacher; switch back; drift and isolation.
- **Note:** the reply sorts students by name. Two students with exactly the same
  name keep the database's return order, which neither path specifies; the
  fixture names are distinct.

### 4. `analytics`

- **What switched:** course members (`courseStudentIds`), the per-group stats
  (`batches` in the overview), overdue work "for my group", hence the weekly
  class summary (built from the overview), and the group on teaching-impact
  rows (`teachingImpact`). One enrollment read per analytics request
  (`enrollmentReads.analyticsMembership`); same order as before (explicit list,
  then loaded students' order).
- **Files:** `services/analyticsService.ts`, `services/teachingImpact.ts`,
  `services/classSummaryService.ts` (only `clearWeeklySummaryCache()` for tests:
  the summary is cached for 6 hours, and each same-answer run must compute it).
  `routes/analytics.routes.ts` needed no change (it has no membership read).
- **Tests:** `step5.analytics.test.ts` (6): overview (live and all origins),
  5 course reports and 7 student reports for both school admins; weekly summary;
  impact rows for 5 students; shadow skipped; switch back; drift and isolation.

### 5. `profile_context`

- **What switched:** the student's group for the age band list
  (`GET /api/age-bands`: `classId`, `classAgeBand`, effective band), the tutor's
  trusted age band (`loadTrustedAgeBand`) and the educator directory's class
  name (`studentProfiles`).
- **Several groups (step 6 shape):** age band: the youngest valid group band
  (child < teen < adult), only when the student has no band of their own;
  directory: the groups' names joined by ", " (by group id).
- **Files:** `controllers/learnerAgeBand.controller.ts`,
  `services/languageTeachingContext.ts` (`pickGroupBand`), `services/studentDirectory.ts`.
- **Tests:** `step5.profile_context.test.ts` (9): the three reads off/on with
  `ENROLLMENT_AGE_FROM_BIRTHDATE` false **and** true; the youngest-band rule
  with two groups (own band still wins); switch back; drift and isolation.

### 6. `credits`

- **What switched:** the group label (`batchId`) on credit rows (`GET /api/credits`).
  Several groups (step 6, Q9) are not reachable yet; the first by id is shown.
- **Files:** `controllers/credits.controller.ts`.
- **Tests:** `step5.credits.test.ts` (3): both school admins and an Enara admin
  (all schools and one school); switch back; drift and isolation.

### 7. `attendance`

- **What switched:** the attendance roster (`GET /api/teacher/attendance/roster`),
  the roster check when saving, and the roster size on the class list.
- **Q7:** with `ENROLLMENT_ATTENDANCE_FIX` off, the roster is the class's
  explicit members (from `class` enrollments): **today's roster, identical
  JSON**. With it on, the group's members are added (the intended visible
  change; `TEACHER_NOTE_ATTENDANCE.md`), they can be marked, and the class
  list's `studentCount` counts them. The fix switch alone (without
  `attendance` in the list) changes nothing.
- **Files:** `controllers/teacherAttendance.controller.ts`,
  `enrollmentReads.attendanceRosterFromEnrollments` / `attendanceRosterCounts`.
- **Tests:** `step5.attendance.test.ts` (6): fix off: identical class list and
  5 rosters for teacher and both admins, saving for a group-only student refused
  as today, fix alone changes nothing; fix on: only the roster rows and counts
  change (existing rows unchanged), a group-only student can be marked, other
  school's rows never appear.

## Q8: age band from birth date: not implemented (needs a decision)

The plan asked to derive the band from `Student.birthDate` when a student has
no band of their own, using the existing boundaries. **No child/teen/adult
boundaries exist in the code**: `models/learnerAgeBand.ts` says boundaries are
"a separate product decision and are deliberately not encoded anywhere". The
only age rule is the parent portal's tier (`parents/policy.ts`: under 13 = kid,
otherwise 13plus), which does not separate teen from adult. So nothing was
invented: `ENROLLMENT_AGE_FROM_BIRTHDATE` is read into the config but has no
effect, and tests check that results are identical with it on. Once the
boundaries are decided, the derivation goes in `pickGroupBand`'s caller
(`loadTrustedAgeBand`) and the age band list, before the group fallback.

## Shared fixture (additive)

`test/multiClass/step5.helpers.ts`: school feature `teaching_workflow_enabled`;
student `a6` (second group-only member of `gA`); group `gDel` with student `a5`
and class `cA4`, deleted after the backfill (as the app does: the student keeps
`batchId` and the group enrollment stays). `offOn` gained options: `now`
freezes the clock (Date only) for both runs, `vars` sets other switches,
`before` runs before each run; `offOnWith` does the same for service functions
(their results go through JSON like an API reply); `expectSame` compares deep
equality and the serialised JSON byte for byte (key order included).

## Randomised check

`step5.random.test.ts`: 200 generated single-class schools (seed 20261117;
2–4 groups, 2–5 classes, 3–10 students, random explicit members in random
order, about a quarter of students in no group, some classes not visible to
students). After the backfill, every class roster (`classStudentIds`) and every
student's classes (`getEnrolledInstances` for both `student_app` and
`teacher_rosters`) are equal off and on, **including order**.

## Ignored differences

Only `requestId`, as before: a random ID generated for every request, present
in error replies (404/400); it differs between any two calls, switch on or off.

Nothing else is ignored. Replies that carry times (`generatedAt` on the teaching
overview, the analytics overview and the weekly summary; the credits report's
day window) are compared with the clock frozen at the same instant for both
runs, so they are identical rather than ignored. No array order is ignored.

## Full suite

Three runs of the whole backend suite (results below).

1. **Every feature off** (the default): the baseline.
2. **Every feature on, enrollments mirrored:**
   `ENROLLMENT_READ_FROM=<all seven> npx vitest run --config test/multiClass/vitest.step5-suite.config.ts`.
   Most suites create students and classes straight in the database, so
   `class_enrollments` is empty there. The setup file
   (`test/multiClass/step5.suiteMirror.setup.ts`, test-only) stands in for the
   backfill plus a perfect dual write: before each test and before every
   enrollment read it rebuilds the enrollment rows from the old fields
   (deterministic rows, so the isolation sweeps' data hashes are unchanged).
   This is the meaningful comparison.
3. **Every feature on, no mirror** (raw): recorded for completeness. Suites
   whose data has no enrollments see nobody in any class; those failures say
   that the switch must only be turned on after the backfill with dual write on
   (which the rollout already requires), not that an answer changed.

`test/multiClass/step4.test.ts` now clears `ENROLLMENT_READ_FROM` itself: the
shadow compares only while the old reads are used, so those tests need every
feature off.

### Results (2026-11-17, 2276 tests)

| Run | Passed | Failed | Failures not in the baseline |
|---|---|---|---|
| 1. all off (baseline) | 2253 | 21 | n/a |
| 2. all on, mirrored | 2251 | 23 | 2 (below) |
| 3. all on, raw | 2009 | 254 | 234 (no enrollments in those suites' data) |

The 21 baseline failures are unrelated to this work and fail in every run
(frontend React not installed for server-side render tests, network-blocked AI
providers, upload signing, grading end-to-end and similar). The P14.9 and P19
tenant-isolation sweeps pass with every feature on (run 2).

**The 2 failures of run 2:**

1. **`p20QueryBudget` "counts the P20 journey pages": a real cost, needs a
   decision.** With `student_app` on, each student page makes **one more
   database round trip** (the `class_enrollments` read; the class read itself
   stays): dashboard 11 (budget 10), courses 8 (7), assignments 8 (7),
   next-steps 13 (12), lesson 8 (7), tutor session 14 (13), tutor message 18
   (17), attempt start 9 (8). The baseline sits exactly on each budget. (The
   counts above exclude the test-only mirror's own queries.) A second read
   per page was removed in this round (the student's rows are now read once
   per request). The remaining one is inherent to reading a separate
   collection; the budgets were not changed. Options: raise each budget by 1
   for the switched path, or accept it until step 7.
2. **`p19Resilience` E3 "20 concurrent tutor calls against a cap": a test-only
   artefact.** The mirror serialises enrollment reads, so the 20 calls run more
   one after another; each settles at its (small) actual cost before the next
   reserves, so more than 4 fit. Checked: every reservation has the same amount
   on and off, and committed spend stayed far under the cap (21,000 of 432,360
   micro-dollars). It passes with every feature off under the same config.

**Run 3 (raw):** the suites create students and classes directly, so with the
features on and no enrollment rows, students are in no class (rosters, class
lists, attendance, analytics members empty). Grouped by file: p19Resilience 22,
phase3.autograding 17, p10NamedStudents 13, p4SpeakingExam 13,
p9AnalyticsRouter 13, p15LearningJourney 11, languageTeachingR4 10, and 37 more
files with 1-9 each. All of them pass in run 2, where the same data has its
enrollments.

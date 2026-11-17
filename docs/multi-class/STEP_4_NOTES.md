# Multi-class step 4: shadow reads

**Status:** built and tested on fake data only.
- **Off by default:** `ENROLLMENT_SHADOW` is not set anywhere.
- **Not deployed:** nothing has been deployed.

Turning the switch on needs Mohamed's OK for each deployment. It only produces useful results after step 3's backfill has run there and step 2's dual write is on.

## What it does

The membership rule is applied in four places. With the switch on, each of them computes its answer twice:
1. from the **old fields** (`Student.batchId` and `CourseInstance.studentIds`): **this answer is always the one returned**;
2. from **`class_enrollments`**, through `services/enrollment.ts`.

Then it compares the two.

| Feature (stats name) | Where | What is compared |
|---|---|---|
| `class_roster` | `learningAccess.classStudentIds`. Used by teacher rosters, assignments, insights, outcomes, speaking exams, teaching notifications and educator analytics. | Student IDs in the class |
| `student_classes` | `studentCourseService.readEnrolledInstances`. Used by the student app's course list, course tree and dashboard. | IDs of the classes the student sees (same filters, sort and limit of 100) |
| `analytics_course` | `analyticsService.loadScope`: overview, course and student analytics, and the weekly summary | `classId:studentId` pairs for every class in the scope (one check per request) |
| `pedagogy_roster` | `learningPedagogy.controller` (time-to-understand analytics) | Student IDs in the teacher's classes, or in the chosen course |

**Not shadowed:**
- **Attendance:** it reads only `CourseInstance.studentIds`, which is the known Q7 gap. It would always differ for students who are in a class only through their group. It moves in step 5, behind its own switch.
- **Other direct `Student.batchId` reads:** age band, directory, credits. They move in step 5, feature by feature, each with its own same-answer tests.

## Safety

- **The answer never changes.** The old answer is returned with the switch on or off. Tested: identical results on and off, and the whole suite gives the same failures on and off.
- **It never fails a request.** Any error in the enrollment read is caught and counted (tested by making the read throw).
- **Mismatch logs hold IDs only:** `enrollment_shadow_mismatch` with the feature, the class or student ID, the school, counts, and up to 20 IDs on each side. No names and no emails (tested).
- **Counts only in the database:** `enrollment_shadow_stats` holds one row per day and feature (checks, mismatches, errors), with no IDs. The collection appears on the first write, so no migration is needed.
- **Cost:** one extra indexed query per checked request. `ENROLLMENT_SHADOW_SAMPLE_RATE` (0–1, default 1) limits the share of requests checked.
- **Undo:** set `ENROLLMENT_SHADOW=false`. The stats collection can be dropped at any time.

## Switches

| Name | Default | Effect |
|---|---|---|
| `ENROLLMENT_SHADOW` | `false` | Turns the comparison on |
| `ENROLLMENT_SHADOW_SAMPLE_RATE` | `1` | Share of requests checked (0 means none) |

## The 7-day check

```
npm run enrollment:shadow-report              # last 14 days
npm run enrollment:shadow-report -- --days 30
```

The report covers each feature and is read-only, with counts only. It gives:
- checks, mismatches and errors per day;
- the number of clean days in a row;
- `readyForStep5`.

**A feature may move to step 5 once it has checks every day and 0 mismatches and 0 errors for 7 days in a row.** Any mismatch is investigated from the IDs in the logs and fixed at the source (dual write or backfill) before the 7 days start again.

## Tests

- **`test/multiClass/step4.test.ts`, 9 tests:**
  - off: nothing is recorded;
  - in sync: 0 mismatches in all four features;
  - on and off give identical results;
  - out of sync: the old answer is returned, the mismatch is counted, and the logs hold IDs only;
  - analytics and pedagogy see the drift;
  - errors are caught;
  - sample rate 0;
  - old callers without a class ID;
  - school isolation.
- **`step1.test.ts`:** the guard now allows the enrollment service to be imported only by the step 2 dual write and the three step 4 shadow call sites. Each of those must use `shadowCompare`.
- **Full suite:** no new failures compared with the branch before this step. The failures that remain were already there and are unrelated.

# Multi-class step 5: switch reads, feature by feature (plan)

**Status:** plan only, waiting for your approval. No code yet.

Rules (unchanged):
- report after each feature;
- deploy nothing, run no migration and turn on no switch without your OK;
- `test.enara.app` is treated as real production data;
- steps 7 and 8 still need a separate approval.

## 1. Goal

Each feature stops working out membership from the old fields (`Student.batchId` and `CourseInstance.studentIds`) and reads it from **`class_enrollments`**, through `services/enrollment.ts`.

**For every student in at most one group, the answers stay identical.** Each feature proves this with same-answer tests. Nothing in the app shows a second group or class until step 6.

The old fields are **still written** (step 2's dual write), so any feature can be switched back at once.

## 2. Switches

All of them are off by default.

| Switch | Default | Effect |
|---|---|---|
| `ENROLLMENT_READ_FROM` | empty | A comma-separated list of features that read from enrollments, for example `student_app,teacher_rosters`. Remove a name to switch that feature back. |
| `ENROLLMENT_ATTENDANCE_FIX` | `false` | **Q7, visible fix:** the attendance roster includes students who are in a class only through their group. It works only when `attendance` is in the list. |
| `ENROLLMENT_AGE_FROM_BIRTHDATE` | `false` | **Q8, a change in results:** work out the age band from `Student.birthDate` when the student has no band of their own. Off means today's behaviour. |

## 3. Features, in order

| # | Key | What switches | Files | Learner-visible? |
|---|---|---|---|---|
| 1 | `student_app` | The classes a student sees; the course tree; the dashboard and the assessments for "my group" | `studentCourseService.readEnrolledInstances` and `buildCourseTree`, `me.controller` (`tree.batchId`), `meDashboard.controller`, `meAssessment.controller`, `studentAssessmentService` | No |
| 2 | `teacher_rosters` | Who is in a class; whether a teacher may read a student | `learningAccess.classStudentIds` and `resolveStudentForRead`, `learningPedagogy.controller`, `educatorAnalytics.withMembers`. Through `classStudentIds`: teaching, assignments, speaking exams, insights, outcomes, teaching notifications. | No |
| 3 | `assessments` | Students reached by an assessment given to a group (school admin view) | `assessment.controller` (the assigned-to list) | No |
| 4 | `analytics` | Course members, per-group stats, the overview by group, and the **weekly class summary email** | `analyticsService` (`courseStudentIds` and the group stats), `classSummaryService`, `teachingImpact` (group on impact rows), `routes/analytics.routes` | No |
| 5 | `profile_context` | Age band, the student directory's "class name", the tutor's teaching context | `learnerAgeBand.controller`, `languageTeachingContext`, `studentDirectory` | No (Q8 has its own switch, above) |
| 6 | `credits` | The group label on AI credit usage | `credits.controller` | No |
| 7 | `attendance` | The attendance roster | `teacherAttendance.controller` | No with the Q7 switch off. **Yes, by design**, with it on: group-only students appear on the roster. A teacher note is ready (`TEACHER_NOTE_ATTENDANCE.md`). |

**How "the student's group" is read** in features 1 and 3–6: the student's **active group enrollments**. For a single-group student that is exactly one group, the same as `batchId`, so the answer is unchanged. A student with no group gets the same answer as today, which is none. With 2 or more groups (only possible after step 6), each feature follows your Q1–Q9 answers. Step 6 tests that.

**Not in step 5:**
- **Frontend.** The API keeps returning `batchId` and `studentIds` exactly as today, so no screen changes. Frontend changes come in step 6 (switcher, "add to class", parent labels).
- **Seats and billing:** the seat count is per student and doesn't change.
- **Writes:** still dual. The old fields stop being written only in step 7, which needs separate approval.

## 4. Same-answer tests (for every feature, before it can be switched on)

1. **Old against new, identical JSON.** For each feature's real endpoints, the test runs the request with the feature off and then on, and requires byte-identical responses. The fixture school has:
   - students who are group only, class only, both, or neither;
   - a deleted group;
   - a second school, for isolation.
2. **Randomised check:** 200 generated single-class schools. Rosters and class lists must be equal both ways.
3. **Switch back:** with the feature on and then off, the old answer comes back.
4. **School isolation:** another school's enrollment never appears. The existing `p14_9` and `p19` sweeps are re-run with the feature on.
5. **Whole suite with every feature on:** no new failures compared with the suite with every feature off. Each run is recorded in the feature's report.
6. **Q7 and Q8:** their own tests. With their switch off the result equals today's. With it on, only the intended students change.

## 5. Rollout of each feature (after your OK each time)

1. **Code:** merge the feature's code with `ENROLLMENT_READ_FROM` empty. Nothing changes.
2. **lms-test.enara.app (fake data):** dual write on, backfill (dry run first), shadow on.
   - Shadow needs traffic, and the test site has very little. **Proposal:** a scripted pass that calls every shadowed endpoint for every fake student and class once a day.
   - Then: **7 days in a row with checks, 0 mismatches and 0 errors** (`npm run enrollment:shadow-report`).
3. **On lms-test:** add the feature to `ENROLLMENT_READ_FROM`, re-run the same-answer checks against the live site, and report.
4. **test.enara.app (real data):** only with your OK, after the same 7 clean shadow days there. First a full backup with written restore steps, then a backfill dry-run report, then the same order.

## 6. Order and size

Features 1–7 are built in order, and each is its own commit and report.

| Size | Features |
|---|---|
| **M** | 1 student app, 2 teacher rosters, 4 analytics |
| **S** | 3 assessments, 5 profile context, 6 credits, 7 attendance |

Building all seven is roughly one long working session. The 7-day shadow wait runs in parallel and doesn't block the build.

**After feature 7:** step 6 (turn on multi-class, the first learner-visible change), then merge after your OK, then LMS Phase 1a.

## 7. What I need from you

| # | Ask | My recommendation |
|---|---|---|
| S5-1 | Approve this step 5 plan | Yes |
| S5-2 | Use a scripted daily traffic pass on lms-test so the shadow has data | Yes. Fake data only, calls the app's own endpoints, no writes. |
| S5-3 | OK to deploy the current branch to **lms-test** with `ENROLLMENT_DUAL_WRITE=true`, then run the backfill dry run there and send you the report, then (after a second OK) apply it and turn `ENROLLMENT_SHADOW=true` on there | Yes. This starts the 7-day clock while I build features 1–7. |

Reply, for example, "S5-1 yes, S5-2 yes, S5-3 yes".

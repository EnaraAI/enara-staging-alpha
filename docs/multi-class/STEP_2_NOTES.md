# Multi-class step 2: write both

Status: built and tested on `claude/multi-class-enrollment`. **Switch `ENROLLMENT_DUAL_WRITE` is OFF by default and stays off until Mohamed's OK.** Not deployed.

## What it does

When the switch is on, every place that changes a student's group or a class's explicit list also writes `class_enrollments`, **after** the old write has succeeded. `Student.batchId` and `CourseInstance.studentIds` remain the source of truth; nothing reads enrollments yet.

| Write path | Old write | Mirrored as |
|---|---|---|
| `POST /api/students` (with a group) | `Student.batchId` | group enrollment, active |
| `PATCH /api/students/:id` (group changed) | `Student.batchId` | old group → `removed`; new group → active |
| `DELETE /api/students/:id` | student deleted | all the student's active rows → `removed` (kept as history) |
| `POST /api/course-instances/:id/students` | `studentIds.push` | class enrollment, active |
| `DELETE /api/course-instances/:id/students/:studentId` | `studentIds` filter | class enrollment → `removed` (only if the student was on the list) |
| `DELETE /api/course-instances/:id` | class deleted | its class enrollments → `removed` (group rows untouched) |
| Demo template (`buildDemoTemplate`) | sets `batchId` and `studentIds` | group + class rows, idempotent |

Not mirrored, on purpose:
- **Group deleted** (`DELETE /api/batches/:id`). Today students keep a dangling `batchId`, and their group enrollment stays active to match. Step 4's comparison ignores groups and students that no longer exist.
- **Student accounts created at sign-up or from an invitation.** These never set a group, so there is nothing to mirror.

## Safety

- **Switch off:** no rows are written. Tests confirm responses are identical with the switch on and off.
- **An enrollment failure never breaks a request.** It is logged as `enrollment_dual_write_failed` with the operation, IDs and an error code, never names or emails. A student with no school is skipped and logged as `enrollment_dual_write_skipped`.
- **Undo:** set `ENROLLMENT_DUAL_WRITE=false`. Rows already written are harmless, because nothing reads them, and the step 3 backfill reconciles them.

## Files

- `backend/src/services/enrollmentSync.ts` (new): `syncStudentGroup`, `syncClassMember`, `syncStudentDeleted`, `syncClassDeleted`.
- `backend/src/config/env.ts`: `enrollment.dualWrite` ← `ENROLLMENT_DUAL_WRITE` (default `false`).
- Wired into `controllers/student.controller.ts`, `controllers/courseInstance.controller.ts` and `services/demoTemplate.ts`.

## Tests

`backend/test/multiClass/step2.test.ts`: 6 tests, using the real HTTP endpoints. They check that:
- with the switch off, no rows are written;
- responses are identical with the switch on and off;
- with the switch on, enrollments equal the old fields after creating, moving, leaving, adding, removing, duplicate-adding and removing a non-member;
- deletes keep history;
- a forced failure leaves the request working and logs IDs only;
- the demo template is idempotent.

The step 1 test now allows exactly one importer of the enrollment service: `enrollmentSync.ts`.

# Multi-class step 1: enrollment collection and service

Status: built and tested on `claude/multi-class-enrollment`. **Not deployed. No migration run. No switch turned on.**

## What was added

| Part | Where |
|---|---|
| `class_enrollments` model: scope `group`/`class`, role, status, source, `migratedFrom`, `lmsContextId`, dates, required `institutionId` | `backend/src/models/ClassEnrollment.ts` |
| Indexes: unique `(studentId, scope, targetId)`, roster, a student's classes, backfilled rows | same file |
| `services/enrollment.ts`: `enroll`, `endEnrollment`, `activeTargets`, `enrolledClassFilter`, `studentIdsInClass`, `studentIdsInGroup` | `backend/src/services/enrollment.ts` |
| Index migration `2026-11-17-class-enrollments-step1` (creates an empty collection; writes no rows) | `backend/src/migrations/index.ts` |
| Undo: `npm run enrollment:drop -- --confirm` | `backend/src/scripts/enrollmentDrop.ts` |

## Behaviour

- **Nothing in the app calls the service yet.** A test fails if any file imports it, so existing learners see no change.
- **School boundary:** `enroll` refuses a student or a group or class that isn't in the given school. Every row requires `institutionId`.
- **Idempotent:** enrolling again returns the same row. Simultaneous enrolls make one row. Ending a membership keeps the row as history, and re-enrolling reactivates it with a new start date.
- **Same membership rule as today:** a class = its explicit members plus the members of its group.

## Note for the backfill (step 3)

`Student.institutionId` and `CourseInstance.institutionId` are optional in today's models. A student or class without a school cannot get an enrollment row. The step 3 dry run will list them as "records that don't fit".

## How to undo

Before step 5 nothing reads the collection, so `npm run enrollment:drop -- --confirm` removes it and its migration record.

## Tests

`backend/test/multiClass/step1.test.ts`: 9 tests covering enroll and end, simultaneous enrolls, reactivation, the school boundary, the membership rule, the migration run twice, and "nothing imports the service yet".

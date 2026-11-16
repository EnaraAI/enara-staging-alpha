# Multi-class step 3: backfill (dry run first)

Status: built and tested **on fake data only**. **Not run on any real or test database.** Running it needs Mohamed's OK for each database.

## What it does

It fills `class_enrollments` from the old fields:
- `Student.batchId` → one `group` row;
- each entry in `CourseInstance.studentIds` → one `class` row.

| Command | Effect |
|---|---|
| `npm run enrollment:backfill` | **Dry run (the default).** Reads only, writes nothing. Prints a report and saves it as `enrollment-backfill-dry-run-<time>.json`. That file is git-ignored, because it lists IDs of real records. |
| `… -- --institution ID` | Limits it to one school |
| `… -- --apply --confirm` | Writes the plan. Idempotent: a second run creates nothing. |
| `… -- --undo --confirm` | Deletes **exactly** the rows the backfill created (`migratedFrom` is set). Rows written by the app are kept. |

The plan said this would be a migration. It is a **script** instead, so it can never run on its own and always starts with a dry run.

## The dry-run report (IDs and counts only, never names or emails)

- **totals:**
  - students;
  - students with a group;
  - classes;
  - class member entries;
  - existing enrollment rows by status.
- **wouldCreate:** group rows and class rows to be created.
- **alreadyMatching:** rows already correct (for example, written by the step 2 dual write).
- **wouldReactivate:** rows that exist as `inactive` or `removed`, but the old fields say are active.
- **doesNotFit** (skipped and listed, never guessed):

| Case | Meaning |
|---|---|
| `studentWithoutSchool` | the student has no `institutionId` |
| `groupMissing` | `batchId` points to a group that no longer exists |
| `groupInOtherSchool` | `batchId` points to another school's group |
| `classWithoutSchool` | a class with members but no `institutionId` |
| `classMemberMissing` | `studentIds` contains a student that no longer exists |
| `classMemberInOtherSchool` | `studentIds` contains another school's student |
| `duplicateClassMember` | the same student is listed twice in one class |

- **conflicts → activeNotInOldFields:** active enrollment rows that the old fields don't contain. The backfill **never** changes these; a person decides.
- **inSync:** true when nothing would be created or reactivated and there are no conflicts. This is the consistency check from the plan (`enrollment:check`).

Each list shows up to 200 items, with the full count.

## Safety

- The dry run makes **no writes** (tested).
- The old fields are **never** changed (tested: identical before and after apply and undo).
- Undo removes only backfilled rows (tested).
- After apply, the class roster from enrollments equals today's `classStudentIds` for real, same-school students (tested).

## Before it runs on the real database (Mohamed's rules)

1. Mohamed approves.
2. A full backup is taken and the restore steps are written down.
3. The dry run is reviewed first: counts, records that don't fit, conflicts.

**Connectivity:** this sandbox can't reach Atlas, so the command runs on a trusted computer with the database string. It can't run from here.

## Tests

`backend/test/multiClass/step3.test.ts`: 8 tests on fake data covering every "doesn't fit" case, scoping to one school, idempotent apply, reactivation, conflicts left untouched, exact undo, unchanged old fields, and the same roster as today.

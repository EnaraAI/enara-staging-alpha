# Parents P3: results reach parents only after the teacher releases them

Branch `claude/parents-p3` → `lms-test-live`. lms-test only (test.enara.app frozen).

## Switch

`PARENT_GRADES_AFTER_REVIEW_ENABLED` (default off; ON for lms-test in `deploy/lms-test.flags.json`). With it off,
parents see results exactly as before.

## What each person sees

- **School admin**, sidebar **Parents** → **Parent settings**: **Show results to parents**, with two choices: "After the
  teacher releases them" (default, D7) or "Immediately". Changes are audited (`parent_settings_changed`, before
  and after).
- **Parent**: a result that is not released yet shows **Waiting for the teacher** (EN) / **بانتظار المعلم** (AR),
  with no score and no passed/not-passed tag. Once released, the score appears.
- **Teacher**: nothing new. The existing Release (one result, or all of an assignment's) is what shows a result
  to parents. A result that an assignment releases automatically counts as released (owner decision 3, D7).

## The rule (`parents/resultVisibility.ts`), applied to every path a score takes to a parent

| Path | Before P3 | After release (default) |
|---|---|---|
| Progress: assessments list | every submitted attempt with its score | only `gradingStatus: 'released'` has a score; the others are listed as `waiting`, with `score: null` |
| Weekly status: "score dropped" | the last 2 submitted scores | the last 2 **released** scores |
| CEFR level: checkpoint tests (home, progress, weekly report, "Share") | any submitted checkpoint | released checkpoints only |
| "Verified" mark | a missing grading status counted as verified | released or finalized only; a missing status (older assessments) is not released and not verified |
| New-results email (P4) | — | will use the same rule |

"Immediately" shows every submitted attempt with a score, as before. A missing grading status is then shown but
not marked verified. The rule is per child, by the link's school.

Not changed, and not a score: the outcome-mastery evidence behind the level and can-dos (learning intelligence).
It is updated when an attempt is graded, also for a result that is held for the teacher. See "Open question" in
the PR.

## Tests

- `backend/test/parentsP3.test.ts`:
  - switch off: the old leaks reproduced (unreleased score, score drop, checkpoint level, no status counted as
    verified);
  - after release: every path is closed, auto-release counts as released, and the release brings everything back;
  - the setting: values, school admin only, audited, "immediately";
  - 404 with the switch off.
- E2E `e2e/tests/12-parents-p3.spec.ts`:
  - the default setting on the Parents page;
  - the Moodle student submits a manual-release quiz on the Moodle-made class;
  - a parent sees "Waiting for the teacher" with no score and no score drop;
  - after the release, the score appears (and, for a child in several classes, the class label is the Moodle
    course's ENARA class name).

# Learner memory phase 1: errors to work on

Owner "go": 20 Nov 2026. Plan: `docs/tutor/LEARNER_MEMORY_PLAN.md` on `claude/tutor-kids-pack`. Switch: `ENARA_ENGINE_V2` `workOn`, named only and **off by default**.

## What it does
- **Recording.**
  - Each wrong (or partly right) answer on a **released assignment attempt** becomes a row: learner, objective, error code, sources.
  - The error code is the chosen option's distractor category, else `unknown`. No question or answer text is stored.
  - Rows are picked up when the list is read (`syncErrors`, idempotent), so the LMS grading code is unchanged.
- **Gate.** An error is used only when all of these hold:
  - the results are released;
  - the assessment is over for the learner: closed, past its close date, or no attempts left;
  - no attempt is in progress.
  
  It is checked on every read (`gateOpen`).
- **Tutor.**
  - The session's brief lists at most 3 errors (2 for children): recurring first, then prerequisites, then most recent.
  - At the session start, the review opener is set (planner S1 / method M3).
  - The tutor reteaches the rule with new items.
  - A reply sentence that contains one of the assessment's questions is removed (`removeExamItems`).
- **Leaving and coming back.**
  - Two independent rights in a row, in later sessions or attempts, resolve an error. Each session or attempt counts once.
  - A wrong answer resets the count and reopens a resolved error.
  - Tutor outcomes count on the session's own objective.
- **Teachers** (own classes) and **admins** (own school):
  - `GET /api/learning/students/:id/errors-to-work-on` and an "Errors to work on" panel on the learner analytics page, with Dismiss.
  - The learner ('me') sees the list without sources.
  - The API answers 404 while the switch is off.
- **Privacy.** Ids and codes only. Both new collections are deleted with the learner (`studentErasure`).

## Limits (phase 1)
- Assignment attempts only. Practice quizzes keep their spaced review.
- Results of Moodle's own quizzes are not imported. That is a separate LMS-track project.
- A tutor practice on an error from another objective is not counted. Only the session's own objective, or a later assessment, counts.
- A regrade after release doesn't change rows already recorded.

## Tests
`test/errorsToWorkOn.test.ts`: recording, the gate, priority and limit, resolve and reopen, the brief, and the exam-item guard (10 tests).

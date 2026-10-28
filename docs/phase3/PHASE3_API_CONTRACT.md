# Phase 3: API Contract

All routes require authentication. Teacher routes check teacher/admin role and class scope server-side; student routes return only the caller's data. Errors use `{ error, code }`. Every surface returns 404/403 when its flag is off.

## Assessments (`/api/assessments`, teacher-scoped)
create, update, `POST /:id/validate`, `GET /:id/preview`, `POST /:id/publish`, `POST /:id/archive`, `POST /:id/restore`, `POST /:id/duplicate`, `GET /:id/versions`, `POST /generate` (AI draft; `ai_assessment_authoring_enabled`; 20/h per user), `POST /:id/questions/:questionId/regenerate` (60/h per user). Hard delete is replaced by archive.

## Assignments (`/api/assignments`)
`GET /`, `GET /classes`, `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/publish`, `/close`, `/reopen`, `/archive`, `POST /:id/extensions`.

## Student (`/api/me`)
`GET /assignments`, `GET /assignments/:id`, `POST /assignments/:id/attempts`, `PUT /assignments/:id/attempts/:attemptId/draft`, `POST /assignments/:id/attempts/:attemptId/submit` (idempotent: a retry returns the same result), `GET /assignments/:id/attempts/:attemptId/result` (only after release; no keys or rubric internals), `GET /study-plan`, `PATCH /study-plan/items`, `POST /tutor/handoff`.
Legacy `/api/me/assessments` start/submit uses published content and refuses open-response assessments with `NEEDS_ASSIGNMENT`.

## Grading (`/api/grading`, staff only, school and class scoped)
Grading itself is automatic; these endpoints are for oversight.
- `GET /queue?status=&assignmentId=&classId=&appeals=open`: submissions ordered by urgency (exceptions, hand grading, in progress, released). Each row has status, score, exception reason, next retry and the open-appeal count. Opening the list also nudges due grading runs.
- `GET /attempts/:id`: answers, the evaluation each grade came from and every evaluation made, plus history, appeals, exception details and `intelligenceStatus`.
- `PUT /attempts/:id/answers/:questionId`: score by hand. Only for `grading_exception` or hand-graded (`needs_review` / `graded_draft`) attempts; otherwise `409 GRADING_IN_PROGRESS`.
- `PUT /attempts/:id/feedback`: overall feedback, before release.
- `POST /attempts/:id/finalize`: finalize hand-graded or exception work. It is **released at once**.
- `POST /attempts/:id/regrade { reason? }`: send an exception or failed attempt back to the grader. `409 NOT_REGRADABLE` for released work.
- `POST /attempts/:id/correct { questionId, points | criterionScores, feedback?, reason, appealId? }`: the only way to change a released grade. The original is kept (`originalPoints`, history), old evidence is invalidated and teacher evidence recorded.
- `PUT /attempts/:id/appeals/:appealId { decision: upheld | rejected, response }`: answer a student's request.
- `POST /attempts/:id/release`, `POST /assignments/:assignmentId/release`: kept for older `finalized` records.
- Removed: `POST /attempts/:id/propose`.

Student additions under `/api/me`:
- `GET .../result` returns `{ released: false, processing: grading | with_teacher | delayed }` until release. Released results add `scoreExplanation`, `strengths`, `improvements` and `appeals`.
- `POST /assignments/:id/attempts/:attemptId/appeals { questionId?, message }`: allowed only after release, one open request per question, at most 3 open.

## Teaching (`/api/teaching`)
`GET /overview`, `GET /ops`, `GET /classes/:classId/roster`, `GET /classes/:classId/objectives`, `GET /students/:studentId/profile`, `GET /students/:studentId/study-plan`, `GET|POST /interventions`, `PATCH /interventions/:id`.

## Lesson plans (`/api/lesson-plans`, `ai_lesson_planning_enabled`)
`GET /`, `POST /generate` (20/h per user), `GET /:id`, `PUT /:id`, `POST /:id/sections/:sectionId/regenerate` (60/h), `POST /:id/save`, `POST /:id/archive`.

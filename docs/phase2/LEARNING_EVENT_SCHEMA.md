# Learning Event Schema (v2)

Collection `learning_events` (`backend/src/models/LearningEvent.ts`). Append-only: rows are never edited for content; only `processing`, `supersededBy` and (by migration) `idempotencyKey` are set later.

| Field | Meaning |
|---|---|
| `id` | `le-<uuid>` |
| `institutionId`, `studentId`, `actorId` | Tenant, learner, and the user who caused it |
| `type` | See table below |
| `source` | `lesson`, `assessment`, `review`, `tutor_chat`, `tutor_voice`, `client` |
| `verified` | Server-observed or rule-graded. Never true for `client` events or `tutor_reply` (enforced in `validateLearningEvent`) |
| `gradedBy` | `rule` (answer key), `ai`, `teacher` |
| `objectiveIds` | Objectives from question tags (`questions[].objectiveIds`) or lesson links (approved objectives whose `lessonIds` include the lesson). Never inferred |
| `refs` | `courseId`, `lessonId`, `assessmentId`, `attemptId`, `questionId`, `reviewItemId`, `sessionId`, `messageId` |
| `outcome` | `correct`, `score`, `hintsUsed` |
| `at` / `recordedAt` | When it happened / when it was stored |
| `schemaVersion` | 1 = Phase 1 rows, 2 = current |
| `idempotencyKey` | Derived from the source record; unique (partial index) |
| `supersededBy` | Set on a duplicate found by migration (kept, not deleted) |
| `processing.evidence` | `pending` (verified graded answer awaiting evidence), `done`, `failed`, `not_applicable`; `attempts`, `lastError`, `processedAt` |

## Types, required fields and keys

| Type (spec name) | Required | Idempotency key |
|---|---|---|
| `lesson_viewed` (learning.lesson.viewed) | refs.courseId, lessonId | none (each view is separate) |
| `lesson_completed` (learning.lesson.completed) | refs.courseId, lessonId | `lesson:<student>:<course>:<lesson>:completed` |
| `assessment_started` (learning.assessment.started) | refs.assessmentId, attemptId | `attempt:<id>:started` |
| `question_answered` (learning.question.answered) | refs.assessmentId, questionId; outcome.correct | `attempt:<id>:q:<questionId>` |
| `assessment_submitted` (learning.assessment.submitted) | refs.assessmentId, attemptId; outcome.score | `attempt:<id>:submitted` |
| `review_answered` (learning.retention.review_completed) | refs.reviewItemId; outcome.correct | `review:<itemId>:<answeredAt ISO>` |
| `tutor_question` / `tutor_reply` | refs.sessionId, messageId | `msg:<session>:<message>` |

Later sprints add diagnostic, misconception, pedagogy and intervention types to the same table.

## Writing, failures and recovery
- Writers call `recordLearningEvents()` after the action is saved. Invalid events are logged (`learning_event_invalid`) and dropped; duplicate keys are skipped silently (`learning_event_duplicates_skipped`); other failures are logged (`learning_event_record_failed`) and do not fail the student's action.
- There is no transactional outbox (DECISIONS D4). Because keys are derived from source records, a missing event can be re-created from assessments, lessons and reviews without duplicates (the Phase 1 backfill migration does exactly this).
- Downstream processing is tracked per event in `processing`, so failed evidence processing can be found (`processing.evidence: failed`) and retried.

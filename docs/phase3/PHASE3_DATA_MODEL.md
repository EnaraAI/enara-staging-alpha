# Phase 3: Data Model

## New collections
| Model | Key fields | Indexes / notes |
|---|---|---|
| `AssessmentVersion` (`models/Assessment.ts`) | assessmentId, version, snapshot of questions/rubrics/points, publishedAt, publishedBy | unique (assessmentId, version); immutable |
| `Assignment` | id, institutionId, classId, assessmentId, assessmentVersion, studentIds (empty = whole class), opensAt, dueAt, timezone, latePolicy, timeLimitMinutes, maxAttempts, extensions[], tutorPolicy (`allowed` / `hints_only` / `blocked`), state (draft / published / closed / archived) | rules version assign-v1 |
| `GradingProposal` (evaluation record) | attemptId, questionId, kind (rubric / short_answer), run (1, 2, 3 for the consistency check), status (proposed = valid / invalid / failed), criteria (level, points, quoted evidence, rationale), points, scoreExplanation, strengths, improvements, feedback, objectiveIds, confidence (stored, not used for decisions), flags, error, modelName, promptVersion (eval-v2) | immutable; the answer's `proposalId` points to the one used |
| `LessonPlan` | institutionId, courseId, lessonId, sections[], sources[], state (draft / saved / archived), createdBy, version (lessonplan-v1) | |
| `StudyPlan` | studentId (unique), institutionId, items[] (stable `key`, kind, source, rationale, evidenceIds, priority, dueAt, status), version (optimistic concurrency), history[] (last 50) | plan-v1 |

## Extended models
- **Assessment**: lifecycle (draft / published / archived), publishedVersion, hasUnpublishedChanges, per-question points, open-response rubric (criteria with levels), source (manual / ai), sources, createdBy, language.
- **AssessmentAttempt**: assignmentId, assessmentVersion, draftAnswers, expiresAt, isLate, gradingStatus (autograde-v1: `grading_queued → grading_in_progress → finalized + released`, or `grading_failed` (retry) → `grading_exception`; older/hand-graded: `needs_review`, `graded_draft`, `grading_pending`), gradingRuns, gradingLeaseUntil, nextGradingAt, gradingError, exceptionReason, intelligenceStatus (pending / done / failed) with intelligenceAttempts and intelligenceUpdatedAt, appeals[] (questionId, message, status open / upheld / rejected, response, resolvedBy/At), per-answer method `ai`, scoreExplanation, strengths, improvements, originalPoints (kept on correction), totalPoints/maxPoints, finalizedAt/By, releasedAt/By, history[], per-answer points, method (auto / teacher / ai_accepted / ai_edited), feedback, criterionScores, needsReview, proposalId.
- **LearningEvent**: refs gain assignmentId.
- **LearningIntervention**: `EDUCATOR_ACTIONS` types; objectiveId optional; rationale, ownerId, dueAt, lessonId, assignmentId, outcomeNote.
- **TutorSession**: `handoff` (source, item, prepared context, version).
- **ReminderLog**: kinds `assignment_published`, `results_released`.

## Autonomous grading changes
Additive only: new optional fields, new enum values and two indexes (`{gradingStatus, nextGradingAt}`, `{intelligenceStatus, intelligenceUpdatedAt}`). Mongoose builds the indexes on start, and no data migration is needed. Existing attempts keep their states. `Assignment.releasePolicy` is kept on records but no longer holds results back, and new assignments default to `auto`.

## Migration
`2026-10-26-phase3-assessment-versions` (registered in `migrations/index.ts`): creates a v1 snapshot for each legacy assessment and builds the new indexes. Additive and idempotent; legacy attempts keep working. **Not run against production** — it runs on deploy and needs owner approval.

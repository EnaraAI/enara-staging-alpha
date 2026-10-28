# Evidence Model

Collection `learning_evidence` (`backend/src/models/LearningEvidence.ts`). Created from events by `services/evidenceProcessor.ts` using the policy in `services/evidencePolicy.ts`.

- One row per (source event, objective), enforced by a unique index, so reprocessing never duplicates.
- Fields: `evidenceType` (`independent_assessment`, `guided_practice`, `diagnostic`, `retention_review`, `teacher_verified`), `result` (`correct`, `partially_correct`, `incorrect`, `inconclusive`), `normalizedScore` 0–1, `assistanceLevel` (`none`, `hint`, `guided`, `worked_solution`), `difficulty`, `priorExposures` (repeat sightings of the same item), `reliabilityWeight` (from the versioned policy, never from a client), `evidenceVersion`, `itemKey`, `occurredAt`, `recordedAt`.
- Invalidation keeps the row: `invalidatedAt`, `invalidatedBy`, `invalidationReason`; teacher verification sets `verifiedBy`; both append to `history`.
- What is never evidence: lesson views or completions, tutor questions or replies, browser-reported events, AI classifications.

## Policy `evidence-v1`
| Event | Evidence type | Base weight |
|---|---|---|
| `question_answered` from an assessment (verified, answer-key graded) | independent_assessment | 1.0 |
| `question_answered` from a diagnostic (Sprint 3) | diagnostic | 1.0 |
| `review_answered` (spaced review, verified) | retention_review | 0.8 |

- Assistance factor: none 1.0, hint 0.6, guided 0.4, worked solution 0.2 (current flows have no hints, so all are `none`).
- Repeat exposure: weight ÷ (1 + earlier sightings of the same item by the student).
- Difficulty is stored but not used: it isn't calibrated.
- Only events whose objectives come from links a person made (question tags) produce evidence; nothing is inferred.

## Processing
- Verified graded events are stored with `processing.evidence: pending`. Right after the student's action (assessment submit, review answer) the server processes that student's pending events; the daily cron processes anything left (e.g. after a failure, or when a school turns mastery tracking on).
- Evidence is written with an upsert on (sourceEventId, objectiveId), then the event is marked `done`; a failure marks it `failed` with the error, retried up to 5 times.
- Schools with `mastery_tracking_enabled` off keep their events pending: nothing is lost, and turning it on processes the backlog.

## Invalidation and links
- `POST /api/learning/evidence/:id/invalidate { reason }` (the student's teacher or school admin) keeps the row with who/why and recomputes mastery.
- Linking a question to an objective applies to answers already given to that question (DECISIONS D8); unlinking invalidates the evidence those answers gave that objective.

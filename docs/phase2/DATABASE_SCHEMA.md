# Database Schema (Phase 2 changes)

MongoDB via Mongoose. All additive.

| Collection | Change | Key indexes |
|---|---|---|
| `institutions` | + `features` map (flags) | existing |
| `learning_objectives` (new) | see `LearningObjective.ts`: code, title, description, language, translations, lessonIds, prerequisiteObjectiveIds, difficultyLevel, estimatedLearningMinutes, status draft/approved/archived, version, history, origin teacher/ai, extraction metadata | unique (institutionId, curriculumId, code); (institutionId, curriculumId, status); (institutionId, lessonIds) |
| `assessments.questions[]` | + `objectiveIds`, `difficulty` | — |
| `learning_events` | + `objectiveIds`, `schemaVersion`, `idempotencyKey`, `recordedAt`, `supersededBy`, `processing` | unique partial idempotencyKey; (processing.evidence, recordedAt); (studentId, objectiveIds, at) |
| `learning_evidence` (new) | see `EVIDENCE_MODEL.md` | unique (sourceEventId, objectiveId); (studentId, objectiveId, occurredAt); (institutionId, objectiveId, occurredAt) |
| `student_objective_mastery` (new) | estimate, strength, status, counts, needsVerification, modelVersion | unique (studentId, objectiveId); (institutionId, objectiveId, masteryStatus) |
| `student_mastery_history` (new) | one row per change with previous status/estimate and trigger | (studentId, objectiveId, at); (institutionId, at) |
| `diagnostic_sessions` (new) | session state, current item, responses, decisions with reasons, limits, stop reason | unique open session per (studentId, courseId); (institutionId, startedAt) |
| `student_misconceptions` (new) | rule key, category, description, heuristic confidence, supporting evidence ids, status + history | unique (studentId, ruleKey); (institutionId, objectiveId, status) |
| `institutions.learningSettings` | `diagnosticMaxQuestions`, `diagnosticMaxMinutes` | — |
| `assessments.questions[].distractors` | tagged wrong options | — |
| `pedagogical_decisions` (new) | strategy, reasons, evidence, version | (studentId, objectiveId, at); (institutionId, strategyId, at) |
| `learning_interventions` (new) | lifecycle, baseline, outcome, history | unique active per (studentId, objectiveId); (institutionId, status, updatedAt); (reassessmentDiagnosticId) |
| `time_to_understand` (new) | episode times, interventions, strategies, status | unique open episode per (studentId, objectiveId); (institutionId, objectiveId, status) |
| `tutor_sessions` | + `objectiveId`, `interventionId` | — |
| `objective_retention_states` (new) | schedule per student and objective | unique (studentId, objectiveId); (institutionId, nextReviewAt) |
| `institutions.learningSettings.pathwayMode` | strict_sequence / teacher_controlled / adaptive | — |
| `curriculum_chunks` (new) | passage text, file, page, lesson, normalised terms, objective ids, content hash, extraction version | (institutionId, curriculumId, terms); (institutionId, curriculumId, fileUrl) |
| `curriculum_processing_jobs` (new) | one per uploaded file: status, detail, pages, chunk count, attempts | unique (curriculumId, fileUrl); (status, updatedAt); (institutionId, curriculumId) |
| `tutor_messages.meta.citations` | cited passages | — |

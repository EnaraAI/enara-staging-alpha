# Phase 3: Architecture

Phase 3 adds a teaching workflow on top of the existing Express + Mongoose backend and React/Vite frontend. It reuses Phase 2 (evidence, mastery, pathways, interventions, tutor) rather than duplicating it.

## Components
| Area | Backend | Frontend |
|---|---|---|
| Assessment authoring and versions | `controllers/assessment.controller.ts`, `services/assessmentVersions.ts`, `services/educatorAi.ts` (author-v1) | `pages/teaching/AssessmentBuilder.tsx` |
| Assignments | `models/Assignment.ts`, `services/assignments.ts` (assign-v1), `controllers/assignments.controller.ts`, `controllers/meAssignments.controller.ts` | `pages/teaching/ClassAssignments.tsx`, `pages/StudentAssignments.tsx` |
| Grading | `services/autoGrading.ts` (autograde-v1: orchestration, validation, retries), `services/gradingProposals.ts` (eval-v2: AI evaluation), `services/grading.ts` (grading-v2: key scoring, finalize, Phase 2 update), `models/GradingProposal.ts` (evaluation records), `controllers/grading.controller.ts` (oversight) | `pages/teaching/GradingReview.tsx` (oversight), `pages/StudentAssignments.tsx` (results, appeals) |
| Teaching workspace | `controllers/teaching.controller.ts` (overview, roster, profile, interventions, objectives, ops) | `pages/teaching/TeachingDashboard.tsx` |
| Lesson planning | `models/LessonPlan.ts`, `controllers/lessonPlans.controller.ts` (lessonplan-v1) | `pages/teaching/LessonPlanner.tsx` |
| Study plans | `models/StudyPlan.ts`, `services/studyPlans.ts` (plan-v1), `controllers/meStudyPlan.controller.ts` | `pages/StudyPlan.tsx` |
| Tutor handoff and policy | `services/tutorHandoff.ts` (handoff-v1); tutor, tutorExtras and avatar controllers | tutor chat opened with a prepared session |
| Notifications | `services/teachingNotifications.ts` (ReminderLog kinds `assignment_published`, `results_released`) | — |
| AI plumbing | `services/aiJson.ts` (`askForJson`: schema validation, one retry, `trackAiCall`) | — |

## Main flow
1. Teacher drafts an assessment (by hand or AI draft), edits, validates and publishes. Publishing writes an immutable `assessment_versions` snapshot.
2. Teacher creates an assignment for a class (or selected students) pointing at a published version, with window, due date, late policy, time limit, attempts and tutor policy; then publishes it. Students are notified.
3. Student starts an attempt (records `assessmentVersion`), saves drafts, submits once (idempotent).
4. On submit the attempt is `grading_queued` and the grader runs (`processAttempt`). Answer-key questions are scored by rule. Short answers that don't match the key exactly get an AI meaning check. Open responses and essays get two independent rubric evaluations that must agree. If they don't, a third decides or the run retries.
5. Deterministic validation checks attempt, version, completeness, ranges, totals, quotes, objectives and leaks. The grade is then **finalized and released in one write**, with no teacher step. The student is emailed.
6. Phase 2 is updated separately: evidence (evidence-v3), mastery and the study plan (`intelligenceStatus`). A failure there is retried on its own and never touches the grade.
7. Failures go to `grading_failed` and retry with backoff (1 min, 10 min). After 3 runs, or on a problem a retry can't fix (integrity flag, missing rubric, AI grading off), they become `grading_exception`, flagged for a teacher, with no score. Retries are triggered by the daily cron, by students or teachers opening the work, and by expired leases.
8. Teachers oversee: they see every graded submission with the evaluation evidence, correct a grade with a reason (the original is kept and evidence replaced), answer student appeals, grade an exception by hand or send it back to the grader. Schools that turn `ai_grading_enabled` off grade open answers by hand (`needs_review`); answer-key work still releases automatically.

## Boundaries
- Tenant isolation: every query is scoped by `institutionId` and teacher scope (`CourseInstance.instructorIds`) server-side.
- Feature flags gate each surface server-side (`TEACHING_FLAGS`); master `teaching_workflow_enabled`.
- The grader finalizes and releases only results that pass validation; AI output never authorizes a database operation on its own. See PHASE3_AI_SAFEGUARDS.md and PHASE3_GRADING_BENCHMARK.md.

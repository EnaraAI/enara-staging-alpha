# Phase 3: Rollout and Operations

## Prerequisites (need owner approval)
1. Merge PR #3 into `connect-backend` — this deploys to Vercel.
2. The migration `2026-10-26-phase3-assessment-versions` runs on deploy. It is additive (v1 snapshots + indexes); back up the database first.

## Rollout
All flags default **off**, per institution.
1. Enable `teaching_workflow_enabled` for one pilot school: manual authoring, assignments, grading, teaching dashboard.
2. Then `ai_grading_enabled`. With it on, subjective answers are graded, validated and **released automatically**. Before turning it on for a school, run the benchmark on teacher-scored work in that school's subjects and languages and check it against the criteria in `PHASE3_GRADING_BENCHMARK.md`. After that, watch `autoGrading` on `/api/teaching/ops`: exceptions by reason, retries, corrections after release, and minutes to release. With it off, answer-key work still releases automatically and open answers are graded by hand.
3. Then `ai_assessment_authoring_enabled`, `ai_lesson_planning_enabled`.
4. Then `study_plans_enabled` (student-facing). Phase 2 recommendations appear in plans only when `learning_pathways_enabled` is on and shadow mode is off.

## Monitoring (`GET /api/teaching/ops`)
Grading by status; `autoGrading`: released count, median minutes to release, retries, exceptions by reason, released grades later corrected, and Phase 2 updates pending or failed. Also evaluation records by status, AI calls (feature `ai_grading`) with cost and latency, results emails, and late submissions.
Retries and reconciliation: the daily cron runs `sweepGrading` and `sweepLearningIntelligence`. Reading a result or assignment, and opening the teacher's grading list, nudge due attempts in between. On Vercel Hobby the cron is daily, so a run whose background work died is picked up when someone next opens the work, or at the latest by the next daily cron.

## Rollback
Turn the flag off (immediate, server-side). Data stays; no down-migration needed. Legacy assessments continue to work through their v1 snapshot.

## Runbook
- `grading_exception`: read `exceptionReason` and `gradingError` on the submission. If the cause is fixed (AI back up, rubric added) use `POST /api/grading/attempts/:id/regrade`; otherwise grade by hand and finalize, which releases it.
- `integrity_flag`: check the answer for attempts to instruct the grader before regrading or grading by hand.
- Many `conflicting_results` or `ai_invalid_output`: likely a rubric problem (vague levels) or a model change. Check the evaluation records.
- Phase 2 update failed (`intelligenceStatus: failed`): it retries by itself, up to 5 times. Grades are not affected.
- Wrong released grade: `POST /api/grading/attempts/:id/correct` (history kept, evidence updated idempotently).
- Rate-limit complaints: limits are per user per hour in `app.ts`.

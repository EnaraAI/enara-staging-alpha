# Phase 3: Autonomous Grading — Audit and Change Plan

Audit of branch `phase3-teaching` at `43e692b` before the autonomous-grading change. Evidence is file references in the repository as of 2026-10-25.

## 1. Current grading implementation
| Piece | Where | What it does today |
|---|---|---|
| Objective scoring | `services/grading.ts` `gradeAnswers` | MC, true/false, short answer scored by the answer key (`gradeAnswer`, exact match after normalising). Open responses get `points: null`, `needsReview: true` |
| AI evaluation | `services/gradingProposals.ts` `proposeForAnswer`, `validateProposal` | One AI call per open answer through `askForJson` (schema check, one retry, `trackAiCall`). The output is stored as a `GradingProposal` and never becomes a grade on its own |
| Lifecycle | `models/AssessmentAttempt.ts` `GradingStatus` | `grading_pending → needs_review / graded_draft → finalized → released` |
| Finalize / release | `services/grading.ts` `finalizeAttempt`, `releaseAttempt` | Conditional updates (idempotent). Evidence is written at finalize |
| Phase 2 evidence | `recordAttemptEvidence` + `services/evidencePolicy.ts` (evidence-v2) | Answer-key results count; teacher-set points count; AI-set points never count |
| Teacher actions | `controllers/grading.controller.ts` | queue, score/accept proposal, feedback, finalize, release, bulk release, correction with reason |
| Retry | `sweepMissingProposals` on the daily cron | Re-asks for proposals that never arrived |
| Notifications | `services/teachingNotifications.ts` | `results_released` email once per attempt (ReminderLog) |

## 2. Approval gates found
1. `gradeAnswers`: every non-empty open response is `needsReview: true` with no points.
2. `gradingStatusAfterScoring`: any `needsReview` → `needs_review`; nothing can be finalized until a person scores it.
3. `finalizeAttempt` refuses while any answer lacks points (`GRADING_INCOMPLETE`) and is only called by a teacher (or by auto-release when there is no open answer).
4. `Assignment.releasePolicy = 'manual'` (the default): finalized results wait for a teacher to release.
5. `evidencePolicy` v2 ignores `gradedBy: 'ai'`.
6. Student result endpoint shows nothing until `released`.
7. Frontend `GradingReview` is built as an approval queue (needs review → accept → finalize → release).

## 3. Reusable pieces (kept)
`gradeAnswers` (deterministic part), `askForJson`, `validateProposal` (level ids, quotes checked against the answer), `GradingProposal` (as the stored AI evaluation record), `finalizeAttempt` / `releaseAttempt` conditional-update pattern, `recordAttemptEvidence` idempotency keys, `invalidateEvidence` for corrections, `notifyResultsReleased` dedupe, the correction endpoint, the daily cron.

## 4. Changes
- **States.** New: `grading_queued`, `grading_in_progress`, `grading_failed` (will retry), `grading_exception` (retries used up or not retryable). `finalized` and `released` stay as GRADE_FINALIZED and FEEDBACK_RELEASED. AI_EVALUATION and RESULT_VALIDATION are steps inside one run, recorded in the attempt history. LEARNING_INTELLIGENCE_UPDATED is a separate field (`intelligenceStatus`) so a Phase 2 failure never moves or reopens the grade. The old `needs_review` / `graded_draft` values stay valid for existing records and for schools that turn AI grading off.
- **Orchestrator.** New `services/autoGrading.ts`: claim the attempt with a lease (no duplicate runs), evaluate, validate deterministically, then finalize and release in one conditional write, then notify and update Phase 2 independently.
- **Evaluator.** `gradingProposals.ts` becomes the evaluator: rubric evaluation adds strengths, improvements and a score explanation; open answers are evaluated twice independently and must agree; short answers that don't match the key exactly get a meaning check against the key.
- **Validation.** Deterministic checks before finalization (version, completeness, ranges, totals, quotes, objective refs, leakage of keys/model answers, integrity flags).
- **Failures.** Retries with backoff; after 3 runs `grading_exception`. No score is invented.
- **Teachers.** Queue becomes an oversight list (exceptions first, then everything graded). Teachers can score exceptions, retry them, correct any released grade with a reason (original kept), and answer appeals.
- **Students.** Processing / delayed state while grading; released result adds strengths, improvements, explanation; they can appeal a released result (a request, not a regrade).
- **Phase 2.** evidence-v3: validated AI-graded answers count, at a lower weight than answer-key and teacher-scored answers.
- **Release policy.** Results release as soon as they are valid; `releasePolicy` is kept on old records but no longer holds results.
- **Coding questions.** There is no secure execution service in the codebase, so coding assessments stay unsupported (they can't be authored); documented, not faked.

## 5. Affected APIs and UI
Backend: `meAssignments.controller.ts` (submit, result, appeal), `grading.controller.ts` (queue, score, finalize, regrade, appeals, correction), `teaching.controller.ts` (overview and ops counts), `services/assignments.ts` (student status), cron. Frontend: `GradingReview.tsx`, `StudentAssignments.tsx`, `ClassAssignments.tsx` (release option removed).

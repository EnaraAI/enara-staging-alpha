# Phase 3: Implementation Report

Branch `phase3-teaching`, draft PR #3 into `connect-backend`. **Not merged, not deployed, migration not run.**

## Delivered by sprint
| Sprint | Delivered |
|---|---|
| 0 | Audit and plan (`PHASE3_AUDIT_AND_PLAN.md`) |
| 1 | Assessment lifecycle and immutable versions, points, rubrics, assignments (windows, time zone, late policy, extensions, time limit, attempts), draft save, idempotent submit, migration |
| 2 | Grading lifecycle, AI grading proposals with teacher review, finalize/release/correct, evidence-v2, notifications, grading review UI |
| 3 | AI assessment drafts with per-question regenerate and source checks; AI lesson planner; honest replacement of frontend mocks |
| 4 | Teaching dashboard: overview, roster, learner profile, class objectives, educator interventions |
| 5 | Persisted study plans, tutor handoff, assignment tutor policy enforced in chat, course tutor and voice |
| 6 | Ops metrics, end-to-end test, docs |

## Autonomous grading update
This supersedes the earlier teacher-approval grading model: **Enara evaluates, validates, finalizes and releases grading results automatically, with no human approval required. Teachers keep oversight, correction and auditing after release.**
- Audit and change plan: `PHASE3_AUTONOMOUS_GRADING_AUDIT.md`.
- New `services/autoGrading.ts`:
  - claims each attempt with a lease, so it is never graded twice at once;
  - runs a double evaluation with a consistency check;
  - validates deterministically, then finalizes and releases in one write;
  - retries with backoff and ends in an exception, never in an invented score;
  - updates Phase 2 separately (evidence-v3), with its own retries.
- Evaluator (eval-v2): rubric evaluation with strengths, improvements and score explanation; points must cite quotes from the answer; objective ids are checked; short answers get a meaning check.
- Teacher oversight: exception handling (grade by hand or regrade), corrections that keep the original, appeals, and ops metrics. Student side: processing, delayed and released states, richer feedback, and appeals.
- Removed: approval-only paths (AI proposals waiting for acceptance, and manual release as the default).
- Kept: hand grading for schools with AI grading off, and older records.
- Benchmark harness and release criteria: `PHASE3_GRADING_BENCHMARK.md`. A first run on a provisional (non-teacher) key gave 26/28 exact totals and 10/10 short answers. **Subjective grading is not validated until a teacher-scored set passes.**

## Verification
See `PHASE3_TEST_PLAN.md`. After the autonomous-grading change: backend 234/234, backend typecheck pass, frontend build pass, frontend typecheck 8 pre-existing errors. The real-AI benchmark ran (provisional key).

## Deferred
- **Guardian reports**: no verified guardian–student linkage exists in the data model, so per the spec they are deferred.
- **Coding questions** (run-and-test grading): the codebase has no secure execution service, so coding assessments can't be authored. They enter the autonomous workflow once a sandboxed runner exists. AI must not replace test results.
- Remaining frontend mocks: `generateStudyPlan`, `generateInterventionPlan`.

## Limitations and risks
- Automatic grading quality is measured only on a small provisional benchmark, not on teacher-scored real work. Collect that before relying on it in a pilot (see the benchmark doc).
- AI-graded subjective answers cost 2-3 AI calls each.
- Teachers still use the admin layout (Phase 2 D10).
- No load testing; browser coverage of dashboard, lesson planner and study plan is API-only.
- Frontend type errors (8) predate Phase 3 and are not in CI.

## Needs owner decision
Merge/deploy (runs the migration), and which pilot school to enable first.

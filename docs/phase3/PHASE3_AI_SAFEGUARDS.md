# Phase 3: AI Safeguards

**Grading policy:** Enara evaluates, validates, finalizes and releases grading results automatically, with no human approval required. Teachers keep oversight after release: they can review, correct, audit and answer appeals. Exception handling and the quality safeguards below still apply.

## Automatic grading
| Risk | Safeguard | Where |
|---|---|---|
| A wrong or invented grade is released | A grade is released only after deterministic validation (below). If validation or the AI fails, the attempt retries and then goes to `grading_exception`. No score is ever given in that case | `services/autoGrading.ts` (`validateGrading`, `recordFailure`) |
| One unlucky AI reading decides the grade | Each open answer is evaluated twice, independently. The two must agree: no criterion more than one level apart, and totals within ¼ of the maximum (at least 1 point). If they don't, a third evaluation must agree with one of them; otherwise the run retries | `agree`, `evaluateOpen` |
| Trusting the model's self-reported confidence | Confidence is stored for audit only. Release decisions come from schema checks, quotes, the consistency check and validation | `gradingProposals.ts` |
| Points without basis in the answer | Every rubric level above zero must cite a quote that appears verbatim in the student's answer, or the reply is rejected | `validateProposal` |
| Malformed or out-of-range output | Rubric level ids must exist and level points must match. Criterion sums must equal answer points, answer points must lie within 0..max, and totals are recomputed. The attempt, assignment, assessment version and question set must all match. Answer-key results are re-checked against the key | `validateGrading` |
| Hidden material leaks into feedback | Released feedback, explanations, strengths and improvements are checked for any 8-word run of the model answer and, for short answers, the answer key. If found, the run fails and retries. Students never receive model answers, rubric descriptions, evaluation records or history | `leaks`, `meAssignments.controller.ts` (`resultView`) |
| Prompt injection in student answers | The answer is passed as delimited, untrusted data. The `possible_integrity_issue` flag stops grading at once (exception, no retry) for a person to check. The model's output can only fill fields that are then validated; it never authorizes a database operation | `RUBRIC_SYSTEM`, `evaluateOpen` |
| Invalid objective references | Objective ids in the output must belong to the question or its rubric | `validateProposal`, `validateGrading` |
| Duplicate or concurrent grading | A run claims the attempt with a lease. Finalize and release happen in one conditional write tied to that run. Events, evidence and email are idempotent | `claim`, `processAttempt` |
| Lost background work | Any due attempt is picked up again by the daily cron, by reading a result or assignment, and by opening the teacher's list. Expired leases are reclaimed | `sweepGrading`, `kickGrading` |
| Downstream failure changes a grade | The Phase 2 update runs after release, separately (`intelligenceStatus`), and is retried by its own sweep. It never regrades | `updateLearningIntelligence`, `sweepLearningIntelligence` |
| Students tamper with grades | Grade fields in submissions are ignored; only answers are read. Grading endpoints are staff-only. A student can't trigger a regrade. Appeals are requests that change nothing until a teacher corrects the grade | routes, `appealMyResult` |
| Unreviewed AI weighs too much in mastery | evidence-v3: validated AI grades count at weight 0.8, and teacher corrections replace them at 1.0 | `services/evidencePolicy.ts` |
| Reliability unknown | Benchmark harness with release criteria in `PHASE3_GRADING_BENCHMARK.md`. **Not yet validated against teacher scores**; the only run so far uses a provisional engineering key | `scripts/gradingBenchmark.ts` |
| Unsupported formats graded badly | Coding questions can't be authored, since there is no secure execution service. If any unsupported type reaches the grader, the attempt becomes an exception | `processAttempt` |

## Other AI features
| Risk | Safeguard | Where |
|---|---|---|
| AI-authored content published unchecked | Generated assessments and lesson plans are drafts. Regenerating a question or section changes only that draft. Publishing requires validation, and cited sources are checked against the curriculum (`verifyQuestionSources`) | `assessment.controller.ts`, `lessonPlans.controller.ts` |
| Tutor gives away assignment answers | The assignment's tutor policy (`blocked` / `hints_only`) is enforced server-side in text chat, course tutor and voice | tutor and avatar controllers |
| Cost / abuse | Per-user hourly limits on generation endpoints; every call is tracked with `trackAiCall` | `app.ts` |
| Invented study work | Study plans contain only items backed by an assignment, a teacher action, a released result or Phase 2 evidence | `services/studyPlans.ts` |
| Fake AI in the UI | Frontend mocks for assessment generation, recommendations, rubrics and lesson plans were replaced by honest messages. `generateStudyPlan` and `generateInterventionPlan` mocks remain | `frontend/services/geminiService.ts` |

Every AI record stores the model name and the prompt or algorithm version (`eval-v2`, `autograde-v1`) for audit.

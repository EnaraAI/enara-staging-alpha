# Phase 3: Audit and Plan (Teaching & Learning Automation)

> **Superseded in part.** This plan describes grading where AI output was a proposal for a teacher to approve. The autonomous grading update replaces that: grading, validation, finalization and release are automatic, and teachers oversee and correct afterwards. See `PHASE3_AUTONOMOUS_GRADING_AUDIT.md`, `PHASE3_ARCHITECTURE.md` and `PHASE3_AI_SAFEGUARDS.md`. The rest of this document is kept as the original record.

Audit of branch `phase3-teaching` (from `connect-backend` at `1bd2451`, Phase 2 merged and deployed to the sandbox). Evidence is file and line references in the repository as of 2026-10-25.

## Baseline checks (actually run)
| Check | Command | Result |
|---|---|---|
| Backend type check | `cd backend && npx tsc --noEmit -p .` | Pass |
| Backend tests | `cd backend && npx vitest run` | 178/178 pass, 20 files (run twice). A first run while another process was busy had 3 files fail to start their in-memory database (37 tests skipped); not reproducible, recorded as a flaky start |
| Frontend build | `cd frontend && npm run build` | Pass |
| Frontend type check (`npm run lint` = `tsc --noEmit`) | `cd frontend && npx tsc --noEmit -p .` | **8 errors, pre-existing** (`pages/Login.tsx` icon props, `services/avatarService.ts` provider union, `worker/index.ts` Cloudflare types). Not caused by Phase 2/3; CI doesn't run it |
| E2E | none in the repo besides backend `elie.e2e.test.ts` | Phase 2 loop test passes |

## Capability matrix
Status: **E** existing · **P** partial · **M** missing · **B** blocked · **D** deferred.

| Capability | Status | Evidence | Gap |
|---|---|---|---|
| Assessment definitions (MCQ, true/false, short answer) | E | `models/Assessment.ts` L3-39; `controllers/assessment.controller.ts` L219-289 | Admin-only (`routes/assessment.routes.ts` uses `requireAdmin`); teachers can't author |
| Points per question | M | no `points` field | Score is % of correct answers |
| Open-ended responses graded by a rubric | M | `gradeAnswer` is exact match (`services/assessmentSecurity.ts`) | Short answers must match the key exactly |
| Rubrics | M (frontend mock) | `frontend/services/geminiService.ts` L78-160 returns hardcoded rubrics | Not persisted, no API |
| Draft / publish / archive lifecycle | P | `status` mixes availability states (`upcoming/active/completed/pending/in-progress`), set freely by `PATCH` (L263-289) | No draft, no publish, no state machine |
| Versioning | M | edits mutate questions in place, even with attempts | Historical attempts lose their question set |
| Duplicate | M | — | — |
| Hard delete | E (risk) | `DELETE /api/assessments/:id` (L291) | Attempts orphaned; Phase 3 replaces it with archive |
| Assignment instances (definition vs assignment) | M | targeting is on the assessment itself (`batchId`, `studentId`) | One assessment = one assignment |
| Deadlines | P | `dueDate` is a free-form string; only used to reveal answers (`isAssessmentClosed`) | Start/submit don't enforce it; no time zone; no late policy; no extensions |
| Time limit | P | `duration` stored, not enforced | — |
| Attempts limit, one open attempt | E | `maxAttempts`, unique partial index `one_open_attempt` (`models/AssessmentAttempt.ts`), atomic submit (`meAssessment.controller.ts` L176) | — |
| Idempotent submit | E | second submit → 409 `ATTEMPT_ALREADY_SUBMITTED` | Retry gets an error instead of the same result |
| Save/resume | P | open attempt reused on restart (11000 handling) | Answers aren't saved before submit |
| Answer-key protection | E | `stripAnswersForStudent`, `hideAnswerKey`, `canRevealAnswers` | Must extend to rubrics, proposals, private notes |
| AI grading proposals | M | no AI grading; `LearningEvent.gradedBy` already allows `'ai'`/`'teacher'` | — |
| Review / override / finalize / release / correction | M | only read-only `GET /api/assessments/:id/attempts` (L127-211) | Score shown to students immediately |
| Phase 2 evidence from assessments | E | per-question `question_answered` events with idempotency keys → evidence → mastery | Must wait for finalized grades once review exists; open answers not evidence today |
| Teacher scoping | E | `CourseInstance.instructorIds`, `services/learningAccess.ts`, `requireTeacher` | Not used by assessment routes |
| Instructor workspace | P | Class Insights (Phase 2), `CourseTeacherAnalytics` page | No assignment/review dashboard, no learner profile, teachers use the admin layout (Phase 2 D10) |
| Educator interventions | P | `LearningIntervention` (Phase 2) with `teacher_assigned`; assign from Class Insights | Types limited to tutoring/practice/review |
| Study plans | P | Phase 2 pathways and recommendations (computed on read) | Not persisted; no assignments/deadlines in them; no history |
| Tutor handoff | E | interventions open focused tutor sessions with objective context and the integrity rule (Phase 2 `learningContext.ts`) | No handoff from an assignment or released result |
| AI gateway | E | `@anthropic-ai/sdk`; `services/aiCalls.ts` `trackAiCall` (latency, tokens, cost); credits (`services/creditsService.ts`) | No assessment / grading / lesson-plan generation |
| AI assessment generation | M (frontend mock) | `geminiService.ts` `generateAssessment` mock | — |
| AI lesson planning | M (frontend mock) | `geminiService.ts` `generateLessonPlan` mock | No model |
| Notifications | P | email (`services/emailService.ts`, Resend), reminders and weekly summary with dedupe (`ReminderLog`) | No in-app notifications |
| Feature flags | E | `Institution.features` + `services/featureFlags.ts` | Phase 2 flags only |
| Guardian reports | M → **D** | no parent role, link or consent | Deferred (spec §12) |
| Coding / practical questions | M → **D** | no safe code execution | Out of scope |

## What Phase 3 builds (smallest coherent version)
One workflow: **author (or AI-draft) → publish a version → assign to a class → student works and submits → automatic grading for objective items, AI proposals for open answers → teacher reviews, overrides, finalizes, releases → Phase 2 evidence from finalized grades → explained study plan and tutor handoff → teacher interventions.**

### Design decisions (details in `PHASE3_ARCHITECTURE.md` and `PHASE3_DATA_MODEL.md`)
1. **Extend `Assessment`, don't replace it.** Add `lifecycle` (`draft/published/archived`), `version`, `points`, an `open-response` type with a rubric, and authorship. Existing assessments are migrated as `published`, version 1.
2. **Immutable published versions** in a new `assessment_versions` collection (questions, keys, rubrics, objective links). Attempts record the version they were taken against; grading always uses that version.
3. **Assignments are a new collection** pointing to an assessment version and a class, with dates (stored as UTC, with a time zone), attempts, time limit, late policy, release policy and extensions. Existing batch/student-targeted assessments keep working through the current routes (legacy path), so nothing breaks.
4. **Grading lives on the attempt**, extended with per-answer points, method, feedback and a grading status (`submitted → grading_pending → needs_review / graded_draft → finalized → released`) plus an append-only history. AI proposals are a separate, immutable collection. Released results change only through a correction with a reason.
5. **Phase 2 evidence** for assignment attempts is recorded at **finalization** (not at submission), from final points, so overridden or unreviewed AI scores never become evidence. Legacy assessments keep today's behaviour.
6. **Teachers author and assign for classes they instruct**, through the same routes with server-side scoping. Admins keep school-wide access.
7. **Study plans** are a persisted, versioned list built from Phase 2 recommendations plus outstanding assignments and released results. No new intelligence model.
8. **AI calls** (assessment drafts, grading proposals, lesson plans) go through one helper on the existing Anthropic client with JSON output validated by code, tracked with `trackAiCall`, charged as credits, rate-limited per user, and flagged per school.
9. **Notifications:** email through the existing service (assignment published, results released), deduplicated. No in-app notification system in Phase 3.
10. **Guardian reports deferred** (no verified guardian link exists). **Coding questions deferred.**

## Sequence (vertical slices, each with tests and docs)
| Sprint | Slice |
|---|---|
| 1 | Assessment lifecycle and versions; points; open-response + rubric; teacher authoring; assignments (create, schedule, extend, close, monitor); student list/start/save/submit for assignments with deadlines, late policy, time limit and idempotent retries |
| 2 | Grading pipeline: rule grading by points, AI grading proposals for open answers, review queue, override with reason, finalize, release, correction; evidence at finalization; results view |
| 3 | Instructor workspace: dashboard, roster with real statuses, learner profile (facts vs results vs estimates vs recommendations), interventions with new types |
| 4 | Educator AI: assessment drafts and per-question regeneration, lesson-plan drafts with section regeneration and versions |
| 5 | Personalization: persisted study plans with replanning and history, tutor handoff from assignments/results/plan items |
| 6 | Hardening: E2E, security tests, migration validation, observability, rollout docs, implementation report |

## Risks
| Risk | Mitigation |
|---|---|
| Two assignment paths (legacy assessment targeting vs assignments) | Legacy path unchanged and documented; new UI creates assignments; migration later if wanted |
| AI grading misread as final | Proposals never reach students; teacher must finalize when any answer needs review; confidence labelled as the model's own, uncalibrated |
| Large existing frontend page (`AssessmentCenter.tsx`, 1927 lines, mock AI) | Replace mock calls with real APIs incrementally; keep layout |
| S1 account takeover (open from Phase 0) exposes grades too | Still a pilot blocker; documented again |
| Serverless time limits for AI grading of many submissions | Grade on submit in the background (`waitUntil`) with a cron sweep for anything pending |
| Cost of AI calls | Credits, per-user rate limits, per-school flags |

## Approvals needed later
Merging `phase3-teaching` into `connect-backend` (deploys the sandbox and runs migrations). No production deployment is part of this phase.

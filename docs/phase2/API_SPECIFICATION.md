# API Specification (Phase 2)

All routes under `/api/learning` need a session token. Errors use the existing format `{ error: { code, message, requestId }, message }`.

## Flags
| Route | Who | Notes |
|---|---|---|
| `GET /flags[?institutionId=]` | admin (own school), enara-admin (any) | Effective flags (sub-flags are false unless the master flag is on) |
| `PUT /flags` `{ institutionId, flags: { name: bool } }` | enara-admin | Unknown flags → 400 |

When `learning_intelligence_enabled` is off for the caller's school, other routes return 404 `FEATURE_DISABLED` (Enara admins pass).

## Objectives
Staff only (teacher: curricula of classes they instruct; admin: own school; enara-admin: all).

| Route | Notes |
|---|---|
| `GET /objectives?curriculumId=&status=` | Archived excluded unless `status=archived` |
| `POST /objectives` `{ curriculumId, code, title, description?, language?, translations?, lessonIds?, prerequisiteObjectiveIds?, difficultyLevel?, estimatedLearningMinutes? }` | Creates a draft. 409 `OBJECTIVE_CODE_TAKEN`; 400 `PREREQUISITE_CYCLE` |
| `GET /objectives/:id` | |
| `PATCH /objectives/:id` | Content changes bump `version` and add a history entry; `status: archived` (409 `OBJECTIVE_IN_USE` while it is a prerequisite) or `status: draft` to restore |
| `POST /objectives/:id/approve` | 409 `PREREQUISITES_NOT_APPROVED` until its prerequisites are approved |
| `GET /objectives/:id/prerequisites` | Transitive, with depth |
| `POST /objectives/extract` `{ curriculumId, lessonIds?, language? }` | AI drafts (origin `ai`), validated; existing codes skipped; cyclic links dropped. 10/hour per user |

## Changed existing routes
- `POST/PATCH /api/assessments`: questions accept `objectiveIds` (same school, not archived; else 400) and `difficulty` 1–5.

## Question links (Sprint 2)
| Route | Notes |
|---|---|
| `GET /objectives/:id/questions` | Questions of the curriculum's assessments with `linked` |
| `PUT /objectives/:id/questions` `{ links: [{ assessmentId, questionId }] }` | Sets exactly the linked set; returns `linked`, `unlinked`, `pastAnswersLinked`, `evidenceInvalidated` |

## Mastery (Sprint 2)
Need `learning_intelligence_enabled` and `mastery_tracking_enabled`. `:studentId` may be `me` for a student. Access: the student themself; teachers of a class the student is in; admins of the student's school; Enara admins. Anyone else gets 404.

| Route | Notes |
|---|---|
| `GET /students/:studentId/mastery` | Approved objectives of the student's courses with `masteryEstimate` (heuristic), `evidenceStrength`, `masteryStatus`, `needsVerification` |
| `GET /students/:studentId/mastery/:objectiveId` | Plus the evidence (up to 100) and history (up to 50) |
| `GET /students/:studentId/knowledge-map` | Plus `prerequisiteObjectiveIds`, `readyToLearn`, `isGap`, `weakPrerequisites` |
| `POST /students/:studentId/mastery/recompute` | Staff; rebuilds every objective from evidence |
| `POST /evidence/:id/invalidate` `{ reason }` | Staff with access to the student; 409 if already invalidated |

## Diagnostics (Sprint 3)
Need `learning_intelligence_enabled` and `diagnostics_enabled`.

| Route | Who | Notes |
|---|---|---|
| `POST /diagnostics` `{ courseId, objectiveIds?, maxQuestions? }` | student | 201 new or 200 `resumed: true`; 409 `NO_OBJECTIVES` |
| `GET /diagnostics/:id` | student, or staff with access | Staff don't get `currentQuestion` |
| `POST /diagnostics/:id/answer` `{ assessmentId, questionId, answer }` | student | 409 `STALE_QUESTION`, `DIAGNOSTIC_FINISHED`; repeats return `duplicate: true` |
| `POST /diagnostics/:id/complete` | student | Ends early (`student_ended`) |
| `GET /diagnostics/:id/report` | student, or staff with access | See `DIAGNOSTIC_ENGINE.md` |
| `GET /students/:studentId/diagnostics` | as mastery | Recent sessions |
| `GET/PUT /settings` `{ diagnosticMaxQuestions?, diagnosticMaxMinutes? }` | admin (own school), enara-admin | School limits |

## Misconceptions (Sprint 3)
Need `misconception_detection_enabled`.

| Route | Notes |
|---|---|
| `GET /students/:studentId/misconceptions[?status=]` | Students: own, not dismissed, no evidence; staff: with evidence and history |
| `PATCH /misconceptions/:id` `{ status, note? }` | Staff with access to the student |

## Changed
- Questions accept `distractors: [{ option, category, description }]` (option must be a wrong option; category from the taxonomy). Never sent to students.
- `question_answered` events now carry `outcome.answer` (first 200 chars) for the distractor rule.

## Pedagogy and interventions (Sprint 4)
Need `adaptive_pedagogy_enabled`.

| Route | Who | Notes |
|---|---|---|
| `GET /strategies` | staff | Registry and decision version |
| `POST /interventions` | student `{ objectiveId }`; staff `{ studentId, objectiveId, interventionType, strategyId?, note? }` | 409 `INTERVENTION_ACTIVE` |
| `POST /interventions/:id/start` | student | Baseline; returns `tutorSessionId` and the chosen strategy |
| `POST /interventions/:id/complete` | student or staff | `reassessmentRecommended: true`; mastery unchanged |
| `POST /interventions/:id/cancel` | student (own choice) or staff | |
| `POST /interventions/:id/reassess` | student | Opens a diagnostic on the objective; needs `diagnostics_enabled` |
| `GET /interventions/:id/outcomes` | student or staff with access | Baseline, outcome, decisions, TTU |
| `GET /students/:studentId/interventions` | as mastery | |
| `GET /analytics/ttu?objectiveId=&courseId=` | teacher (own classes), admin | See `TTU_SPECIFICATION.md` |

## Pathways, retention and class insights (Sprint 5)
| Route | Who | Flags | Notes |
|---|---|---|---|
| `GET /students/:studentId/pathway` | as mastery | `learning_pathways_enabled` | Mode, current, next, completed, awaiting verification, gaps, active interventions, sequence |
| `GET /students/:studentId/recommendations` | as mastery | `learning_pathways_enabled` | Ordered, explained, with evidence ids |
| `GET /students/:studentId/retention` | as mastery | `retention_intelligence_enabled` | Objective schedules and status |
| `GET /classes` | teacher (own), admin (school) | `teacher_learning_insights_enabled` | |
| `GET /classes/:classId/insights` | teacher of the class, admin | `teacher_learning_insights_enabled` | Heatmap, common gaps, misconceptions to review, interventions, diagnostic completion, baseline-to-latest (first 500 students) |
| `PUT /settings` | admin | — | adds `pathwayMode` |

## Curriculum processing and school analytics (Sprint 6)
| Route | Who | Flags | Notes |
|---|---|---|---|
| `GET /curricula/:id/processing` | staff with curriculum access | master | Extraction status per file |
| `POST /curricula/:id/process` | admin, Enara admin | master | Body `{ retryFailed?: boolean }`. Records jobs for all files, processes up to 3 now |
| `GET /analytics/school?institutionId=` | admin (own school), Enara admin (`institutionId` required) | master | Metrics with definitions; see `CURRICULUM_INTELLIGENCE.md` |

Tutor messages (`POST /api/me/tutor/sessions/:id/messages` and the course tutor) return `assistantMessage.meta.citations: { n, fileName, page, lessonId, chunkId }[]` when the answer cites retrieved passages.

## Shadow mode and limits (Sprint 7)
| Route | Who | Notes |
|---|---|---|
| `PUT /settings` `{ institutionId, shadowMode }` | Enara admin only | School admins get 403 for this field |
| `GET /analytics/shadow-comparison?institutionId=` | admin, Enara admin | Agree / disagree / no score, strong disagreements to review, definitions and caveat |

In shadow mode every `/api/learning` route returns `404 FEATURE_DISABLED` to students. All `/api/learning` routes are limited to 240 requests a minute per signed-in user (`429 RATE_LIMITED`).

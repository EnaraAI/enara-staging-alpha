# Phase 2 (ELIE): System Architecture

ELIE lives inside the existing Express + MongoDB backend and React frontend. No new services; AI calls go through the existing Anthropic integration. Details per component are in the linked documents.

```
Student actions (quizzes, reviews, diagnostics, tutoring)
        │  server-side, verified
        ▼
learning_events ──(evidence processor: inline after an action + daily cron)──▶ learning_evidence
        │                                                                      │
        │                                       mastery model (mastery-v1) ◀───┘
        │                                               │
        │            ┌──────────────┬───────────────────┼──────────────┬───────────────┐
        ▼            ▼              ▼                   ▼              ▼               ▼
  objectives &   diagnostics    misconception       retention       time to        pathways &
  graph          (diag-v1)      rules               (ret-v1)        understand     recommendations
                                (misc-rules-v1)                     (ttu-v1)       (path-v1)
                                        │
                                        ▼
                     pedagogy policy (ped-v1) ─▶ tutor context ─▶ tutor (Anthropic)
                                                                    ▲
             uploaded files ─▶ extraction (extract-v1) ─▶ passages ─┘ retrieval (retrieval-v1), citations

Staff views: objectives editor, class insights, school insights, TTU and shadow comparison.
```

## Principles
- **Evidence only from verified, server-side records** (D3). AI output and browser reports never become evidence.
- **Deterministic, versioned rules** (D7). Each stored result records the version that produced it.
- **Derived data can be rebuilt** from events and files (D4; tested in `elie.sprint7`).
- **School-scoped everywhere**; teachers limited to their classes; students to themselves.
- **Off by default** per school (D5), with shadow mode for safe trials (D13).

## Where things are
| Concern | Code | Doc |
|---|---|---|
| Flags, shadow mode | `services/featureFlags.ts`, `controllers/learningFlags.controller.ts` | `ROLLOUT_PLAN.md` |
| Objectives | `models/LearningObjective.ts`, `services/objectiveGraph.ts`, `controllers/learningObjectives.controller.ts` | `DATABASE_SCHEMA.md` |
| Events | `services/learningEvents.ts` | `LEARNING_EVENT_SCHEMA.md` |
| Evidence and mastery | `services/evidencePolicy.ts`, `evidenceProcessor.ts`, `masteryModel.ts` | `EVIDENCE_MODEL.md`, `MASTERY_MODEL.md` |
| Diagnostics | `services/diagnosticEngine.ts`, `controllers/learningDiagnostics.controller.ts` | `DIAGNOSTIC_ENGINE.md` |
| Misconceptions | `services/misconceptionRules.ts` | `MISCONCEPTION_ENGINE.md` |
| Pedagogy, tutor context | `services/strategyRegistry.ts`, `pedagogyPolicy.ts`, `learningContext.ts` | `PEDAGOGICAL_ENGINE.md` |
| Interventions, TTU | `controllers/learningInterventions.controller.ts`, `services/timeToUnderstand.ts` | `INTERVENTION_ENGINE.md`, `TTU_SPECIFICATION.md` |
| Retention, pathways | `services/retention.ts`, `services/pathways.ts` | `RETENTION_MODEL.md`, `PEDAGOGICAL_ENGINE.md` |
| Curriculum, retrieval, analytics | `services/curriculumExtraction.ts`, `curriculumRetrieval.ts`, `controllers/learningAnalytics.controller.ts` | `CURRICULUM_INTELLIGENCE.md` |
| Routes | `routes/learning.routes.ts` (`/api/learning`), cron in `routes/cron.routes.ts` | `API_SPECIFICATION.md` |

## Background work
- Inline: after a quiz, review or diagnostic answer, that student's pending events are processed in the same request.
- Daily cron (`/api/cron/daily`): pending evidence (up to 2,000 events), TTU maintenance, curriculum files (10), then the existing reminders.
- Bulk evidence processing runs 8 students at a time; each student's events stay in order.

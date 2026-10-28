# Phase 2 (ELIE): Implementation Plan

See `ARCHITECTURE_AUDIT.md` for the current state and `DECISIONS.md` for the choices below.

## Architecture and module boundaries

All modules live in the existing backend (`backend/src`) as models, services and controllers under one route prefix, `/api/learning`. No new infrastructure.

| Module | Files (planned) | Reuses |
|---|---|---|
| Feature flags | `services/featureFlags.ts`, `Institution.features` | Institution model |
| Objectives & graph | `models/LearningObjective.ts`, `services/objectiveGraph.ts`, `controllers/learningObjectives.controller.ts` | Curriculum, tenancy helpers |
| Events | `models/LearningEvent.ts` (extended), `services/learningEvents.ts` | Phase 1 log |
| Evidence | `models/LearningEvidence.ts`, `services/evidencePolicy.ts`, `services/evidenceProcessor.ts` | events, assessment grading |
| Mastery | `models/StudentObjectiveMastery.ts`, `models/MasteryHistory.ts`, `services/masteryModel.ts` | evidence |
| Diagnostics | `models/DiagnosticSession.ts`, `services/diagnosticEngine.ts` | assessment questions, grading |
| Misconceptions | `models/StudentMisconception.ts`, `services/misconceptionRules.ts` | evidence, AI calls |
| Pedagogy | `services/strategyRegistry.ts`, `models/PedagogicalDecision.ts` | tutor teaching methods, prompts |
| Interventions & TTU | `models/LearningIntervention.ts`, `models/TimeToUnderstand.ts` | tutor sessions, events |
| Retention & pathways | `models/ObjectiveRetentionState.ts`, `services/pathways.ts` | review items |
| Retrieval | `models/CurriculumChunk.ts`, `services/curriculumRetrieval.ts` | uploads, `directTutorModel.ts` |

## Data model and migrations
New collections: `learning_objectives`, `learning_evidence`, `student_objective_mastery`, `student_mastery_history`, `diagnostic_sessions`, `student_misconceptions`, `pedagogical_decisions`, `learning_interventions`, `time_to_understand`, `objective_retention_states`, `curriculum_chunks`. Changed: `learning_events` (D1), `assessments.questions` (+`objectiveIds`, `difficulty`), `institutions` (+`features`). Every migration is additive, idempotent and recorded by the existing runner; none deletes data.

## Dependency order (sprints, as in the spec)
1. Foundations: flags, objectives and graph, event extension, evidence model, indexes, migrations.
2. Mastery: evidence processing, estimator, strength, history, backfill, APIs, student knowledge map.
3. Diagnostics: selection, sessions, grading, report, rule-based misconceptions, UI.
4. Pedagogy and interventions: registry, decisions, tutor context, interventions, reassessment, TTU.
5. Pathways and retention: pathways, objective retention on top of review items, teacher insights.
6. Curriculum and analytics: extraction/chunking, retrieval with citations (keyword first; semantic if a provider is approved), learning analytics, school dashboard.
7. Hardening: end-to-end loop test, security review, performance, AI evaluation, shadow mode, pilot-readiness report.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Few questions tagged with objectives, so little evidence | Objective-tagging UI and AI-suggested tags (teacher-approved); honest "not assessed" states |
| Mastery misread as a grade | Label as estimate, always shown with evidence strength |
| Missing events (no outbox) | Idempotency keys + re-derivation job (D4) |
| Serverless time limits for bulk recompute | Per-student recompute inline; bulk in chunks via cron or script |
| Registration takeover (S1) exposes ELIE data | Flagged as blocker for pilot (Stage D); fix requires owner approval |
| Arabic quality | Bilingual objective titles; evaluation set needs reviewers |

## Test plan
Unit tests for every algorithm (graph cycles, evidence policy, mastery, strength, selection, stopping, misconception rules, strategy selection, TTU, retention, pathways); integration tests for each flow in spec §21; security tests (cross-tenant, cross-student, teacher scope, answer keys, spoofed events, duplicates); one deterministic end-to-end loop test; AI calls mocked in CI.

## Rollout
Flags default off (D5). Stage B (sandbox) after merge approval; Stage C shadow mode = flags on with recommendations visible to staff only; Stage D pilot per school.

## Acceptance criteria per sprint
As in the spec §24 exit criteria; status tracked in `IMPLEMENTATION_STATUS.md`.

## Deferred from Phase 2 (unless a dependency is approved)
- Semantic (vector) retrieval: needs an embeddings provider and Atlas Vector Search.
- Calibrated probabilities / IRT difficulty: needs response data.
- AI-graded open answers as evidence: AI grading stays a hypothesis (not evidence) in this phase.
- Causal impact claims: analytics report before/after only.

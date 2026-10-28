# Interventions

Code: `controllers/learningInterventions.controller.ts`, `services/interventions.ts`; collection `learning_interventions`. Flag: `adaptive_pedagogy_enabled` (reassessment also needs `diagnostics_enabled`).

## Lifecycle
`assigned` (by the student for themselves, or by a teacher with optional strategy and note) → `in_progress` (student starts: mastery baseline recorded; tutoring types open a tutor chat focused on the objective) → `completed` (activity done; **mastery unchanged**) → reassessment (a short diagnostic, up to 4 questions, on that objective) → `outcome` recorded when the diagnostic finishes: mastery after, and `improved` (status rank rose). `cancelled` at any point (students can't cancel a teacher's).

One active intervention per student and objective (unique index); a second returns 409 `INTERVENTION_ACTIVE`. Every status change is in `history`.

## Outcomes
`GET /interventions/:id/outcomes`: baseline, outcome, decisions and the time-to-understand episode, with the note that a before/after comparison of one student does not show causation.

## UI
Student: My progress → objective → "Practise with the AI tutor" creates/starts an intervention and opens the tutor in its focused session; "My plan" lists active ones with Continue practice, I've finished practising, and Take the check. Teacher assignment UI comes with teacher insights (Sprint 5); the API exists.

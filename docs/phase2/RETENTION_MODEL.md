# Retention Model (ret-v1)

Code: `services/retention.ts`; collection `objective_retention_states`. Flag: `retention_intelligence_enabled`. Recomputed after every mastery recomputation by replaying the objective's evidence, so it is deterministic and can be rebuilt.

## Schedule
- Starts after **2 distinct independent correct items** on the objective (one lucky answer doesn't start it).
- First review due 3 days after that; each independent correct answer **at or after** the due date is a successful review, and the next interval grows: 3, 7, 14, 30, 60 days.
- Correct answers before the due date don't advance it (no cramming credit).
- An independent wrong answer resets the streak and makes it due in 1 day.
- Status: `not_scheduled`, `scheduled`, `due` (past due), `overdue` (more than 7 days past due).

This is a fixed schedule, not a prediction of a person's forgetting curve.

## Relationship to existing reviews
The per-question spaced review (`review_items`, `reviewService.ts`) is unchanged and keeps its own schedule. Its answers (on questions linked to objectives) become `retention_review` evidence, which feeds this objective-level schedule. Objective-level and question-level histories stay separate.

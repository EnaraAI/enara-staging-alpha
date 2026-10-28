# Misconception Detection (misc-rules-v1)

Code: `services/misconceptionRules.ts`; taxonomy `services/misconceptionTaxonomy.ts`; collection `student_misconceptions`. Flag: `misconception_detection_enabled`. Runs after evidence processing for the objectives that changed.

## Rules
- **Tagged distractor**: teachers can tag a wrong option of a question with a category and description (`questions[].distractors`, hidden from students). Choosing tagged options with the same description on **2+ different questions** of an objective creates a *suspected* misconception. Confidence 0.35 per question, max 0.9.
- **Prerequisite gap**: emerging/developing on an objective (2+ independent answers) and emerging on a direct prerequisite (2+). Category `prerequisite_gap`, confidence 0.5.
- **Resolution**: a suspected finding is resolved automatically when evidence recorded after detection brings the objective to proficient or mastered.

Confidence values are heuristics, not calibrated probabilities, and are always returned with `confidenceIsHeuristic: true`.

## Review
- Students see their own as "Possible misconception (not confirmed)" or "Confirmed by a teacher"; dismissed ones are hidden; no evidence details.
- The student's teachers and school admins see the supporting evidence and can set `confirmed`, `dismissed`, `resolved` or back to `suspected` with a note (`PATCH /api/learning/misconceptions/:id`); every change is kept in `statusHistory`. Rules never overwrite a teacher decision.

## Not in this version
AI classification of ambiguous answers (open responses) is deferred: it would produce AI hypotheses that must stay separate from verified evidence, and needs an evaluation set first.

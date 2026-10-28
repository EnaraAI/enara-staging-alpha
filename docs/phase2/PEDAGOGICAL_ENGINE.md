# Pedagogical Engine (ped-v1)

Code: `services/strategyRegistry.ts` (11 strategies with id, version, intended use, limitations, prompt instructions, expected interaction, success criteria), `services/pedagogyPolicy.ts` (selection), `services/learningContext.ts` (tutor context), `pedagogical_decisions` collection. Flag: `adaptive_pedagogy_enabled`.

## Selection rules
In order: teacher-assigned strategy on the intervention → weak prerequisite (`prerequisite_remediation` on that prerequisite) → misconception category (conceptual → analogy, then visual explanation; procedural/calculation → worked example, then guided practice; misinterpretation → error analysis) → mastery status (not assessed → Socratic; emerging → direct instruction, then worked example; developing → guided practice, then scaffolding; proficient → independent practice; mastered → retrieval practice).

"Then" applies only when the previous strategy was **tried**: new evidence has arrived since it was chosen and the need remains (`STRATEGY_CHANGED`). Without new evidence the strategy stays the same across turns. These rules are hypotheses to validate, not established laws; decisions are observational and do not show a strategy caused improvement.

## Recorded decision
`strategyId`, `strategyVersion`, `targetObjectiveId`, `reasonCodes`, `supportingEvidenceIds`, `misconceptionIds`, `requiresReassessment`, `decisionVersion`, `previousStrategyId`, intervention and tutor session ids. A new row is written only when the strategy for the session changes.

## Tutor context
When a tutor chat targets an objective (sessions opened by an intervention carry `objectiveId`), the system prompt gets a short block: the objective, its status in words, recent assessed answers on it (count only), weak prerequisites, possible misconceptions (labelled confirmed / not confirmed), the strategy instructions, an assessment-integrity rule (never give answers to the student's assessment or check questions), and a reminder that practice isn't proof. Nothing else from the student's history is sent. If the flag is off or anything fails, the tutor answers normally without it.

## Not in this version
- Live voice calls don't carry an objective yet; the context applies to chat.
- Strategy effectiveness is not estimated (needs a comparison design).

# Pathways and Recommendations (path-v1)

Code: `services/pathways.ts`. Flag: `learning_pathways_enabled`. School setting `pathwayMode` (`PUT /api/learning/settings`).

- **Sequence**: approved objectives ordered by the earliest curriculum lesson they're linked to, then code.
- **Modes**: `strict_sequence` and `teacher_controlled` (default) suggest only the first objective in sequence that isn't secure as "learn next"; `teacher_controlled` puts teacher-assigned work first. `adaptive` suggests up to 3 objectives whose prerequisites are secure, so a student can move ahead within the approved set.
- **Recommendation types** (priority order): continue intervention (teacher's first) → review a weak prerequisite → practise a gap → take a check (estimate rests on little evidence) → review due → learn next. Secure objectives are not recommended again unless a review is due.
- **Explanations** quote real numbers from the student's records (e.g. "Review A before B: B builds on it, and on A 1 of 3 recent independent answers correct.") and list the evidence ids used. Draft and archived objectives never appear.

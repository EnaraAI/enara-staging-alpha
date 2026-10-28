# Mastery Model (mastery-v1)

Code: `backend/src/services/masteryModel.ts`. State: `student_objective_mastery`; every change appends to `student_mastery_history`.

**The estimate is a heuristic 0–1 score, not a calibrated probability.** The API marks it `estimateIsHeuristic: true` and the UI says "estimate".

## Inputs
Non-invalidated, non-inconclusive evidence for one student and objective (see `EVIDENCE_MODEL.md`).

## Formula
- Weight per evidence = `reliabilityWeight × 0.5^(age / 60 days)`, where age is measured back from the student's latest evidence on that objective. Recomputing later gives the same result: it depends only on the evidence, not on the current date.
- `estimate = (Σ weight × score + 1 × 0.5) / (Σ weight + 1)`. One neutral "virtual" observation stops a single answer from pushing the score to 0 or 1.

## Evidence strength (separate from the estimate)
Only independent evidence counts (assistance `none`), taking the best weight per distinct item:
none 0 · limited < 2 · moderate < 4 · substantial ≥ 4 (weight units).

## Status
| Status | Rule |
|---|---|
| not_assessed | no evidence |
| mastered | estimate ≥ 0.85 **and** strength moderate or more **and** ≥ 3 distinct independent items **and** the latest independent answer correct |
| proficient | estimate ≥ 0.70 (including a "mastered" estimate that lacks the evidence above: `needsVerification: true`) |
| developing | estimate ≥ 0.50 |
| emerging | below 0.50 |

`needsVerification` is also set when the estimate is ≥ 0.70 on limited evidence.

## Guarantees (tested in `elie.sprint2.test.ts`)
- One correct answer → 0.75, proficient, needs verification. Three distinct correct items → 0.875, mastered.
- Answering the same question repeatedly can't reach mastery: repeat exposures are discounted (`evidence-v1`) and strength counts each item once.
- Lesson completion and tutor activity never change mastery (they aren't evidence).
- Input order doesn't matter; recomputing with the same evidence gives the same state and adds no history row.
- Invalidated evidence is excluded and the change is recorded in history with trigger `invalidation:<id>`.

## Version changes
A new version string means recomputation (`POST /students/:id/mastery/recompute`, or a bulk script); history rows record the `modelVersion` that produced them.

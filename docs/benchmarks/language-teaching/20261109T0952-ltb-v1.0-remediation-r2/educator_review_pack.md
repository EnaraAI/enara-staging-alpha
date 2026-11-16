# Educator review pack: `ltc-v1-r2`

**Status: PREPARED — NOT EDUCATOR REVIEWED.** No qualified educator has rated any item, and no human ratings were generated or simulated.

## Sample (56 items; the selection rule is in code: `whyIncluded` on each item)

- **Balanced cells:** all 9 cohort × CEFR cells, each with T03 (answer feedback) and T12 (contradictory evidence): 18 items.
- **All T06** (9) and **all T10** (9).
- **Every r2 regression against r1** (18).
- **Cases with lesson_drift, over_helping or verbosity tags:** the first 12 by case ID.

Duplicates were merged, giving 56 unique items.

## Files

- `educator_review_items.json`. Per item:
  - a context summary with no identifiers (lesson, objective, the age band and moves the engine used);
  - the expected and unacceptable behaviour;
  - the full learner and tutor transcript;
  - the machine judge's scores, rationale and tags, clearly labelled **`machineJudge_NOT_HUMAN`**.
- `educator_review_scoresheet.csv`: one row per reviewer × item, with the 7 rubric dimensions (0–4), tags, severity, agreement with the machine judge, rationale, case/label issues and comments.
- The rubric: `rubric_v1.md` in the baseline dir.

## Instructions

1. **Score each item yourself first:** apply the 7 rubric dimensions with the anchors, judging the whole conversation with weight on the final tutor turn. Only then read the machine judge's output and record whether you agree.
2. **Flag case problems:** note anything wrong with the case itself, such as an implausible CEFR label or an expected behaviour you'd disagree with.
3. **Use at least two qualified EFL/ESL teachers,** ideally including one with young-learner experience.

## Analysis plan

- **Agreement between educators:** per dimension, weighted Cohen's kappa (2 raters) or Krippendorff's alpha (3 or more), plus exact and within-1 agreement.
- **Human vs machine:** the same statistics, comparing the mean human score with the machine judge.
- **Disagreements:** list every disagreement of 2 or more points.
- **Change the status only after real reviewers finish:** set it to `EDUCATOR-REVIEW-COMPLETED` only then.

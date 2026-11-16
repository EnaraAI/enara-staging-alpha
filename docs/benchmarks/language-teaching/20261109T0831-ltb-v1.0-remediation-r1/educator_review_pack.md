# Educator review pack: LTB v1.0 baseline vs `ltc-v1-r1`

**Status: `EDUCATOR-REVIEW-PREPARED` (NOT CONDUCTED).** No qualified educator has reviewed any case. No human ratings exist, and none were generated.

## Purpose

1. Check the LLM judge's provisional scores against qualified human judgement.
2. Validate the provisional CEFR labels and expected behaviours.
3. Get a blind human comparison of the baseline and remediated tutor replies on the four remediated behaviours.

## Sample (stratified; rule fixed before r1 results were read)

27 cases: in each of the 9 age × CEFR cells, one each of:
- **T13** answer request (hint-first behaviour);
- **T11** off-topic request (redirect);
- an **answer-feedback** case: A1 → T03 blocking error, A2 → T04 minor error, B1 → T07 hint-then-fail (learner-answer recognition and feedback).

The child cells carry the length and step-size behaviour. Sample IDs are in `educator_review_unblinding_key.json`.

## Files

| File | Who sees it |
|---|---|
| `educator_review_items.json`: per item, review ID, age band, CEFR estimate, situation type, lesson (objective, vocabulary, grammar, examples), expected and unacceptable behaviour, and two **blinded** conversations, A and B (learner turns + tutor replies). Synthetic content only | Reviewers |
| `rubric_v1.md` (in `../20261109T-ltb-v1.0/`): the frozen rubric, 7 dimensions with 0–4 anchors | Reviewers |
| `educator_review_scoresheet.csv`: one row per reviewer × item × conversation | Reviewers |
| `educator_review_unblinding_key.json`: which of A or B is baseline or r1 (assigned by a fixed-seed shuffle) | **Coordinator only**, until all scores are in |

## Reviewer instructions

1. Read the lesson and the expected and unacceptable behaviour for the item.
2. Score conversation A and then B on each rubric dimension, 0–4, using the anchors. `scaffolding_adaptation` may be "n/a" only when there is a single learner turn. Score the whole conversation, with weight on the final tutor turn.
3. Record any failure categories from the rubric list, with their severity (critical / major / minor), and a one- or two-sentence rationale.
4. Say whether A or B is better overall, or that they are the same.
5. **Also judge the case itself.** Is the CEFR label plausible? Are the expected and unacceptable behaviours sound? Use the notes column for this.
6. Don't discuss items with other reviewers until all scoring is done.

Recommended reviewers: at least 2 qualified English-language teachers (EFL/ESL), ideally at least one with young-learner experience.

## Analysis plan (fixed now)

- **Inter-rater agreement:**
  - per dimension, quadratic-weighted Cohen's kappa for 2 reviewers, or Krippendorff's alpha (ordinal) for 3 or more;
  - exact and within-1 agreement also reported.
- **Human vs LLM judge:** the same statistics per dimension, comparing the mean human score with the judge's score for the same conversation. The judge scores are in `case_scores.csv` here and in the baseline directory.
- **Blind preference:** the share of items where r1 is preferred, with a sign test.
- **Disagreements:** list every item where the human and judge scores differ by 2 or more points, with both rationales.
- Report the results in a new file. Change this file's status to `EDUCATOR-REVIEW-COMPLETED` only after real reviewers have finished.

## Remaining steps

1. Recruit the reviewers and confirm their qualifications.
2. Send them the items file, the rubric and the scoresheet (never the unblinding key).
3. Collect the scoresheets.
4. Unblind and run the analysis plan.
5. Publish the results, keeping these provisional automated scores alongside, unchanged.

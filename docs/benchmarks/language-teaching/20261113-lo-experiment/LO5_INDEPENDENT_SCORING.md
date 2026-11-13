# LO5 — Independent Scoring

## Method
All items are objectively scorable, so **no LLM judge is used anywhere in scoring**.
1. Every item has a frozen list of accepted answers (`lo_assessment_bank.json`), written before any run.
2. Scoring is deterministic (`keyMatch` in `backend/benchmarks/ltc-v2/lo_assess.ts`): answer and key are normalised (case, apostrophes, punctuation, spaces); correct if the answer contains an accepted answer as a whole phrase; an answer that hedges (contains "or" or two question marks) is wrong.
3. Each item is answered 3 times independently; an item is correct when at least 2 of 3 samples are correct. All raw samples are kept.
4. Scoring is blind: the same function scores every group and stage, sees only the answer and the key, never the group, the transcript or any tutor verdict.
5. The tutor's own assessments are never outcome evidence.
6. Measures: stage score = items correct / 2; absolute gain = post − pre; normalised gain only when pre < 1 (ceiling learners reported separately); mastery = post 2/2 and transfer at least 1/2.

## Flaw found and fixed (after the campaigns, before interpretation)
A hand check of 30 randomly drawn scored answers found one false positive: for the outcome "past simple with a finished time" (LO-12) the accepted answer is a bare verb ("opened"), and the wrong answer "They **have opened** the shop on Monday" contains it, so it was scored correct. This also made LO-12 look like it had no room to learn (pre-test 95%).
- **Fix:** for LO-12 only, an answer containing have, has, 've or had is wrong. Applied to all 1,020 LO-12 item results from the stored answers (no new paid calls); 508 decisions changed. Original files are untouched; corrected files are `campaign_N/lo_assessment_rescored.jsonl`.
- **Effect:** LO-12 pre-test 95% to 5%; overall pre-test 27% to 20%; ENARA post 57% to 54%; the average ENARA − static gap stayed at about +9 points (the conclusion is unchanged).
- Other items use full multi-word or non-overlapping keys; none of the other 29 sampled answers was scored wrongly.

## Uncertainty
- **False negatives:** a correct answer in an unexpected form ("I'd love an orange juice") is marked wrong; this lowers all groups equally.
- **Sampling noise:** reduced by 3 samples and the majority rule, not removed.
- **Not scored by humans:** open-ended and "explain why" outcomes were not included (no teacher-validated rubric exists).
- **Evaluator independence:** scoring does not depend on any model, but the simulated learner and the tutor share a model family (LO7).

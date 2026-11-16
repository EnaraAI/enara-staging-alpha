# Grader validation — A1–A2 (PART 5)

**SIMULATION ONLY · DRAFT.** No API calls were made. The grader was not changed.

## Question
Can ENARA's existing grader score the A1–A2 outcome assessments accurately enough?

## Targets
- Controlled items (exact 0/1): at least **95%** exact agreement with the reference score.
- Free-production and transfer items (0/1/2): quadratic-weighted kappa (QWK) of at least **0.80**.

## Method (round 2, the counted round)
- **Answers:** 100 simulated learner answers: 53 controlled items and 47 free or transfer items.
- **Reference scores:** 3 independent agent scorers. Each read only `docs/SCORING_RUBRIC.md` and the answers, without seeing the other scorers or any earlier scores. All 3 agreed on 84 of 100 answers. Every other answer had a 2-of-3 majority, so the reference is the majority score.
- **Grader run:** a 4th agent, who did not see the reference scores, produced the grader's scores in two ways:
  - **Deterministic path:** the real grader code, run offline. Controlled items were scored by `gradeAnswer`. Target-form items were scored by `evaluateAgainstKey`, with a right answer scored 2 and a wrong one 0.
  - **Model path:** an **AGENT STAND-IN, not the production grader**. The agent applied the grader's own eval-v2 short-answer and rubric prompts, and its outputs passed through the real validators (`validateShortAnswer`, `validateProposal`, `agree`). This is one run per answer.

## Results

| Grader path | Controlled agreement (target ≥95%) | Free/transfer QWK (target ≥0.80) |
|---|---|---|
| Deterministic (production code, offline) | **60.4%**: fail | **0.193**: fail |
| Model path, agent stand-in | **92.5%**: fail | **0.986**: pass* |

\*An estimate only. The real model path needs the API and was not run.

## Verdict
**Not validated.** The existing grader does not meet the targets for these assessments.
- The deterministic path fails both targets.
- The model path, approximated by the stand-in, passes the free/transfer target but misses the 95% controlled target.

## Why it fails (main causes)
1. **Exact string matching.** Differences in case, final punctuation, contractions and apostrophes cause correct answers to be marked wrong.
2. **Only one accepted answer per item.** The assignment grader takes only one accepted answer per item, so correct variants score 0.
3. **Choice items.** An answer is credited only if it matches the option text exactly. The option letter is not accepted.
4. **No target-form-only scoring.** A slip in a word outside the target form sinks an otherwise correct answer.
5. **Meaning check.** In the model path, the meaning check can credit an answer that avoids the target form.

## Recommended fixes (not applied; the grader is unchanged)
- Normalised matching for case, final punctuation, contractions and curly apostrophes.
- Multiple accepted answers in the assignment grader.
- Accept the option letter as well as the option text on choice items.
- A deterministic target-form scorer for free sentences, scoring 0/1/2.
- A guard so the meaning check cannot credit answers that avoid the target form.

## Important caveat: the items changed after this validation
Round 2 ran on the item bank as it was **before** review rounds 2–5, the user decisions and the fixes of issues flagged by 2 or more reviewers. Since then, many keys, accepted answers and items have changed. For example, polite requests, present continuous, third-person -s and rooms in a home were substantially rewritten. The causes above are properties of the grader, so the verdict still holds. The exact percentages, however, describe the old items.
**Before any confirmatory use, re-run the validation (round 3) on the final item bank, after the grader fixes, and with the real model path.**

## Consequence for ESL6
ESL6 pre-registers "grader agreement on a 10% blind recheck at least the PART 5 targets" as a guard. With the grader as it is now, that guard is expected to **fail** on the deterministic path. Under ESL6's decision rule, a failed guard means NOT CONFIRMED. Options: apply the grader fixes and re-validate before ESL6, or run ESL6 knowing this guard will likely fail. This is the user's decision.

## Limits
- Agent scorers only. No human raters.
- The model path is an agent stand-in, not the production grader.
- 100 answers in total, which gives wide uncertainty.
- The validation ran on an earlier version of the item bank (see the caveat above).

## Files
- `research/assessment-validation/a1a2/REPORT.md`: full report, rounds 1 and 2.
- `research/assessment-validation/a1a2/round2/`: REFERENCE.json, scorerS1/2/3.json, GRADER_DET.json, GRADER_STANDIN.json, AGREEMENT.json, harness2.ts.

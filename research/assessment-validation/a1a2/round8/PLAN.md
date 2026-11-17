SIMULATION ONLY

# Grader fix plan: controlled items to ≥95%

**Status: plan only. No code changes until Mohamed approves.** ESL6 stays stopped until the controlled check reaches 95% on answers the fix was **not** built from.

## Where we are

- **Round 7 (final re-check):** 150 fresh answers, 75 of them controlled. Agreement **92.0% (69/75)**, target ≥95%. Free/transfer QWK 0.845, which passes.
- All 6 controlled disagreements are the grader being **too strict**:

| Pattern | Items | Reference | Grader |
|---|---|---|---|
| **A.** A gap answer that also repeats the next word of the sentence ("an old", "The restaurant", "at half past nine") | R7-001, R7-006, R7-031 | 1 | 0 |
| **B.** An error correction where the target error is fixed, but other harmless words also changed ("…in the market", "…for me", "some eggs from the shop") | R7-042, R7-111, R7-124 | 1 | 0 |

## The fix (in `backend/src/services/graderV2.ts`, graderV2-ON path only)

1. **Pattern A, gap answers with surrounding words.**
   - Before matching, remove any words in the answer that exactly repeat the words **just before or just after the gap** in the item's sentence.
   - Then match the rest against the key.
   - Only words already in the sentence are removed. Any other extra word still scores 0.
2. **Pattern B, error correction.**
   - Score 1 when the **target error is gone** and the **target form is present**, and every other change is a small edit.
   - "Small edit" here means the other changes add no new error of the item's own type, and they keep at least 70% of the original words.
   - A rewrite into a different sentence still scores 0.
3. **Guard against over-correcting.** Keep both rules out of items that test **spelling or capital letters**. That earlier failure mode, where "carot", "fourty" and "september" were credited, must not come back.

## How it's checked (no API calls)

1. **Unit tests** for each pattern, plus "must still be 0" cases: an extra unrelated word, a wrong form, a full rewrite, and a spelling-item misspelling.
2. **Parity:** with graderV2 OFF, the output must be identical. The existing parity tests cover this.
3. **Regression:** rerun rounds 5, 6 and 7, and the ESL6 810-item answer check.
   - Required: no new disagreements.
   - Round 7 should reach 75/75 on controlled items. That is **not** an independent result, because the fix was built from those items.
4. **Independent check, Round 8:**
   - **150 NEW answers** covering all 33 outcomes (75 controlled), with at least 33% partial or debatable answers;
   - **3 new agent scorers**, with the majority as reference;
   - the grader run blind.
   - **Pass** = controlled ≥95% **and** free/transfer QWK ≥0.80.
5. **If Round 8 fails on controlled items:** stop and report the remaining patterns. No more fixes without your approval. ESL6 stays stopped.

## Limits (unchanged)

- The reference scorers are agents, not human raters.
- n = 75 per group.
- The rules are hand-written.
- The model path stays NOT VALIDATED.

## Size

Small: one file of code plus tests, then Round 8 (answers, 3 scorers, a blind run), using up to 3 agents at a time.

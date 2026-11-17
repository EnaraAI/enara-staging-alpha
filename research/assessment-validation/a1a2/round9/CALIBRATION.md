SIMULATION ONLY

# Option B, step 2: calibration of the model path with an AGENT STAND-IN (no API calls)

The user chose agents instead of the API (2026-11-17). An agent applied the **production meaning-check prompt** (`evaluateShortAnswer`, verbatim in `STANDIN_TASK.md`) to all **28 error-correction answers the rules marked wrong** in rounds 7 and 8. It was blind to the references. Its replies went through the real production steps (`standin9.ts`):
1. `needsAiEvaluation`;
2. the word-target guard;
3. `validateShortAnswer`;
4. the `targetFormMissing` guard.

**This is a stand-in for the model, not the production model.**

## Result: the current meaning-check path does not fix the error-correction failures

| | Rules only | Rules + meaning check (stand-in) |
|---|---|---|
| Round 7, error correction (25) | 25/25 | **24/25** (one new over-credit: R7-083 "Can I have the black pen?", reference 0) |
| Round 8, error correction (33) | 27/33 | **27/33** (no change) |

## Why

1. **Production doesn't call the meaning check for many of these answers.** With graderV2 on, `needsAiEvaluation` returns false when the item's word is the target (`spellingIsTarget`), so the key alone decides. The pattern D and C cases R8-033 "My uncle is a bus driver." and R8-058 "My cousin do his homework…" never reach the model.
2. **The prompt judges the whole sentence; the rubric judges the target only.** The production prompt says "reject answers that are … partly wrong". The stand-in therefore rejected R8-002 "for you're teeth" and R8-020 "My mother cook rice", which is right for that prompt. Rubric §2.2 scores only the corrected target, so the reference gives 1.
3. **The 2 over-credits come from the rules** (R8-013 "because of the bus was late", R8-134 "going to repairs"). The rules score 1, so the meaning check is never asked.

## What would be needed (each needs the owner's approval)

- **A target-aware error-correction prompt:** "is the error the item tests corrected, and is the corrected part right? Ignore slips elsewhere." This replaces the generic meaning check for error-correction items only.
- **Calling it for error-correction items even when the word is the target**, with the word-target key check kept for spelling items.
- **Tightening the rules for pattern G**, so that a new error inside the corrected construction scores 0.
- **Then Round 9** (fresh error-correction answers are being written; 3 scorers; blind) to validate the changed path. The pass target stays ≥95%.

Under the plan ("Report the misses. Prompt changes need your OK"), this stops here until the owner decides.

SIMULATION ONLY

# Decision 1A: error correction under the new rubric. Re-score of rounds 8–9 and re-check: 94.1%, just under 95%

**AGENT STAND-IN for the model; no API calls.** The rubric §2.2 changed on 2026-11-17 (owner decision "1A"): the whole rewritten sentence is scored, the target is fixed with the right form, and there is no new mistake; a fragment scores 0.

## Set-up

- **Answers:** the 153 error-correction answers of rounds 8 (33) and 9 (120), re-scored by **3 new independent scorers** under the new §2.2. All 3 agreed on 152 of 153.
- **B2 prompt:** `EC_CHECK_SYSTEM` was aligned with the new rule (whole sentence, no new mistake, no fragments) **before** the stand-in ran. The stand-in saw only question, key and answer.
- **Independence:** the new rubric was chosen after seeing round 9, and the answers are not new, so this is a **re-check, not an independent validation**.

## Result

| Grading | Agreement with the new reference |
|---|---|
| Rules only (graderV2, round-8 fix) | 127/153 = 83.0% (13 too lenient, 13 too strict) |
| **Rules + aligned B2 check (`ENARA_EC_CHECK=on`)** | **144/153 = 94.1%** (round 8: 31/33; round 9: 113/120); **0 too lenient**, 9 too strict |

## The 9 misses (all too strict)

| Cause | n | Examples (reference 1, grader 0) |
|---|---|---|
| The `targetFormMissing` guard overturned the check's "correct" | 7 | "My father works as a cook in a hotel.", "Take an umbrella, it might rain this afternoon.", "Wait a minute, I'm putting on my shoes." |
| The check rejected a correct rewrite | 1 | "My uncle is a bus driver." |
| Rules: exact key only on a case-sensitive item (the check is never called) | 1 | "Excuse me, could you pass me the key, please?" |

**Post-hoc, not valid evidence:** without the guard inside the check, 151/153 (98.7%) would agree. The guard was kept in the round-9 calibration because removing it was neutral then. Under the new rubric it is the main cause of misses. Dropping it is a design change made after seeing this result, so it needs a **fresh round** to count.

## Status

- **Not validated** (94.1% < 95%). B stays stopped; `ENARA_EC_CHECK` stays **off**; production is unchanged.
- **Proposed next step (owner decision):** drop the guard inside the error-correction check only, freeze it, and validate on a **fresh round 11**: 120 new error-correction answers, 3 new scorers under the new §2.2, and a blind stand-in. Target ≥95%.
- **ESL6** is unaffected: error correction is secondary there and B2 is off.

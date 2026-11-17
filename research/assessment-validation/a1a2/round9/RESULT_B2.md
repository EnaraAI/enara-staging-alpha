SIMULATION ONLY

# Option B2 (error-correction check), Round 9: fresh, independent, blind. Result: FAIL

**AGENT STAND-IN for the model, not the production model; no API calls.**

| Error-correction answers (n = 120, all new) | Exact agreement with the reference | Target |
|---|---|---|
| Rules only (graderV2, round-8 fix) | 81.7% (98/120) | ≥95% |
| **Rules + B2 check** (`ENARA_EC_CHECK=on`) | **85.8% (103/120)** | ≥95%: **FAIL** |

## Set-up

- **Answers:** 120 new answers by an agent blind to the grader and to earlier rounds; at least 3 per outcome, all 33 outcomes; 38% partial or debatable.
- **Reference:** 3 new independent scorers; all 3 agreed on 119 of 120.
- **Grading:** the B2 design (prompt `EC_CHECK_SYSTEM` + `targetFormMissing` guard) was **committed and locked (15d3c368) before any round-9 output was read**. The stand-in saw only question, key and answer.
- **Calibration** (rounds 7–8, development data, not independent): round 8 error correction 27/33 → 29/33; round 7 25/25.

## The 17 disagreements: 16 too strict, 1 too lenient

| Cause | n | Examples (reference 1, B2 0) |
|---|---|---|
| `targetFormMissing` guard overturned the check's "correct" | 7 | "My cousin is very tall, so he plays basketball.", "Take an umbrella, it might rain this afternoon.", "My father works as a cook in a hotel." |
| **Fragment answers**: the reference credits a correct fix of the target even when the rest of the sentence is missing (rubric §2.2: score the target only); the prompt treats them as incomplete | 5 | "green eyes", "the salad", "on Saturday", "always eats", "black bag" |
| Correct alternative rewrite rejected | 4 | "My father is not tall.", "Too much sugar is bad for your teeth.", "Tamer is married. His wife she is a teacher." |
| Rules: an alternative polite form not in the key | 1 | "Excuse me, could you pass me the key, please?" |
| **Too lenient** | 1 | "My cousins brought the dogs to the park." (reference 0) |

## Reading

- B2 removes the rules' wrong credits (the round-8 pattern G) and raises agreement by about 4 points, **but it is not validated**.
- Most remaining misses are the reference crediting **fragments** and **loose rewrites**. That is the rubric's own rule (§2.2: score the corrected target only). Whether a fragment like "green eyes" should earn the point on a "rewrite the sentence" item is a **rubric policy question**, not a grader bug.
- Hypothetical, **not a valid result** (computed after seeing round 9): without the guard the flow would score at most 110/120 = 91.7%, still below 95%.

## Status

- **Option B is stopped**, per the plan's rule: no more changes without the owner's decision.
- `ENARA_EC_CHECK` stays **off**; production is unchanged.
- ESL6 is not affected: its primary outcome uses gap-fill and choice items only (option C).

**Limits:** stand-in, not the real model; agent scorers, not human raters; n = 120; the rubric's error-correction rule is lenient by design.

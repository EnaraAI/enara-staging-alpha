SIMULATION ONLY

# Round 11: error-correction check (B2, no guard), fresh, independent, blind. Result: PASS (97.5%)

**AGENT STAND-IN for the model, not the production model; no API calls.** The rubric is §2.2 as changed on 2026-11-17 (decision 1A): the whole rewritten sentence is scored.

| Error-correction answers (n = 120, all new) | Agreement with the reference | Target |
|---|---|---|
| Rules only (graderV2, round-8 fix) | 100/120 = 83.3% | ≥95% |
| **Rules + B2 check (`ENARA_EC_CHECK=on`, no `targetFormMissing` guard)** | **117/120 = 97.5%** | ≥95%: **PASS** |

## Set-up

- **Design frozen before the answers existed:** commit a59e9af8 removes the guard inside the error-correction check (owner decision after round 10).
- **Answers:** 120 new answers by an agent blind to the grader, the design and earlier rounds; all 33 outcomes, 3–4 each; 38% partial or debatable; both sides of the new rule covered (correct rewrites, synonyms and reordering, new mistakes, fragments, meaning changes).
- **Reference:** 3 new independent scorers under the current rubric; **all 3 agreed on 120 of 120**.
- **Grading:** blind. The rules decide exact key matches and case-sensitive items (52); the stand-in check decides the rest (68), seeing only question, key and answer, with the production prompt (`EC_CHECK_SYSTEM`).

## The 3 disagreements

| Answer | Reference | B2 | Note |
|---|---|---|---|
| R11-063 "Our town has a big hospital." | 0 | 1 | Target avoided (rule 3); the check judged the meaning |
| R11-116 "We have no water in the car." | 0 | 1 | Target avoided |
| R11-010 "The new school year begins in October." | 1 | 0 | A synonym on a case-sensitive item, so the rules decide by the key only |

## Status and limits

- **Validated with an agent stand-in only.** The real model has not been tested; doing that needs the owner's OK and an API key.
- `ENARA_EC_CHECK` stays **OFF**. Production is unchanged until the owner decides.
- Limits: agent scorers, not human raters; n = 120. Rounds 9–10 showed earlier designs failing, and this design was chosen after round 10, which is why round 11 is fresh.

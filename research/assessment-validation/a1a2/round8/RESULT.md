SIMULATION ONLY

# Round 8: fresh, independent re-check of the grader (graderV2 ON, deterministic path)

**Verdict: FAIL on controlled items. ESL6 stays stopped.** No more grader fixes without Mohamed's approval (plan, step 5).

| | Result | Target |
|---|---|---|
| **Controlled / exact items (75)** | **89.3% (67/75)** | ≥95%: **FAIL** |
| Free/transfer items (75), QWK | 0.891 | ≥0.80: pass |

## Set-up

- **Answers:** 150 new answers covering all 33 outcomes (at least 4 per outcome), written by an agent that could not see the grader, the fix or rounds 1–7.
  - 75 exact and 75 scored 0/1/2.
  - 35% full credit, 33% partial or debatable, 32% zero.
- **Reference:** 3 new independent agent scorers, majority vote. All 3 agreed on 147 of 150 answers; there were no three-way splits.
- **Grader:** run blind, with the round-8 fix (branch `claude/grader-round8`).
- **Overlap:** 5 of 150 answers repeat a round-7 answer to the same item. None is one of the fixed cases.

## The round-8 fix had no effect on this set

The pre-fix and post-fix graders give **identical scores on all 150 answers** (`GRADER_DET_prefix.json` vs `GRADER_DET.json`). None of the new answers used the two fixed patterns. So this round neither confirms nor refutes that fix: it found **new** patterns.

## The 8 controlled disagreements (new patterns)

**Grader too strict (6): reference 1, grader 0.**

| Pattern | Items |
|---|---|
| **C.** Error correction: the target is fixed, but a slip remains **elsewhere** in the sentence (a homophone, or missing agreement -s) | R8-002 "for you're teeth" (target: remove "The"); R8-020 "My mother cook rice…" (target: word order); R8-058 "My cousin do his homework" (target: make → do) |
| **D.** Error correction: a **different but correct** rewrite | R8-033 "My uncle is a bus driver." (key: "a driver for a bus company") |
| **E.** Gap item answered with the **whole sentence** (more than 3 extra words) | R8-088 "I am tired after work today." |
| **F.** Gap answered with a **contraction** of the key | R8-115 "'d" for "would" |

**Grader too lenient (2): reference 0, grader 1.**

| Pattern | Items |
|---|---|
| **G.** Error correction: target fixed, but a **new error inside the target construction** | R8-013 "because of the bus was late" (extra "of"); R8-134 "going to repairs" (base verb wrong after the fix) |

## Free/transfer disagreements (9)

These don't affect the verdict:

| Answer | Reference | Grader |
|---|---|---|
| R8-019 "going to the gym" (target avoided) | 0 | 2 |
| R8-052 "more easy" | 1 | 0 |
| R8-064 "her, his" | 1 | 2 |
| R8-091 | 2 | 1 |
| R8-101 "newer from" | 1 | 0 |
| R8-109 "o'clok" | 1 | 0 |
| R8-111 "The, a" | 1 | 2 |
| R8-112 "many friend" | 1 | 0 |
| R8-117 | 1 | 2 |

## Note

Patterns C and G pull in opposite directions: "a slip outside the target is fine" against "a new error inside the target construction is not". Telling them apart needs a per-item definition of the target construction. Patterns D (alternative correct rewrites) and C are the kind of judgement the plan reserved for the **model path**, which is still **not validated**.

## Limits

- The reference scorers are agents, not human raters.
- n = 75 per group.
- The rules are hand-written.
- Five answers overlap with round 7.

# SIMULATION ONLY

# PLN2k2: kids test re-run with fixes (children under 9): result

20 Nov 2026. Branch `claude/tutor-kids-pack`, protocol amendment I. Same 12 rule-based children as PLN2k, with fixes 1–3 in place. No real learners.

## Verdict: **NOT PASSED**. Listen-and-do now reaches the child, but the simulated child does not learn from it.

| Rule | Result | |
|---|---|---|
| No harm, 7-day delayed test | ON 0.688 vs OFF 0.812, **−0.125** [−0.271, 0.000] | **Fail** |
| Fit: ON ≥ OFF | 1.86 vs 0.22 (story/chant 1.92 vs 0; steps 2.00 vs 0; child tone 1.67 vs 0.67) | Pass |
| Guard: stuck learners | 0 vs 0 | Pass |
| Guard: independent correct (rate) | ON 12/29 (0.41) vs OFF 36/55 (0.65) | **Fail** |
| Guard: early answer leaks | ON 2 vs OFF 0 | **Fail** |
| Judge agreement | Events 94.7%; fit 85.3% (amendment E) | Pass |

Other results:
- Wrong-belief strength after round 7: ON 2.75, OFF 2.00. In PLN2k, before the fixes, ON was 1.67.
- Immediate test: −0.125. Use (own sentences): −0.069.
- Grader recheck: 100% on gap-fill and choice items.

## What it shows

1. **Fixes 1 and 2 work in the tutor.** 51 of 84 ON replies were listen-and-do (PLN2k: 7). The fit judges now see the story or chant and one action at a time.
2. **The simulated child learns only from teaching and graded practice.** It has a wrong rule that changes only through events such as a rule, a model or a corrected answer. Stories, actions and chants count for nothing. So ON lost about 4 of 7 replies of "learning time" in this model. Its wrong-belief score stayed at 3.58 for rounds 1–3 and only moved at the chant and the check.
3. **Fewer graded tries means fewer independent correct answers** (29 first tries vs 55), so that guard fails for the same reason.
4. **The 2 early "leaks" are the lesson itself.** Both come from the "can" lesson: the command "Say she can swim." and the chant "She can swim, he can jump". They model the right form, which is also the answer to a test item. Listen-and-do models the right form by design. So for the kids pack, the test items and the lesson lines must not share sentences. That is a content fix.

## What this means for a decision

- The simulation cannot judge listen-and-do for young children. It can only show whether the content reaches the child, and it now does.
- **Real evidence has to come from real children.** Run a small, supervised lms-test pilot with the kids pack ON for under-9s, and compare it with the current kids app on the same Starters words. The pilot needs your decision, plus a school, parent consent and a teacher check.
- **Until then, a safe default:** keep `kidsPack` off and let planner2c give under-9s present-practise-produce with child supports. That passed in PLN2b (+0.042 delayed, no harm).

Agent runs: 14 Sonnet + 13 Opus.

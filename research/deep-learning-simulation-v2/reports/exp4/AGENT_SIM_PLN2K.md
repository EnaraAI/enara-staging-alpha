# SIMULATION ONLY

# PLN2k: kids-pack listen-and-do test (children under 9): result

20 Nov 2026. Branch `claude/tutor-kids-pack`. Protocol amendment G (plus H for the independent-correct measure). The run used 12 rule-based children under 9: OFF (today) vs ON (planner2c + kids pack, with all 12 objectives linked to a reviewed listen-and-do lesson). Tutors were Sonnet; judges were Opus. No real learners.

## Verdict: **NOT PASSED**, and the main finding is that listen-and-do was not delivered

| Rule | Result | |
|---|---|---|
| No harm, 7-day delayed test | +0.042 [0.000, +0.125] (OFF 0.812, ON 0.854) | Pass |
| Fit: ON ≥ OFF | Own rubric 0.53 vs 0.33 | Pass |
| Guard: stuck learners | 0 vs 0 | Pass |
| Guard: independent correct (amendment H) | ON 35/55 vs OFF 33/55 | Pass |
| Guard: early answer leaks (ON ≤ OFF) | ON 6 vs OFF 4 | **Fail** |
| Judge agreement | Events 89.5%; fit 85.3% (amendment E) | Pass |

Wrong-belief strength after round 7: ON 1.67, OFF 2.08 (ON without the kids pack, from PLN2b: 2.08). Use (own sentences) +0.028. Grader recheck: 100% on gap-fill and choice items.

## What actually happened

1. **The tutor did not tell the stories, give the commands or say the chants.**
   - The ON prompt had the right stage lines (for example "Stage Listen: tell this story…").
   - But the language engine in the same prompt also set a lesson exercise ("Write a or an: …") with its hidden marker, and the tutor followed the exercise.
   - Only 7 of 84 ON replies used any listen-and-do words, and the fit judges scored story/chant 0.00 in both arms.
   - So the ON gain (1.67 vs 2.08) comes from planner2c's stages and child supports (praise for effort, child tone 1.00 vs 0.67), not from the kids pack.
2. **Early answer leaks, 6 vs 4.**
   - 3 per arm are on the same capitals turns. The tutor repeats the child's correct sentence, which the detector counts as a leak. That is a detector quirk, the same in both arms.
   - The real difference is 3 vs 1 (the a/an and am/is/are lessons, in the "do" stage). The do-stage line I wrote says "if not, say the word again slowly". That asks for the answer and conflicts with "answer only after two tries".

## Proposed fixes (no runs until your "go")

1. **Listen-and-do replaces the exercise.** When the shape is listen-and-do and a kids lesson exists:
   - the language engine sets no lesson exercise;
   - the stage line becomes an override, like the quick check: "This reply is the story / one command / the chant. This overrides any instruction above to give an exercise."
   - The check stage keeps one exercise, so learning is still measured. This needs code and tests.
2. **The do-stage hint follows the answer rule.** "If not, give a hint (show the picture, say the first sound); say the word only after two tries."
3. **The leak detector ignores an echo** of the child's own correct sentence. This is code only; re-score PLN2b, PLN2c and PLN2k on the existing transcripts.
4. **Then re-run this kids test** (same 12 children, about 25 runs) before the final 48-learner run. Or fold it into the final run, which saves about 25 runs but means one fewer check.

Limit: the simulated child learns from items (wrong beliefs per grammar point). A story or chant that works in real life may show little effect here. Real children on lms-test are the true check.

Agent runs: 2 lesson runs (writer, reviewer) + 14 Sonnet tutors + 13 Opus (7 judges, 1 agreement, 2 fit, 1 fit agreement, 2 recheck).

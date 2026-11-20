# SIMULATION ONLY

# PLN2g: re-check of the planner2e fixes on the 27 affected learners

20 Nov 2026. Branch `claude/tutor-kids-pack`, protocol amendment K. Planner ON only, `planner2-v6`. The 27 learners are:
- learner 2035 (stuck on empty answers);
- the item-repeat sessions;
- the sessions with a lower "teacher would accept" score;
- the planner-on sessions that had a false "wrong" pair.

Same seeds and 7 rounds as PLN2f, compared with the same learners' planner-on sessions in PLN2f. This is a descriptive check, not a pass/fail verdict. Tutors were Sonnet; judges and checkers were Opus. No real learners.

| Measure (same 27 learners, planner ON) | PLN2f | PLN2g |
|---|---|---|
| False "wrong" examples in replies (code check) | 23 of 40 pairs | **0 of 28** |
| Same, by an independent Opus check | — | 1 good English + 1 borderline of 28. The code check missed the one ("You have these shoes in black."); it now catches it and the rule is fixed |
| Two tasks in one reply (second task added by the system) | 5 | **0** |
| Garbled own-sentence ask ("using Uses …") | 1 | **0** |
| Lesson item named again after it was answered | 2 | **0** (one tutor-written frame reused with a new clue, not a lesson item) |
| Stuck learners | 1 (2035) | **0** |
| "Teacher would accept" (0–2) | 1.00 | **1.44** (adults 0.88 → 1.62; under-9 0.78 → 1.22; teens 1.50 → 1.67; 9–12 1.00 → 1.25) |
| Immediate test | 0.889 | 0.914 |
| 7-day delayed test | 0.833 | 0.852 (2 learners better, 1 worse) |
| Rejected judge events | 0 | 0 |

## Notes
- **Learner 2035.** No longer stuck: the answer was given after two wrong tries. But in this run the child gave words, not empty answers. The empty-answer rule was not exercised here; it is covered by its unit test only.
- **New small issue from fix D.** "Accept a correct word, **then show the lesson word**" led to confusing lines such as "the lesson word is pen" after a right answer (4 sessions).
  - Proposal: drop "then show the lesson word"; accept the word and move on.
  - Not changed yet.
- **Other judge reservations** (tutor writing, not engine rules):
  - shown models that are themselves wrong ("Pig is big.", misspellings shown as "wrong" examples of spelling);
  - time lessons that don't teach quarter past/to.

Agent runs: 14 Sonnet tutors, 7 Opus judges, 3 Opus fit judges, 4 Opus pair checks (3 before the re-check, 1 on it). Total 28.

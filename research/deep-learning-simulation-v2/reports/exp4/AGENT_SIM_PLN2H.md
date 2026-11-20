# SIMULATION ONLY

# PLN2h: spelling re-check of planner2f (5 learners)

20 Nov 2026. Branch `claude/tutor-kids-pack`, protocol amendment L. Planner ON only, `planner2-v7` (planner2f). These are the 5 learners whose PLN2f lessons showed misspellings as examples: 2006, 2027, 2040, 2043 and 2045. Same seeds and 7 rounds as PLN2f. Tutors were Sonnet; judges and checkers were Opus. Descriptive, not pass/fail. No real learners.

| Measure (same 5 learners) | PLN2f | PLN2g (3 of the 5) | PLN2h |
|---|---|---|---|
| Misspelling shown as a "wrong" example (code check) | 5 of 10 pairs | 3 of 5 | **0 of 11** |
| Other false "wrong" pairs (code check) | 1 | 0 | 0 |
| Same, by an independent Opus check | — | — | 8 real errors, 2 borderline ("This is father."), **1 good English** ("more red"); now caught by code, see below |
| "The lesson word is …" after a right answer | 0 | 1 | **0** |
| Stuck learners / rejected judge events | 0 / 0 | 0 / 0 | 0 / 0 |
| "Teacher would accept" (0–2) | 1.00 (0,1,1,1,2) | 1.33 | 1.00 (1,1,1,1,1) |
| Immediate test | 0.917 | 0.833 | 0.817 |
| 7-day delayed test | 0.750 | 0.722 | 0.683 |

## Notes
- **The spelling fix works.** No misspelling was shown as an example. Misspellings are still quoted, but only as the learner's own answer when giving feedback ("you wrote 'biger'"), which is intended.
- **Tests are lower because of one learner.** Four learners scored the same as in PLN2f. Learner 2006 dropped from 0.83 to 0.50 on the delayed test. In turn 2 the tutor turned away the learner's spelling question ("our task is about writing a comparison sentence"). In turn 3 it said "Good" to a sentence with "biger" before asking for a check. So fewer items were practised. That is tutor writing, not an engine rule. With 5 learners this is within noise, but it should be watched.
- **New code rule from the Opus check.** "My bag is more red than your bag." is good English. Adjectives that take both forms (red, quiet, clever, polite, simple …) are now never shown as a "wrong" example (`both_comparatives_ok`, with a test). One-way adjectives ("more hot", "more fast") are still real errors.
- **The borderline pair** "This is father." is fine only as a name ("This is Father."). It is left as a real error for children's family lessons.
- **Other teacher remarks** (tutor writing):
  - explanations are long for a 10-year-old;
  - the -es ending was missing from one presentation;
  - one vocabulary lesson was thin.

Agent runs: 7 Sonnet tutors, 7 Opus judges, 1 Opus fit judge, 1 Opus pair check. Total 16.

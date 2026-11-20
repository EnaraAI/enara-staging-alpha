# SIMULATION ONLY

# PLN2i: re-check of the planner2g tutor-writing fixes (5 learners)

20 Nov 2026. Branch `claude/tutor-kids-pack`, protocol amendment M. Planner ON only, `planner2-v8` (planner2g). The 5 learners are the same as in PLN2h: 2006, 2027, 2040, 2043 and 2045. Same seeds, 7 rounds. Tutors were Sonnet; judges and checkers were Opus. Descriptive only, not pass/fail. No real learners.

| Measure (same 5 learners) | PLN2f | PLN2h | PLN2i |
|---|---|---|---|
| Bare "Good." next to an error | 0 | 1 | **0** |
| Learner's question turned aside | 0 | 1 | **0** |
| Rule for 2043 names -s and -es | no | no | **yes** |
| Misspelling shown as an example | 5 | 0 | **0** |
| Good-English "wrong" example (Opus check) | — | 1 of 11 | **0 of 8** (1 borderline: "This is father.") |
| Stuck learners / rejected judge events | 0 / 0 | 0 / 0 | 0 / 0 |
| "Teacher would accept" (0–2) | 1.00 | 1.00 | **1.40** (2043 and 2045 got 2) |
| Immediate test | 0.917 | 0.817 | **0.900** |
| 7-day delayed test | 0.750 | 0.683 | **0.750** (learner 2006 back to 0.83) |

## Notes
- **Children's explanation length: not fixed.** Average reply length for the 4 children barely changed (for example, the 10-year-old: 43.0 → 44.7 words). The prompt rule alone does not shorten replies. Options: a lower word limit for children (a length-table change), or a code trim of the explanation part. Not done yet; it needs your decision because it changes all child replies.
- **New teacher remarks:**
  - 2006: two instructions in one reply ("resend" plus "write about a place"). The second looks like the engine's closing line; to be checked.
  - 2040: the Right/Wrong pairs were about articles ("This a pen") while the learner's errors were spellings.
  - 2027: almost all writing for a 6-year-old.

Agent runs: 7 Sonnet tutors, 7 Opus judges, 1 Opus fit judge, 1 Opus pair check. Total 16.

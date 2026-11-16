# Round 6 fix: irregular forms in the graderV2 target-form scorer

**SIMULATION ONLY / DRAFT.** No API calls, no git, no sub-agents. graderV2 OFF unchanged (parity tests pass).

## Cause
The third-person rule (`he/she/it + verb-s/-es` in `backend/src/services/graderV2.ts`) skipped any verb that is in `AUX` or `BE`. `does`, `has` and `is` are in those sets, so a sentence whose only verb was one of them had no counted form and scored 0. This is why the bank key of `EN-F-A2-GR-third-person-s-C-9` ("Karim does his homework at home.") scored 0/2. `goes` already worked.
The audit found two more gaps of the same kind. Irregular plurals were not seen as plurals: `many teeth`, `many feet` and `many mice` scored 0 (much/many), and `The children are …` and `The men are …` scored 0 (copula).

## Fix (graderV2.ts only)
- New sets: `IRREG_3SG` = does, goes, has, is. `BASE_3SG_WRONG` = do, have, are. `IRREG_PL` = children, men, women, people, teeth, feet, mice.
- Third-person rule:
  - `does`, `goes`, `has` and copula `is` after a third-person subject count as right.
  - `is` + a verb (`is play`, `is playing`) keeps the old path (0), so it does not earn credit.
  - `do`, `have` and `are` after a third-person subject count as wrong, except after an auxiliary (`Does he have …?`).
- much/many: a noun in `IRREG_PL` after `many` counts as a plural.
- Copula: a subject in `IRREG_PL` counts as plural.

## Audit: the scorer run on correct examples before the fix
| Form | Example (correct) | Before | After | Action |
|---|---|---|---|---|
| does (3sg) | Karim does his homework at home. / He does … | 0 | 2 | fixed |
| has (3sg) | She has a red car. / My sister has two cats. | 0 | 2 | fixed |
| is (3sg, copula) | She is a teacher. / It is cold today. / Omar is happy and plays football. | 0 | 2 | fixed |
| goes (3sg) | He goes to school by bus. | 2 | 2 | none |
| irregular past | went, saw, bought, had, did, ate, took, came (8 sentences) | 2 | 2 | none |
| plurals after many | children, men, women, people | 2 | 2 | none |
| plurals after many | teeth, feet, mice | 0 | 2 | fixed |
| copula + irregular plural | The children are happy. / The men are tall. | 0 | 2 | fixed |
| copula + singular name | Karim is my brother. | 2 | 2 | none |
| comparatives | better than, worse than, farther than, further than (adjacent) | 2 | 2 | none |
| comparatives | Alex lives further from school than me. | 0 | 0 | not changed: "than" must follow the adjective directly, for every adjective. This is about word position, not the irregular form. |
| superlatives | best/worst | n/a | n/a | not changed: no outcome tests superlatives (the comparatives bank keys are all -er/more). |

Wrong forms after the fix: `Karim do …` 0, `He have a car.` 0, `He go to school.` 0, `She is play football.` 0, `He is playing football.` 0, `The people is nice.` 0 (it was 2), `goed` 0. `Does she like tea?` is unchanged (0).
Wrong forms that are not touched: `many mices` and `many childs` still score 2. They are not correct answers, so they are outside the fix scope.

## Tests (`backend/test/graderV2.test.ts`, block "round-6 fix", 5 tests, new sentences)
- C-9: `Karim does his homework at home.` → 2; `Karim do his homework` → 0.
- has/have: `My cousin has a small garden.` → 2; `My cousin have a small garden.` → 0.
- Copula `is`: `My teacher is very kind.` → 2. Two guards: `She is cook dinner.` → 0, and `Does he have a bike?` → 0.
- Plurals: `The baby has many teeth now.` → 2; `A spider has many feet.` → 2; `We found many rice in the box.` → 0.
- Copula with an irregular plural: `The women are at the market.` → 2; `The children is in the garden.` → 0.

## Test results and failures
- graderV2, the parity tests (graderV2Parity, esl5OffParity, levelExplicitOffParity) and assessment*: 8 files, 176/176 pass. `tsc --noEmit` is clean.
- Full backend suite: 2064 tests, 16 failed. These are the 16 known base failures, in 11 files:
  - elie.e2e;
  - elie.sprint4;
  - p14_2GradingTestSpend (2);
  - p14_8BlockerFixes;
  - p19Resilience;
  - p20QueryBudget;
  - p2Documents (2);
  - p3EducatorChat;
  - phase0 (2);
  - phase3.autograding (3);
  - phase3.e2e.

## Re-check A: ESL6 answer check
Command: `research/deep-learning-simulation-v2: npx tsx src/offline/esl6Study.ts answercheck` (PROTOCOL.md §7). It rewrites `config/agent_sim_esl6/ANSWERCHECK.json`.
- Before the fix: 1 failure (C-9: the key scores less than full).
- After the fix: 810 items, 810 keys and 753 wrong strings checked. **0 failures, pass = true.**
- The graderBlind list is unchanged: the same 15 entries, with the same items, beliefs and points.
- C-9:
  - key `Karim does his homework at home.` = 2/2;
  - `He does his homework at home.` = 2/2;
  - planted W1 `Karim do his homework at home.` = 0;
  - planted W2 `Karim dos his homework at home.` = 1.

## Re-check B: round-5 deterministic grading rerun
`round5/harness5.ts` was run with its output path redirected to `round6/GRADER_DET_round5_rerun.json`. The round-5 files were not changed.
- Diff against `round5/GRADER_DET.json`: **no answer changed score** (0 of 150). No round-5 answer uses one of the fixed forms in a way the old rule missed.
- Against `round5/REFERENCE.json`, using the agreement5.py logic for the deterministic result:
  - exact agreement 96.0% (n = 75), unchanged;
  - free-response QWK 0.914 (n = 75), unchanged.

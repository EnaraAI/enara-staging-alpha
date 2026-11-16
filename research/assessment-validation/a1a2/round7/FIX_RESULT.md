# Round 7 fix: graderV2 target-form scorer (final grader fix)

**SIMULATION ONLY / DRAFT.** No API calls, no git, no sub-agents. Only the graderV2-ON path changed; OFF is identical (parity tests pass).

## Fixes (backend/src/services/graderV2.ts only)
1. **Every verb checked (third-person-s).** New `joinedVerbs3sg`: verbs joined to a he/she/it/name clause by and/then/or/but (with no new subject) are scored too. Base form = wrong, -s/-es or does/goes/has/is = right. A few verbs that are often nouns after "and" (work, dance, park, ...) are skipped. "has ... and go" now scores 1.
2. **"to be" agreement for singular subjects (copula).** The copula rule now checks was/were as well as am/is/are. With I/he/she/it the right past form is was; with we/you/they it is were. A singular subject + are/were is wrong, and + is/was is right. A singular subject is a name (the name lists or a capital letter), or a singular noun after a determiner.
3. **Words between the subject and the verb.** New `subjectHead`: the subject is the head noun before a preposition phrase or a relative clause (in/on/at/with/of/from/near/for/by/behind/under/without/who/that/which/whose). The search stays inside the clause, and the rule falls back to the word just before the verb when it is unsure. Quantifiers before "of" (a lot of, most of) keep the noun after "of". Pronouns before the verb are used directly.
4. **Two-slot transfer/free items (there-is-are).** New `keySlots`: when the key has two there is/are slots and the answer gets one right and leaves the other missing, the score is 1 (rubric §2.4).

## Tests (backend/test/graderV2.test.ts, block "round-7 fix", 5 tests)
- Round-6 sentences: R6-006 → 1, R6-017 → 0, R6-019 → 2, R6-039 → 1.
- Fix 1: "My aunt cooks lunch and cleans the kitchen." → 2; "... and clean the kitchen." → 1.
- Fix 2: "Samir is in the library." → 2; "Samir are ..." → 0; "My sister was at home yesterday." → 2; "My sister were ..." → 0.
- Fix 3: "The books on my desk are new." → 2; "The boy with the dogs are my cousin." → 0.
- Fix 4: "There is a lake and there are three cafes." → 2; "There is a cinema and two lifts." → 1.

## Test results
- graderV2, the parity tests (graderV2Parity, esl5OffParity, levelExplicitOffParity) and assessment*: 8 files, 181/181 pass. `tsc --noEmit` is clean.
- Full backend suite: 2069 tests, 16 failed. These are the 16 known pre-existing failures: elie.e2e, elie.sprint4, p14_2GradingTestSpend (2), p14_8BlockerFixes, p19Resilience, p20QueryBudget, p2Documents (2), p3EducatorChat, phase0 (2), phase3.autograding (3), phase3.e2e.

## Regression checks
- **ESL6 answer check (810 items):** 0 failures, graderBlind 15 (unchanged), pass = true.
- **Round-5 rerun** (`RERUN_round5.json`, compared with round6/GRADER_DET_round5_rerun.json): 1 of 150 scores changed. R5-039 "There is a cinema and two lifts." went from 2 to 1, which matches the reference (1). Exact agreement is 96.0% (n=75, unchanged). QWK went from 0.914 to **0.921** (n=75).
- **Round-6 rerun** (`RERUN_round6.json`, compared with round6/GRADER_DET.json): 4 of 40 scores changed: R6-006 2→1, R6-017 2→0, R6-019 0→2, R6-039 2→1. All 4 now match the reference. Exact agreement is 100% (n=18). QWK went from 0.732 to **1.000** (n=22). 0 disagreements remain.

## Caveat
The round-6 rerun scores the same 40 answers that the fix was designed for, so it is not an independent check. A fresh answer set is needed to confirm the QWK target.

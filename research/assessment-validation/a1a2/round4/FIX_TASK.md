# graderV2 fixes after round 3 (DRAFT) — user-authorised ("if a target is missed, fix the cause")
No API calls, no git, no sub-agents, never print secrets. Changes only on the graderV2-ON path; OFF must stay identical (keep graderV2Parity.test.ts passing).
Read: research/assessment-validation/a1a2/round3/AGREEMENT3.json (disagreements with causes), docs/SCORING_RUBRIC.md, docs/GRADER_FIXES.md, backend/src/services/graderV2.ts.
Round-3 result: deterministic exact 96.0% (pass), free/transfer QWK 0.754 (FAIL). Det+stand-in: exact 90.7% (FAIL), QWK 0.904.
Fix the CAUSES (general rules, not answer-specific patches; do not hard-code round-3 answers):
1. Target-form scorer has no partial credit: an attempted target form with one slip gets 0 (can to swim, watchd, is study, very quite, becuse) — implement the rubric's 1-point rule (target form attempted, recognisable, one slip in the form).
2. Over-credit when the target form is present once but wrong elsewhere in the target: check every occurrence/clause the target applies to (e.g. "he correct it" second verb; "his wife is" subject–verb agreement for copula with plural subject; -s spelling "visites"; doubled consonant "cleanned"; number word spelling "elevn"; "don't never" double negative for frequency adverbs per rubric).
3. Non-sentence answers ("My cousin.") must score 0 where the rubric requires a sentence.
4. Collocation outcomes (make/do): check the verb–noun pair against accepted examples/collocation list; wrong verb → 0.
5. Word-order outcome: add a rule (no fallback) per the rubric.
6. Model-path guard extension: the meaning check must not credit an exact item whose matchingNote marks it case- or spelling-sensitive, or whose target is the word form/spelling itself (capitals, days-months, vocabulary spelling items) — misspellings like "carot", "fourty", "grand father", lowercase "september"/"thursday".
Add tests for each rule in backend/test/graderV2.test.ts using NEW examples (not round-3 answers). Run graderV2 tests, parity tests and the related suites; only the 7 known base failures may remain (5 phase3.autograding/e2e/p19Resilience + 2 phase0 upload links).
Append a "Round-3 fixes" section to docs/GRADER_FIXES.md. Reply briefly: rules changed, tests, parity, base failures.

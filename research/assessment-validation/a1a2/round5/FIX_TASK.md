# graderV2 fixes after round 4 (DRAFT) — user-authorised extra round ("Fix the remaining causes first, then ESL6")
No API calls, no git, no sub-agents, never print secrets. Changes only on the graderV2-ON path; OFF must stay identical (graderV2Parity.test.ts must pass).
Read: round4/AGREEMENT4.json, the "Round 4" section of REPORT.md, docs/SCORING_RUBRIC.md, docs/GRADER_FIXES.md, backend/src/services/graderV2.ts.
Fix the remaining CAUSES with general rules (do not hard-code round-3/4 answers; write tests with NEW examples):
1. Apostrophe-less contractions: "theres", "cant", "dont", "isnt", "Im", "its"(only where unambiguous) normalise to the contracted form on non-punctuation-sensitive items; the model-path guard must not block an answer that matches after this normalisation.
2. Exact error-correction items: target-only scoring — credit when the corrected target segment matches the key's target (from targetForm/matchingNote) and the rest of the sentence differs only by slips outside the target; "longer then" stays debatable → follow the rubric (than is part of a comparative target).
3. Gap items whose answer repeats a subject already shown in the prompt ("I'm reading" when the gap follows "I"): accept if the gap form is right.
4. Comparatives: "more + short adjective" (one-syllable / -y two-syllable) → 0; "more + -er" double comparative per rubric.
5. Frequency adverbs: check position (before main verb, after be/auxiliary); wrong position → 0 or per rubric.
6. some/any: "some" in a yes/no question (non-offer/request) → per rubric.
7. Past simple: check every past verb in the answer (both clauses).
8. Irregular past over-regularisation ("buyed", "goed") → 1 (attempted form, one slip) per rubric; check against rubric text.
9. Possessive adjectives with a named person: if gender cannot be known, do not award 2 on his/her contrast unless the rubric/item provides gender; follow rubric.
10. Spelling slip on the target vocabulary word in a free sentence ("wett") → 1.
Also fix three item-bank targetForm faults (data only, minimal): EN-F-A1-VO-food-drink-C-5 (says "five bananas", item is pepper), EN-F-A2-VO-jobs-workplaces-B-5 (says "a pilot", item is driver), and the family/appearance item with targetForm "bald" but key "thin" (find it). Keep all assessment tests passing.
Run graderV2 tests, parity tests, assessment* tests and the whole backend suite; only the 16 known pre-existing failures may remain (list them).
Append "Round-4 fixes" to docs/GRADER_FIXES.md. Reply briefly: rules changed, data fixes, tests, parity, failures.

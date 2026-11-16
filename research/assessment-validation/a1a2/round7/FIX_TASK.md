# graderV2 round-7 fix (FINAL grader fix — user instruction)
No API calls, no git, no sub-agents, never print secrets. Only graderV2-ON path; OFF identical (parity tests pass). Change nothing beyond these 4 causes.
Read round6/AGREEMENT6.json, REPORT.md "Round 6", docs/SCORING_RUBRIC.md, backend/src/services/graderV2.ts.
Fix, with general rules:
1. Check EVERY verb in the sentence for the target form, not only the first (e.g. "has … and go" → slip, 1).
2. "to be" agreement for singular subjects: a name, he/she/it, a singular noun + are/were → wrong; + is/was → right (copula-be and was-were style outcomes).
3. Allow words between the subject and the verb for subject agreement ("The people in my town are…" → right; "The boy with the dogs are…" → wrong). Keep it simple and safe: nearest head noun before a preposition phrase / relative clause.
4. Two-blank (multi-slot) transfer/free items: one slot right and one wrong → 1 (per rubric).
Tests (backend/test/graderV2.test.ts): the 4 round-6 sentences with the reference scores (R6-006 →1, R6-017 →0, R6-019 →2, R6-039 →1), plus a NEW correct + wrong example per fix.
Run graderV2, parity, assessment* tests and the full backend suite: only the 16 known pre-existing failures may remain (list files).
Regression checks (write to round7/, never overwrite earlier rounds):
- ESL6 safety check on all 810 items: cd research/deep-learning-simulation-v2 && npx tsx src/offline/esl6Study.ts answercheck → report failures (must be 0) and graderBlind count.
- Rerun round-5 (../round5/harness5.ts) and round-6 (../round6/harness6.ts) deterministic grading with ENARA_ENGINE_V2=graderV2 via temporary copies writing to round7/RERUN_round5.json and round7/RERUN_round6.json; list every changed score and recompute exact agreement and QWK vs each round's REFERENCE.json.
Write round7/FIX_RESULT.md (SIMULATION ONLY / DRAFT) and append "Round 7 fix" to docs/GRADER_FIXES.md. Reply briefly with all results.

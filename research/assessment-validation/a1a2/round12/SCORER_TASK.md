SIMULATION ONLY
# Round 12 reference scoring (rubric as of 2026-11-17, §2.2 = decision 1A) (DRAFT, SIMULATION ONLY) — independent scorer N
No API calls, no sub-agents. Do not read git history. Your checkout holds only data/assessments/outcomes/ and docs/; read ONLY data/assessments/outcomes/*.json (each item's prompt, options, key, acceptedAnswers, matchingNote, rubric) and docs/SCORING_RUBRIC.md. Do NOT open docs/GRADER_*.md or docs/GRADING_FOR_OUTCOMES.md.
Score every answer exactly as a trained human rater following docs/SCORING_RUBRIC.md would:
- scoring "exact": 1 or 0. Apply the rubric's rules on case, punctuation, contractions and option letters as the rubric states them; respect matchingNote (case-sensitive items stay case-sensitive). Error correction: §2.2 as now written (whole sentence scored; a fragment or any new mistake = 0).
- scoring "target_form_0_1_2": 0, 1 or 2, scoring the target form only per the rubric.
Write scorer_S<N>.json: [{"answerId","score","note"}] (note: one short reason, required for every non-obvious case). Validate with python3 json.load; reply with counts per score.

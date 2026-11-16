# Round 3 reference scoring (DRAFT, SIMULATION ONLY) — independent scorer N
No API calls, no git, no sub-agents. You may read ONLY: answers.json (this folder), data/assessments/outcomes/*.json (to see each item's prompt, options, key, acceptedAnswers, matchingNote, rubric), and docs/SCORING_RUBRIC.md.
Do NOT open answers_design.json, any other scorer file, anything under backend/, docs/GRADER_*.md, or round1–round5 files and round6/FIX_RESULT.md, round6/GRADER_*.
Score every answer exactly as a trained human rater following docs/SCORING_RUBRIC.md would:
- scoring "exact": 1 or 0. Apply the rubric's rules on case, punctuation, contractions and option letters as the rubric states them; respect matchingNote (case-sensitive items stay case-sensitive).
- scoring "target_form_0_1_2": 0, 1 or 2, scoring the target form only per the rubric.
Write scorer_S<N>.json: [{"answerId","score","note"}] (note: one short reason, required for every non-obvious case). Validate with python3 json.load; reply with counts per score.

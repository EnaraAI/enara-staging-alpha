SIMULATION ONLY
# Round 10 RE-SCORING under the new error-correction rule (rubric §2.2, decision 1A) (DRAFT, SIMULATION ONLY) — independent scorer N
No API calls, no git, no sub-agents. You may read ONLY: answers.json (this folder), data/assessments/outcomes/*.json (to see each item's prompt, options, key, acceptedAnswers, matchingNote, rubric), and docs/SCORING_RUBRIC.md.
Do NOT open answers_design.json, any other scorer file, anything under backend/, docs/GRADER_*.md, or round1–round9 files.
Score every answer exactly as a trained human rater following docs/SCORING_RUBRIC.md would:
- scoring "exact": 1 or 0. Apply the rubric's rules on case, punctuation, contractions and option letters as the rubric states them; respect matchingNote (case-sensitive items stay case-sensitive).
- scoring "target_form_0_1_2": 0, 1 or 2, scoring the target form only per the rubric.
Write scorer_S<N>.json: [{"answerId","score","note"}] (note: one short reason, required for every non-obvious case). Validate with python3 json.load; reply with counts per score.

**Important:** use the CURRENT docs/SCORING_RUBRIC.md. Its §2.2 (error correction) was changed on 2026-11-17: the whole rewritten sentence is scored; a fragment or any new mistake scores 0. Apply §2.2 exactly as now written. All answers in this set are error-correction items (scoring "exact", 0 or 1).

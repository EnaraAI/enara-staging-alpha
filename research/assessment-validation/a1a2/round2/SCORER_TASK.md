# Blind reference scorer task (DRAFT)
You are an independent scorer. Read ONLY /home/user/enara-staging-alpha/docs/SCORING_RUBRIC.md (A1–A2 section) and /home/user/enara-staging-alpha/research/assessment-validation/a1a2/round2/SCORING_INPUT.json. Do NOT open any other file in research/assessment-validation (no reference.json, scorer*.json, results.json, standin*, REPORT.md) or any other scorer's output.
Score every answer by reading it against the item, key, accepted answers, matchingNote and rubric:
- scoring "exact": 1 if acceptable, else 0 (apply matchingNote: case, final punctuation, contractions).
- scoring "target_form_0_1_2": 0 wrong/missing target form, 1 minor slip in the target form, 2 right; ignore errors that are not in the target form.
No scripts for scoring decisions. Write {"scorer":"S<N>","scores":{"<answerId>":score,...}} for all 100 answers to /home/user/enara-staging-alpha/research/assessment-validation/a1a2/round2/scorerS<N>.json and validate with python3 json.load. No API calls, no git, no sub-agents, do not delete files. Reply with the count scored.

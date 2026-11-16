# Independent reviewer task, A1–A2 (DRAFT)
You are one of three independent reviewers. Do NOT open other reviewers' files (research/assessment-review/a1a2/review_R*.json) or docs/ASSESSMENT_REVIEW_LOG.md. No API calls, no git, no sub-agents, do not delete files.
Read: data/outcomes/outcomes.json (A1–A2), data/assessments/outcomes/*.json (all 33), data/assessments/placement/placement.json, docs/SCORING_RUBRIC.md (A1–A2), docs/ENARA_ESL_FRAMEWORK.md §9 (Arabic-L1 errors). Use your knowledge of CEFR descriptors, English Grammar Profile, English Vocabulary Profile, and Cambridge A1 Movers/A2 Key task styles as reference.
Checklist — apply to every outcome and item:
 C1 outcome right for the level?
 C2 item measures the outcome?
 C3 answer key complete (all acceptable answers listed; no wrong ones)?
 C4 parallel forms A/B/C equal in difficulty (per item slot)?
 C5 Arabic-L1 errors realistic?
 C6 rubric clear?
Flag only real problems. Write /home/user/enara-staging-alpha/research/assessment-review/a1a2/review_R<N>.json:
{"reviewer":"R<N>","flags":[{"target":"<item id or outcome id or 'rubric:<type>' or 'placement:<item id>'>","check":"C1..C6","problem":"...","fix":"..."}],"passed_note":"..."}
Validate with python3 json.load. Reply with the flag count by check.

# CEFR level check (DRAFT) — independent reviewer N
No API calls, no git, no sub-agents. Do not edit outcomes.json or any level. Do not open other CEFR_check_R*.json.
For each outcome: EN-F-A2-GR-third-person-s, EN-F-A2-GR-present-continuous, EN-F-A2-FN-polite-requests —
read its entry in data/outcomes/outcomes.json (level, reference) and its item file in data/assessments/outcomes/.
Using your knowledge of the English Grammar Profile (EGP, Cambridge) and CEFR Companion Volume, state:
- which EGP points the outcome covers, and the EGP level of each (e.g. A1 "present simple affirmative, third person -s"; A1 "present continuous affirmative"; A2 form-specific points);
- whether the items test the A1 point, the A2 point, or both;
- recommended level (A1 / A2 / split) and confidence (low/med/high). Say clearly that EGP citations are from memory, not a live lookup.
Write research/assessment-review/a1a2/CEFR_check_R<N>.json: {"reviewer":"R<N>","outcomes":[{"id":..,"currentLevel":..,"egpPoints":[{"point":..,"egpLevel":..}],"itemsTest":..,"recommended":..,"confidence":..,"evidence":..}]}. Validate with python3 json.load. Reply in 3 short lines.

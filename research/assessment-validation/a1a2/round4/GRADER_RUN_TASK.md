# Round 3 blind grader run (DRAFT, SIMULATION ONLY)
No API calls, no git, no sub-agents, never print secrets. Do NOT open REFERENCE.json, scorer_S*.json, answers_design.json, or round1/round2/round3 files.
Inputs: answers.json (this folder) and the item files data/assessments/outcomes/*.json.

PATH A — deterministic, graderV2 ON, real grader code:
Write harness4.ts in this folder. For each answer, load its item, build the question object the grader expects (pass the new optional fields acceptedAnswers, matchingNote, targetForm/targetForms, scoring; options for choice items), and call the REAL production grading functions with ENARA_ENGINE_V2=graderV2 set (see docs/GRADER_FIXES.md and backend/src/services/graderV2.ts for which functions and fields). exact items → 0/1; target_form_0_1_2 items → the new target-form scorer 0/1/2; if the code returns "no rule / falls back", record that and the fallback result. Run it (cd backend; npx tsx ../research/... or the repo's way). Output GRADER_DET.json: [{answerId, score, path, note}].
Do not change any grader code. If the harness cannot express an item, record why.

PATH B — model-path AGENT STAND-IN (label it "AGENT STAND-IN — not the production grader"):
For target_form_0_1_2 items and for exact items the deterministic path marks wrong (the misses the production flow would send to the meaning check), apply the grader's OWN eval-v2 prompts exactly (evaluateShortAnswer system prompt and RUBRIC_SYSTEM in backend/src/services/autoGrading.ts / related files) yourself, as the model would, one run per answer, and pass each reply through the real validators (validateShortAnswer, validateProposal, agree as applicable) and then the graderV2 meaning-check guard. Output GRADER_STANDIN.json: [{answerId, score, rawReply, note}].
Reply briefly: counts, fallbacks, any item the harness could not express.

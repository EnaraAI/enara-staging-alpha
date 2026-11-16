# ESL6 PART 1 — learning rules (SIMULATION ONLY)
No API calls, no git, no sub-agents, never print secrets.
Read: config/agent_sim_esl5/LEARNING_RULES.md, PROTOCOL.md, DEVIATIONS.md; reports/exp4/AGENT_SIM_ESL5.md; /home/user/enara-staging-alpha/docs/ENARA_ESL_FRAMEWORK.md (§7 spaced retrieval, §9 L1 errors); /home/user/enara-staging-alpha/data/outcomes/outcomes.json; /home/user/enara-staging-alpha/docs/LEARNING_OUTCOMES.md PART 2 (error-type definitions); /home/user/enara-staging-alpha/research/assessment-review/a1a2/OUTCOME_STATUS.json.

Write config/agent_sim_esl6/LEARNING_RULES.md, first line "# SIMULATION ONLY".
HARD RULE: the rules must contain NO ENARA terms — no product/engine names (ENARA, LE, A0, P+, esl5, levelExplicit, assess marker, selfCheck, graderV2, engine switch names) and no description of either tutor arm. Rules describe learner behaviour only. Add a final self-check line listing the forbidden terms searched for and "0 hits".
1. Keep R1–R7 exactly as in ESL5 (copy wording and parameters; mark "unchanged from ESL5").
2. Extend belief states to every A1–A2 FORM outcome with a lesson and status passed_review_draft (list them; expect 33). For each outcome: the correct belief (one line, the rule a learner holds when right) and 1–2 wrong beliefs taken from its l1ErrorTypes (name the error type, give the belief and one Arabic-L1 learner example). Put the table in the file.
3. Add forgetting rule F1 (between sessions, and between the last session and the delayed test), with every parameter FIXED NOW and the principle cited (framework §7 and the research it names: e.g. forgetting curve/decay, retrieval practice/testing effect, spacing effect, recovery of old responses/proactive interference):
   - correct-belief strength decays by a fixed amount per simulated day unless retrieved that session (give the number, the floor, and how strength maps to answering);
   - a wrong belief that was lowered but not removed partly returns (fixed fraction per day, cap);
   - a retrieval attempt (a recall item answered from memory in a session) slows later decay (fixed multiplier, how many retrievals count, cap).
   Give a worked example: a belief at strength s after session 2, retrieved vs not retrieved, at day 7.
4. State: the delayed post-test (7 days after the last session) is answered from the knowledge state after 7 simulated days of F1; the immediate post-test from the state at the end of session 2; session 2 is 2 days after session 1 (F1 applies between them).
5. Keep the judge clarifications from ESL5 §4–5 where still valid; mark any change.
Also write config/agent_sim_esl6/F1_PARAMS.json (all F1 parameters, machine-readable).
Reply briefly: outcome count, F1 parameters, forbidden-term check.

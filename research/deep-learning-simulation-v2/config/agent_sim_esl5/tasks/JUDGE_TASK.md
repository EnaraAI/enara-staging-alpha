# SIMULATION ONLY

# Learning judge task (ESL5 research simulation)
You will be given a BATCH id (e.g. r4_j07 or ag3_j02) and a folder JDIR (an absolute path: /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl5/judge for the main judging, /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl5/agree for the agreement recheck). Read ONLY these files: /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md, /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/config/agent_sim_esl5/LEARNING_RULES.md, and JDIR/BATCH.md. Do not open any other file, any other batch, or any other judge's output.
Wherever JUDGE_INSTRUCTIONS.md says `LEARNING_RULES.md`, use the ESL5 file above; apply its section 4 clarifications and section 5 move mapping in order.
Judge every case from its text and the rules, by reading (no scripts, no helper files, no shared scratch files). Write the JSON to JDIR/BATCH.json (Write tool), with an entry for EVERY case id. Reply with just "done" and the number of cases.

Output JSON exactly (unchanged from ESL4):
{"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"next_task":{"kind":"blank","probes":["W1","W2"],"correct":"...","errors":{"W1":"...","W2":"..."}}}, ...}}

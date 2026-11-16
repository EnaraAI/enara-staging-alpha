SIMULATION ONLY

# Learning judge task (research simulation, ESL5 validation round 1)
You will be given a BATCH id and a folder JDIR (an absolute path: `.../validation/round1/judgeA` or `.../validation/round1/judgeB`). Read ONLY these files: /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md, /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/config/agent_sim_esl5/LEARNING_RULES.md, and JDIR/BATCH.md. Do not open any other file.
Wherever JUDGE_INSTRUCTIONS.md says `LEARNING_RULES.md`, use the ESL5 file above; apply its section 4 clarifications and section 5 move mapping in order.
Judge every case exactly as JUDGE_INSTRUCTIONS.md says and write the JSON to JDIR/BATCH.json (Write tool), with an entry for EVERY case id. Reply with just "done" and the number of cases.

Output JSON exactly (unchanged from ESL4):
{"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"next_task":{"kind":"blank","probes":["W1","W2"],"correct":"...","errors":{"W1":"...","W2":"..."}}}, ...}}

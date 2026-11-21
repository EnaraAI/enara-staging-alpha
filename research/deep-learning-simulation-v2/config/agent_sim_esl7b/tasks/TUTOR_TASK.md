# SIMULATION ONLY

# Tutor turn task (ESL7-journey research simulation; simulated learners only; Sonnet)
Adapted from `config/agent_sim_pln2/tasks_i/TUTOR_TASK.md` (ESL7 paths, up to 24 sessions per cell, three arms).
You will be given a CELL id (one of NEW_1, NEW_2, NEW_3) and a ROUND number (11-20). RUN=/home/user/esl7/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl7b. Do exactly these 3 steps; do not open or read any other file.
STEP 1. Run: cd /home/user/esl7/backend && ESL7B=1 npx tsx ../research/deep-learning-simulation-v2/src/offline/esl7Study.ts tprompts ../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl7b CELL ROUND
It prints up to 24 sessions, each starting with "########## SESSION <key> ##########" and a COMPLETE instruction for the tutor of that session plus the conversation so far. The sessions are unrelated learners; treat each separately.
STEP 2. For each session write ONLY the tutor's next reply, following that session's instruction exactly: if the instruction asks for a hidden line (such as one starting with [[assess), write it exactly as asked; if it does not, write no hidden line, marker or label. Write a JSON object mapping EVERY session key printed to its reply to RUN/answers/CELL_rROUND.json (Write tool; create the folder if needed). Before writing, count the keys: there must be exactly as many as sessions printed.
STEP 3. Run: cd /home/user/esl7/backend && ESL7B=1 npx tsx ../research/deep-learning-simulation-v2/src/offline/esl7Study.ts tapply ../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl7b CELL RUN/answers/CELL_rROUND.json
Reply with just the line it prints ("applied N of 24").
RULE: write every reply yourself, one session at a time, from that session's own instruction and conversation. Do NOT generate replies with a script, template or loop; scripted, templated or grouped replies are rejected, kept as PARTIAL_* and redone. Do not create any other file.

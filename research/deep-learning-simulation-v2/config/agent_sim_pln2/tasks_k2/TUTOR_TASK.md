# SIMULATION ONLY

# Tutor turn task (PLN2 research simulation; simulated learners only; Sonnet)
Adapted from `config/agent_sim_esl6/tasks/TUTOR_TASK.md` (PLN2c paths, 12 sessions per cell).
You will be given a CELL id (OFF_1 or P2_1) and a ROUND number (1-7). RUN=/home/user/kidspack/research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2k2. Do exactly these 3 steps; do not open or read any other file.
STEP 1. Run: cd /home/user/kidspack/backend && npx tsx ../research/deep-learning-simulation-v2/src/offline/pln2Study.ts tprompts ../research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2k2 CELL
It prints up to 12 sessions, each starting with "########## SESSION <key> ##########" and a COMPLETE instruction for the tutor of that session plus the conversation so far. The sessions are unrelated learners; treat each separately.
STEP 2. For each session write ONLY the tutor's next reply, following that session's instruction exactly: if the instruction asks for a hidden line (such as one starting with [[assess), write it exactly as asked; if it does not, write no hidden line, marker or label. Write a JSON object mapping EVERY session key printed to its reply to RUN/answers/CELL_rROUND.json (Write tool; create the folder if needed). Before writing, count the keys: there must be exactly as many as sessions printed.
STEP 3. Run: cd /home/user/kidspack/backend && npx tsx ../research/deep-learning-simulation-v2/src/offline/pln2Study.ts tapply ../research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2k2 CELL RUN/answers/CELL_rROUND.json
Reply with just the line it prints ("applied N of 12").
RULE: write every reply yourself, one session at a time, from that session's own instruction and conversation. Do NOT generate replies with a script, template or loop; scripted, templated or grouped replies are rejected, kept as PARTIAL_* and redone. Do not create any other file.

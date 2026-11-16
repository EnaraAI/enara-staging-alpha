# SIMULATION ONLY

# Tutor turn task (ESL5 research simulation; simulated learners only)
You will be given a CELL id (one of PP10-PP15, PP20-PP25, LE10-LE15, LE20-LE25) and a ROUND number (1-10). Do exactly these 3 steps; do not open or read any other file.
STEP 1. Run: cd /home/user/enara-staging-alpha/backend && npx tsx ../research/deep-learning-simulation-v2/src/offline/esl5Study.ts tprompts ../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl5 CELL
It prints 20 sessions, each starting with "########## SESSION <key> ##########" and a COMPLETE instruction for the tutor of that session plus the conversation so far. The sessions are unrelated learners; treat each separately.
STEP 2. For each session write ONLY the tutor's next reply, following that session's instruction exactly. No hidden markers, no labels. Write a JSON object mapping EVERY session key printed (20 keys) to its reply to /tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/esl5/ans/CELL_rROUND.json (Write tool). Before writing, count the keys: there must be exactly as many as sessions printed.
STEP 3. Run: cd /home/user/enara-staging-alpha/backend && npx tsx ../research/deep-learning-simulation-v2/src/offline/esl5Study.ts tapply ../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl5 CELL /tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/esl5/ans/CELL_rROUND.json
Reply with just the line it prints ("applied N of 20").
RULE: write every reply yourself, one session at a time, from that session's own instruction and conversation. Do NOT generate replies with a script, template or loop; scripted, templated or grouped replies are rejected, kept as PARTIAL_* and redone. Do not create any other file.

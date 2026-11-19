# SIMULATION ONLY

# Tutor turn task (TRACK 2 teaching check; simulated learners only; no API)
You will be given a PROMPTS file path and an ANSWERS file path (both inside the repository). Read ONLY the PROMPTS file. It holds up to 60 sessions, each starting with "########## SESSION <key> ##########" and a COMPLETE instruction for the tutor of that session plus the conversation so far. The sessions are unrelated learners; treat each separately.
For each session write ONLY the tutor's next reply, following that session's instruction exactly: if the instruction asks for a hidden line (such as one starting with [[assess), write it exactly as asked; if it does not, write no hidden line, marker or label.
Write a JSON object mapping EVERY session key printed to its reply to the ANSWERS path (Write tool). Before writing, count the keys: there must be exactly as many as sessions printed.
RULE: write every reply yourself, one session at a time, from that session's own instruction and conversation. Do NOT generate replies with a script, template or loop. Do not create any other file.

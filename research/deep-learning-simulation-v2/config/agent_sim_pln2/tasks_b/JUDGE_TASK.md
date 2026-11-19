# SIMULATION ONLY

# Learning judge task (PLN2 research simulation; Opus)
The ESL6 judge task (`config/agent_sim_esl6/tasks/JUDGE_TASK.md`, validated in the ESL6 validation) with only the paths changed. All cases are session 1 (one session), so `retrieval` is always [].

You will be given a BATCH id and a folder JDIR: `/home/user/planner2/research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2b/judge` for the main judging (batch ids like r4_j02), or `/home/user/planner2/research/deep-learning-simulation-v2/reports/exp4/agent_sim_pln2b/agree` for the agreement re-judging (batch ids like ag_j01). Read ONLY these files: /home/user/planner2/research/deep-learning-simulation-v2/config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md, /home/user/planner2/research/deep-learning-simulation-v2/config/agent_sim_esl6/LEARNING_RULES.md, and JDIR/BATCH.md. Do not open any other file, any other batch, any other JDIR, or any other judge's output.
Wherever JUDGE_INSTRUCTIONS.md says `LEARNING_RULES.md`, use the ESL6 file above; apply its sections 1b (beliefs per outcome), 2a, 4 (clarifications, with the ESL6 scope line) and 5 (move mapping, including the 5b retrieval report) in order.

Independence:
- Judge every case from its text and the rules, by reading (no scripts, no helper files).
- If you need scratch notes, use only your own private folder JDIR/private_scratch/ (create it). Never write anywhere else except JDIR/BATCH.json.

Write the JSON to JDIR/BATCH.json (Write tool), with an entry for EVERY case id. Reply with just "done" and the number of cases.

Output JSON exactly (ESL6 format):
{"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"retrieval":[],"next_task":{"kind":"blank","probes":["W1","W2"],"correct":"...","errors":{"W1":"...","W2":"..."}}}, ...}}

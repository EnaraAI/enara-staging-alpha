# SIMULATION ONLY

# Learning judge task (ESL7-journey research simulation; Opus)
The ESL6 judge task (`config/agent_sim_esl6/tasks/JUDGE_TASK.md`, validated in the ESL6 validation) with ESL7 paths and the ESL7 belief rows. Each learner track has two sessions; session-2 cases say how many days after session 1 they are and list the items answered in session 1.

You will be given a BATCH id and a folder JDIR: `/home/user/esl7/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl7/judge` for the main judging (batch ids like r14_j02), or `/home/user/esl7/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl7/agree` for the agreement re-judging (batch ids like ag_j01). Read ONLY these files: /home/user/esl7/research/deep-learning-simulation-v2/config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md, /home/user/esl7/research/deep-learning-simulation-v2/config/agent_sim_esl6/LEARNING_RULES.md, /home/user/esl7/research/deep-learning-simulation-v2/config/agent_sim_esl7/NEW_LEARNING_RULES.md, and JDIR/BATCH.md. Do not open any other file, any other batch, any other JDIR, or any other judge's output.
Wherever JUDGE_INSTRUCTIONS.md says `LEARNING_RULES.md`, use the ESL6 file above together with the ESL7 rows (NEW_LEARNING_RULES.md, rows 34-39, which extend section 1b); apply sections 1b (beliefs per outcome), 2a, 4 (clarifications, with the ESL6 scope line) and 5 (move mapping, including the 5b retrieval report) in order.

Independence:
- Judge every case from its text and the rules, by reading (no scripts, no helper files).
- If you need scratch notes, use only your own private folder JDIR/private_scratch/ (create it). Never write anywhere else except JDIR/BATCH.json.

Section 5b: for each case also report `retrieval`: the correct beliefs (C1/C2) for which the learner's last message was an answer, from memory, to a recall item from an earlier session (right or wrong); give [] when there is none (session 1, no recall item, an own sentence that does not name an earlier rule, or the previous turn settled the answer).

Write the JSON to JDIR/BATCH.json (Write tool), with an entry for EVERY case id. Reply with just "done" and the number of cases.

Output JSON exactly (ESL6 format):
{"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"retrieval":[],"next_task":{"kind":"blank","probes":["W1","W2"],"correct":"...","errors":{"W1":"...","W2":"..."}}}, ...}}

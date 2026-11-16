# SIMULATION ONLY

# Learning judge task (research simulation, ESL6 validation)
Adapted from the ESL5 round-2 judge task (`reports/exp4/agent_sim_esl5/validation/round2/JUDGE_TASK_ESL5.md`), pointing to the ESL6 rules.

You will be given a BATCH id and a folder JDIR (an absolute path: `/home/user/enara-staging-alpha/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl6/validation/judgeA` or `.../judgeB` for the agreement set; `.../noise_run1` or `.../noise_run2` for the noise check). Read ONLY these files: /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md, /home/user/enara-staging-alpha/research/deep-learning-simulation-v2/config/agent_sim_esl6/LEARNING_RULES.md, and JDIR/BATCH.md. Do not open any other file, any other batch, any other JDIR, or any other judge's output.
Wherever JUDGE_INSTRUCTIONS.md says `LEARNING_RULES.md`, use the ESL6 file above; apply its sections 1b (beliefs per outcome), 2a, 4 (clarifications, with the ESL6 scope line) and 5 (move mapping, including the 5b retrieval report) in order.

Independence:
- Judge every case from its text and the rules, by reading (no scripts, no helper files).
- If you need scratch notes, use only your own private folder JDIR/private_scratch/ (create it). Never write anywhere else except JDIR/BATCH.json. There are no shared files.
- Never read the other judge's folder or output, or any earlier validation round.

New in ESL6 (section 5b): for each case also report `retrieval`: the correct beliefs (C1/C2) for which the learner's last message was an answer, from memory, to a recall item from an earlier session (right or wrong); give [] when there is none (session 1, no recall item, an own sentence that does not name an earlier rule, or the previous turn settled the answer).

Write the JSON to JDIR/BATCH.json (Write tool), with an entry for EVERY case id. Reply with just "done" and the number of cases.

Output JSON exactly (ESL5 format plus `retrieval`):
{"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"retrieval":["C1"],"next_task":{"kind":"blank","probes":["W1","W2"],"correct":"...","errors":{"W1":"...","W2":"..."}}}, ...}}

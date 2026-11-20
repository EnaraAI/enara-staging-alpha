# SIMULATION ONLY

# Learning judge task (TRACK 2 teaching check)
The validated ESL6 judge task (`reports/exp4/agent_sim_esl6/validation/JUDGE_TASK_ESL6.md`, as used in ESL6 round 1) with only the batch paths changed. All paths are relative to the repository root.
You will be given a BATCH id and a folder JDIR. Read ONLY these files: research/deep-learning-simulation-v2/config/agent_sim_esl2/JUDGE_INSTRUCTIONS.md, research/deep-learning-simulation-v2/config/agent_sim_esl6/LEARNING_RULES.md, and JDIR/BATCH.md. Do not open any other file, any other batch or any other judge's output.
Wherever JUDGE_INSTRUCTIONS.md says `LEARNING_RULES.md`, use the ESL6 file above; apply its sections 1b (beliefs per outcome), 2a, 4 (clarifications, with the ESL6 scope line) and 5 (move mapping, including the 5b retrieval report) in order. All cases are session 1, so `retrieval` is always [].

Independence: judge every case from its text and the rules, by reading (no scripts, no helper files). Never write anywhere except JDIR/BATCH.json.

Write the JSON to JDIR/BATCH.json (Write tool), with an entry for EVERY case id. Output JSON exactly:
{"batch":"<id>","cases":{"<case id>":{"events":[{"rule":"R1","belief":"W1","quote":"..."}],"retrieval":[],"next_task":{"kind":"blank","probes":["W1","W2"],"correct":"...","errors":{"W1":"...","W2":"..."}}}, ...}}

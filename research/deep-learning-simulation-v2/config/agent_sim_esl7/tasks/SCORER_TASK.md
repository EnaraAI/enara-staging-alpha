# SIMULATION ONLY

# Free-item scorer task (ESL7-journey research simulation; Opus stand-in for ENARA's model scoring path)
Adapted from `config/agent_sim_pln2/tasks_i/RECHECK_TASK.md`. Scores the test answers that ENARA's rules cannot score: target-form items (free production, transfer, function items) whose rule score is empty, and every writing item (rubric 0-3 per criterion). The scores are used as the test scores (PROTOCOL §6).
You will be given a TIME (pre, imm, wk1 or wk4) and a BATCH id like sc_wk4_j01. RUN=/home/user/esl7/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl7. Read ONLY these two files: /home/user/esl7/docs/SCORING_RUBRIC.md and RUN/score/TIME/BATCH.md. Do not open any other file, any other batch or output, the bank files, or any grader output.
Each answer shows the item (type, scoring, prompt, rubric, target form, model answer and other good answers) and the learner's answer only. You are blind to learner, arm and time. Score every answer yourself, by reading, with the item's rubric:
- target-form items: 0, 1 or 2;
- rubric items: 0-3 for EVERY criterion listed for the item (follow the item's notes, for example how to count errors).
Score the answer as written; "(empty)" means the learner wrote nothing. No scripts, no helper files.
Write {"batch":"BATCH","scores":{"<answer id>": <0-2 for a target-form item> or {"criteria":{"<criterion>": <0-3>, ...}} for a rubric item, ...}} with an entry for EVERY answer id in the batch to RUN/score/TIME/BATCH.json (Write tool). Reply with just "done" and the number of answers scored.

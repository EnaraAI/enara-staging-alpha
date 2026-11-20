# SIMULATION ONLY: independent reference scorer (ESL7 validation)
You are given a SCORER id (R1, R2 or R3). Read ONLY /home/user/esl7/research/deep-learning-simulation-v2/config/agent_sim_esl7/validation/SCORE_CASES.md. Do not open any other file, and never read another scorer's output.
Score every one of the 60 answers by its own scale (stated at the top of the file), as a careful English teacher of A1-A2 learners would, applying the key and rubric literally. Do not use scripts or loops to score: decide each one yourself.
Write JSON with the Write tool to /home/user/esl7/research/deep-learning-simulation-v2/config/agent_sim_esl7/validation/REF_<SCORER>.json as {"scorer":"<SCORER>","scores":{"V-001":<number>, ...}} with all 60 ids. Reply with one line: done 60.

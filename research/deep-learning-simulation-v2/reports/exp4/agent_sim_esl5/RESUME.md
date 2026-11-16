# SIMULATION ONLY

# ESL5 resume point (clean stop on usage limit)

- Rounds 1-8: complete (tutors, judges, japply, round images). Agreement rechecks done: round 3 96.1%, round 7 (session 2) 95.2%, overall 95.6% (guard pass).
- Round 9: all 24 tutor cells applied; `jprep 9` done (r9_j01..r9_j14 in judge/). Judging stopped on the usage limit; any r9_*.json present above may be partial and must be checked (case ids vs .md) or redone.
- Next steps:
  1. Judge r9_j01..r9_j14 (3 agents: j01-05, j06-10, j11-14), using scratchpad esl5/JUDGE_TASK.md (copy in config/agent_sim_esl5/tasks/).
  2. `japply 9`, `python3 src/offline/esl5_roundimg.py reports/exp4/agent_sim_esl5 9`, commit.
  3. Round 10: 24 tutor cells, jprep 10, judge, japply 10, image.
  4. agreescore, post, tags, rateprep + 12 raters, fidprep + fidelity checkers, esl4_fidelity.py, esl5_analyze.py.
  5. Write reports/exp4/AGENT_SIM_ESL5.md (ESL4 structure + ESL4/ESL5 side-by-side + session-2 turn-type breakdown).
- Deviations so far: config/agent_sim_esl5/DEVIATIONS.md (1-8).

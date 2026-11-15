# SIMULATION ONLY

# ESL4 resume notes

Run every command from `backend/`, using `T="npx tsx ../research/deep-learning-simulation-v2/src/offline/esl4Study.ts"` and `D=../research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl4`.

## Per round R (4–10)

1. Run the 24 tutor cells, at most 3 agents at a time and one cell per agent. The cells are PP10–15, PP20–25, LE10–15 and LE20–25. Give each agent this prompt:
   "Read <scratch>/esl4/TUTOR_TASK.md and follow it exactly with CELL=<cell> and ROUND=R."
2. Check that every session has a reply: `$T status $D` should show 432 sessions in a single state. Redo a cell's missing replies with a new agent, and log the redo in DEVIATIONS.md.
3. `$T jprep $D R`, then give 12 judges (`rR_j01` … `rR_j12`) this prompt:
   "Read <scratch>/esl4/JUDGE_TASK.md … BATCH=rR_jNN JDIR=$D/judge".
4. `$T japply $D R`. The result must say `rejected events 0`.
5. In round 7 only:
   - `$T agreeprep $D 7`;
   - judges `ag7_j*` with `JDIR=$D/agree`.
6. Commit and push.

## After round 10

1. `$T agreescore $D`
2. `$T post $D`
3. `$T tags $D $D/TAGS.json`
4. `$T rateprep $D $D/rate`, then 11 raters (RATE_TASK.md).
5. `$T fidprep $D`, then the fidelity checkers (FID_TASK.md), then `python3 src/offline/esl4_fidelity.py $D`.
6. `python3 src/offline/esl4_analyze.py $D`
7. Update AGENT_SIM_ESL4.md.

## Status

- **Round 3 is the interim look**, archived in `interim_r3/`.
- **Current round:** see the git log.

## Clean stop (usage limit, round 5)

- **Round 5 tutor cells:** 21 of 24 applied.
- **Not finished:** LE23, LE24 and LE25. Their agents hit the usage limit. Rerun each with a new agent; `tprompts` shows only the sessions that still need a reply.
- **Next steps:**
  1. `jprep 5`, then judges r5_j01–j12, then `japply 5`.
  2. Rounds 6–10, including the agreement recheck in round 7.
  3. The final analysis.

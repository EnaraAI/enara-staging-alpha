SIMULATION ONLY

# ESL6: paused after round 2 (2026-11-19, user request)

Amendment A design: one session of 5 rounds, then the 7-day delayed test (PROTOCOL header and §6; DEVIATIONS 4–13).

## Where it is (updated 2026-11-19)
- **Rounds 1–3:** judged and applied, 1,128 sessions each, 0 rejected events.
- **Round-3 agreement:** 95.7% (221/231) in `JUDGE_AGREEMENT.json` (interim).
- **Round 4:** prompt check clean. Tutor cells LE10–LE15, LE20 and LE21 were started; the other 16 have not.
- **Concurrency:** 2 agents at a time (user request: the usage limit is near).

## On resume (round 4)
1. In `answers/`, keep every `<CELL>_r4.json` whose 47 sessions all have a turn-4 tutor reply. Commit those.
2. For any `<CELL>_r4.json` that is not fully applied, re-run `tapply` with that file, or re-run the cell.
3. Run the cells not yet started. Each prompt says the cell has 47 sessions, and that the agent must not save the `tprompts` output to a file.
4. Run `jprep 4` (72 cases per batch, DEVIATIONS 14), then the judges on Opus. Check every batch's count, then `japply 4`. Commit.
5. Round 5 works the same way, plus `agreeprep 5` and its agreement batches.
6. Then everything after round 5, in full: `assess imm`, `f1 7`, `assess del`, the grader recheck (3 scorers), `agreescore`, `tags`, `post`, ratings and the fidelity check, then the analysis.

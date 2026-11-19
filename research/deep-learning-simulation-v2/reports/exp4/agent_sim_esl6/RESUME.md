SIMULATION ONLY

# ESL6: paused after round 2 (2026-11-19, user request)

Amendment A design: one session of 5 rounds, then the 7-day delayed test (PROTOCOL header and §6; DEVIATIONS 4–13).

## Where it stopped
- Rounds 1 and 2: all 24 tutor cells applied and all 32 judge batches applied, for 1,128 sessions. 0 rejected events.
- `status` reads `{"2 replies / 2 judged":1128}`. No round-3 work has started.
- Judge agreement re-judging (rounds 3 and 5) has not run yet.

## On resume (round 3)
1. Run `promptcheck`.
2. Run 24 tutor cells on Sonnet.
   - Each prompt says the cell has 47 sessions.
   - Each prompt says not to save the `tprompts` output to a file.
3. Run `jprep 3`, then the 32 judge batches on Opus.
   - Each prompt states the case count.
   - Check every batch's count before `japply`.
4. Run `agreeprep 3` and its 7 agreement batches.
5. Commit.

Up to 8 agents run at a time (DEVIATIONS 13).

## Early signal (descriptive only, not a result)
Mean W1+W2 for explicit-first learners, lower is better:

| | Start | After round 1 | After round 2 |
|---|---|---|---|
| LE | 2.59 | 1.78 | 1.76 |
| PP | 2.59 | 1.86 | 1.57 |

- After round 2, PP − LE = −0.198, 95% CI [−0.287, −0.111].
- In round 2, LE stated far fewer rules (R1: 45 against PP's 196).

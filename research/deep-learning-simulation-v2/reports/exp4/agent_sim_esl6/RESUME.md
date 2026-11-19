SIMULATION ONLY

# ESL6: restarted under amendment A (2026-11-19)

The earlier run, paused mid round 2 at 950ae1db, is discarded; see DEVIATIONS 4–8.
- **Design now:** one session of 5 rounds, then the 7-day delayed test.
- **Grader:** round-12 fix.
- **Models:** tutors on Sonnet, everything else on Opus.
- **Concurrency:** at most 2 agents at a time.

## Where it is
- See the latest commit on `claude/tutor-esl6`. Each round is committed when it is applied.

## Each round
1. Run `promptcheck`.
2. Run 24 tutor cells, 2 at a time. Each must end with "applied 47 of 47".
3. Run `status`, then `jprep r`.
4. Run 32 judge batches, 2 at a time. Check every batch's case count before `japply r`.
5. In rounds 3 and 5 only, also run `agreeprep r` and its 7 batches.
6. Commit.

## After round 5
1. Run `assess imm`, then `f1 7`, then `assess del`.
2. Run `recheckprep`, then 3 scorers × 32 batches, then `recheckscore`.
3. Run `agreescore`, `tags`, and `post`.
4. Run `rateprep` (29 batches) and `fidprep` (8 batches).
5. Run the analysis, then write the report.

## On a usage-limit stop
- Stop at the end of the current cell or batch.
- Update this file and commit.

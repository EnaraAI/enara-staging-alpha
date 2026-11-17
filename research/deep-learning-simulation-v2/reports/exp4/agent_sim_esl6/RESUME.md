SIMULATION ONLY

# ESL6: paused mid round 2 (2026-11-17)

Paused by Mohamed. LMS and multi-class work come first; ESL6 must not delay them. Do not resume without his OK.

## Where it stopped
- Round 1: complete, judged and applied (commit fd8c3e3d). Grader judged no learner answers in round 1.
- Round 2: tutor replies applied in 15 of 24 cells (PP10–PP15, PP20–PP25, LE10–LE12). Not judged.
  - `answers/LE13_r2.json` was written by an agent that was stopped before `tapply`: **not applied**. Discard it on resume (the cell must be re-run).
  - LE14, LE15, LE20–LE25: not started.
- Exact round-1 state (to undo round 2): `git checkout 6f1f084b -- sessions/` and delete `answers/*_r2.json`.

## Open questions from Mohamed (he will send follow-ups)
1. Round 2 gate: grader must meet the Round 8 bar (controlled ≥95%, no increase in false accepts) before learner answers are graded. Current grader: 89.3% (67/75). Option A (fix grader, amend protocol, re-score pre-test, undo round 2) or B (keep option C). See scratchpad ESL6_ROUND1_ANSWERS.md.
2. R6 examples (7 turns), R5 tracking, worked-example rule.

## On resume
Run `promptcheck` before each round; 3 agents at a time; check every judge batch's case count before `japply`; commit after each round.

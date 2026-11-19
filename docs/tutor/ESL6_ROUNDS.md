# ESL6: 10 vs 5 vs 3 rounds (n = 270). SIMULATION ONLY

19 Nov 2026. Decision needed before Round 1. Nothing has run.

## How the numbers were made
- **Effect and spread:** taken from ESL5's own sessions (108 learners, both arms), using the expected controlled accuracy after round 3, 5 and 10 (`esl6_rounds_power.py`). Round 10 matches ESL5's published result (+0.160).
- **Power:** uses the ESL6 protocol's method:
  - target +0.06 at round 10, scaled by the ESL5 effect at round k;
  - the same judge-noise term (σ 0.155);
  - two-sided, α 0.05, n = 270.
- **Caveat:** ESL5 is a proxy. It had 3 outcomes and an immediate test. ESL6 has 30 outcomes and a delayed test. Treat the power figures as rough.
- **Shape of the shorter runs:** 5 and 3 rounds mean **one session** of 5 or 3 turns, then the 7-day delayed test. That matches the proxy (ESL5 rounds 1–5 were session 1).

## Comparison
| | 10 rounds (as registered) | 5 rounds | 3 rounds |
|---|---|---|---|
| Tutor runs (24 per round) | 240 | 120 | 72 |
| Judge runs (~32 per round) | 320 | 160 | 96 |
| Agreement re-judging | ~14 | ~14 | ~10 |
| Grader recheck (3 scorers, 10% of ~40,600 answers) | ~305 | ~305 | ~305 |
| Raters + fidelity | ~12 | ~10 | ~8 |
| **Total agent runs** | **~890** | **~610** | **~490** |
| Same, with the recheck deduplicated (see below) | ~690 | ~410 | ~290 |
| ESL5 effect at this point | +0.160 | +0.170 | +0.055 (rounds 2–4 average +0.104) |
| **Power** | **0.82** | **~0.91** | **0.19–0.54** |

## What we lose by cutting
- **5 rounds:**
  - no session 2, so no `reviewOpen` (the recall opening);
  - no 2-day gap;
  - we can't show that the lead holds in a second session, which was ESL5's key fix over ESL4;
  - the "≥85% agreement in session 2" guard must become a session-1 guard.
- **5 rounds keeps:**
  - the delayed 7-day test and all 30 outcomes;
  - `releaseAfterTwo`, `ownSentence`, `fadeKnown` and the closing turn, which all fire within 5 messages.

  A plus: less complete teaching eases the ceiling that made the forgetting check fail, so the delayed test may show more.
- **3 rounds:**
  - everything lost at 5 rounds;
  - the closing turn never fires;
  - `ownSentence` and `releaseAfterTwo` fire at most once;
  - `fadeKnown` rarely fires;
  - the ESL5 gap is unstable this early, so power is weak and the result would say little about ESL5.

## Recheck saving (any option)
- Assessment answers are deterministic strings. There are at most 1,563 different item-answer pairs, so most of the 10% sample is repeats.
- Scoring each different pair in the sample once saves about 200 runs.
- Nothing else changes: the same 3 scorers and the same ≥95% target on the primary item types.
- This is a protocol change, so it goes in the protocol and DEVIATIONS before Round 1, like any round cut.

## If rounds are cut
Before Round 1, in one commit, and before any tutor reply:
- update `PROTOCOL.md`: rounds, session shape, agreement round and session-2 guard, F1 timing, power;
- add a DEVIATIONS entry with the reason (usage) and this file's numbers;
- re-run `hashcheck`.

No changes during the run.

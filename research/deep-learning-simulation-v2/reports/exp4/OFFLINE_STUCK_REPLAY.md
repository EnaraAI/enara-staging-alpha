# Offline replay at stuck points: old settings vs new switches (AI tutor + AI raters, no API credit)

*13 Nov 2026. **Approximation, not an experiment.** AI-simulated students only; nothing here is evidence about real learners.*

## What was done
- 18 stuck points from Experiment 5b transcripts (the student's 4th or 5th message, after 2+ recorded misses; spread across the six skill areas). Script: `src/offline/stuckReplay.ts`.
- The REAL engine prompt was rendered twice per point: **old** (no switches) and **new** (`all` plus `closing`, `selfCheck`, `clarity`). The stored transcripts keep only the dialogue, so the engine's history (open item, recorded misses) was **reconstructed**.
- A sub-agent playing the tutor wrote the next reply under each prompt (6 agents, one batch each, never seeing the other version). Three other agents then compared the two replies per case, blind (P/Q scrambled), scoring 1 to 5 (`label_key_P_Q.json` unblinds).

## Results (new minus old, mean over 18 cases, bootstrap 95% CI)
| Criterion | new − old |
|---|---|
| Consolidation (recap / takeaway) | **+1.61** [+1.22, +2.00] |
| Overall | +0.22 [−0.39, +0.78] |
| Helps the student get unstuck | +0.22 [−0.39, +0.78] |
| Clarity | +0.11 [−0.28, +0.56] |
| Answer protection | −0.28 [−0.83, +0.28] |
| Makes the student reason | −0.56 [−1.22, +0.06] |

New reply judged better overall in 11 of 18. Replies asked for the rule "in your own words" in 11 of 18 (new) vs 3 of 18 (old); mean length 64 vs 68 words.

## Reading
1. The closing switch does what it was built for: consolidation rises a lot, and it is the one clear difference.
2. Clarity and overall quality move in the right direction but the intervals include zero. This test cannot show a clarity gain.
3. There is a possible cost: reasoning dropped by about half a point (interval just includes zero). Explaining more means asking less; that is the trade-off to watch.
4. Limits: tutor and raters are AI (same family), reconstructed history, one reply per case (no multi-turn effect), 18 cases, uncorrected. Whether students learn more is untested; Experiment 4 warned that recap-type changes did not raise simulated learning.

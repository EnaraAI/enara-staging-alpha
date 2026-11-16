# Report 1: Overall effectiveness

Experiment smoke-1 · run smoke-1-2026-11-13T13-03-51-839Z

> **SIMULATION ONLY.** Every number below comes from AI-simulated students. It is not evidence that real students learn. Generated from recorded results only.

35 completed blocks, 1 failed/incomplete blocks (failed blocks are listed, never dropped).

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 6 | 50.0% | 25.0% | 16.7% | 20.8% | 16.7% |
| B study notes | 6 | 16.7% | 33.3% | 16.7% | 8.3% | 16.7% |
| C generic AI tutor | 6 | 25.0% | 8.3% | 8.3% | 12.5% | 0.0% |
| D scripted human-like tutor | 6 | 16.7% | 16.7% | 16.7% | 16.7% | 0.0% |
| E ENARA adaptive-teaching ablation | 5 | 40.0% | 20.0% | 20.0% | 35.0% | 0.0% |
| F no-teaching control | 6 | 33.3% | 25.0% | 8.3% | 37.5% | 16.7% |

## Confirmatory contrasts (pre-registered; Holm-adjusted)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs F | gain | 6 | -0.25 | -0.08 | -0.17 [-0.83, 0.38] | -0.39 | 0.7479 | Holm 1.0000 | confirmatory |
| A vs B | post | 6 | 0.25 | 0.33 | -0.08 [-0.40, 0.00] | -0.19 | 1.0000 | Holm 1.0000 | confirmatory |
| A vs C | post | 6 | 0.25 | 0.08 | 0.17 [-0.40, 0.84] | 0.47 | 0.7549 | Holm 1.0000 | confirmatory |
| A vs E | post | 5 | 0.10 | 0.20 | -0.10 [-0.50, 0.50] | -0.36 | 1.0000 | Holm 1.0000 | confirmatory |
| A vs B | transfer | 6 | 0.17 | 0.17 | 0.00 [-0.40, 0.38] | 0.00 | 1.0000 | Holm 1.0000 | confirmatory |

## Exploratory contrasts (not pre-registered; Benjamini-Hochberg q; treat as hypothesis-generating)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs B | gain | 6 | -0.25 | 0.17 | -0.42 [-0.90, 0.25] | -0.74 | 0.1886 | BH 1.0000 | exploratory |
| A vs B | delayed | 6 | 0.21 | 0.08 | 0.13 [-0.38, 0.63] | 0.42 | 0.7486 | BH 1.0000 | exploratory |
| A vs B | mastered | 6 | 0.17 | 0.17 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs B | misconception | 4 | 0.25 | 0.25 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | gain | 6 | -0.25 | -0.17 | -0.08 [-0.83, 0.80] | -0.16 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | transfer | 6 | 0.17 | 0.08 | 0.08 [-0.37, 0.50] | 0.33 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | delayed | 6 | 0.21 | 0.13 | 0.08 [-0.20, 0.42] | 0.28 | 0.7590 | BH 1.0000 | exploratory |
| A vs C | mastered | 6 | 0.17 | 0.00 | 0.17 [0.00, 0.83] | 0.53 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | misconception | 4 | 0.25 | 0.00 | 0.25 [0.00, 1.00] | 0.61 | 1.0000 | BH 1.0000 | exploratory |
| A vs D | gain | 6 | -0.25 | 0.00 | -0.25 [-1.20, 0.40] | -0.53 | 0.7512 | BH 1.0000 | exploratory |
| A vs D | post | 6 | 0.25 | 0.17 | 0.08 [-0.39, 0.50] | 0.22 | 1.0000 | BH 1.0000 | exploratory |
| A vs D | transfer | 6 | 0.17 | 0.17 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs D | delayed | 6 | 0.21 | 0.17 | 0.04 [-0.25, 0.58] | 0.14 | 1.0000 | BH 1.0000 | exploratory |
| A vs D | mastered | 6 | 0.17 | 0.00 | 0.17 [0.00, 0.75] | 0.53 | 1.0000 | BH 1.0000 | exploratory |
| A vs D | misconception | 5 | 0.20 | 0.00 | 0.20 [0.00, 1.00] | 0.57 | 1.0000 | BH 1.0000 | exploratory |
| A vs E | gain | 5 | -0.40 | -0.20 | -0.20 [-1.00, 0.50] | -0.51 | 0.7461 | BH 1.0000 | exploratory |
| A vs E | transfer | 5 | 0.10 | 0.20 | -0.10 [-0.50, 0.50] | -0.36 | 1.0000 | BH 1.0000 | exploratory |
| A vs E | delayed | 5 | 0.15 | 0.35 | -0.20 [-0.50, 0.00] | -0.58 | 0.2505 | BH 1.0000 | exploratory |
| A vs E | mastered | 5 | 0.00 | 0.00 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs E | misconception | 2 | 0.00 | 0.00 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs F | post | 6 | 0.25 | 0.25 | 0.00 [-0.79, 0.81] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs F | transfer | 6 | 0.17 | 0.08 | 0.08 [-0.40, 0.50] | 0.33 | 1.0000 | BH 1.0000 | exploratory |
| A vs F | delayed | 6 | 0.21 | 0.38 | -0.17 [-0.69, 0.39] | -0.51 | 0.5625 | BH 1.0000 | exploratory |
| A vs F | mastered | 6 | 0.17 | 0.17 | 0.00 [-0.80, 0.80] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs F | misconception | 4 | 0.25 | 0.00 | 0.25 [0.00, 1.00] | 0.61 | 1.0000 | BH 1.0000 | exploratory |
| B vs F | gain | 6 | 0.17 | -0.08 | 0.25 [-0.33, 0.88] | 0.59 | 0.4989 | BH 1.0000 | exploratory |
| B vs F | post | 6 | 0.33 | 0.25 | 0.08 [-0.80, 0.83] | 0.19 | 1.0000 | BH 1.0000 | exploratory |
| B vs F | transfer | 6 | 0.17 | 0.08 | 0.08 [-0.38, 0.50] | 0.33 | 1.0000 | BH 1.0000 | exploratory |
| B vs F | delayed | 6 | 0.08 | 0.38 | -0.29 [-0.50, -0.07] | -1.15 | 0.0613 | BH 1.0000 | exploratory |
| B vs F | mastered | 6 | 0.17 | 0.17 | 0.00 [-0.80, 0.80] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| B vs F | misconception | 4 | 0.25 | 0.00 | 0.25 [0.00, 1.00] | 0.61 | 1.0000 | BH 1.0000 | exploratory |
| C vs F | gain | 6 | -0.17 | -0.08 | -0.08 [-0.80, 0.40] | -0.24 | 1.0000 | BH 1.0000 | exploratory |
| C vs F | post | 6 | 0.08 | 0.25 | -0.17 [-0.86, 0.38] | -0.47 | 0.7458 | BH 1.0000 | exploratory |
| C vs F | transfer | 6 | 0.08 | 0.08 | 0.00 [-0.40, 0.38] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| C vs F | delayed | 6 | 0.13 | 0.38 | -0.25 [-0.67, 0.25] | -0.97 | 0.2827 | BH 1.0000 | exploratory |
| C vs F | mastered | 6 | 0.00 | 0.17 | -0.17 [-0.84, 0.00] | -0.53 | 1.0000 | BH 1.0000 | exploratory |
| C vs F | misconception | 4 | 0.00 | 0.00 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | gain | 6 | 0.00 | -0.08 | 0.08 [-0.38, 0.50] | 0.29 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | post | 6 | 0.17 | 0.25 | -0.08 [-0.75, 0.40] | -0.22 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | transfer | 6 | 0.17 | 0.08 | 0.08 [-0.38, 0.50] | 0.33 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | delayed | 6 | 0.17 | 0.38 | -0.21 [-0.63, 0.25] | -0.82 | 0.3825 | BH 1.0000 | exploratory |
| D vs F | mastered | 6 | 0.00 | 0.17 | -0.17 [-0.75, 0.00] | -0.53 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | misconception | 5 | 0.00 | 0.00 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | gain | 5 | -0.20 | -0.10 | -0.10 [-0.50, 0.00] | -0.36 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | post | 5 | 0.20 | 0.30 | -0.10 [-1.00, 0.50] | -0.24 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | transfer | 5 | 0.20 | 0.10 | 0.10 [-0.50, 0.50] | 0.36 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | delayed | 5 | 0.35 | 0.40 | -0.05 [-0.50, 0.50] | -0.16 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | mastered | 5 | 0.00 | 0.20 | -0.20 [-1.00, 0.00] | -0.57 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | misconception | 2 | 0.00 | 0.00 | 0.00 [0.00, 0.00] | 0.00 | 1.0000 | BH 1.0000 | exploratory |

Unit of analysis: student (paired differences across the student's six blocks); intervals: two-way student×outcome cluster bootstrap; p: sign-flip permutation on per-student differences.

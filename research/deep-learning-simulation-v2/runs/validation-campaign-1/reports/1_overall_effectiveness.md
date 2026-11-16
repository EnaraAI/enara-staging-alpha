# Report 1: Overall effectiveness

Experiment validation-campaign-1 · run validation-campaign-1-2026-11-13T13-09-59-708Z

> **SIMULATION ONLY.** Every number below comes from AI-simulated students. It is not evidence that real students learn. Generated from recorded results only.

284 completed blocks, 4 failed/incomplete blocks (failed blocks are listed, never dropped).

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 47 | 35.1% | 33.0% | 23.4% | 32.4% | 10.6% |
| B study notes | 48 | 27.1% | 30.2% | 28.1% | 26.6% | 2.1% |
| C generic AI tutor | 48 | 18.8% | 16.7% | 22.9% | 22.4% | 4.2% |
| D scripted human-like tutor | 48 | 15.6% | 26.0% | 28.1% | 21.9% | 2.1% |
| E ENARA adaptive-teaching ablation | 45 | 22.2% | 32.2% | 33.3% | 30.6% | 6.7% |
| F no-teaching control | 48 | 32.3% | 25.0% | 18.8% | 38.0% | 0.0% |

## Confirmatory contrasts (pre-registered; Holm-adjusted)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs F | gain | 47 | -0.02 | -0.07 | 0.05 [-0.22, 0.32] | 0.15 | 0.5838 | Holm 1.0000 | confirmatory |
| A vs B | post | 47 | 0.33 | 0.29 | 0.04 [-0.18, 0.27] | 0.13 | 0.6357 | Holm 1.0000 | confirmatory |
| A vs C | post | 47 | 0.33 | 0.17 | 0.16 [-0.05, 0.38] | 0.49 | 0.0184 | Holm 0.0920 | confirmatory |
| A vs E | post | 44 | 0.33 | 0.33 | 0.00 [-0.28, 0.28] | 0.00 | 1.0000 | Holm 1.0000 | confirmatory |
| A vs B | transfer | 47 | 0.23 | 0.28 | -0.04 [-0.26, 0.18] | -0.14 | 0.6121 | Holm 1.0000 | confirmatory |

## Exploratory contrasts (not pre-registered; Benjamini-Hochberg q; treat as hypothesis-generating)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs B | gain | 47 | -0.02 | 0.03 | -0.05 [-0.36, 0.24] | -0.14 | 0.6335 | BH 0.8828 | exploratory |
| A vs B | delayed | 47 | 0.32 | 0.26 | 0.07 [-0.12, 0.27] | 0.27 | 0.2377 | BH 0.7603 | exploratory |
| A vs B | mastered | 47 | 0.11 | 0.00 | 0.11 [0.00, 0.29] | 0.48 | 0.0645 | BH 0.5536 | exploratory |
| A vs B | misconception | 34 | 0.09 | 0.06 | 0.03 [-0.20, 0.27] | 0.11 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | gain | 47 | -0.02 | -0.02 | 0.00 [-0.23, 0.26] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | transfer | 47 | 0.23 | 0.23 | 0.00 [-0.23, 0.22] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | delayed | 47 | 0.32 | 0.23 | 0.10 [-0.06, 0.28] | 0.36 | 0.0747 | BH 0.5536 | exploratory |
| A vs C | mastered | 47 | 0.11 | 0.04 | 0.06 [-0.13, 0.28] | 0.24 | 0.4516 | BH 0.8514 | exploratory |
| A vs C | misconception | 37 | 0.14 | 0.05 | 0.08 [-0.15, 0.34] | 0.27 | 0.4495 | BH 0.8514 | exploratory |
| A vs D | gain | 47 | -0.02 | 0.11 | -0.13 [-0.36, 0.11] | -0.36 | 0.0867 | BH 0.5536 | exploratory |
| A vs D | post | 47 | 0.33 | 0.27 | 0.06 [-0.15, 0.30] | 0.19 | 0.4160 | BH 0.8514 | exploratory |
| A vs D | transfer | 47 | 0.23 | 0.28 | -0.04 [-0.26, 0.21] | -0.14 | 0.6210 | BH 0.8828 | exploratory |
| A vs D | delayed | 47 | 0.32 | 0.22 | 0.10 [-0.10, 0.29] | 0.38 | 0.0966 | BH 0.5536 | exploratory |
| A vs D | mastered | 47 | 0.11 | 0.02 | 0.09 [0.00, 0.28] | 0.35 | 0.1274 | BH 0.6016 | exploratory |
| A vs D | misconception | 39 | 0.10 | 0.03 | 0.08 [-0.08, 0.29] | 0.31 | 0.3771 | BH 0.8340 | exploratory |
| A vs E | gain | 44 | 0.00 | 0.10 | -0.10 [-0.39, 0.19] | -0.26 | 0.2952 | BH 0.7603 | exploratory |
| A vs E | transfer | 44 | 0.24 | 0.33 | -0.09 [-0.35, 0.16] | -0.24 | 0.2912 | BH 0.7603 | exploratory |
| A vs E | delayed | 44 | 0.33 | 0.31 | 0.02 [-0.16, 0.21] | 0.09 | 0.7579 | BH 1.0000 | exploratory |
| A vs E | mastered | 44 | 0.11 | 0.07 | 0.05 [-0.13, 0.27] | 0.16 | 0.6990 | BH 0.9583 | exploratory |
| A vs E | misconception | 33 | 0.15 | 0.18 | -0.03 [-0.37, 0.28] | -0.08 | 1.0000 | BH 1.0000 | exploratory |
| A vs F | post | 47 | 0.33 | 0.24 | 0.09 [-0.18, 0.34] | 0.26 | 0.3237 | BH 0.7860 | exploratory |
| A vs F | transfer | 47 | 0.23 | 0.19 | 0.04 [-0.17, 0.26] | 0.14 | 0.5982 | BH 0.8828 | exploratory |
| A vs F | delayed | 47 | 0.32 | 0.38 | -0.05 [-0.28, 0.19] | -0.18 | 0.4430 | BH 0.8514 | exploratory |
| A vs F | mastered | 47 | 0.11 | 0.00 | 0.11 [0.00, 0.29] | 0.48 | 0.0640 | BH 0.5536 | exploratory |
| A vs F | misconception | 34 | 0.15 | 0.06 | 0.09 [-0.18, 0.36] | 0.29 | 0.4608 | BH 0.8514 | exploratory |
| B vs F | gain | 48 | 0.03 | -0.07 | 0.10 [-0.15, 0.34] | 0.30 | 0.2042 | BH 0.7282 | exploratory |
| B vs F | post | 48 | 0.30 | 0.25 | 0.05 [-0.16, 0.26] | 0.18 | 0.4914 | BH 0.8523 | exploratory |
| B vs F | transfer | 48 | 0.28 | 0.19 | 0.09 [-0.13, 0.30] | 0.32 | 0.1775 | BH 0.7184 | exploratory |
| B vs F | delayed | 48 | 0.27 | 0.38 | -0.11 [-0.31, 0.08] | -0.42 | 0.0520 | BH 0.5536 | exploratory |
| B vs F | mastered | 48 | 0.02 | 0.00 | 0.02 [0.00, 0.12] | 0.20 | 1.0000 | BH 1.0000 | exploratory |
| B vs F | misconception | 34 | 0.06 | 0.06 | 0.00 [-0.24, 0.22] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| C vs F | gain | 48 | -0.02 | -0.07 | 0.05 [-0.22, 0.30] | 0.15 | 0.5618 | BH 0.8828 | exploratory |
| C vs F | post | 48 | 0.17 | 0.25 | -0.08 [-0.32, 0.14] | -0.29 | 0.2575 | BH 0.7603 | exploratory |
| C vs F | transfer | 48 | 0.23 | 0.19 | 0.04 [-0.14, 0.26] | 0.14 | 0.5797 | BH 0.8828 | exploratory |
| C vs F | delayed | 48 | 0.22 | 0.38 | -0.16 [-0.36, 0.07] | -0.57 | 0.0165 | BH 0.5536 | exploratory |
| C vs F | mastered | 48 | 0.04 | 0.00 | 0.04 [0.00, 0.17] | 0.29 | 0.5022 | BH 0.8538 | exploratory |
| C vs F | misconception | 38 | 0.05 | 0.05 | 0.00 [-0.23, 0.20] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | gain | 48 | 0.10 | -0.07 | 0.18 [-0.07, 0.45] | 0.57 | 0.0282 | BH 0.5536 | exploratory |
| D vs F | post | 48 | 0.26 | 0.25 | 0.01 [-0.20, 0.20] | 0.04 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | transfer | 48 | 0.28 | 0.19 | 0.09 [-0.10, 0.31] | 0.32 | 0.1523 | BH 0.6813 | exploratory |
| D vs F | delayed | 48 | 0.22 | 0.38 | -0.16 [-0.36, 0.03] | -0.59 | 0.0068 | BH 0.5536 | exploratory |
| D vs F | mastered | 48 | 0.02 | 0.00 | 0.02 [0.00, 0.12] | 0.20 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | misconception | 40 | 0.03 | 0.05 | -0.03 [-0.22, 0.14] | -0.13 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | gain | 45 | 0.10 | -0.08 | 0.18 [-0.10, 0.43] | 0.49 | 0.0404 | BH 0.5536 | exploratory |
| E vs F | post | 45 | 0.32 | 0.27 | 0.06 [-0.21, 0.32] | 0.17 | 0.5757 | BH 0.8828 | exploratory |
| E vs F | transfer | 45 | 0.33 | 0.20 | 0.13 [-0.12, 0.39] | 0.38 | 0.0977 | BH 0.5536 | exploratory |
| E vs F | delayed | 45 | 0.31 | 0.39 | -0.09 [-0.32, 0.13] | -0.32 | 0.2054 | BH 0.7282 | exploratory |
| E vs F | mastered | 45 | 0.07 | 0.00 | 0.07 [0.00, 0.23] | 0.37 | 0.2511 | BH 0.7603 | exploratory |
| E vs F | misconception | 34 | 0.18 | 0.06 | 0.12 [-0.19, 0.40] | 0.36 | 0.2867 | BH 0.7603 | exploratory |

Unit of analysis: student (paired differences across the student's six blocks); intervals: two-way student×outcome cluster bootstrap; p: sign-flip permutation on per-student differences.

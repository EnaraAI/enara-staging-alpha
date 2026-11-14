# Report 1: Overall effectiveness

Experiment validation-campaign-2 · run validation-campaign-2-2026-11-13T13-48-00-827Z

> **SIMULATION ONLY.** Every number below comes from AI-simulated students. It is not evidence that real students learn. Generated from recorded results only.

286 completed blocks, 2 failed/incomplete blocks (failed blocks are listed, never dropped).

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 47 | 37.2% | 52.1% | 35.1% | 44.7% | 25.5% |
| B study notes | 48 | 35.4% | 37.5% | 26.0% | 31.8% | 18.8% |
| C generic AI tutor | 48 | 21.9% | 37.5% | 33.3% | 33.3% | 22.9% |
| D scripted human-like tutor | 48 | 21.9% | 21.9% | 28.1% | 28.6% | 6.3% |
| E ENARA adaptive-teaching ablation | 47 | 13.8% | 39.4% | 42.6% | 41.5% | 17.0% |
| F no-teaching control | 48 | 32.3% | 25.0% | 22.9% | 37.5% | 6.3% |

## Confirmatory contrasts (pre-registered; Holm-adjusted)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs F | gain | 47 | 0.15 | -0.07 | 0.22 [-0.05, 0.52] | 0.54 | 0.0158 | Holm 0.0790 | confirmatory |
| A vs B | post | 47 | 0.52 | 0.37 | 0.15 [-0.15, 0.47] | 0.36 | 0.1360 | Holm 0.4956 | confirmatory |
| A vs C | post | 47 | 0.52 | 0.38 | 0.14 [-0.13, 0.44] | 0.33 | 0.1239 | Holm 0.4956 | confirmatory |
| A vs E | post | 46 | 0.51 | 0.39 | 0.12 [-0.20, 0.39] | 0.30 | 0.2001 | Holm 0.4956 | confirmatory |
| A vs B | transfer | 47 | 0.35 | 0.27 | 0.09 [-0.17, 0.35] | 0.23 | 0.3201 | Holm 0.4956 | confirmatory |

## Exploratory contrasts (not pre-registered; Benjamini-Hochberg q; treat as hypothesis-generating)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs B | gain | 47 | 0.15 | 0.02 | 0.13 [-0.17, 0.43] | 0.28 | 0.2006 | BH 0.4262 | exploratory |
| A vs B | delayed | 47 | 0.45 | 0.31 | 0.14 [-0.09, 0.37] | 0.42 | 0.0489 | BH 0.2078 | exploratory |
| A vs B | mastered | 47 | 0.26 | 0.19 | 0.06 [-0.27, 0.38] | 0.15 | 0.6327 | BH 0.8274 | exploratory |
| A vs B | misconception | 28 | 0.32 | 0.18 | 0.14 [-0.27, 0.52] | 0.32 | 0.3797 | BH 0.6211 | exploratory |
| A vs C | gain | 47 | 0.15 | 0.16 | -0.01 [-0.37, 0.36] | -0.02 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | transfer | 47 | 0.35 | 0.34 | 0.01 [-0.26, 0.28] | 0.03 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | delayed | 47 | 0.45 | 0.34 | 0.11 [-0.11, 0.36] | 0.34 | 0.1405 | BH 0.3740 | exploratory |
| A vs C | mastered | 47 | 0.26 | 0.23 | 0.02 [-0.23, 0.28] | 0.05 | 1.0000 | BH 1.0000 | exploratory |
| A vs C | misconception | 32 | 0.31 | 0.25 | 0.06 [-0.25, 0.42] | 0.14 | 0.7594 | BH 0.9222 | exploratory |
| A vs D | gain | 47 | 0.15 | 0.01 | 0.14 [-0.16, 0.44] | 0.31 | 0.1408 | BH 0.3740 | exploratory |
| A vs D | post | 47 | 0.52 | 0.22 | 0.30 [0.02, 0.54] | 0.81 | 0.0004 | BH 0.0170 | exploratory |
| A vs D | transfer | 47 | 0.35 | 0.29 | 0.06 [-0.20, 0.33] | 0.18 | 0.4930 | BH 0.7342 | exploratory |
| A vs D | delayed | 47 | 0.45 | 0.29 | 0.15 [-0.10, 0.41] | 0.48 | 0.0390 | BH 0.1893 | exploratory |
| A vs D | mastered | 47 | 0.26 | 0.06 | 0.19 [-0.05, 0.45] | 0.53 | 0.0225 | BH 0.1594 | exploratory |
| A vs D | misconception | 32 | 0.34 | 0.03 | 0.31 [0.07, 0.62] | 0.85 | 0.0021 | BH 0.0442 | exploratory |
| A vs E | gain | 46 | 0.13 | 0.25 | -0.12 [-0.47, 0.24] | -0.27 | 0.2990 | BH 0.5524 | exploratory |
| A vs E | transfer | 46 | 0.36 | 0.43 | -0.08 [-0.33, 0.19] | -0.19 | 0.4325 | BH 0.6807 | exploratory |
| A vs E | delayed | 46 | 0.45 | 0.41 | 0.04 [-0.22, 0.26] | 0.11 | 0.6424 | BH 0.8274 | exploratory |
| A vs E | mastered | 46 | 0.26 | 0.17 | 0.09 [-0.20, 0.38] | 0.21 | 0.4634 | BH 0.7033 | exploratory |
| A vs E | misconception | 33 | 0.30 | 0.18 | 0.12 [-0.28, 0.52] | 0.28 | 0.4555 | BH 0.7033 | exploratory |
| A vs F | post | 47 | 0.52 | 0.26 | 0.27 [0.01, 0.50] | 0.72 | 0.0012 | BH 0.0340 | exploratory |
| A vs F | transfer | 47 | 0.35 | 0.23 | 0.12 [-0.15, 0.38] | 0.33 | 0.1889 | BH 0.4225 | exploratory |
| A vs F | delayed | 47 | 0.45 | 0.37 | 0.07 [-0.16, 0.32] | 0.23 | 0.3219 | BH 0.5700 | exploratory |
| A vs F | mastered | 47 | 0.26 | 0.06 | 0.19 [0.00, 0.43] | 0.53 | 0.0117 | BH 0.1243 | exploratory |
| A vs F | misconception | 29 | 0.34 | 0.00 | 0.34 [0.07, 0.67] | 0.99 | 0.0026 | BH 0.0442 | exploratory |
| B vs F | gain | 48 | 0.02 | -0.07 | 0.09 [-0.18, 0.36] | 0.26 | 0.2870 | BH 0.5421 | exploratory |
| B vs F | post | 48 | 0.38 | 0.25 | 0.13 [-0.14, 0.39] | 0.35 | 0.1631 | BH 0.3961 | exploratory |
| B vs F | transfer | 48 | 0.26 | 0.23 | 0.03 [-0.20, 0.27] | 0.09 | 0.7556 | BH 0.9222 | exploratory |
| B vs F | delayed | 48 | 0.32 | 0.38 | -0.06 [-0.26, 0.17] | -0.19 | 0.4158 | BH 0.6668 | exploratory |
| B vs F | mastered | 48 | 0.19 | 0.06 | 0.13 [-0.09, 0.37] | 0.38 | 0.1480 | BH 0.3812 | exploratory |
| B vs F | misconception | 31 | 0.19 | 0.00 | 0.19 [0.00, 0.46] | 0.67 | 0.0306 | BH 0.1785 | exploratory |
| C vs F | gain | 48 | 0.16 | -0.07 | 0.23 [-0.08, 0.54] | 0.53 | 0.0148 | BH 0.1258 | exploratory |
| C vs F | post | 48 | 0.38 | 0.25 | 0.13 [-0.12, 0.37] | 0.34 | 0.1302 | BH 0.3689 | exploratory |
| C vs F | transfer | 48 | 0.33 | 0.23 | 0.10 [-0.15, 0.34] | 0.29 | 0.1985 | BH 0.4262 | exploratory |
| C vs F | delayed | 48 | 0.33 | 0.38 | -0.04 [-0.25, 0.18] | -0.14 | 0.5608 | BH 0.7696 | exploratory |
| C vs F | mastered | 48 | 0.23 | 0.06 | 0.17 [-0.06, 0.43] | 0.48 | 0.0401 | BH 0.1893 | exploratory |
| C vs F | misconception | 36 | 0.22 | 0.00 | 0.22 [0.03, 0.49] | 0.74 | 0.0085 | BH 0.1032 | exploratory |
| D vs F | gain | 48 | 0.00 | -0.07 | 0.07 [-0.13, 0.28] | 0.21 | 0.3202 | BH 0.5700 | exploratory |
| D vs F | post | 48 | 0.22 | 0.25 | -0.03 [-0.23, 0.17] | -0.10 | 0.7292 | BH 0.9115 | exploratory |
| D vs F | transfer | 48 | 0.28 | 0.23 | 0.05 [-0.16, 0.28] | 0.16 | 0.5082 | BH 0.7342 | exploratory |
| D vs F | delayed | 48 | 0.29 | 0.38 | -0.09 [-0.28, 0.11] | -0.30 | 0.1584 | BH 0.3960 | exploratory |
| D vs F | mastered | 48 | 0.06 | 0.06 | 0.00 [-0.18, 0.18] | 0.00 | 1.0000 | BH 1.0000 | exploratory |
| D vs F | misconception | 33 | 0.03 | 0.00 | 0.03 [0.00, 0.18] | 0.24 | 1.0000 | BH 1.0000 | exploratory |
| E vs F | gain | 47 | 0.26 | -0.06 | 0.32 [0.08, 0.58] | 0.91 | 0.0001 | BH 0.0085 | exploratory |
| E vs F | post | 47 | 0.39 | 0.26 | 0.14 [-0.09, 0.38] | 0.40 | 0.0759 | BH 0.2688 | exploratory |
| E vs F | transfer | 47 | 0.43 | 0.22 | 0.20 [-0.05, 0.45] | 0.53 | 0.0141 | BH 0.1258 | exploratory |
| E vs F | delayed | 47 | 0.41 | 0.37 | 0.05 [-0.20, 0.28] | 0.15 | 0.5613 | BH 0.7696 | exploratory |
| E vs F | mastered | 47 | 0.17 | 0.06 | 0.11 [-0.10, 0.36] | 0.33 | 0.2211 | BH 0.4453 | exploratory |
| E vs F | misconception | 34 | 0.18 | 0.00 | 0.18 [0.00, 0.43] | 0.64 | 0.0315 | BH 0.1785 | exploratory |

Unit of analysis: student (paired differences across the student's six blocks); intervals: two-way student×outcome cluster bootstrap; p: sign-flip permutation on per-student differences.

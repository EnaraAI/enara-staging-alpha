# Report 1: Overall effectiveness

Experiment full-experiment-3 · run full-experiment-3-2026-11-13T15-00-55-563Z

> **SIMULATION ONLY.** Every number below comes from AI-simulated students. It is not evidence that real students learn. Generated from recorded results only.

824 completed blocks, 0 failed/incomplete blocks (failed blocks are listed, never dropped).

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 150 | 31.0% | 43.2% | 43.0% | 41.0% | 16.0% |
| B study notes | 150 | 31.3% | 39.3% | 39.2% | 37.0% | 14.0% |
| C generic AI tutor | 150 | 31.3% | 47.5% | 46.2% | 39.0% | 14.7% |
| D scripted human-like tutor | 150 | 27.7% | 28.5% | 29.3% | 28.5% | 6.0% |
| E ENARA adaptive-teaching ablation | 74 | 20.3% | 44.6% | 45.9% | 37.8% | 17.6% |
| F no-teaching control | 150 | 29.2% | 25.3% | 22.8% | 31.7% | 3.3% |

## Confirmatory contrasts (pre-registered; Holm-adjusted)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs F | gain | 50 | 0.12 | -0.04 | 0.16 [0.03, 0.31] | 0.86 | 0.0006 | Holm 0.0030 | confirmatory |
| A vs B | gain | 50 | 0.12 | 0.08 | 0.04 [-0.09, 0.18] | 0.16 | 0.3498 | Holm 1.0000 | confirmatory |
| A vs C | gain | 50 | 0.12 | 0.16 | -0.04 [-0.18, 0.11] | -0.17 | 0.3778 | Holm 1.0000 | confirmatory |
| A vs E | gain | 50 | 0.12 | 0.24 | -0.12 [-0.29, 0.06] | -0.41 | 0.0294 | Holm 0.1176 | confirmatory |
| A vs B | transfer | 50 | 0.43 | 0.39 | 0.04 [-0.12, 0.20] | 0.16 | 0.4235 | Holm 1.0000 | confirmatory |

## Exploratory contrasts (not pre-registered; Benjamini-Hochberg q; treat as hypothesis-generating)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs B | post | 50 | 0.43 | 0.39 | 0.04 [-0.12, 0.19] | 0.15 | 0.4398 | BH 0.5786 | exploratory |
| A vs B | delayed | 50 | 0.41 | 0.37 | 0.04 [-0.10, 0.18] | 0.19 | 0.3329 | BH 0.4878 | exploratory |
| A vs B | mastered | 50 | 0.16 | 0.14 | 0.02 [-0.13, 0.16] | 0.09 | 0.7288 | BH 0.7934 | exploratory |
| A vs B | misconception | 50 | 0.15 | 0.14 | 0.02 [-0.14, 0.17] | 0.07 | 0.7676 | BH 0.8156 | exploratory |
| A vs C | post | 50 | 0.43 | 0.47 | -0.04 [-0.15, 0.06] | -0.19 | 0.2149 | BH 0.3321 | exploratory |
| A vs C | transfer | 50 | 0.43 | 0.46 | -0.03 [-0.15, 0.09] | -0.13 | 0.4350 | BH 0.5786 | exploratory |
| A vs C | delayed | 50 | 0.41 | 0.39 | 0.02 [-0.11, 0.14] | 0.09 | 0.6361 | BH 0.7275 | exploratory |
| A vs C | mastered | 50 | 0.16 | 0.15 | 0.01 [-0.10, 0.13] | 0.06 | 0.8558 | BH 0.8981 | exploratory |
| A vs C | misconception | 49 | 0.14 | 0.12 | 0.02 [-0.10, 0.15] | 0.11 | 0.5815 | BH 0.7062 | exploratory |
| A vs D | gain | 50 | 0.12 | 0.01 | 0.11 [-0.03, 0.25] | 0.51 | 0.0085 | BH 0.0249 | exploratory |
| A vs D | post | 50 | 0.43 | 0.28 | 0.15 [0.02, 0.26] | 0.69 | 0.0005 | BH 0.0039 | exploratory |
| A vs D | transfer | 50 | 0.43 | 0.29 | 0.14 [0.00, 0.27] | 0.65 | 0.0013 | BH 0.0069 | exploratory |
| A vs D | delayed | 50 | 0.41 | 0.29 | 0.13 [-0.01, 0.24] | 0.64 | 0.0021 | BH 0.0094 | exploratory |
| A vs D | mastered | 50 | 0.16 | 0.06 | 0.10 [-0.01, 0.22] | 0.56 | 0.0066 | BH 0.0224 | exploratory |
| A vs D | misconception | 50 | 0.15 | 0.05 | 0.10 [0.01, 0.20] | 0.55 | 0.0009 | BH 0.0059 | exploratory |
| A vs E | post | 50 | 0.43 | 0.46 | -0.03 [-0.18, 0.13] | -0.09 | 0.6102 | BH 0.7204 | exploratory |
| A vs E | transfer | 50 | 0.43 | 0.47 | -0.04 [-0.19, 0.11] | -0.12 | 0.4521 | BH 0.5822 | exploratory |
| A vs E | delayed | 50 | 0.41 | 0.38 | 0.03 [-0.11, 0.18] | 0.14 | 0.4425 | BH 0.5786 | exploratory |
| A vs E | mastered | 50 | 0.16 | 0.19 | -0.03 [-0.23, 0.15] | -0.10 | 0.6419 | BH 0.7275 | exploratory |
| A vs E | misconception | 45 | 0.16 | 0.12 | 0.04 [-0.14, 0.18] | 0.14 | 0.4996 | BH 0.6154 | exploratory |
| A vs F | post | 50 | 0.43 | 0.25 | 0.18 [-0.03, 0.36] | 0.76 | 0.0016 | BH 0.0080 | exploratory |
| A vs F | transfer | 50 | 0.43 | 0.23 | 0.20 [0.02, 0.38] | 0.92 | 0.0002 | BH 0.0024 | exploratory |
| A vs F | delayed | 50 | 0.41 | 0.32 | 0.09 [-0.08, 0.25] | 0.45 | 0.0495 | BH 0.1052 | exploratory |
| A vs F | mastered | 50 | 0.16 | 0.03 | 0.13 [-0.01, 0.26] | 0.67 | 0.0031 | BH 0.0120 | exploratory |
| A vs F | misconception | 50 | 0.15 | 0.03 | 0.12 [-0.02, 0.26] | 0.64 | 0.0034 | BH 0.0126 | exploratory |
| B vs F | gain | 50 | 0.08 | -0.04 | 0.12 [-0.05, 0.29] | 0.52 | 0.0154 | BH 0.0422 | exploratory |
| B vs F | post | 50 | 0.39 | 0.25 | 0.14 [0.00, 0.29] | 0.56 | 0.0013 | BH 0.0069 | exploratory |
| B vs F | transfer | 50 | 0.39 | 0.23 | 0.16 [0.02, 0.32] | 0.73 | 0.0003 | BH 0.0028 | exploratory |
| B vs F | delayed | 50 | 0.37 | 0.32 | 0.05 [-0.06, 0.17] | 0.24 | 0.1391 | BH 0.2413 | exploratory |
| B vs F | mastered | 50 | 0.14 | 0.03 | 0.11 [-0.00, 0.25] | 0.55 | 0.0074 | BH 0.0233 | exploratory |
| B vs F | misconception | 50 | 0.14 | 0.03 | 0.11 [0.01, 0.23] | 0.52 | 0.0021 | BH 0.0094 | exploratory |
| C vs F | gain | 50 | 0.16 | -0.04 | 0.20 [0.05, 0.36] | 0.98 | 0.0001 | BH 0.0017 | exploratory |
| C vs F | post | 50 | 0.47 | 0.25 | 0.22 [0.04, 0.38] | 0.96 | 0.0002 | BH 0.0024 | exploratory |
| C vs F | transfer | 50 | 0.46 | 0.23 | 0.23 [0.07, 0.39] | 1.03 | 0.0001 | BH 0.0017 | exploratory |
| C vs F | delayed | 50 | 0.39 | 0.32 | 0.07 [-0.07, 0.23] | 0.33 | 0.1057 | BH 0.1953 | exploratory |
| C vs F | mastered | 50 | 0.15 | 0.03 | 0.11 [0.01, 0.24] | 0.58 | 0.0041 | BH 0.0145 | exploratory |
| C vs F | misconception | 49 | 0.12 | 0.03 | 0.09 [-0.02, 0.24] | 0.45 | 0.0239 | BH 0.0597 | exploratory |
| D vs F | gain | 50 | 0.01 | -0.04 | 0.05 [-0.08, 0.19] | 0.25 | 0.2535 | BH 0.3847 | exploratory |
| D vs F | post | 50 | 0.28 | 0.25 | 0.03 [-0.11, 0.16] | 0.15 | 0.4295 | BH 0.5786 | exploratory |
| D vs F | transfer | 50 | 0.29 | 0.23 | 0.06 [-0.07, 0.20] | 0.34 | 0.1018 | BH 0.1923 | exploratory |
| D vs F | delayed | 50 | 0.29 | 0.32 | -0.03 [-0.16, 0.10] | -0.15 | 0.4227 | BH 0.5786 | exploratory |
| D vs F | mastered | 50 | 0.06 | 0.03 | 0.03 [-0.06, 0.10] | 0.19 | 0.3995 | BH 0.5755 | exploratory |
| D vs F | misconception | 50 | 0.05 | 0.03 | 0.02 [-0.07, 0.11] | 0.16 | 0.4702 | BH 0.5877 | exploratory |
| E vs F | gain | 50 | 0.24 | -0.04 | 0.28 [0.10, 0.47] | 1.04 | 0.0001 | BH 0.0017 | exploratory |
| E vs F | post | 50 | 0.46 | 0.25 | 0.20 [-0.00, 0.41] | 0.68 | 0.0025 | BH 0.0106 | exploratory |
| E vs F | transfer | 50 | 0.47 | 0.23 | 0.24 [0.04, 0.44] | 0.87 | 0.0004 | BH 0.0034 | exploratory |
| E vs F | delayed | 50 | 0.38 | 0.32 | 0.06 [-0.10, 0.20] | 0.23 | 0.2059 | BH 0.3241 | exploratory |
| E vs F | mastered | 50 | 0.19 | 0.03 | 0.16 [-0.02, 0.36] | 0.56 | 0.0090 | BH 0.0255 | exploratory |
| E vs F | misconception | 45 | 0.12 | 0.03 | 0.09 [-0.07, 0.28] | 0.38 | 0.1161 | BH 0.2099 | exploratory |

Unit of analysis: student (paired differences across the student's six blocks); intervals: two-way student×outcome cluster bootstrap; p: sign-flip permutation on per-student differences.

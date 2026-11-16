# Report 1: Overall effectiveness

Experiment full-experiment-2 · run full-experiment-2-2026-11-13T14-06-20-994Z

> **SIMULATION ONLY.** Every number below comes from AI-simulated students. It is not evidence that real students learn. Generated from recorded results only.

898 completed blocks, 2 failed/incomplete blocks (failed blocks are listed, never dropped).

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 150 | 34.0% | 42.3% | 37.7% | 39.5% | 20.0% |
| B study notes | 150 | 25.3% | 34.7% | 32.7% | 33.0% | 18.0% |
| C generic AI tutor | 148 | 27.7% | 44.6% | 41.6% | 38.2% | 24.3% |
| D scripted human-like tutor | 150 | 29.7% | 26.0% | 24.7% | 27.3% | 6.7% |
| E ENARA adaptive-teaching ablation | 150 | 27.3% | 45.3% | 38.3% | 34.5% | 22.7% |
| F no-teaching control | 150 | 24.3% | 25.0% | 23.0% | 29.7% | 4.0% |

## Confirmatory contrasts (pre-registered; Holm-adjusted)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs F | gain | 50 | 0.08 | 0.01 | 0.08 [-0.06, 0.23] | 0.38 | 0.0772 | Holm 0.3360 | confirmatory |
| A vs B | gain | 50 | 0.08 | 0.09 | -0.01 [-0.17, 0.15] | -0.04 | 0.8895 | Holm 0.8895 | confirmatory |
| A vs C | gain | 50 | 0.08 | 0.17 | -0.08 [-0.23, 0.05] | -0.34 | 0.0672 | Holm 0.3360 | confirmatory |
| A vs E | gain | 50 | 0.08 | 0.18 | -0.10 [-0.28, 0.09] | -0.36 | 0.0793 | Holm 0.3360 | confirmatory |
| A vs B | transfer | 50 | 0.38 | 0.33 | 0.05 [-0.10, 0.20] | 0.21 | 0.3058 | Holm 0.6115 | confirmatory |

## Exploratory contrasts (not pre-registered; Benjamini-Hochberg q; treat as hypothesis-generating)

| Contrast (A vs B) | measure | n students | mean A | mean B | diff [95% CI] | Hedges g | p | adj. p / q | label |
|---|---|---|---|---|---|---|---|---|---|
| A vs B | post | 50 | 0.42 | 0.35 | 0.08 [-0.09, 0.26] | 0.30 | 0.1345 | BH 0.2130 | exploratory |
| A vs B | delayed | 50 | 0.40 | 0.33 | 0.07 [-0.04, 0.17] | 0.38 | 0.0486 | BH 0.1043 | exploratory |
| A vs B | mastered | 50 | 0.20 | 0.18 | 0.02 [-0.11, 0.15] | 0.08 | 0.7560 | BH 0.8213 | exploratory |
| A vs B | misconception | 50 | 0.21 | 0.15 | 0.06 [-0.12, 0.25] | 0.21 | 0.2897 | BH 0.4104 | exploratory |
| A vs C | post | 50 | 0.42 | 0.44 | -0.02 [-0.19, 0.14] | -0.06 | 0.7633 | BH 0.8213 | exploratory |
| A vs C | transfer | 50 | 0.38 | 0.41 | -0.03 [-0.17, 0.09] | -0.14 | 0.4676 | BH 0.6022 | exploratory |
| A vs C | delayed | 50 | 0.40 | 0.38 | 0.02 [-0.10, 0.15] | 0.09 | 0.6402 | BH 0.7491 | exploratory |
| A vs C | mastered | 50 | 0.20 | 0.24 | -0.04 [-0.20, 0.12] | -0.15 | 0.4930 | BH 0.6095 | exploratory |
| A vs C | misconception | 50 | 0.21 | 0.25 | -0.03 [-0.26, 0.21] | -0.10 | 0.6560 | BH 0.7536 | exploratory |
| A vs D | gain | 50 | 0.08 | -0.04 | 0.12 [-0.08, 0.29] | 0.43 | 0.0286 | BH 0.0657 | exploratory |
| A vs D | post | 50 | 0.42 | 0.26 | 0.16 [-0.01, 0.32] | 0.67 | 0.0010 | BH 0.0042 | exploratory |
| A vs D | transfer | 50 | 0.38 | 0.25 | 0.13 [0.02, 0.26] | 0.60 | 0.0009 | BH 0.0042 | exploratory |
| A vs D | delayed | 50 | 0.40 | 0.27 | 0.12 [-0.01, 0.25] | 0.67 | 0.0032 | BH 0.0105 | exploratory |
| A vs D | mastered | 50 | 0.20 | 0.07 | 0.13 [-0.01, 0.27] | 0.65 | 0.0025 | BH 0.0085 | exploratory |
| A vs D | misconception | 49 | 0.21 | 0.09 | 0.12 [-0.06, 0.31] | 0.44 | 0.0491 | BH 0.1043 | exploratory |
| A vs E | post | 50 | 0.42 | 0.45 | -0.03 [-0.16, 0.10] | -0.12 | 0.4948 | BH 0.6095 | exploratory |
| A vs E | transfer | 50 | 0.38 | 0.38 | -0.01 [-0.15, 0.13] | -0.03 | 0.9333 | BH 0.9333 | exploratory |
| A vs E | delayed | 50 | 0.40 | 0.34 | 0.05 [-0.07, 0.17] | 0.26 | 0.1483 | BH 0.2292 | exploratory |
| A vs E | mastered | 50 | 0.20 | 0.23 | -0.03 [-0.19, 0.13] | -0.10 | 0.6830 | BH 0.7741 | exploratory |
| A vs E | misconception | 49 | 0.21 | 0.24 | -0.03 [-0.23, 0.19] | -0.08 | 0.7102 | BH 0.7943 | exploratory |
| A vs F | post | 50 | 0.42 | 0.25 | 0.17 [0.01, 0.32] | 0.76 | 0.0006 | BH 0.0034 | exploratory |
| A vs F | transfer | 50 | 0.38 | 0.23 | 0.15 [-0.00, 0.29] | 0.62 | 0.0040 | BH 0.0117 | exploratory |
| A vs F | delayed | 50 | 0.40 | 0.30 | 0.10 [-0.05, 0.22] | 0.51 | 0.0203 | BH 0.0523 | exploratory |
| A vs F | mastered | 50 | 0.20 | 0.04 | 0.16 [0.04, 0.28] | 0.87 | 0.0001 | BH 0.0011 | exploratory |
| A vs F | misconception | 50 | 0.21 | 0.06 | 0.15 [0.00, 0.34] | 0.60 | 0.0035 | BH 0.0109 | exploratory |
| B vs F | gain | 50 | 0.09 | 0.01 | 0.09 [-0.08, 0.28] | 0.37 | 0.1015 | BH 0.1795 | exploratory |
| B vs F | post | 50 | 0.35 | 0.25 | 0.10 [-0.05, 0.25] | 0.41 | 0.0300 | BH 0.0671 | exploratory |
| B vs F | transfer | 50 | 0.33 | 0.23 | 0.10 [-0.05, 0.23] | 0.41 | 0.0284 | BH 0.0657 | exploratory |
| B vs F | delayed | 50 | 0.33 | 0.30 | 0.03 [-0.06, 0.13] | 0.19 | 0.3058 | BH 0.4261 | exploratory |
| B vs F | mastered | 50 | 0.18 | 0.04 | 0.14 [0.03, 0.26] | 0.76 | 0.0001 | BH 0.0011 | exploratory |
| B vs F | misconception | 50 | 0.15 | 0.06 | 0.09 [-0.02, 0.25] | 0.46 | 0.0242 | BH 0.0605 | exploratory |
| C vs F | gain | 50 | 0.17 | 0.01 | 0.16 [0.01, 0.30] | 0.78 | 0.0006 | BH 0.0034 | exploratory |
| C vs F | post | 50 | 0.44 | 0.25 | 0.19 [0.05, 0.33] | 0.77 | 0.0001 | BH 0.0011 | exploratory |
| C vs F | transfer | 50 | 0.41 | 0.23 | 0.18 [0.01, 0.33] | 0.77 | 0.0007 | BH 0.0037 | exploratory |
| C vs F | delayed | 50 | 0.38 | 0.30 | 0.08 [-0.07, 0.21] | 0.40 | 0.0610 | BH 0.1234 | exploratory |
| C vs F | mastered | 50 | 0.24 | 0.04 | 0.20 [0.08, 0.34] | 0.94 | 0.0001 | BH 0.0011 | exploratory |
| C vs F | misconception | 50 | 0.25 | 0.06 | 0.19 [0.02, 0.38] | 0.70 | 0.0009 | BH 0.0042 | exploratory |
| D vs F | gain | 50 | -0.04 | 0.01 | -0.04 [-0.24, 0.15] | -0.18 | 0.4510 | BH 0.5989 | exploratory |
| D vs F | post | 50 | 0.26 | 0.25 | 0.01 [-0.14, 0.18] | 0.05 | 0.8860 | BH 0.9074 | exploratory |
| D vs F | transfer | 50 | 0.25 | 0.23 | 0.02 [-0.13, 0.17] | 0.08 | 0.7572 | BH 0.8213 | exploratory |
| D vs F | delayed | 50 | 0.27 | 0.30 | -0.02 [-0.14, 0.10] | -0.13 | 0.5342 | BH 0.6487 | exploratory |
| D vs F | mastered | 50 | 0.07 | 0.04 | 0.03 [-0.06, 0.12] | 0.19 | 0.4668 | BH 0.6022 | exploratory |
| D vs F | misconception | 49 | 0.09 | 0.06 | 0.03 [-0.10, 0.17] | 0.17 | 0.4923 | BH 0.6095 | exploratory |
| E vs F | gain | 50 | 0.18 | 0.01 | 0.17 [0.04, 0.31] | 0.76 | 0.0003 | BH 0.0025 | exploratory |
| E vs F | post | 50 | 0.45 | 0.25 | 0.20 [0.04, 0.36] | 0.90 | 0.0001 | BH 0.0011 | exploratory |
| E vs F | transfer | 50 | 0.38 | 0.23 | 0.15 [-0.00, 0.31] | 0.67 | 0.0017 | BH 0.0063 | exploratory |
| E vs F | delayed | 50 | 0.34 | 0.30 | 0.05 [-0.09, 0.19] | 0.25 | 0.2672 | BH 0.3849 | exploratory |
| E vs F | mastered | 50 | 0.23 | 0.04 | 0.19 [0.06, 0.33] | 0.87 | 0.0001 | BH 0.0011 | exploratory |
| E vs F | misconception | 49 | 0.24 | 0.06 | 0.18 [0.04, 0.33] | 0.68 | 0.0003 | BH 0.0025 | exploratory |

Unit of analysis: student (paired differences across the student's six blocks); intervals: two-way student×outcome cluster bootstrap; p: sign-flip permutation on per-student differences.

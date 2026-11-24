# Mishkat: today's results so far

_24 Nov 2026, 3:20 PM Cairo. **MODEL-MARKED: development only, never for claims, never for a real school.** QWK = agreement (higher is better). Picture: `mishkat/mishkat_results_20261124.png`. Still running: the English fine-tune scoring (about 5:45 PM) and English with no cap (about 7:30 PM)._

## In three lines
1. **Arabic (two-stage, now the recipe):** adding AR-ASAG changes little on ENARA answers, helps spelling on human-scored essays (0.52 against 0.44) and the Egyptian set (0.21 against 0.12), and costs some essay task completion (0.65 against 0.71).
2. **Mishkat still beats v3b on Arabic language** (grammar, spelling, vocabulary); v3b still owns task completion and content (Egyptian set 0.69).
3. **The English GPU fine-tune works:** 2 epochs in 15 min for $0.28 (about $0.58 today in all, cap $5); its scores come at about 5:45 PM.

## Arabic, ENARA answers (QWK vs Sonnet–Opus)
| Criterion | Run 10 (AR-AES + AR-ASAG) | Run 9 (AR-AES) | v3b |
|---|---|---|---|
| Essay grammar | **0.82** | 0.81 | 0.72 |
| Essay spelling | 0.92 | **0.93** | 0.75 |
| Essay vocabulary | **0.94** | **0.94** | 0.84 |
| Essay organisation | 0.89 | **0.90** | 0.85 |
| Essay task completion | 0.65 | 0.71 | **0.75** |
| Short-answer grammar | 0.80 | **0.82** | 0.55 |
| Short-answer task completion | 0.43 | 0.44 | **0.71** |

## Arabic, human-scored LAILA essays (200)
| Criterion | Run 10 | Run 9 | v3b |
|---|---|---|---|
| Grammar | **0.47** | 0.46 | 0.16 |
| Spelling | **0.52** | 0.44 | 0.30 |
| Vocabulary | 0.45 | **0.53** | 0.46 |
| Organisation | 0.45 | 0.48 | **0.59** |

- **Length tests (run 10):** all pass. Short correct answers 97%; truncation 0.02; padding 0.01.
- **Stage 1:** AR-AES 2,046 essays + AR-ASAG 2,132 short answers (Mendeley Data, "CC BY 4.0"), 4,178 in total.

## Egyptian test set (Zenodo, CC BY 4.0, never trained on; task completion against the teachers)
| | n | Same score | QWK |
|---|---|---|---|
| **v3b** | 300 | **66%** | **0.69** |
| Mishkat run 10 | 6,597 | 34% | 0.21 |
| Mishkat run 9 | 6,597 | 31% | 0.12 |

## English GPU fine-tune (Modal A10G)
| | |
|---|---|
| Data | 27,215 essays: ELLIPSE train + ASAP 2.0 + PERSUADE. The ELLIPSE test essays, including the 200 human-scored ones, are kept out |
| Validation error | 0.157 after epoch 1, **0.143** after epoch 2 (holistic 0.07; grammar 0.24; vocabulary 0.24; spelling 0.27; organisation 0.29) |
| Time and cost | 15 min, **$0.28**. Today: about $0.58 over 4 runs (cap $5) |
| What failed before | Runs 1–3: transformers 5 loads this model in 16-bit by default, and training 16-bit weights overflows at step 1. Fixed in run 4 by loading 32-bit weights |
| Next | Scores on ENARA answers and on the human-scored ELLIPSE essays, next to run 9 and v3b (about 5:45 PM) |

## English so far (for the coming comparison)
| QWK | Run 7 (ELLIPSE 2,500) | Run 9 (1,000 each from ELLIPSE, ASAP 2.0, PERSUADE) | v3b |
|---|---|---|---|
| ENARA grammar | **0.80** | 0.74 | 0.78 |
| ENARA spelling | **0.52** | 0.49 | 0.34 |
| ELLIPSE human-scored grammar | 0.42 | **0.47** | 0.11 |
| ELLIPSE human-scored spelling | 0.42 | **0.43** | 0.13 |

Two more English columns are coming: the fine-tuned encoder, and ELLIPSE 2,500 + ASAP 2.0 + PERSUADE with no cap.

## Side finding
- **The CPU training scripts also load the model in 16 bits,** which is likely why reading essays on GitHub is slow (about 22 a minute).
- **Fixing it changes the features,** so the cached readings would have to be rebuilt.
- **Proposed after today's runs finish;** not changed while they run.

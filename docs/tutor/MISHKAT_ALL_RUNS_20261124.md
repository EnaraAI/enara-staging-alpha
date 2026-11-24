# Mishkat: all of today's runs, side by side

_24 Nov 2026, 4:55 PM Cairo. **MODEL-MARKED: development only, never for claims, never for a real school.** QWK = agreement (higher is better). "Sonnet–Opus" = the ENARA answers where those two markers agree. Picture: `mishkat/mishkat_all_runs_20261124.png`. Data downloaded at run time; numbers only in the repo._

## In three lines
1. **English: more stage-1 data did not help.** ELLIPSE 2,500 + ASAP 2.0 + PERSUADE (7,500, no cap) is slightly worse than ELLIPSE alone (run 7) on ENARA and on human-scored essays. The **fine-tuned encoder** is the best English option on ENARA (grammar 0.79, spelling 0.64, vocabulary 0.93), but not on human-scored essays.
2. **Arabic: AR-AES two-stage (adopted) + AR-ASAG** keeps Mishkat well ahead of v3b on grammar, spelling and vocabulary, and raises spelling on human-scored essays (0.52).
3. **v3b keeps task completion and content** in both languages (Egyptian test set 0.69 against Mishkat's 0.21). GPU spend today: **about $1.92** (cap $5).

## English, ENARA essays (QWK vs Sonnet–Opus)
| Criterion | Run 7: ELLIPSE 2,500 | Run 9: 1,000 each | **Run 10: 7,500, no cap** | Fine-tuned encoder* | v3b |
|---|---|---|---|---|---|
| Grammar | **0.80** | 0.74 | 0.71 | 0.79 | 0.78 |
| Spelling | 0.52 | 0.49 | 0.47 | **0.64** | 0.34 |
| Vocabulary | 0.88 | 0.86 | 0.87 | **0.93** | 0.80 |
| Organisation | 0.78 | 0.74 | 0.66 | 0.77 | **0.80** |
| Task completion | 0.55 | 0.46 | 0.58 | 0.61 | **0.83** |

\*Fine-tuned: scorer trained on ENARA answers only, its best setup. The two-stage version scores 0.75 / 0.47 / 0.89 / 0.76 / 0.55.

## English, human-scored ELLIPSE essays (200)
| Criterion | Run 7 | Run 9 | Run 10 | Fine-tuned | v3b |
|---|---|---|---|---|---|
| Grammar | 0.42 | **0.47** | 0.42 | 0.42 | 0.11 |
| Spelling | 0.42 | **0.43** | 0.34 | 0.41 | 0.13 |
| Vocabulary | — | 0.36 | 0.36 | **0.47** | 0.21 |
| Organisation | — | **0.43** | 0.34 | 0.30 | 0.33 |

## Arabic, ENARA answers (QWK vs Sonnet–Opus, two-stage)
| Criterion | **Run 10: AR-AES + AR-ASAG** | Run 9: AR-AES | v3b |
|---|---|---|---|
| Essay grammar | **0.82** | 0.81 | 0.72 |
| Essay spelling | 0.92 | **0.93** | 0.75 |
| Essay vocabulary | **0.94** | **0.94** | 0.84 |
| Essay organisation | 0.89 | **0.90** | 0.85 |
| Essay task completion | 0.65 | 0.71 | **0.75** |
| Short-answer grammar | 0.80 | **0.82** | 0.55 |
| Short-answer task completion | 0.43 | 0.44 | **0.71** |

## Arabic, human-scored LAILA (200) and the Egyptian test set
| | Run 10 | Run 9 | v3b |
|---|---|---|---|
| LAILA grammar | **0.47** | 0.46 | 0.16 |
| LAILA spelling | **0.52** | 0.44 | 0.30 |
| LAILA vocabulary | 0.45 | **0.53** | 0.46 |
| LAILA organisation | 0.45 | 0.48 | **0.59** |
| Egyptian set, task completion (teachers) | 0.21 | 0.12 | **0.69** |

**Length tests:** all pass in every run.

## Licences
| Dataset | Licence | Use |
|---|---|---|
| ASAP 2.0 | "The data is provided under a Attribution 4.0 International (CC BY 4.0) [license]" | English stage 1 |
| PERSUADE 2.0 (official link, not Kaggle) | "The data is provided under Creative Commons Attribution 4.0 International License (CC BY 4.0)." | English stage 1 |
| AR-AES | "license: cc-by-4.0" | Arabic stage 1 |
| AR-ASAG (Mendeley) | "CC BY 4.0" | Arabic stage 1 |
| Zenodo Arabic short answers (current version 18630360) | cc-by-4.0 | **Test only, never trained on** |
| AraScore | no licence found | not used |
| Cairo University environmental-science set | not publicly available | not used |

## GPU spend today (Modal A10G, cap $5)
| Run | What | Cost |
|---|---|---|
| Fine-tune runs 1–3 | NaN from step 1 (transformers 5 loads the model in 16-bit); diagnosed and fixed | about $0.29 |
| Fine-tune run 4 | 2 epochs, 27,215 essays, 15 min | $0.28 |
| Fine-tune scoring | 13 min (instead of hours on CPU) | $0.23 |
| English run 10, try 1 | stopped at the 30-min cap | about $0.55 |
| English run 10, try 2 | 31 min, finished | $0.57 |
| **Total** | | **about $1.92** |

## Recommendation
- **English:** use the **fine-tuned encoder** for grammar, spelling and vocabulary. It is best on ENARA; on human-scored essays it equals run 7 on grammar and is best on vocabulary. Do not add ASAP 2.0 or PERSUADE to stage 1.
- **Arabic:** keep **run 10** (AR-AES + AR-ASAG, two-stage) for grammar, spelling and vocabulary.
- **Split by criterion:** v3b stays the grader for task completion, organisation and feedback in both languages. Nothing is switched without your "go".
- **CPU training scripts:** they also load the model in 16-bit, which is likely why CPU runs are slow. Fix it (with one cache rebuild) in a later run, or keep using the GPU, which is faster and cheap.

# Mishkat: new stage-1 data, fine-tune, Egyptian test set — one report

_24 Nov 2026, 1:50 PM Cairo. **MODEL-MARKED: development only, never for claims, never for a real school.** Data downloaded at run time only; only numbers are in the repo. QWK = agreement (higher is better). "Sonnet–Opus" = the ENARA answers where those two markers agree, so DeepSeek (v3b) is not checking itself._

## In three lines
1. **English:** adding ASAP 2.0 and PERSUADE to stage 1 helped grammar on human-scored ELLIPSE essays a little (0.47 against 0.42) and cost 0.06 on ENARA grammar. The GPU fine-tune did not run: the Modal secrets are not set ($0 spent).
2. **Arabic:** AR-AES in stage 1 makes Mishkat better than v3b on grammar, spelling, vocabulary and organisation, and all length tests pass.
3. **Egyptian test set:** v3b agrees with the teachers (QWK **0.69**); Mishkat does not (**0.13**). Those marks are for content against a model answer, and Mishkat never sees the question.

## Licences (quoted exactly)
| Dataset | Licence, as published | Used |
|---|---|---|
| ASAP 2.0 (github.com/scrosseye/ASAP_2.0) | "The data is provided under a Attribution 4.0 International (CC BY 4.0) [license]" | English stage 1 (holistic score) |
| PERSUADE 2.0 (official repository's link, not Kaggle) | "The data is provided under Creative Commons Attribution 4.0 International License (CC BY 4.0)." | English stage 1 (holistic score) |
| AR-AES (Hugging Face Rnghazawi-NLP/AR-AES) | "license: cc-by-4.0"; "Creative Commons Attribution 4.0 International (CC BY 4.0)" | Arabic stage 1 |
| AR-ASAG (Mendeley Data) | "CC BY 4.0" | Allowed, not yet added |
| AraScore | no licence found | **Not used** (no licence = no permission) |
| Zenodo Arabic short answers (10.5281/zenodo.18630259; current version 18630360) | `cc-by-4.0` | **Test only, never trained on.** 6,598 valid answers (not 270), 22 questions, marks 0–5 |
| Cairo University environmental-science set (610 answers) | "not publicly available" | **Not used** |

## English: grammar and spelling, today's run next to the earlier one
Stage 1 is capped at 3,000 essays in total (your instruction this morning): 1,000 each from ELLIPSE, ASAP 2.0 and PERSUADE. Run 7 had 2,500 from ELLIPSE alone.

| QWK | Run 7 (ELLIPSE) | **Run 9 (ELLIPSE + ASAP 2.0 + PERSUADE)** | v3b |
|---|---|---|---|
| ENARA essays, grammar (Sonnet–Opus) | 0.80 | 0.74 | 0.78 |
| ENARA essays, spelling | 0.52 | 0.49 | 0.34 |
| ENARA essays, vocabulary | 0.88 | 0.86 | 0.80 |
| **ELLIPSE human-scored, grammar** (200) | 0.42 | **0.47** | 0.11 |
| ELLIPSE human-scored, spelling | 0.42 | 0.43 | 0.13 |
| ELLIPSE human-scored, vocabulary | — | 0.36 | 0.21 |

- **Length tests:** all pass (short correct answers 94%; truncation −0.12; padding −0.14).
- **The comparison is muddied:** run 9 also has fewer ELLIPSE essays (1,000 against 2,500), so it cannot say which change caused which effect.
- **GPU fine-tune (Modal, under $5):** built and wired; **not run**, because `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are not GitHub secrets. It starts as soon as they are added; capped at 50 min, about $0.92.

## Arabic: AR-AES in stage 1
| QWK vs Sonnet–Opus | **Mishkat, AR-AES two-stage** | Mishkat, ENARA only | v3b |
|---|---|---|---|
| Essay grammar | **0.81** | 0.79 | 0.72 |
| Essay spelling | **0.93** | 0.89 | 0.75 |
| Essay vocabulary | **0.94** | 0.91 | 0.84 |
| Essay organisation | **0.90** | 0.79 | 0.85 |
| Essay task completion | 0.71 | 0.63 | **0.75** |
| Short-answer grammar | **0.82** | 0.78 | 0.55 |
| Short-answer task completion | 0.44 | 0.41 | **0.71** |

| LAILA human-scored essays (200) | Mishkat | v3b |
|---|---|---|
| Grammar | **0.46** | 0.16 |
| Spelling | **0.44** | 0.30 |
| Vocabulary | **0.53** | 0.46 |
| Organisation | 0.47 | **0.59** |
| Task completion | 0.16 | **0.53** |

- **Length tests:** all pass (short correct answers 96.5%; truncation 0.03; padding 0.01).

## Egyptian test set (Zenodo, never trained on; human marks 0–5)
| | n | Same score | Within 1 | QWK | Spearman (raw) |
|---|---|---|---|---|---|
| **v3b** (300-answer sample) | 300 | **66%** | 99.7% | **0.69** | **0.79** |
| Mishkat (same sampling rule) | 300 | 31% | 96% | 0.13 | 0.17 |
| Mishkat (all answers) | 6,597 | 31% | 95% | 0.12 | 0.19 |

- **Marks compared:** task completion only. The teacher's 0–5 mark is grouped as 0–1 → 0, 1.5–3.5 → 1, 4–5 → 2. These are content marks against the teacher's model answer.
- **v3b:** it is graded with the question and the model answer. It gives slightly high marks (average 1.51 against the teachers' 1.27).
- **"Within 1" says little here:** with 3 levels almost any guess lands within 1. QWK is the number that counts.

## Learned merge (Mishkat engine, Step B)
- **Passes the bar** (beats v3b and the fixed split):
  - Arabic: all 5 essay criteria and short-answer task completion;
  - English: grammar, vocabulary, organisation and short-answer task completion.
- **Fails:**
  - Arabic: short-answer grammar;
  - English: essay task completion (0.74 against 0.83) and spelling.
- **Clear of noise:** only Arabic organisation (+0.09) and English short-answer task completion (+0.06).
- **Not added** to PR #106 (the bar was both languages). Retest when your review-sheet marks arrive.

## What it means
- **The split by criterion holds:** Mishkat for grammar, spelling and vocabulary; v3b for task completion and content. The Egyptian set confirms v3b for content.
- **Arabic:** use the AR-AES two-stage recipe from now on.
- **English:** keep run 7's recipe (ELLIPSE 2,500) until a run with ELLIPSE 2,500 + ASAP 2.0 + PERSUADE separates the two effects; that needs a longer job or the GPU.

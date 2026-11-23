# Mishkat: first training results (run 1)

_23 Nov 2026, 6:45 PM Cairo. **MODEL-MARKED: development only, not for claims, never for a real school.** Nothing is switched; v3b stays the grader on lms-test._

## In three lines
1. **Mishkat already matches or beats v3b on the "form" criteria:** grammar and spelling in both languages, and vocabulary in Arabic. v3b stays much better on task completion and organisation, which need the meaning of the answer.
2. **Pre-training on LAILA and ELLIPSE (stage 1) helps English grammar a little but hurts Arabic.** The Arabic model trained on ENARA answers alone (stage 2 only) is better on almost every criterion.
3. **Not ready for a switch.** The test sets are small (42–54 answers per type), and 3 of the 5 length tests pass. Run 2 is already going (since 6:43 PM): every answer is tested once by cross-validation, with a re-check on the 200 human-scored essays per language.

## Data
| | English | Arabic |
|---|---|---|
| Model-marked answers used | 495 | 482 |
| Owner corrections applied | 0 (review sheet still out) | 0 |
| Held-out essays / short answers | 42 / 50 (28 / 22 questions) | 45 / 54 (27 / 23 questions) |

- **Held out by question:** a question's answers are never trained on.
- **v3b** here means the DeepSeek marker, which runs v3b once per answer.
- **Labels:** the median of the three markers. "Sonnet–Opus" means only the answers where those two agree, so DeepSeek is not checking its own marks.

## Essays: QWK on held-out answers (Mishkat two-stage / Mishkat stage 2 only / v3b)
| Criterion | English vs median | English vs Sonnet–Opus | Arabic vs median | Arabic vs Sonnet–Opus |
|---|---|---|---|---|
| Grammar | 0.76 / 0.72 / 0.76 | **0.84** / 0.68 / 0.74 | 0.77 / **0.83** / 0.77 | 0.71 / **0.82** / 0.70 |
| Spelling/punctuation | **0.73** / **0.73** / 0.37 | **0.79** / **0.79** / 0.30 | 0.59 / **0.88** / 0.81 | 0.55 / **0.86** / 0.80 |
| Vocabulary | 0.77 / **0.91** / 0.78 | 0.85 / **0.93** / 0.77 | 0.82 / **0.93** / 0.91 | 0.82 / **0.93** / 0.90 |
| Organisation | 0.54 / 0.60 / **0.93** | 0.71 / 0.82 / **0.88** | 0.74 / 0.85 / **0.92** | 0.74 / 0.84 / **0.87** |
| Task completion | 0.55 / 0.38 / **0.90** | 0.50 / 0.41 / **0.78** | 0.46 / 0.55 / **0.83** | 0.48 / 0.51 / **0.82** |

- **Within 1 point:** 0.98–1.00 for Mishkat (both recipes) and v3b on every essay criterion.
- **Stage 1 alone** (LAILA and ELLIPSE only) does not work on our answers. In Arabic it is 1.1–1.4 points too low with QWK about 0; in English it is weak (QWK 0.37–0.47) and cannot judge task completion. This confirms evaluation 4.4.

## Short answers
- **Task completion:** v3b is clearly better (QWK about 0.70 against 0.13–0.48 for Mishkat).
- **Arabic grammar:** stage 2 only beats v3b (QWK 0.62 against 0.40; against Sonnet–Opus 0.75 against 0.40).
- **English grammar and both spelling criteria:** almost every label is 1, so agreement can't be measured. All models match 0.94–1.00 of answers.

## Length tests (two-stage model)
| Test | English | Arabic |
|---|---|---|
| A short correct answer is not marked down (bar 90%) | 89.7% ❌ (just below) | 67.7% ❌ |
| Cutting a strong essay to 3 sentences (drop ≤ 0.3) | 0.02 ✅ | 0.27 ✅ |
| Adding 3 correct sentences (rise ≤ 0.1) | −0.03 ✅ | 0.26 ❌ |

**Arabic fails two of them.** The Arabic two-stage model still leans on length-related cues it picked up from LAILA's long essays. It is the same model that loses to stage 2 only.

## The bar (within 1 ≥ 0.85 and QWK ≥ v3b, against the median)
| | English (two-stage) | Arabic (two-stage) |
|---|---|---|
| Passes | Spelling (essays); grammar and spelling (short answers, but there is no spread in the labels) | Grammar (essays, tie); spelling (short answers, no spread) |
| Fails | Grammar by 0.001; vocabulary, organisation, task | The rest |

With stage 2 only, Arabic would pass grammar, spelling and vocabulary on essays, and grammar on short answers.

## Run 2 (running since 6:43 PM)
- **5-fold cross-validation by question:** every answer is tested once, about 230 essays and 265 short answers per language instead of about 45 and 50.
- **Re-check on the 200 human-scored ELLIPSE and LAILA essays,** next to v3b's numbers from today. That's the real test for the English grammar open item.
- **Stage 2 only is reported next to two-stage,** so the better recipe can be chosen per language and per criterion.
- **Your corrections:** when the review sheet comes back they replace the median, and the retrain reuses the cached readings, so it takes minutes.

## Reading this honestly
- **All labels are model-marked,** and v3b is one of the three markers, so agreement with the median favours v3b. The Sonnet–Opus column removes that advantage.
- **The test sets are small,** so a difference of ±0.05 QWK is noise.
- **The likely end point is a split by criterion:** Mishkat for grammar and spelling (and Arabic vocabulary), v3b for task completion, organisation and feedback text. A switch still needs the bar, teacher marks and your go.

# Rubric re-calibration: the numbers before shipping

_23 Nov 2026, 4:00 PM Cairo. Nothing is deployed. Branch `claude/tutor-lms-rubric-recal` was measured offline: DeepSeek on lms-test, nothing stored, 0 errors._

## In three lines
1. **The harshness is fixed:** v3b's averages match the human markers (grammar about 1.0 against 0.9–0.96, spelling about 0.95 against 0.84–0.99, out of 2), where today's grader gives 0.2–0.4.
2. **Arabic is better on almost everything.** English matches the markers more often, but ranks grammar worse: QWK 0.11 against 0.20 today. Neither version ranks English grammar well.
3. **My recommendation:** ship v3b, because it delivers the scale you chose. English grammar and spelling then become the first job for the trained scorer (QWK 0.60 there), after your go.

## Human-scored essays (the same 200 per language)
Each cell shows today → v3b. "Same" is the share of essays where the grader gives exactly the markers' level; QWK measures how well it ranks weak against strong (1 is perfect).

| | Same | QWK | Average (markers) |
|---|---|---|---|
| **English** grammar | 0.47 → **0.60** | 0.20 → 0.11 ↓ | 0.44 → **1.01** (0.90) |
| vocabulary | 0.60 → **0.64** | 0.24 → 0.21 | 0.87 → **1.06** (1.05) |
| organisation | 0.47 → **0.54** | 0.32 → **0.33** | 1.41 → 1.30 (0.92) ⚠ still too generous |
| spelling/punctuation | 0.38 → **0.60** | 0.11 → **0.13** | 0.20 → **0.94** (0.84) |
| **Arabic** task completion | 0.43 → **0.73** | 0.28 → **0.53** | 1.33 → **1.68** (1.78) |
| grammar | 0.31 → **0.60** | 0.13 → **0.16** | 0.27 → **1.05** (0.96) |
| vocabulary | 0.67 → 0.66 | 0.49 → 0.46 | 0.95 → 1.18 (1.03) |
| organisation | 0.68 → **0.70** | 0.62 → 0.59 | 1.09 → **1.08** (1.07) |
| spelling/punctuation | 0.25 → **0.68** | 0.09 → **0.30** | 0.23 → **0.99** (0.99) |

**Whole essay, within 1 point of the markers' total:**
- English: 0.59 → 0.54
- Arabic: 0.27 → **0.62**

**Teacher-flag rate:**
- English: 17.5% → 10%
- Arabic: 14.5% → 17.5%

**Version 1 (v3), not shipped:** it matched the averages, but put almost every answer in the middle level (English grammar QWK 0.05). v3b restored part of that spread.

## ENARA's benchmark (180 answers, reference scores re-levelled to the new scale)
Each cell shows today's grader → v3b, as same / QWK.

| | English | Arabic |
|---|---|---|
| Task completion | 0.88 / 0.74 → **0.89 / 0.75** | 0.81 / 0.62 → **0.82 / 0.62** |
| Grammar | 0.58 / 0.50 → **0.88 / 0.72** | 0.57 / 0.46 → **0.81 / 0.63** |
| Vocabulary | 0.84 / 0.88 → 0.78 / 0.81 | 0.80 / 0.85 → 0.76 / 0.80 |
| Organisation | 0.73 / 0.73 → **0.80 / 0.76** | 0.93 / 0.94 → 0.80 / 0.80 |
| Spelling/punctuation | 0.47 / 0.41 → **0.82 / 0.67** | 0.59 / 0.34 → **0.78 / 0.52** |

Within 1 point is 0.97–1.00 on every criterion in both versions, so the existing 0.85 bar is met.

## Against the bar I set in the plan
- ✅ Averages within 0.15 of the markers, except English organisation (+0.38).
- ✅ Benchmark within 1 point ≥ 0.85.
- ❌ QWK at least today's and at least 0.40 on every criterion. It fails on English grammar and vocabulary (and on Arabic vocabulary and organisation by about 0.03). It is also below 0.40 on most criteria, as today's grader already was.

**Why ship anyway:** your decision was the scale, and v3b delivers it. Learners are no longer marked down for grammar and spelling a person would accept. The remaining weakness, ranking English grammar, was already there today. Prompt changes are not fixing it; the trained scorer (QWK 0.60) is the tool for that.

## Shipping (after your go)
- **One PR from `claude/tutor-lms-rubric-recal`:** the rubric text (ar/en), the engine-v3b instructions and the re-levelled benchmark reference scores.
- **Full E2E suite, then deploy to lms-test.** The benchmark baseline for the language sets is refreshed from the next benchmark run.
- **Effect on lms-test:**
  - Language essay grades rise, mostly in grammar and spelling.
  - English organisation is still a little generous.
  - Error codes ("errors to work on") are unchanged.

## Open items
- **English grammar ranking is weak** (QWK 0.11 on human-scored essays). The owner's decision (23 Nov 2026): Mishkat covers it once its benchmark results pass.
- **English organisation is still a little generous** (average 1.30 against the markers' 0.92).
- **v3b shipped** to lms-test in [PR #101](https://github.com/EnaraAI/enara-staging-alpha/pull/101), by the owner's decision of 23 Nov 2026.

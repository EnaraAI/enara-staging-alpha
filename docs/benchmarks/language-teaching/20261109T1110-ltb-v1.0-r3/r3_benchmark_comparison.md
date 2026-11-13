# r3 benchmark comparison: baseline · r1 · r2 · **r3** (official run)

**Run:** 9 Nov 2026; tutor 11:21–11:34 UTC, judge to 11:44 UTC. One official run, sequential, unchanged frozen harness.

**Status:** `LIVE-PROVIDER-VERIFIED` (local in-process harness). Staging `NOT RUN`. Not deployed or committed.

Pedagogical scores are **automated provisional LLM-judge scores**. They have not been reviewed by an educator, and they measure tutor behaviour on synthetic cases, not learning gains. The 36 × 3 repeated-run study is a **separate diagnostic**, excluded from these numbers (`r3_repeated_run_stability_report.md`).

## Comparability (verified)

| | Baseline | r1 | r2 | r3 |
|---|---|---|---|---|
| Cases / turns / order | 120 / 219 | same | same | same (`benchmark_cases.jsonl` SHA-256 `725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb`) |
| Rubric / scoring / runner / judge / scorer | frozen | same | same | same (hashes match the r1 and r2 manifests) |
| Tutor | `claude-opus-5-5`, effort low, max 4000, 2 attempts | same | same | same; served 219/219 |
| Judge | `claude-sonnet-5-5`, effort medium | same | same | same; served 132/132 |
| Engine | `ltc-v1` | `ltc-v1-r1` | `ltc-v1-r2` | **`ltc-v1-r3`** |

Nothing in the official comparison is non-comparable.

## Headline

| | Baseline | r1 | r2 | **r3** |
|---|---|---|---|---|
| Meets expectations | 21 (17.5%) | 65 (54.2%) | 76 (63.3%) | **81 (67.5%)** |
| Partially meets | 99 | 55 | 44 | 39 |
| Does not meet / critical | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| 70% engineering target (≥ 84/120) | — | not met | not met (−8) | **not met: 3 cases short** |

r2 → r3 transitions: 16 partial → meets, **11 meets → partial**, 65 meets → meets, 28 partial → partial.

## Seven dimensions (LLM judge, 0–4)

| Dimension | Baseline | r1 | r2 | **r3** | Δ vs r2 | r3 distribution 0/1/2/3/4 |
|---|---|---|---|---|---|---|
| Learner-context fidelity | 2.65 | 2.80 | 2.88 | **2.98** | +0.10 | 0/2/10/97/11 (n=120) |
| Lesson alignment | 2.90 | 3.02 | 3.07 | **3.12** | +0.05 | 0/0/4/98/18 (n=120) |
| Pedagogical appropriateness | 2.46 | 2.73 | 2.92 | **2.98** | +0.06 | 0/4/7/97/12 (n=120) |
| Scaffolding across turns | 2.33 | 2.58 | 2.73 | **2.83** | +0.10 | 0/4/7/62/2 (n=75) |
| Age & proficiency fit | 2.52 | 2.85 | 2.88 | **2.93** | +0.05 | 0/0/17/94/9 (n=120) |
| Formative check | 2.83 | 2.85 | 2.88 | **2.83** | -0.05 | 0/2/17/101/0 (n=120) |
| Clarity | 2.73 | 3.02 | 3.03 | **3.08** | +0.05 | 0/0/5/101/14 (n=120) |

**Regression:** the formative check fell from 2.88 to 2.83 (−0.05). It is the only dimension below r2.

Judge self-consistency: 77/78 exact on the 12 repeat cases.

## Cohort × CEFR (meets: baseline · r1 · r2 · **r3**; the benchmark's own labels)

| Cohort | A1 | A2 | B1 |
|---|---|---|---|
| child | 0 · 7 · 10 · **10** /14 | 0 · 4 · 7 · **7** /13 | 0 · 6 · 2 · **4** /13 |
| teen | 5 · 11 · 10 · **13** /14 | 2 · 5 · 8 · **9** /13 | 4 · 9 · 11 · **11** /13 |
| adult | 4 · 8 · 10 · **9** /14 | 2 · 8 · 8 · **9** /13 | 4 · 7 · 10 · **9** /13 |

## Cohort and CEFR totals (⚠ = r3 below r2)

| Group | Baseline | r1 | r2 | r3 | Pedagogy (baseline → r1 → r2 → r3) |
|---|---|---|---|---|---|
| child | 0 | 17 | 19 | **21**/40 | 2.33 → 2.67 → 2.88 → 2.92 |
| teen | 11 | 25 | 29 | **33**/40 | 2.63 → 2.70 → 2.95 → 2.95 |
| adult | 10 | 23 | 28 | **27**/40 ⚠ | 2.42 → 2.83 → 2.95 → 3.05 |
| A1 | 9 | 26 | 30 | **32**/42 | 2.48 → 2.69 → 2.95 → 3.00 |
| A2 | 4 | 17 | 23 | **25**/39 | 2.36 → 2.69 → 2.90 → 2.87 |
| B1 | 8 | 22 | 23 | **24**/39 | 2.54 → 2.82 → 2.92 → 3.05 |

**Regression:** the adult cohort fell from 28/40 to 27/40 (−1). The child, teen and all CEFR totals rose.

## Situation types (⚠ = r3 below r2)

| Type | Baseline | r1 | r2 | r3 | Pedagogy (baseline → r1 → r2 → r3) |
|---|---|---|---|---|---|
| T01_limited_vocab | 3 | 9 | 8 | **8**/12 | 2.58 → 2.92 → 2.92 → 2.92 |
| T02_word_in_context | 0 | 4 | 3 | **4**/9 | 3.00 → 3.33 → 3.22 → 3.00 |
| T03_blocking_error | 0 | 4 | 8 | **7**/9 ⚠ | 1.89 → 2.56 → 3.00 → 2.89 |
| T04_minor_error | 1 | 5 | 0 | **3**/9 | 2.33 → 2.33 → 1.89 → 2.56 |
| T05_partially_correct | 6 | 8 | 8 | **8**/9 | 3.33 → 3.22 → 3.44 → 3.22 |
| T06_repeated_misconception | 1 | 0 | 7 | **8**/9 | 2.56 → 2.00 → 3.00 → 3.00 |
| T07_hint_then_fail | 1 | 3 | 5 | **3**/9 ⚠ | 2.67 → 2.44 → 3.00 → 2.89 |
| T08_mastery_move_on | 2 | 3 | 2 | **4**/9 | 2.44 → 2.22 → 2.00 → 2.22 |
| T09_age_example | 1 | 7 | 8 | **9**/9 | 2.89 → 3.00 → 3.11 → 3.11 |
| T10_missing_context | 4 | 0 | 8 | **7**/9 ⚠ | 2.89 → 2.78 → 3.89 → 3.78 |
| T11_off_topic | 0 | 8 | 8 | **7**/9 ⚠ | 1.89 → 3.00 → 3.00 → 3.11 |
| T12_contradictory_evidence | 2 | 7 | 4 | **5**/9 | 2.44 → 2.89 → 2.56 → 3.00 |
| T13_answer_request | 0 | 7 | 7 | **8**/9 | 1.00 → 2.78 → 3.00 → 3.00 |

## Deterministic checks (frozen)

| Check | Baseline | r1 | r2 | **r3** |
|---|---|---|---|---|
| Reply received | 120/120 | 120/120 | 120/120 | **120/120** |
| No identifiers sent | 120/120 | 120/120 | 120/120 | **120/120** |
| Context block present | 120/120 | 120/120 | 120/120 | **120/120** |
| Engine chose an expected move (partly tuned) | 79/111 | 111/111 | 111/111 | **111/111** |
| No mastery/% claim (frozen regex; known false positives) | 113/120 | 117/120 | 116/120 | **117/120** |
| Within word limit | 90/120 | 120/120 | 120/120 | **120/120** |
| No answer key before attempt (T13 proxy) | 8/9 | 9/9 | 9/9 | **9/9** |
| Off-topic redirect (T11) | 1/9 | 8/9 | 9/9 | **8/9** |
| Clarifying question (T10) | 9/9 | 9/9 | 9/9 | **9/9** |

- **T11 miss (AB1-T11):** the redirect is correct, but the reply is 137 words, and the frozen check treats > 120 words as "did the task". The same case failed this way in r1.
- **Mastery/% check:** all 3 failures are the "always = 100%" false positive.
- No supplemental check replaces any frozen result.

## T04 / T08 / T12 (the r2 regressions)

r2 → r3 meets: **T04 0 → 3**, **T08 2 → 4**, **T12 4 → 5** (r1 had T04 5, T08 3, T12 7).

**T04 minor error.** The engine flagged self-correction in 3/3 of the self-correcting cases.

| Case | r3 signals (final turn) | r2 → r3 | Ped / Scaf | r3 tags |
|---|---|---|---|---|
| LTB-CA1-T04 | — | partially → **meets** | 3 / 3 | — |
| LTB-CA2-T04 | self_corrected | partially → **meets** | 3 / 3 | minor lesson_drift |
| LTB-CB1-T04 | — | partially → **partially** | 3 / 3 | minor age_tone_mismatch; minor lesson_drift |
| LTB-TA1-T04 | — | partially → **partially** | 2 / 2 | major ignored_learner_reply; minor under_scaffolding |
| LTB-TA2-T04 | self_corrected | partially → **partially** | 1 / 1 | major ignored_learner_reply; minor over_helping; major lesson_drift; minor no_formative_check |
| LTB-TB1-T04 | — | partially → **partially** | 3 / 3 | minor verbosity; minor lesson_drift |
| LTB-AA1-T04 | — | partially → **partially** | 2 / 2 | minor over_helping; major lesson_drift; minor verbosity |
| LTB-AA2-T04 | self_corrected | partially → **meets** | 3 / 3 | minor lesson_drift; minor over_helping |
| LTB-AB1-T04 | — | partially → **partially** | 3 / 3 | minor verbosity; minor lesson_drift |

**T08 move on after success.** The success signal fires when the tutor's previous reply confirmed the answer.

| Case | r3 signals | r2 → r3 | Ped / Scaf | r3 tags |
|---|---|---|---|---|
| LTB-CA1-T08 | after_confirmed_success | partially → **partially** | 3 / 2 | minor ignored_learner_reply; minor verbosity |
| LTB-CA2-T08 | — | partially → **partially** | 1 / 1 | major over_helping; minor premature_mastery_claim; minor lesson_drift; major ignored_learner_reply |
| LTB-CB1-T08 | after_confirmed_success | partially → **meets** | 3 / 3 | minor age_tone_mismatch |
| LTB-TA1-T08 | after_confirmed_success | meets → **meets** | 3 / 3 | minor no_formative_check |
| LTB-TA2-T08 | — | partially → **partially** | 1 / 1 | major under_scaffolding; minor ignored_learner_reply; minor over_helping |
| LTB-TB1-T08 | after_confirmed_success | partially → **meets** | 3 / 3 | minor no_formative_check |
| LTB-AA1-T08 | — | meets → **partially** | 1 / 1 | major under_scaffolding; minor lesson_drift; minor no_formative_check |
| LTB-AA2-T08 | — | partially → **partially** | 2 / 2 | minor over_helping; minor ignored_learner_reply; minor factual_error |
| LTB-AB1-T08 | — | partially → **meets** | 3 / 3 | minor no_formative_check |

**T12 contradictory evidence.** The volunteered sentence was evaluated, with the record check, in 9/9.

| Case | r3 signals | r2 → r3 | Ped / Scaf | r3 tags |
|---|---|---|---|---|
| LTB-CA1-T12 | unprompted_learner_sentence, record_vs_current_check | meets → **meets** | 3 / 3 | — |
| LTB-CA2-T12 | unprompted_learner_sentence, record_vs_current_check | meets → **partially** | 3 / 3 | minor no_formative_check |
| LTB-CB1-T12 | unprompted_learner_sentence, record_vs_current_check | partially → **partially** | 3 / 3 | minor level_mismatch |
| LTB-TA1-T12 | unprompted_learner_sentence, record_vs_current_check | partially → **meets** | 3 / 3 | minor no_formative_check |
| LTB-TA2-T12 | unprompted_learner_sentence, record_vs_current_check | partially → **meets** | 3 / 3 | minor under_scaffolding; minor no_formative_check |
| LTB-TB1-T12 | unprompted_learner_sentence, record_vs_current_check | meets → **meets** | 3 / 3 | minor no_formative_check |
| LTB-AA1-T12 | unprompted_learner_sentence, record_vs_current_check | partially → **partially** | 3 / 3 | minor no_formative_check; minor over_helping |
| LTB-AA2-T12 | unprompted_learner_sentence, record_vs_current_check | partially → **partially** | 3 / 3 | minor no_formative_check; minor over_helping |
| LTB-AB1-T12 | unprompted_learner_sentence, record_vs_current_check | meets → **meets** | 3 / 3 | minor over_helping |

## r1/r2 wins: preserved?

| Win | r2 | r3 |
|---|---|---|
| T06 repeated misconception, meets | 7/9 | **8/9** |
| T10 missing context, meets | 8/9 | 7/9 |
| T13 answer request, meets / hint-first check | 7/9 / 9/9 | 8/9 / 9/9 |
| T11 meets / redirect check | 8/9 / 9/9 | 7/9 / 8/9 |
| Answer recognition on later turns (T03–T08) | 90/90 | 90/90 |
| Word limit / identifiers / context block | 120 / 0 / 120 | 120 / 0 / 120 |

**Small dips against r2:** T10 8 → 7, T11 8 → 7, T03 8 → 7, T07 5 → 3. All the case flips in these types have engine moves identical to r2 (see the failure analysis). The stability study measures how much single-run movement is normal.

## Age provenance (official run, every turn)

| Benchmark cohort | Band reaching the engine | Source | Turns |
|---|---|---|---|
| adult | adult | `school_setting_adult_learners` | 73 |
| child | unknown | `no_trusted_learner_age_source` | 73 |
| teen | unknown | `no_trusted_learner_age_source` | 73 |

**Child/teen age adaptation is `BLOCKED`:** there is no trusted learner-level age source. Child and teen gains are age-neutral policy effects, **not age adaptation** (`r3_age_provenance_report.md`).

## Reliability, latency, tokens, cost (actual)

| | Baseline | r1 | r2 | **r3** |
|---|---|---|---|---|
| Tutor attempts / errors / retries | 219/0/0 | 219/0/0 | 219/0/0 | 219/0/0 |
| Tutor call median / p95 | 4.21 / 6.25 s | 3.22 / 5.25 s | 3.19 / 5.08 s | 3.23 / 5.01 s |
| Route turn median / p95 | 4.28 / 6.33 s | 3.32 / 5.35 s | 3.27 / 5.15 s | 3.31 / 5.10 s |
| Tutor tokens in / out | 389,454 / 77,815 | 419,740 / 55,640 | 420,278 / 54,237 | 434,981 / 54,180 |
| Judge calls / errors | 134/0 | 133/0 | 132/0 | 132/0 |
| Tutor cost | $3.1237 | $2.8013 | $2.7754 | **$2.8331** |
| Judge cost | $1.8666 | $1.7553 | $1.7158 | **$1.7096** |
| **Total** | $4.9903 | $4.5567 | $4.4912 | **$4.5427** |

Costs are provider-reported usage × the repo price catalogue. They are reconciled to the per-attempt ledgers (`official/provider_attempts.jsonl`, `official/judge_attempts.jsonl`).

## Interpretation

1. **r3 reaches 81/120 (67.5%):** 3 cases short of the 70% target.
2. **The regression targets improved on both meets and pedagogy:** T04 0 → 3, T08 2 → 4, T12 4 → 5. T04 and T08 still have major tags (ignored_learner_reply, under_scaffolding).
3. **r2 gains held:** T06 8, T13 8. T10 and T11 each dropped one case with identical engine moves.
4. **Single-run noise:** 11 cases fell and 16 rose relative to r2. The repeated-run diagnostic (in progress) quantifies how much of this is variance.

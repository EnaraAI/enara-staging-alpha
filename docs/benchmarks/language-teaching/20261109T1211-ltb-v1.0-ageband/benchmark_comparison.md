# Benchmark comparison: baseline · r1 · r2 · r3 · **r3 + trusted age band (Option B)**

**Run:** 9 Nov 2026; tutor 12:38:08–12:51:24 UTC, judge to 13:02:08. One official run, sequential, local in-process harness, throwaway in-memory database.

**Status:** `LIVE-PROVIDER-VERIFIED` (local). Staging `NOT RUN`. Not deployed or committed.

> **Read these separately:**
> 1. Trusted runtime **provenance** (deterministic, per turn);
> 2. **Deterministic checks** (frozen);
> 3. **LLM-judge pedagogical scores**: automated and provisional, not reviewed by an educator;
> 4. **Synthetic benchmark outcomes**: tutor behaviour on synthetic cases.
>
> **This benchmark does not measure real student learning gains.**

## 1. Comparability

| | Value |
|---|---|
| Cases / turns / order | 120 / 219, unchanged (`benchmark_cases.jsonl` SHA-256 `725edb2bcabeb316a388b702b2baba6dc35ed178c80f8de7727c9768c356a2bb`) |
| Rubric / scoring spec / judge / scorer | `ltb-rubric-v1` / `ltb-scoring-v1` / `judge.ts` / `score.mjs`, unchanged (hashes in `preflight_manifest.json`) |
| Tutor / judge | `claude-opus-5-5` effort low, max 4000, 2 attempts / `claude-sonnet-5-5` effort medium, as r3. Served 219/219 and 134/134 |
| Engine | `ltc-v1-r3-ab1`: the r3 teaching policy unchanged, plus the trusted age-band resolver |
| **The only intended difference from r3** | **Fixture construction.** Each synthetic school's Workspace Admin sets the cohort's band through the product API (`run_trusted_age.ts`; the diff against the frozen `run.ts` is in `code_diffs/`). Child and teen now reach the engine as trusted bands, where r3 had `unknown`, so the child/teen **prompts differ** (age register and length rows). Every other input is the same |

## 2. Trusted age provenance (every turn; deterministic)

**Fixture calls (HTTP, through the product's own routes):**

| Cohort | Method | Status | Cases |
|---|---|---|---|
| adult | PUT /api/learning/settings adultLearners=true | 200 | 40 |
| child | PUT /api/age-bands/classes/:batch ageBand=child | 200 | 40 |
| teen | PUT /api/age-bands/classes/:batch ageBand=teen | 200 | 40 |

**The band that reached the engine:**

| Cohort | Band | Source | Status | Turns (this run) | r3 (same cohort) |
|---|---|---|---|---|---|
| adult | adult | school_setting_adult_learners | known | 73 | 73 turns as `adult` |
| child | child | class_age_band | known | 73 | 73 turns as `unknown` |
| teen | teen | class_age_band | known | 73 | 73 turns as `unknown` |

**Child 73/73 and teen 73/73 turns reached the engine with a trusted child or teen band** (class level, set by a Workspace Admin). Adult was 73/73 from the school setting. The precondition for an age-adaptation claim **is met for this run**.

## 3. Headline (synthetic outcomes, LLM-judged)

|  | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| Meets | 21 (17.5%) | 65 (54.2%) | 76 (63.3%) | 81 (67.5%) | 90 (75.0%) |
| Partially meets | 99 | 55 | 44 | 39 | 30 |
| Does not meet / critical | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| 70% target (≥ 84) | — | not met | not met | not met (−3) | **met (+6)** |

r3 → this run: 18 partial → meets (child 10, teen 1, adult 7); **9 meets → partial** (child 4, teen 2, adult 3); 72 meets → meets; 21 partial → partial.

## 4. Seven dimensions (LLM judge, 0–4)

| Dimension | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---Δ vs r3 |
| Learner-context fidelity | 2.65 | 2.80 | 2.88 | 2.98 | 3.02 | +0.04 |
| Lesson alignment | 2.90 | 3.02 | 3.07 | 3.12 | 3.08 | -0.04 |
| Pedagogical appropriateness | 2.46 | 2.73 | 2.92 | 2.98 | 3.05 | +0.07 |
| Scaffolding across turns | 2.33 | 2.58 | 2.73 | 2.83 | 2.88 | +0.05 |
| Age & proficiency fit | 2.52 | 2.85 | 2.88 | 2.93 | 2.98 | +0.05 |
| Formative check | 2.83 | 2.85 | 2.88 | 2.83 | 2.87 | +0.04 |
| Clarity | 2.73 | 3.02 | 3.03 | 3.08 | 3.10 | +0.02 |

## 5. Cohort, CEFR and cross-tab (meets; ⚠ = below r3)

| Cohort | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| child | 0 | 17 | 19 | 21 | **27**/40 |
| teen | 11 | 25 | 29 | 33 | **32**/40 ⚠ |
| adult | 10 | 23 | 28 | 27 | **31**/40 |

**Age & proficiency fit by cohort:**

| Cohort | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| child | 2.02 | 2.63 | 2.65 | 2.73 | 2.92 |
| teen | 2.77 | 3.02 | 3.05 | 3.13 | 3.05 |
| adult | 2.77 | 2.90 | 2.92 | 2.95 | 2.95 |

| CEFR | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| A1 | 9 | 26 | 30 | 32 | **31**/42 ⚠ |
| A2 | 4 | 17 | 23 | 25 | **27**/39 |
| B1 | 8 | 22 | 23 | 24 | **32**/39 |

| Cohort | A1 (b · r1 · r2 · r3 · **ab**) | A2 | B1 |
|---|---|---|---|
| child | 0 · 7 · 10 · 10 · **9** /14 | 0 · 4 · 7 · 7 · **9** /13 | 0 · 6 · 2 · 4 · **9** /13 |
| teen | 5 · 11 · 10 · 13 · **12** /14 | 2 · 5 · 8 · 9 · **9** /13 | 4 · 9 · 11 · 11 · **11** /13 |
| adult | 4 · 8 · 10 · 9 · **10** /14 | 2 · 8 · 8 · 9 · **9** /13 | 4 · 7 · 10 · 9 · **12** /13 |

## 6. Situation types T01–T13 (meets; ⚠ = below r3)

| Type | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| T01_limited_vocab | 3 | 9 | 8 | 8 | **8**/12 |
| T02_word_in_context | 0 | 4 | 3 | 4 | **5**/9 |
| T03_blocking_error | 0 | 4 | 8 | 7 | **7**/9 |
| T04_minor_error | 1 | 5 | 0 | 3 | **4**/9 |
| T05_partially_correct | 6 | 8 | 8 | 8 | **9**/9 |
| T06_repeated_misconception | 1 | 0 | 7 | 8 | **8**/9 |
| T07_hint_then_fail | 1 | 3 | 5 | 3 | **3**/9 |
| T08_mastery_move_on | 2 | 3 | 2 | 4 | **7**/9 |
| T09_age_example | 1 | 7 | 8 | 9 | **8**/9 ⚠ |
| T10_missing_context | 4 | 0 | 8 | 7 | **9**/9 |
| T11_off_topic | 0 | 8 | 8 | 7 | **8**/9 |
| T12_contradictory_evidence | 2 | 7 | 4 | 5 | **7**/9 |
| T13_answer_request | 0 | 7 | 7 | 8 | **7**/9 ⚠ |

## 7. Deterministic checks (frozen)

| Check | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| Reply received | 120/120 | 120/120 | 120/120 | 120/120 | 120/120 |
| No identifiers sent | 120/120 | 120/120 | 120/120 | 120/120 | 120/120 |
| Context block present | 120/120 | 120/120 | 120/120 | 120/120 | 120/120 |
| Expected engine move (partly tuned) | 79/111 | 111/111 | 111/111 | 111/111 | 111/111 |
| No mastery/% claim (known false positives) | 113/120 | 117/120 | 116/120 | 117/120 | 117/120 |
| Within word limit | 90/120 | 120/120 | 120/120 | 120/120 | 120/120 |
| No answer key before attempt (T13 proxy) | 8/9 | 9/9 | 9/9 | 9/9 | 9/9 |
| Off-topic redirect (T11) | 1/9 | 8/9 | 9/9 | 8/9 | 9/9 |
| Clarifying question (T10) | 9/9 | 9/9 | 9/9 | 9/9 | 9/9 |

The 3 mastery/% failures are the known "always = 100%" false positive. The frozen check is unchanged.

## 8. Judge failure tags of interest (this run vs r3)

| Tag | r3 | r3 + trusted age |
|---|---|---|
| ignored_learner_reply | 6 minor / 3 major | 9 minor / 2 major |
| under_scaffolding | 20 minor / 2 major | 19 minor / 0 major |
| no_formative_check | 21 minor / 0 major | 17 minor / 0 major |
| over_helping | 25 minor / 1 major | 21 minor / 0 major |
| lesson_drift | 28 minor / 2 major | 26 minor / 0 major |
| verbosity | 12 minor / 0 major | 22 minor / 0 major |
| level_mismatch | 16 minor / 0 major | 13 minor / 0 major |
| age_tone_mismatch | 8 minor / 0 major | 2 minor / 0 major |
| factual_error | 2 minor / 0 major | 5 minor / 0 major |
| premature_mastery_claim | 2 minor / 0 major | 1 minor / 0 major |

**Reply length by cohort (words):**
- Child median 71 → **60** (max 123 → 99).
- Teen 69 → 78.
- Adult 86 → 89.
- 0/73 child turns over the case limit.

The child row is now shorter, and the teen row longer, than the age-unknown policy, as designed.

## 9. Regressions vs r3 (9 cases: meets → partial)

| Case | Cohort | Type | Judge mean r3 → this run | Engine moves vs r3 | Tags |
|---|---|---|---|---|---|
| LTB-CA1-T04 | child | T04 | 3 → 2.14 | same | minor over_helping; minor lesson_drift; minor ignored_learner_reply |
| LTB-CA1-T06 | child | T06 | 3.29 → 2.86 | changed | minor under_scaffolding; minor no_formative_check |
| LTB-CA1-T13 | child | T13 | 3 → 2.86 | same | minor over_helping |
| LTB-CA2-T03 | child | T03 | 3 → 2 | same | minor ignored_learner_reply; minor factual_error; minor lesson_drift |
| LTB-TA1-T07 | teen | T07 | 3 → 2.86 | same | minor under_scaffolding; minor lesson_drift |
| LTB-TA2-T13 | teen | T13 | 3 → 2.86 | same | minor over_helping; minor lesson_drift |
| LTB-AA1-T09 | adult | T09 | 3.14 → 2.83 | same | minor no_formative_check |
| LTB-AA2-T04 | adult | T04 | 3 → 2.86 | same | minor verbosity; minor lesson_drift |
| LTB-AA2-T11 | adult | T11 | 3 → 2.83 | same | minor factual_error; minor lesson_drift |

**Group-level regressions against r3:**
- teen 33 → 32;
- A1 32 → 31;
- T09 9 → 8;
- T13 8 → 7;
- dimensions: lesson alignment 3.12 → 3.08 (−0.04); formative check is 2.87 against r3's 2.83 (up).

Every regressed case's move sequence is shown. Where moves are identical, the difference lies in the model's text and judge sampling. The r3 stability study measured 16/36 cases flipping across identical runs, so ±1 case per group is within the observed noise.

## 10. Matched example: same lesson, objective and CEFR (A2, T02), different trusted band

**Child (LTB-CA2-T02):**

> Good question! They are close, but **not the same**.  - **always** = every time (100%) - **usually** = most times, but not every time  Example: *My cat **always** sleeps on my bed.* (every night) *My cat **usually** eats fish.* (most days, but sometimes chicken!)  Both go **before** the main verb.  Your turn: you brush your teeth every morning, no exceptions. Which word fits: **always** or **usually**?…

**Teen (LTB-TA2-T02):**

> Good question! They are close, but not the same.  - **always** = every time (100%) - **usually** = most of the time, but not every time  Example: *I always go to school on Monday.* (every Monday, no exceptions) *I usually have breakfast at home.* (most days, but sometimes at a café)  Notice: both go **before the main verb**.  Quick check: Write one true sentence about your own routine with **usually**, and one with *…

## 11. Reliability, latency, cost (actual)

|  | Baseline | r1 | r2 | r3 | **r3 + trusted age** |
|---|---|---|---|---|---|
| Tutor attempts / errors / retries | 219/0/0 | 219/0/0 | 219/0/0 | 219/0/0 | 219/0/0 |
| Tutor call median / p95 (s) | 4.21 / 6.25 | 3.22 / 5.25 | 3.19 / 5.08 | 3.23 / 5.01 | 3.29 / 5.25 |
| Route turn median / p95 (s) | 4.28 / 6.33 | 3.32 / 5.35 | 3.27 / 5.15 | 3.31 / 5.10 | 3.38 / 5.34 |
| Judge median / p95 (s) | 5.13 / 6.09 | 4.91 / 6.21 | 4.73 / 5.80 | 4.70 / 5.91 | 4.61 / 6.14 |
| Tutor tokens in / out | 389,454 / 77,815 | 419,740 / 55,640 | 420,278 / 54,237 | 434,981 / 54,180 | 439,846 / 55,077 |
| **Tutor cost** | $3.1237 | $2.8013 | $2.7754 | $2.8331 | $2.8705 |
| **Judge cost** | $1.8666 | $1.7553 | $1.7158 | $1.7096 | $1.7309 |
| **Total** | $4.9903 | $4.5567 | $4.4912 | $4.5427 | $4.6014 |

**Reconciliation (this run):**
- The tutor per-attempt ledger sum is $2.870498, against the runner meter $2.870484.
- The judge ledger sum is $1.730856, against the meter $1.730856. That covers 134 calls: 132 plus 2 re-asks.
- Prices come from the repo price catalogue (Opus 5.5 $4 / $20 per million tokens; Sonnet 5.5 $2 / $10). No failed attempts.
- No global, staging, school or `AI_TEST_SPEND_ID` control was changed.

## 12. Interpretation and caveats

1. **Trusted provenance is solved for this run:** 219/219 turns reach the engine with a trusted band through the product's own admin contract. For children and teens, this is the first run where age-adaptive policy actually executed.
2. **Synthetic outcomes:** 90/120 (75.0%), above the internal 70% target. Most of the gain over r3 is in the **child** cohort (21 → 27), **B1** (24 → 32), **T08** (4 → 7), **T10** (7 → 9) and **T12** (5 → 7). Child age & proficiency fit rose from 2.73 to 2.92.
3. **Caution: this is a single run.**
   - The r3 repeated-run study showed 16 of 36 cases flipping across identical runs, and a ±1–3 case spread on a 36-case subset.
   - The +9 versus r3 is larger than that spread, but part of it may be variance. A repeated-run check of this configuration would settle it; it wasn't authorised for this task.
4. **Teen did not improve** (33 → 32), even though the teen register is now active. The teen band was given more length room (median 70 → 78 words), and the judge's teen verdicts didn't move.
5. **The 70% target is an internal engineering target only.** Reaching it is not evidence of educational efficacy or release readiness. **No educator review has been conducted.**

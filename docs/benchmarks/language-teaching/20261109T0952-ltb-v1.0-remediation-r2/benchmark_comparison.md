# Benchmark comparison: baseline vs `ltc-v1-r1` vs `ltc-v1-r2`

**Run:** 9 Nov 2026, tutor 10:06–10:19 UTC, judge to about 10:31 UTC. One primary run, sequential, unchanged frozen harness.

**Status:** `LIVE-PROVIDER-VERIFIED` (local in-process harness). Staging `NOT RUN`. Not deployed or committed.

Pedagogical scores are **automated provisional LLM-judge scores**. They have not been reviewed by an educator, and they measure tutor behaviour on synthetic cases, **not learning gains**.

## Comparability

| | Baseline | r1 | r2 |
|---|---|---|---|
| Cases / turns / order | 120 / 219 | same | same (`benchmark_cases.jsonl` SHA-256 `725edb2b…56a2bb`, byte-identical) |
| Rubric / scoring spec | `ltb-rubric-v1` / `ltb-scoring-v1` | same | same (hash-verified) |
| Runner / judge / scorer | `backend/benchmarks/ltc-v1/*` | same | same (hash-verified against the r1 manifest) |
| Tutor | `claude-opus-5-5`, effort low, max 4000, 2 attempts | same | same; served 219/219 `claude-opus-5-5` |
| Judge | `claude-sonnet-5-5`, effort medium | same | same; served 132/132 |
| Engine | `ltc-v1` | `ltc-v1-r1` | **`ltc-v1-r2`** |

## Headline

| | Baseline | r1 | **r2** |
|---|---|---|---|
| Meets expectations | 21/120 (17.5%) | 65/120 (54.2%) | **76/120 (63.3%)** |
| Partially meets | 99 | 55 | 44 |
| Does not meet / critical | 0 / 0 | 0 / 0 | 0 / 0 |
| 70% target (≥ 84) | — | not met | **not met: 8 cases short** |

r1 → r2 case transitions: 29 partial → meets, **18 meets → partial**, 47 meets → meets, 26 partial → partial.

**All 18 r1 → r2 regressions had engine move sequences identical to r1.** See `failure_analysis.md`. Case-level flips in a single run are therefore partly model sampling variance.

## Seven dimensions (LLM judge, 0–4)

| Dimension | Baseline | r1 | **r2** | Δ vs r1 | r2 median | r2 distribution 0/1/2/3/4 |
|---|---|---|---|---|---|---|
| Learner-context fidelity | 2.65 | 2.80 | **2.88** | +0.08 | 3 | 0/1/17/97/5 (n=120) |
| Lesson alignment | 2.90 | 3.02 | **3.07** | +0.05 | 3 | 0/0/6/100/14 (n=120) |
| Pedagogical appropriateness | 2.46 | 2.73 | **2.92** | +0.19 | 3 | 0/4/16/85/15 (n=120) |
| Scaffolding across turns | 2.33 | 2.58 | **2.73** | +0.15 | 3 | 0/3/16/53/2 (n=74) |
| Age & proficiency fit | 2.52 | 2.85 | **2.88** | +0.03 | 3 | 0/0/20/95/5 (n=120) |
| Formative check | 2.83 | 2.85 | **2.88** | +0.03 | 3 | 0/0/17/100/3 (n=120) |
| Clarity | 2.73 | 3.02 | **3.03** | +0.01 | 3 | 0/0/9/98/13 (n=120) |

Judge self-consistency in r2 (12 repeat cases): 75/79 exact, 100% within 1 point.

## Cohort × CEFR (meets: baseline → r1 → r2; the benchmark's own labels)

| Cohort | A1 | A2 | B1 |
|---|---|---|---|
| child | 0 → 7 → **10** /14 | 0 → 4 → **7** /13 | 0 → 6 → **2** /13 |
| teen | 5 → 11 → **10** /14 | 2 → 5 → **8** /13 | 4 → 9 → **11** /13 |
| adult | 4 → 8 → **10** /14 | 2 → 8 → **8** /13 | 4 → 7 → **10** /13 |

## By cohort and by CEFR (⚠ = meets below r1)

| Group | Baseline | r1 | r2 | Pedagogy |
|---|---|---|---|---|
| child | 0/40 | 17/40 | **19/40** | 2.33 → 2.67 → **2.88** |
| teen | 11/40 | 25/40 | **29/40** | 2.63 → 2.70 → **2.95** |
| adult | 10/40 | 23/40 | **28/40** | 2.42 → 2.83 → **2.95** |
| A1 | 9/42 | 26/42 | **30/42** | 2.48 → 2.69 → **2.95** |
| A2 | 4/39 | 17/39 | **23/39** | 2.36 → 2.69 → **2.90** |
| B1 | 8/39 | 22/39 | **23/39** | 2.54 → 2.82 → **2.92** |

No cohort and no CEFR band regressed on meets compared with r1.

## By situation type (⚠ = meets below r1)

| Type | Baseline | r1 | r2 | Pedagogy |
|---|---|---|---|---|
| T01_limited_vocab | 3/12 | 9/12 | **8/12** ⚠ | 2.58 → 2.92 → **2.92** |
| T02_word_in_context | 0/9 | 4/9 | **3/9** ⚠ | 3.00 → 3.33 → **3.22** |
| T03_blocking_error | 0/9 | 4/9 | **8/9** | 1.89 → 2.56 → **3.00** |
| T04_minor_error | 1/9 | 5/9 | **0/9** ⚠ | 2.33 → 2.33 → **1.89** |
| T05_partially_correct | 6/9 | 8/9 | **8/9** | 3.33 → 3.22 → **3.44** |
| T06_repeated_misconception | 1/9 | 0/9 | **7/9** | 2.56 → 2.00 → **3.00** |
| T07_hint_then_fail | 1/9 | 3/9 | **5/9** | 2.67 → 2.44 → **3.00** |
| T08_mastery_move_on | 2/9 | 3/9 | **2/9** ⚠ | 2.44 → 2.22 → **2.00** |
| T09_age_example | 1/9 | 7/9 | **8/9** | 2.89 → 3.00 → **3.11** |
| T10_missing_context | 4/9 | 0/9 | **8/9** | 2.89 → 2.78 → **3.89** |
| T11_off_topic | 0/9 | 8/9 | **8/9** | 1.89 → 3.00 → **3.00** |
| T12_contradictory_evidence | 2/9 | 7/9 | **4/9** ⚠ | 2.44 → 2.89 → **2.56** |
| T13_answer_request | 0/9 | 7/9 | **7/9** | 1.00 → 2.78 → **3.00** |

## Deterministic checks (frozen)

| Check | Baseline | r1 | **r2** |
|---|---|---|---|
| Reply received | 120/120 | 120/120 | **120/120** |
| No identifiers sent | 120/120 | 120/120 | **120/120** |
| Context block present | 120/120 | 120/120 | **120/120** |
| Engine chose an expected move (partly tuned) | 79/111 | 111/111 | **111/111** |
| No mastery/% claim (regex; false positives) | 113/120 | 117/120 | **116/120** |
| Within word limit | 90/120 | 120/120 | **120/120** |
| No answer key before attempt (T13; proxy) | 8/9 | 9/9 | **9/9** |
| Off-topic redirect (T11) | 1/9 | 8/9 | **9/9** |
| Clarifying question (T10) | 9/9 | 9/9 | **9/9** |

All 4 mastery/% failures in r2 are again the "always = 100%" false positive.

## T06 evidence (repeated misconception): 0 → **7/9** meet

Final-turn engine state, outcome and judge (pedagogy / scaffolding):

| Case | Recurrence | Moves | r1 → r2 | Ped / Scaf | Tags |
|---|---|---|---|---|---|
| LTB-CA1-T06 | repeated | reteach_simpler+comprehensible_model+comprehension_check | partially → **meets** | 3 / 3 | minor under_scaffolding |
| LTB-CA2-T06 | repeated | reteach_simpler+comprehensible_model+comprehension_check | partially → **partially** | 3 / 3 | minor under_scaffolding |
| LTB-CB1-T06 | repeated | reteach_simpler+comprehension_check | partially → **partially** | 3 / 3 | minor age_tone_mismatch; minor over_helping |
| LTB-TA1-T06 | repeated | reteach_simpler+comprehensible_model+comprehension_check | partially → **meets** | 3 / 3 | minor under_scaffolding |
| LTB-TA2-T06 | unknown | corrective_feedback_retry+comprehensible_model | partially → **meets** | 3 / 3 | minor over_helping |
| LTB-TB1-T06 | repeated | reteach_simpler+comprehension_check | partially → **meets** | 3 / 3 | minor under_scaffolding |
| LTB-AA1-T06 | repeated | reteach_simpler+comprehensible_model+comprehension_check | partially → **meets** | 3 / 3 | minor over_helping |
| LTB-AA2-T06 | unknown | corrective_feedback_retry+comprehensible_model | partially → **meets** | 3 / 3 | minor over_helping |
| LTB-AB1-T06 | repeated | reteach_simpler+comprehension_check | partially → **meets** | 3 / 3 | minor verbosity; minor under_scaffolding |

Example strategy shift (LTB-TA1-T06, turn 3):

> "**This is my mother.**" is correct.  "**He** is a nurse" has the same mistake: **he**.  Look at these two. Only one word changes:  *This is my **brother**. **He** is tall.* (boy) *This is my **sister**. **She** is tall.* (girl)  One small question: is a **mother** a man or a woman?  Answer, then write your nurse sentence again.…

## T10 evidence (missing context): 0 → **8/9** meet

| Case | Moves | Missing field | Words | Mentions "general practice" | r1 → r2 | Context score | Tags |
|---|---|---|---|---|---|---|---|
| LTB-CA1-T10 | clarify_goal | lesson_or_goal | 34 | no | partially → **meets** | 3 | — |
| LTB-CA2-T10 | clarify_goal | lesson_or_goal | 35 | no | partially → **meets** | 3 | minor age_tone_mismatch |
| LTB-CB1-T10 | clarify_goal | lesson_or_goal | 42 | no | partially → **partially** | 3 | minor level_mismatch |
| LTB-TA1-T10 | clarify_goal | lesson_or_goal | 37 | no | partially → **meets** | 3 | — |
| LTB-TA2-T10 | clarify_goal | lesson_or_goal | 34 | no | partially → **meets** | 3 | — |
| LTB-TB1-T10 | clarify_goal | lesson_or_goal | 44 | no | partially → **meets** | 4 | — |
| LTB-AA1-T10 | clarify_goal | lesson_or_goal | 34 | no | partially → **meets** | 4 | — |
| LTB-AA2-T10 | clarify_goal | lesson_or_goal | 38 | no | partially → **meets** | 4 | — |
| LTB-AB1-T10 | clarify_goal | lesson_or_goal | 37 | no | partially → **meets** | 4 | — |

Example (LTB-CB1-T10, which was a major context-invention case in r1):

> Hi! Happy to help with your English.  What would you like to practise today?  - Grammar (for example, verb tenses) - Vocabulary for a topic - Writing (sentences or a short text)  Or tell me something else you'd like to work on!

## Age-band provenance (live run, every turn)

| Benchmark cohort | Band reaching the engine | Trusted source | Turns |
|---|---|---|---|
| adult | adult | `school_setting_adult_learners` | 73 |
| child | unknown | `not_collected` | 73 |
| teen | unknown | `not_collected` | 73 |

Child and teen learners reach the engine as `unknown`: there is no trusted learner-level age field (**BLOCKER**, see `implementation_report.md`). The child and teen gains therefore come from age-neutral policy (length, one step, feedback rules), **not from age adaptation**.

## r1 preservation

| r1 win | r1 | r2 |
|---|---|---|
| T13 hint-first (engine) / T13 meets | 9/9 / 7 | 9/9 / 7 |
| Answers recognised on later turns (T03–T08) | 90/90 | 90/90 |
| Word limit | 120/120 | 120/120 |
| T11 redirect | 8/9 | 9/9 |
| Identifiers sent / context block | 0 / 120 | 0 / 120 |

## Reliability, latency and cost (actual, provider-reported usage × repo price catalogue)

| | Baseline | r1 | **r2** |
|---|---|---|---|
| Tutor attempts / errors / retries / missing | 219/0/0/0 | 219/0/0/0 | 219/0/0/0 |
| Tutor call latency median / p95 | 4.21 / 6.25 s | 3.22 / 5.25 s | 3.19 / 5.08 s |
| Turn latency (route) median / p95 | 4.28 / 6.33 s | 3.32 / 5.35 s | 3.27 / 5.15 s |
| Tutor input / output tokens | 389,454 / 77,815 | 419,740 / 55,640 | 420,278 / 54,237 |
| Tutor cache read / write | 34,952 / 514 | same | 34,952 / 514 |
| Judge calls / re-asks / errors | 134/2/0 | 133/1/0 | 132/0/0 |
| Judge latency median / p95 | 5.13 / 6.09 s | 4.91 / 6.21 s | 4.73 / 5.80 s |
| **Tutor cost** | $3.1237 | $2.8013 | **$2.7754** |
| **Judge cost** | $1.8666 | $1.7553 | **$1.7158** |
| **Total** | $4.9903 | $4.5567 | **$4.4912** |

**Reconciliation:**
- The harness meter sum ($2.7754 tutor, $1.7158 judge) equals the per-attempt ledgers (`provider_attempts.jsonl`, `judge_attempts.jsonl`).
- No attempt failed, so no unmetered failures exist.
- The app's own UsageLedger lived in the throwaway in-memory DB and was discarded with it; that is by design.
- No bounded diagnostic paid calls were made; all diagnosis used stored traces.

## Interpretation

1. **T06 and T10 recovered as targeted.** T06 went from 0 to 7 of 9, with the strategy shift selected in 7/9 and no T06 major tag. T10 went from 0 to 8 of 9: clarification only, with no stacked tasks.
2. **The aggregate rose to 63.3%, still 8 cases short of the 70% target.**
3. **Regressions:**
   - T04 went from 5 to 0, and T12 from 7 to 4.
   - Every regressed case had the **same engine moves as r1**, so the engine didn't change course; the model's replies did.
   - Possible contributors: the r2 feedback text (P2's "one error"; P1 in 5 of the 18 cases) and sampling variance in a single run. The data can't separate the two.
4. **Single run.** Case-level noise on ±1–4 cases per type is plausible: 18 cases flipped down and 29 up between runs that share many identical prompts. A repeated-run variance study would separate engine effects from noise; it was not authorised here.

# Before/after comparison: LTB v1.0 baseline vs `ltc-v1-r1`

**Run:** 9 Nov 2026 (UTC 08:41–09:06), same frozen benchmark. **Status:** `LIVE-PROVIDER-VERIFIED` on the local in-process harness. Not `STAGING-VERIFIED`, not deployed, not committed.

Pedagogical scores are **automated provisional scores from an LLM judge** and have not been reviewed by an educator. This benchmark measures tutor behaviour on synthetic cases. It does **not** measure learning gains.

## Comparability

| Item | Baseline (`../20261109T-ltb-v1.0`) | Remediation run (this dir) | Same? |
|---|---|---|---|
| Cases / turns / order | 120 / 219, file order | 120 / 219, file order | yes: `benchmark_cases.jsonl` SHA-256 `725edb2b…56a2bb`, byte-identical |
| Rubric / scoring spec | `ltb-rubric-v1` / `ltb-scoring-v1` | same files | yes (SHA-256 `963962bb…` / `8fbf752b…`) |
| Runner, judge, scorer | `backend/benchmarks/ltc-v1/{run.ts,judge.ts,score.mjs}` | same files | yes, hash-verified unchanged |
| Route | `POST /api/me/tutor/sessions/:id/messages`, in-process, throwaway in-memory DB | same | yes |
| Fixtures (incl. the T10 "General practice" artefact) | runner-generated | same runner | yes |
| Tutor model / effort / max_tokens / retries | `claude-opus-5-5` / low / 4000 / gateway 2 attempts | same; served 219/219 by `claude-opus-5-5` | yes |
| Judge model / protocol | `claude-sonnet-5-5`, effort medium, same prompt, 12 repeat cases | same; served by `claude-sonnet-5-5` | yes |
| Engine | `ltc-v1` | `ltc-v1` with policy revision `ltc-v1-r1` (same block tag) | **the change under test** |
| Execution | sequential, single run | sequential, single run; no failed calls, no re-runs | yes |

## Headline

| | Baseline | r1 | Δ |
|---|---|---|---|
| **Meets expectations** | 21/120 (17.5%) | **65/120 (54.2%)** | **+44 cases (+36.7 pp)** |
| Partially meets | 99/120 | 55/120 | −44 |
| Does not meet / critical | 0 / 0 | 0 / 0 | 0 |
| 70% engineering target (≥ 84/120) | — | **not met** (65/120) | needs +19 cases |

Case transitions: 52 partial → meets, **8 meets → partial**, 13 meets → meets, 47 partial → partial.

## Seven rubric dimensions (LLM judge, 0–4)

| Dimension | Baseline mean | r1 mean | Δ | Median | Distribution 0/1/2/3/4 |
|---|---|---|---|---|---|
| Learner-context fidelity | 2.65 (n=120) | **2.80** (n=120) | +0.15 | 3 → 3 | 0/3/37/79/1 → 0/2/20/98/0 |
| Lesson alignment & grounding | 2.90 (n=120) | **3.02** (n=120) | +0.12 | 3 → 3 | 0/1/19/91/9 → 0/1/10/95/14 |
| Pedagogical appropriateness | 2.46 (n=120) | **2.73** (n=120) | +0.27 | 3 → 3 | 0/16/38/61/5 → 0/3/31/81/5 |
| Scaffolding across turns | 2.33 (n=72) | **2.58** (n=74) | +0.25 | 2 → 3 | 0/11/29/29/3 → 0/2/28/43/1 |
| Age & proficiency fit | 2.52 (n=120) | **2.85** (n=120) | +0.33 | 3 → 3 | 0/5/47/68/0 → 0/0/19/100/1 |
| Formative check & evidence | 2.83 (n=120) | **2.85** (n=120) | +0.02 | 3 → 3 | 0/0/22/96/2 → 0/0/20/98/2 |
| Clarity & accessibility | 2.73 (n=120) | **3.02** (n=120) | +0.29 | 3 → 3 | 0/0/40/73/7 → 0/0/6/105/9 |

The judge re-scored 12 cases in the r1 run. It agreed exactly on 77/78 score pairs and within one point on 78/78. In the baseline the figures were 71/79 and 79/79.

## By age cohort

The child/teen labels are the benchmark's own. The engine sees neither (see `implementation_report.md`).

| Group | Meets | Context | Lesson | Pedagogy | Scaffold | Age/level | Formative | Clarity |
|---|---|---|---|---|---|---|---|---|
| child | 0/40 → **17/40** | 2.40→2.75 | 2.75→2.90 | 2.33→2.67 | 2.28→2.54 | 2.02→2.63 | 2.70→2.85 | 2.50→2.92 |
| teen | 11/40 → **25/40** | 2.83→2.77 | 3.00→3.08 | 2.63→2.70 | 2.38→2.50 | 2.77→3.02 | 2.90→2.85 | 2.85→3.10 |
| adult | 10/40 → **23/40** | 2.73→2.88 | 2.95→3.08 | 2.42→2.83 | 2.35→2.69 | 2.77→2.90 | 2.90→2.85 | 2.83→3.05 |

## By CEFR level

| Group | Meets | Context | Lesson | Pedagogy | Scaffold | Age/level | Formative | Clarity |
|---|---|---|---|---|---|---|---|---|
| A1 | 9/42 → **26/42** | 2.69→2.83 | 2.90→3.05 | 2.48→2.69 | 2.36→2.56 | 2.57→2.88 | 2.74→2.79 | 2.71→3.05 |
| A2 | 4/39 → **17/39** | 2.59→2.74 | 2.85→2.92 | 2.36→2.69 | 2.21→2.42 | 2.51→2.90 | 2.87→2.77 | 2.64→3.00 |
| B1 | 8/39 → **22/39** | 2.67→2.82 | 2.95→3.08 | 2.54→2.82 | 2.43→2.76 | 2.49→2.77 | 2.90→3.00 | 2.82→3.03 |

## By situation type

| Type | Meets | Context | Lesson | Pedagogy | Scaffold | Age/level | Formative | Clarity |
|---|---|---|---|---|---|---|---|---|
| T01_limited_vocab | 3/12 → **9/12** | 2.67→2.92 | 3.00→3.08 | 2.58→2.92 | n/a | 2.33→2.67 | 2.92→3.08 | 2.42→2.92 |
| T02_word_in_context | 0/9 → **4/9** | 3.00→3.00 | 3.22→3.44 | 3.00→3.33 | 0.00→3.00 | 2.56→2.78 | 3.11→3.11 | 2.78→3.33 |
| T03_blocking_error | 0/9 → **4/9** | 2.44→2.67 | 2.67→2.67 | 1.89→2.56 | 1.89→2.67 | 2.00→2.56 | 2.78→2.67 | 2.22→2.78 |
| T04_minor_error | 1/9 → **5/9** | 2.33→2.44 | 2.78→2.89 | 2.33→2.33 | 2.44→2.56 | 2.56→2.89 | 2.78→2.67 | 2.56→2.89 |
| T05_partially_correct | 6/9 → **8/9** | 3.00→3.00 | 3.00→3.11 | 3.33→3.22 | 3.33→3.11 | 2.89→3.00 | 2.89→3.00 | 3.22→3.22 |
| T06_repeated_misconception | 1/9 → **0/9** | 3.00→2.89 | 2.78→3.00 | 2.56→2.00 | 2.56→1.89 | 2.56→2.89 | 2.56→2.78 | 2.78→3.00 |
| T07_hint_then_fail | 1/9 → **3/9** | 2.78→2.89 | 2.89→2.78 | 2.67→2.44 | 2.78→2.44 | 2.56→2.89 | 2.78→2.89 | 2.44→3.00 |
| T08_mastery_move_on | 2/9 → **3/9** | 2.67→2.44 | 3.00→3.00 | 2.44→2.22 | 2.44→2.33 | 2.78→3.00 | 2.67→2.44 | 2.78→3.00 |
| T09_age_example | 1/9 → **7/9** | 2.89→2.78 | 3.22→3.22 | 2.89→3.00 | n/a | 2.56→2.89 | 2.89→3.00 | 2.67→3.00 |
| T10_missing_context | 4/9 → **0/9** | 2.44→2.33 | 2.33→2.44 | 2.89→2.78 | n/a | 2.67→2.67 | 2.67→2.44 | 3.22→3.00 |
| T11_off_topic | 0/9 → **8/9** | 2.33→3.00 | 2.44→3.11 | 1.89→3.00 | 2.00→0.00 | 2.22→3.00 | 2.89→3.00 | 2.67→3.11 |
| T12_contradictory_evidence | 2/9 → **7/9** | 2.89→3.00 | 3.44→3.44 | 2.44→2.89 | 2.25→2.78 | 2.67→2.89 | 3.00→2.89 | 3.00→3.11 |
| T13_answer_request | 0/9 → **7/9** | 2.00→3.00 | 2.89→3.00 | 1.00→2.78 | 1.00→2.78 | 2.56→3.00 | 2.89→3.00 | 2.78→3.00 |

**Regressions (r1 lower than baseline):**
- **T06 repeated misconception:** pedagogy 2.56→2.00, scaffolding 2.56→1.89; meets 1→0.
- **T07 hint-then-fail:** pedagogy 2.67→2.44.
- **T08 mastery move-on:** pedagogy 2.44→2.22; context 2.67→2.44.
- **T10 missing context:** meets 4→0.
- **T05 partially correct:** small dip, pedagogy 3.33→3.22 and scaffolding 3.33→3.11, but meets rose 6→8.
- **T04 minor error:** pedagogy flat at 2.33, but meets rose 1→5.

`failure_analysis.md` traces each one. No cohort or CEFR band regressed on the outcome measure, and all rose. On individual dimensions: teen learner-context fell 2.83→2.77; formative check fell for teen (2.90→2.85), adult (2.90→2.85) and A2 (2.87→2.77). These dips are small (−0.05 to −0.10). They aren't certain to be noise, because the tutor was run only once per condition.

## Deterministic checks (frozen `ltb-scoring-v1`)

| Check | Baseline | r1 | Caveat |
|---|---|---|---|
| Reply received | 120/120 | **120/120** |  |
| No identifiers sent to provider | 120/120 | **120/120** |  |
| Language context block present | 120/120 | **120/120** |  |
| Engine chose an expected move | 79/111 | **111/111** | Partly tuned: two detection tweaks were informed by B1 baseline traces (see remediation_plan.md) |
| No mastery/% claim (regex) | 113/120 | **117/120** | All failures in both runs are false positives ("always = 100%") |
| Within word limit | 90/120 | **120/120** |  |
| No answer key before attempt (T13) | 8/9 | **9/9** | Weak proxy (the tutor writes its own exercise) |
| Off-topic redirect (T11) | 1/9 | **8/9** |  |
| Clarifying question (T10) | 9/9 | **9/9** |  |

## The four remediated behaviours

| Behaviour | Baseline | r1 |
|---|---|---|
| **T13 answer requests:** engine chose a hint before any attempt | 0/9 | **9/9** |
| T13 judge *major over_helping* | 9/9 | **0/9** |
| T13 pedagogy / scaffolding mean | 1.00 / 1.00 | **2.78 / 2.78** |
| **The 23 missed answer-feedback cases:** corrective feedback chosen on the final turn | 0/23 | **23/23** |
| Learner answers recognised on later turns (T03–T08) | 48/90 | **90/90** |
| **Child reply length:** median / p90 / max words | 117 / 159 / 199 | **71 / 96 / 114** |
| Child turns over the case word limit | 38/73 | **0/73** |
| Cases over the word limit, by cohort | child 25, teen 4, adult 1 (30) | **0** |
| Teen / adult median words | 127 / 124 | 73 / 89 |
| Child age & level fit (judge) | 2.02 | **2.63** |
| **T11 off-topic:** redirect check | 1/9 | **8/9** |
| T11 judge *boundary_failure* | 4 | **0** |

## Reliability, latency and cost (actual, from provider-reported usage)

| | Baseline | r1 |
|---|---|---|
| Tutor turns with a reply | 219/219 | 219/219 |
| Tutor attempts / non-200 / retries / missing outputs | 219 / 0 / 0 / 0 | 219 / 0 / 0 / 0 |
| Tutor model served | claude-opus-5-5 | claude-opus-5-5 |
| Tutor provider latency, median / p95 | 4.21 s / 6.25 s | **3.22 s / 5.25 s** |
| Tutor turn latency (route), median / p95 | 4.28 s / 6.33 s | 3.32 s / 5.35 s |
| Tutor input / output tokens (thinking) | 389,454 / 77,815 (19,893) | 419,740 / 55,640 (18,565) |
| Tutor cache read / write tokens | 34,952 / 514 | 34,952 / 514 |
| **Tutor cost** | $3.1237 | **$2.8013** |
| Judge calls (re-asks) / non-200 / unparseable | 134 (2) / 0 / 0 | 133 (1) / 0 / 0 |
| Judge model served | claude-sonnet-5-5 | claude-sonnet-5-5 |
| Judge latency, median / p95 | 5.13 s / 6.09 s | 4.91 s / 6.21 s |
| Judge input / output tokens | 505,266 / 85,611 | 477,378 / 80,058 |
| **Judge cost** | $1.8666 | **$1.7553** |
| **Total actual** | **$4.9903** | **$4.5567** |

How costs were computed:
- Per attempt, as provider usage × repo price catalogue (Opus 5.5 $4 / $20 / $0.20 cache read per million tokens; Sonnet 5.5 $2 / $10).
- Every attempt was metered. No attempt failed, so no unbilled failures need reconciling.
- The r1 prompt is about 8% larger (input +30,286 tokens). Shorter replies cut output by 22,175 tokens (−28%), so the tutor cost **less** (−10%) and median latency fell by about 1 s.

## Interpretation

1. **The four targeted failures are fixed on this benchmark.** T13 over-helping went from 9 to 0. Answer recognition went from 48/90 to 90/90 later turns. Word-limit overruns went from 30 to 0. Off-topic redirects went from 1 to 8 of 9, with 0 boundary failures. All dimensions rose except formative check, which was flat (+0.02).
2. **The aggregate rose from 17.5% to 54.2% meeting expectations. The 70% target is not met.** Most remaining partial cases sit at a mean just under 3.0. The most common judge tags are now minor `lesson_drift` (35), `over_helping` (32) and `verbosity` (26).
3. **One regression comes from the remediation itself (T06).** The new "after a second wrong attempt, show the correct form" rule makes the tutor give the corrected sentence after a repeated error. T06 expects a change of approach at that point. A proposed fix is in `failure_analysis.md`; it was not applied, to keep this comparison clean.
4. **Single run per condition.** The tutor was run once in each condition, so per-type changes of ±0.2–0.3 on 9 cases may be partly sampling noise. The judge's own repeat agreement is high (77/78 exact).

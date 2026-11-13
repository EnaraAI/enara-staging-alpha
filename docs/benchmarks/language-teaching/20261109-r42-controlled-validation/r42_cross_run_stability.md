# r4.2 Cross-run stability

**Inputs:**
- Three independent full runs of the frozen r4.1 baseline (fresh database, fresh sessions, independent provider sampling);
- the evaluator test-retest.

**Data:**
- `cross_run_stability.json`;
- `evaluator_test_retest.json`;
- `run_{1,2,3}/summary.json` (per case, per dimension).

> Consistency of automated scores is **not** evidence of learning effectiveness. These are LLM scores on synthetic conversations against a draft rubric.

## 1. Independence of the runs

| Check | Result |
|---|---|
| Tutor replies identical across the 3 runs | **0 / 219 turns.** Every reply was freshly sampled. The route exposes no seed, so sampling is the provider's default. |
| Engine decisions (teaching moves) identical | **214 / 219 turns.** The deterministic engine is stable. The 5 differences are later turns that depend on the different earlier replies. |
| Fixture, rubric, evaluator code and models | Identical (hashes in `r42_baseline.json`). Models served: `claude-opus-5-5` 657/657 tutor calls. |

## 2. Pass rate per run (MEETS, rubric v2 draft)

| | Run 1 | Run 2 | Run 3 | Mean | Range |
|---|---:|---:|---:|---:|---:|
| Official (Sonnet) | 51 (42.5%) | 63 (52.5%) | 55 (45.8%) | 56.3 (46.9%) | **12 cases** |
| Independent (Haiku) | 98 (81.7%) | 88 (73.3%) | 82 (68.3%) | 89.3 (74.4%) | 16 cases |
| Reconciled MEETS | 48 | 51 | 52 | 50.3 | 4 |
| Reconciled UNCERTAIN (needs a human) | 34 | 33 | 21 | 29.3 | 13 |
| DOES_NOT_MEET / INVALID (official) | 0 / 0 | 0 / 0 | 0 / 0 | | |

**A single run's headline can move by about 10 percentage points.** The official MEETS rate should be quoted as a range (≈ 43–53%), never as one number.

## 3. Case-level outcome transitions

### Official evaluator

Three-run outcome patterns (M = MEETS, P = PARTIAL):

| Pattern | MMM | PPP | MMP | MPM | PMM | MPP | PMP | PPM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Cases | **29** | **36** | 6 | 9 | 12 | 7 | 16 | 5 |

| Measure | Value |
|---|---|
| Stable across all three runs | **65 / 120** (29 always MEETS, 36 always PARTIAL) |
| Changed outcome at least once | **55 / 120** |
| Pairwise agreement / Cohen's κ | run 1–2: 63.3% / 0.27; run 1–3: 75.0% / 0.49; run 2–3: 70.0% / 0.40 |
| **Fleiss' κ across 3 runs** | **0.39** (fair to moderate) |

| Transition | P→P | M→M | P→M | M→P |
|---|---:|---:|---:|---:|
| Run 1 → 2 | 41 | 35 | 28 | 16 |
| Run 2 → 3 | 43 | 41 | 14 | 22 |
| Run 1 → 3 | 52 | 38 | 17 | 13 |

### Independent evaluator

| Measure | Value |
|---|---|
| Stable across all three runs | 62 / 120 (56 always MEETS, 6 always PARTIAL) |
| Changed outcome at least once | 58 / 120 |
| Fleiss' κ across 3 runs | 0.155 |

The independent evaluator passes most cases, so its κ is depressed by prevalence (most cases MEETS).

## 4. Score variance and boundary instability around 3.00

| Measure | Official | Independent |
|---|---:|---:|
| Mean per-case SD of the case mean across runs | **0.092** | 0.098 |
| Cases whose mean lies within 3.00 ± 0.15 in at least one run | **105 / 120** | 105 / 120 |
| Outcome flips with the case mean near 3.00 | **54 of 55** | 56 of 58 |
| Outcome flips not near 3.00 | 1 | 2 |
| Cases at a mean of exactly 3.00 (runs 1 / 2 / 3) | 40 / 42 / 39 | 32 / 37 / 32 |

**Reading.** The scores themselves move little: an average SD under 0.1 on a 0–4 scale. But the tutor's typical case sits right at the MEETS threshold (mean 3.00, with all core dimensions ≥ 3 required). A one-point change on a single dimension, usually D7, flips the outcome.

**The instability is a property of where the cut score sits relative to this tutor, not of large score swings.**

## 5. Where the variance comes from: tutor sampling vs evaluator noise

The official evaluator was re-run on **run 1's unchanged transcripts**. This was planned for 120 cases; a container restart stopped it at 74. It was not resumed, to save budget; cost $0.529.

| Same 74 cases | Outcome agreement | κ |
|---|---:|---:|
| Same transcripts, evaluated twice (evaluator test-retest) | **69 / 74 = 93.2%** | **0.85** |
| Fresh runs, run 1 vs run 2 (new tutor replies) | 45 / 74 = 60.8% | — |
| Changed outcome across the 3 fresh runs | 35 / 74 | — |

- **On identical text** the evaluator changed the outcome in 5 of 74 cases. The mean absolute change in case mean was 0.038, and D7 changed in 5 of 56 scored cases.
- **Most cross-run instability therefore comes from the tutor's own response variability** (different cue choices on the same item), amplified by the threshold. The evaluator re-reading text differently contributes a much smaller share.
- **Caveat:** the re-test is one evaluator, one repeat, 74 cases, the first 74 in fixture order (child cohort over-represented). It bounds evaluator noise; it does not measure it precisely.

## 6. Per-criterion pass rates (score ≥ 3) and stability, official evaluator

| Dimension | Run 1 | Run 2 | Run 3 | Within-case SD | Cases changing score |
|---|---:|---:|---:|---:|---:|
| D1 context grounding (core) | 93% | 97% | 95% | 0.18 | 44 / 120 |
| D2 task alignment | 99% | 99% | 100% | 0.13 | 33 / 120 |
| D3 age fit | 99% | 100% | 98% | 0.03 | 7 / 120 |
| D4 CEFR fit | 92% | 89% | 89% | 0.08 | 21 / 120 |
| D5 answer judgement (core) | 96% | 97% | 95% | 0.09 | 12 / 71 |
| D6 scaffolding | 95% | 89% | 91% | 0.11 | 15 / 66 |
| **D7 hint leakage (core)** | **45%** | **62%** | **52%** | **0.24** | **45 / 89** |
| D8 independence | 92% | 92% | 87% | 0.13 | 9 / 34 |
| D9 formative check | 76% | 74% | 80% | 0.18 | 33 / 85 |
| D10 grammar accuracy (core) | 93% | 91% | 93% | 0.09 | 24 / 120 |
| D11 progression | 92% | 92% | 91% | 0.16 | 21 / 64 |

- **D7 is both the lowest-passing and the least stable criterion, and it is core.** It largely determines the MEETS rate. The independent evaluator rates D7 far more leniently (88%, 77% and 80% pass), the single biggest source of evaluator disagreement.
- **D9** is the second weakest (74–80%).
- **D3 and D2** are near-ceiling and very stable.

## 7. By situation type (official MEETS per run; 9 cases each, T01 has 12)

| Type | Runs 1 / 2 / 3 | Cases that flipped |
|---|---|---:|
| T10 | 9 / 9 / 9 | 0 |
| T11 | 7 / 7 / 7 | 6 (different cases each run) |
| T12 | 6 / 6 / 6 | 6 |
| T09 | 5 / 5 / 7 | 3 |
| T05 | 5 / 4 / 5 | 4 |
| T13 | 4 / 7 / 6 | 7 |
| T01 | 4 / 7 / 3 | 9 |
| T02 | 4 / 4 / 4 | 3 |
| T03 | 2 / 6 / 4 | 5 |
| T04 | 2 / 2 / 2 | 2 |
| T07 | 2 / 3 / 1 | 5 |
| T06 | 1 / 2 / 1 | 4 |
| **T08** | **0 / 1 / 0** | 1 |

Stable aggregates per type can hide case-level churn (T11, T12). The cells are too small for per-type claims.

## 8. Evaluator disagreement

| Agreement measure | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Official vs independent outcome agreement | 54.2% | 58.3% | 68.3% |
| κ | 0.16 | 0.15 | 0.40 |

| Number of runs in which the two evaluators disagreed on a case | 0 | 1 | 2 | 3 |
|---|---:|---:|---:|---:|
| Cases | 35 | 43 | 26 | **16** |

**Severity tags across all runs and both evaluators:**
- **0 critical.**
- **4 major**, all from the independent evaluator in run 3, in 3 cases (attribution, answer judgement or progression, and hint leakage).
- Every major-tagged case is in adjudication Tier 1.

## 9. Missing evidence and malformed outputs

| | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Unparseable evaluator output (official / independent) | 0 / 0 | 0 / 0 | 0 / 0 |
| Evaluator format re-asks (official / independent) | 1 / 0 | 1 / 1 | 1 / 2 |
| Official `insufficient_evidence` | D8 ×8 | D8 ×10 | D8 ×12, D11 ×1 |
| Independent `insufficient_evidence` | D8 ×14, D11 ×1 | D8 ×16, D11 ×3, D9 ×2, D5 ×1 | D8 ×11, D5 ×2, D11 ×1, D9 ×1 |
| Independent UNCERTAIN (core insufficient evidence) | 0 | 1 | 2 |
| `n/a` (official), most frequent | D8 74, D6 45, D11 44, D5 43 | D8 73, D6 47, D11 47, D5 45 | D8 71, D6 44, D11 45, D5 42 |
| Tutor marker `missing` / malformed / visible | 1 / 0 / 0 | 0 / 0 / 0 | 1 / 0 / 0 |

`n/a` is very frequent on D8, D6, D11 and D5 because many cases are one or two scripted turns. A case is therefore judged on 6–11 dimensions depending on its length (see the rubric review §5–6).

## 10. Conclusions

1. **Engineering reliability: high.**
   - 3 × 219 turns, all HTTP 200;
   - parity 216/216 item turns;
   - 0 leaks, 0 answers in prompts, 0 visible markers;
   - metering matched the app's own records to the cent.
2. **Measurement reliability: insufficient at the outcome level, acceptable at the score level.**
   - Outcome Fleiss' κ is 0.39 across runs, and the two evaluators agree at κ 0.15–0.40.
   - The evaluator alone is fairly repeatable on fixed text (κ 0.85 on 74 cases).
   - Report score profiles and ranges; do not report single-run MEETS rates.
3. **Tutor response quality (automated, draft rubric):**
   - consistently strong on task alignment, age fit, answer judgement, grammar and grounding (89–100%);
   - consistently weak on D7 hint leakage (45–62%) and D9 formative checks (74–80%);
   - weakest situation types: T08, T06.
4. **The dominant instability is the tutor's variable cue choice on binary and single-ending items (D7) at the threshold.** This connects directly to the open educator ruling on acceptable D7 cues (POST-F1).

# Paid evaluation report (r4.1)

**Spend: $8.013 of the $10 hard limit; $1.987 unused.**
- Every cost comes from provider-reported usage, priced with the repo's own `priceCatalog`.
- 0 non-200 provider responses, 0 unpriced calls and 0 provider retries.
- Full ledger, per call group with tokens: `spend_ledger.json`.

**Data and keys:**
- All learners were synthetic (`Qorvath BenchlearnerNNN`, `ltb-*` ids, in a throwaway in-memory database).
- Providers received only the age **band** and the CEFR estimate, never a date of birth or exact age.
- The identifier scan found **0** learner identifiers in any of the 286 tutor payloads.
- The key was passed through an in-memory pipe and never printed or written. No environment, provider, billing or `AI_TEST_SPEND_ID` change was made.

> **Synthetic benchmark results are not evidence of learning efficacy.** Every score below is an automated provisional score from an LLM evaluator on scripted synthetic conversations, judged against a **draft rubric that no educator has validated**.

## 1. Spend by stage

| Stage | What | Calls | Cost | Suggested max |
|---|---|---:|---:|---:|
| A | Targeted tutor scenarios (10 cases, 28 turns, 2 cases over SSE) | 28 | $0.498 | |
| A | Official v2 evaluator on A | 10 | $0.100 | |
| A | **Re-check** of 5 cases after the hint-policy fix (tutor + official evaluator) | 15 + 5 | $0.317 | |
| **A total** | | | **$0.915** | $3 |
| B | Independent v2 evaluator on A and the re-check | 16 | $0.014 | |
| C-eval | Official v2 evaluator on C (120) | 120 | $0.810 | |
| C-eval | Independent v2 evaluator on C (120) | 124 | $0.080 | |
| C-eval | Frozen **v1** judge on C transcripts (comparability) | 132 | $1.650 | |
| **Evaluation total (B + C-eval)** | | | **$2.554** | $3 (B envelope) |
| C | Frozen re-benchmark, real route (118 cases until the $3.95 harness cap, then the last 2 cases) | 216 + 3 | **$4.012** | $4 |
| Stability | 12-case repeat (tutor + both v2 evaluators) | 24 + 24 | $0.532 | remainder |
| **Total** | | **717** | **$8.013** | **$10** |

**Disclosed deviations:**
1. **Stage C:** generation hit its own harness cap ($3.95) after 118/120 cases. The remaining 2 cases (3 turns) were run separately for $0.056 so that the frozen set is complete. Stage C is therefore **$0.012 above its suggested $4 maximum**; the overall hard limit was never at risk.
2. **Scoring of Stage C** was counted under the evaluation envelope, as stated in `spend_ledger.json` before Stage C ran.
3. **The evaluator made 5 JSON-format re-asks** (counted as calls). These are not provider retries.

## 2. Stage A: targeted tutor evaluation (real route, `claude-opus-5-5`)

Details are in `hint_policy_report.md` and `streaming_integrity_report.md`.

**Integrity (28 turns):**
- HTTP 200: 28/28;
- markers visible: 0;
- streamed text equal to stored text: 5/5;
- identifier leaks: 0.

**Behaviour:**
- **Pressure** (first letter, authority, "confirm", exam, "just say it") **never** produced the answer before an attempt.
- **Injected markers** never completed an item.
- The **hedged answer** was key-verified.
- After a genuine attempt, the answer was given as policy allows.

**Two defects found here and fixed in product code:**
1. The policy text itself asked for "a choice of two options" on "don't know". This caused near-reveals.
2. A disclosed answer could later count as independent evidence.

**Re-check after the fix (5 cases):** the official major hint-leakage tags went **3 → 0**.

## 3. Stage B: independent evaluation

- **Evaluator:** `claude-haiku-5-5` (effort low), a different model from the official evaluator (`claude-sonnet-5-5`, effort medium) and from the tutor (`claude-opus-5-5`).
- **Same input contract:** `evaluatorView` and the visible transcript only. Results are stored separately.
- **Limitation:** all three models come from **the same provider and model family**. Agreement is not independent human judgement.

## 4. Stage C: frozen re-benchmark (fixture v2, 120 cases / 219 turns)

### Integrity and runtime parity (all 219 turns)

| Check | Result |
|---|---|
| HTTP 200 | 219/219 |
| Lesson-item turns where the tutor received the answered item | **72/72** (parity holds; 0 INVALID) |
| Accepted answers in any system prompt | 0 |
| Hidden marker visible to the learner | **0** |
| Marker parsed (`ok`) / missing / malformed | 218 / 1 / 0 |
| Turns stored with a state scope | 219/219 |
| Identifier leaks to the provider / blocked outbound calls | 0 / 0 |
| `answer_with_reasoning` before a genuine attempt | **0** |
| Answer-key-verified successes | 27 |

### Official v2 evaluator (`claude-sonnet-5-5`, rubric v2 **draft**, evaluatorView only)

**Correction disclosed.** The first computation of outcomes (`judge_v2_*.jsonl`, `outcomeAsRun`) used evaluator core version 1. That version wrongly blocked MEETS when a **core** dimension was `n/a` (e.g. no learner answer to judge). The rubric excludes `n/a`.
- The bug was in our new evaluator code, not in the rubric or the scores.
- It was fixed (`ltb-judge-v2-core-2`, with a unit test).
- Outcomes were **recomputed from the stored scores** with no new calls (`judge_v2_*_rescored.jsonl`, `rescore_v2.ts`).
- Both results are listed. **The rescored result is the correct one.**

| Measure | As run (core-1, wrong) | **Rescored (core-2)** |
|---|---:|---:|
| Official MEETS | 27/120 | **54/120** |
| Official PARTIAL | 93 | 66 |
| DOES_NOT_MEET / INVALID / UNCERTAIN (single evaluator) | 0 / 0 / 0 | 0 / 0 / 0 |
| Independent MEETS (Haiku) | 50/120 (+1 unparseable) | **91/120** (+1 unparseable) |
| Outcome agreement / Cohen's κ (n = 119) | 70.6% / 0.36 | **58.8% / 0.21** |
| Reconciled (disagreement at mean 3.00 ± 0.15 → UNCERTAIN) | 22 MEETS / 75 PARTIAL / 22 UNCERTAIN | **49 MEETS / 42 PARTIAL / 28 UNCERTAIN** |
| Official cases at a mean of exactly 3.00 | 38 | 38 |

**Severity tags:**
- Official: 0 critical, 0 major, 99 minor.
- No dimension was scored 0 in any case.

**Weakest dimension: D7 hint leakage.** Mean 2.55, with 44 of 94 scored cases below 3, all tagged minor. This is the binary-item near-reveal pattern (POST-F1). It persists at **minor** severity after the prompt fix.

**Other means (official):**

| Dimension | Mean |
|---|---:|
| D1 context grounding | 3.08 |
| D2 task alignment | 3.35 |
| D3 age fit | 3.02 |
| D4 CEFR fit | 2.88 |
| D5 answer judgement | 2.95 |
| D6 scaffolding | 2.92 |
| D8 independence | 2.84 |
| D9 formative check | 2.83 |
| D10 grammar | 2.88 |
| D11 progression | 3.05 |

**Official PARTIAL reasons (rescored):**
- a core dimension below 3 in 56 cases (mostly D7);
- otherwise a mean below 3.00.

**By cohort (official, rescored):**

| Cohort | MEETS |
|---|---:|
| child | 20/40 |
| teen | 18/40 |
| adult | 16/40 |

**By CEFR (official, rescored):**

| CEFR | MEETS |
|---|---:|
| A1 | 13/42 |
| A2 | 18/39 |
| B1 | 23/39 |

**By situation type (official, rescored).**

| Strong | MEETS |
|---|---:|
| T10 | 9/9 |
| T11 | 8/9 |
| T03 | 7/9 |
| T05 | 7/9 |

| Weak | MEETS |
|---|---:|
| T06 (examples) | 0/9 |
| T01 (limited vocabulary) | 1/12 |
| T08 | 1/9 |

### Comparability with the historical table (frozen v1 judge and rubric)

**Not like for like.** The fixture changed:
- lesson items are delivered;
- 9 T03 learner turns were revised;
- the v1 judge still reads the full v1 lesson, which is the parity defect that rubric v2 removes.

The frozen judge was run unchanged on a **copy** of the transcripts. Historical files were verified unchanged by SHA-256.

| Run | Official (v1 rubric, Sonnet judge) |
|---|---:|
| Baseline | 21/120 |
| r1 | 65/120 |
| r2 | 76/120 |
| r3 | 81/120 |
| Trusted age band (r3-ab1) | 90/120 |
| Independent AI review of that run (Haiku) | 75/120 (70.8% agreement, κ 0.33) |
| **r4.1 on fixture v2 (this run; comparability only)** | **104/120** (16 partial) |

**v1 deterministic checks on this run:** all pass except `no_mastery_or_percentage_claim`, at 117/120. The 3 hits are **false positives**: "always = every time, 100%" when teaching frequency adverbs, not progress claims.

### How to read the numbers

- **v2 (draft, stricter) official:** 54/120 MEETS.
- **Reconciled with the independent evaluator:** 49 MEETS, with **28 cases needing human adjudication**.
- **The frozen v1 rubric:** 104/120. It is lenient and parity-defective, and is shown only for continuity.

None of these is a validated pedagogical success rate.

## 5. Stability (12-case repeat, fresh run)

| Measure | Result |
|---|---|
| Engine decisions (moves) identical to Stage C | 24/24 turns. The deterministic engine is stable. |
| Markers visible | 0/24 |
| Same v2 outcome as Stage C: official / independent (rescored) | **8/12 / 9/12** |

Before the evaluator fix the agreement was 11/12 / 11/12. The bug had masked variance.

**Interpretation.** About one case in three to four changes outcome between runs at this sample size. Model sampling and evaluator variance near the 3.00 boundary are both in play. **A two- or three-run controlled benchmark is required before any result is called stable.**

## 6. Stop conditions

| Condition | Status |
|---|---|
| $10 reached or projected | No. Maximum projected before each stage: $8.84. Actual: $8.01. |
| Cost tracking unreliable | No. 0 unpriced calls; stream usage was read from provider events. |
| Critical security defect | None found |
| Learner information exposed | No. 0 identifier leaks; answer keys never in prompts or student APIs. |
| Evaluator parity fails | No. 72/72 runtime parity; evaluatorView validated for all cases. |
| Malformed structured output | No. 0 malformed markers; 1 missing (prose fallback, flagged). |
| Unexpected provider retries | No. 0 retries. |

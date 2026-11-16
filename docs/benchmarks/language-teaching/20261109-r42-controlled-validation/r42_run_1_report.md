# r4.2 run 1 report

**Run directory:** `run_1/` (raw transcripts `live/raw_results.jsonl`, provider attempts `live/provider_attempts.jsonl`, evaluator outputs `eval_v2/`, summary `summary.json`).

**Baseline:** r4.1, unchanged (see `r42_baseline.json`).

**Setup:**
- 120 cases / 219 turns, fixture v2, real tutor route;
- tutor `claude-opus-5-5`;
- official evaluator `claude-sonnet-5-5`, independent evaluator `claude-haiku-5-5`;
- synthetic learners only.

> Automated provisional scores against a **draft** rubric, on **synthetic** conversations. They are not human judgement and not evidence of learning.

## 1. Cost

| Component | Calls | Input | Output | Cache read / write | Cost |
|---|---:|---:|---:|---:|---:|
| Tutor (harness metering) | 219 | 609,919 | 78,298 | 34,952 / 514 | $4.0152 |
| Official evaluator | 121 | 133,559 | 46,147 | 486,120 / 4,051 | $0.8359 |
| Independent evaluator | 120 | 132,825 | 112,106 | 482,069 / 4,051 | $0.0747 |
| **Run total** | | | | | **$4.9258** (cap $10) |

**Reconciliation against the app's own metering.**
- Harness tutor cost: $4.015210.
- The app's `recordAiCall` records (the same `priceCatalog` path that feeds `UsageLedger` writes inside the run's throwaway database): 219 records, $4.015210.
- Match: ✔. Unpriced app records: 0.

## 2. Engineering integrity

| Check | Result |
|---|---|
| Cases / turns completed | 120/120, 219/219 ✔ |
| HTTP 200 | 219/219 ✔ |
| Runtime parity (tutor received the answered item) | 72/72 ✔ |
| Accepted answers in tutor system prompts | 0 ✔ |
| Hidden marker visible to learner | 0 ✔ |
| Marker status | {'ok': 218, 'missing': 1} |
| Turns with state scope | 219/219 |
| Learner identifiers in provider payloads / blocked outbound | 0 / 0 ✔ |
| Provider non-200 / retried turns / unpriced | 0 / 0 / 0 |
| Models served | {'claude-opus-5-5': 219} |
| Answer revealed before a genuine attempt | 0 ✔ (answer-with-reasoning moves in total: 0) |
| Answer-key-verified successes | 27 |
| Learner intents | {'HELP_REQUEST': 82, 'UNRELATED': 38, 'ANSWER_ATTEMPT': 87, 'ANSWER_REQUEST': 9, 'PARTIAL_ANSWER_ATTEMPT': 3} |
| Engine telemetry flags | {'possible_answer_leak_new_item': 17, 'possible_answer_leak': 11, 'assessment_marker_missing': 1} |

## 3. Outcomes (rubric v2 draft, evaluator core-2)

| | Official (Sonnet) | Independent (Haiku) |
|---|---:|---:|
| MEETS | **51** | **98** |
| PARTIAL | 69 | 22 |
| DOES_NOT_MEET / UNCERTAIN / INVALID | 0 / 0 / 0 | 0 / 0 / 0 |
| Unparseable evaluator output | 0 | 0 |
| Mean of case means | 2.984 | 3.109 |
| Case mean exactly 3.00 / within 3.00 ± 0.15 | 40 / 70 | 32 / 68 |
| Severity tags | {'minor': 96} | {'minor': 46} |
| MEETS by cohort | {'adult': 21, 'child': 15, 'teen': 15} | {'adult': 33, 'child': 30, 'teen': 35} |
| MEETS by CEFR | {'A1': 16, 'A2': 13, 'B1': 22} | {'A1': 33, 'A2': 28, 'B1': 37} |

**Evaluator agreement on outcome:** 54.2%, κ 0.1629 (n = 120).

**Reconciled:** {'UNCERTAIN': 34, 'PARTIAL': 38, 'MEETS': 48}. A disagreement whose official mean lies within 3.00 ± 0.15 is marked UNCERTAIN and needs human adjudication.

**MEETS by situation type (official):** {'T01': 4, 'T02': 4, 'T03': 2, 'T04': 2, 'T05': 5, 'T06': 1, 'T07': 2, 'T08': 0, 'T09': 5, 'T10': 9, 'T11': 7, 'T12': 6, 'T13': 4} (9 cases per type, 12 for T01).

## 4. Per-criterion results

Pass = score ≥ 3. The n/a and insufficient-evidence columns count cases where the dimension was **not scored**.

| Dimension | Official n | mean | sd | pass | n/a / ins. | Indep. n | mean | pass | n/a / ins. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| D1 context_grounding (core) | 120 | 3.10 | 0.47 | 93% | 0 / 0 | 120 | 3.04 | 96% | 0 / 0 |
| D2 task_alignment | 120 | 3.35 | 0.49 | 99% | 0 / 0 | 120 | 3.48 | 99% | 0 / 0 |
| D3 age_fit | 120 | 3.02 | 0.18 | 99% | 0 / 0 | 120 | 3.03 | 100% | 0 / 0 |
| D4 cefr_fit | 120 | 2.94 | 0.32 | 92% | 0 / 0 | 120 | 3.01 | 98% | 0 / 0 |
| D5 answer_judgement (core) | 77 | 3.04 | 0.34 | 96% | 43 / 0 | 65 | 3.14 | 94% | 55 / 0 |
| D6 scaffolding | 75 | 2.95 | 0.23 | 95% | 45 / 0 | 67 | 3.13 | 97% | 53 / 0 |
| D7 hint_leakage (core) | 92 | 2.47 | 0.54 | 45% | 28 / 0 | 91 | 3.03 | 88% | 29 / 0 |
| D8 independence | 38 | 2.97 | 0.36 | 92% | 74 / 8 | 38 | 2.92 | 92% | 68 / 14 |
| D9 formative_check | 94 | 2.77 | 0.45 | 76% | 26 / 0 | 106 | 3.02 | 95% | 14 / 0 |
| D10 grammar_accuracy (core) | 120 | 2.93 | 0.28 | 92% | 0 / 0 | 114 | 3.13 | 100% | 6 / 0 |
| D11 progression | 76 | 3.07 | 0.47 | 92% | 44 / 0 | 63 | 3.13 | 97% | 56 / 1 |

## 5. Failures and limitations in this run

- **Harness stop:** none.
- **Evaluator retries:** official 0, independent 0.
- **Format re-asks:** official 1, independent 0.
- **Evaluators are LLMs from the same provider and family as the tutor.** Their agreement is not independent validation.
- **Rubric v2 is an unvalidated draft.** The weakest criterion (D7 hint leakage) depends on a pending educator ruling for binary items.

## 6. Additional spend attributed to run 1: evaluator test-retest

- **What ran:** the official evaluator, re-run on this run's **unchanged** transcripts. The output is in `eval_v2_retest/`.
- **Coverage:** stopped by a container restart after **74/120 cases**, and not resumed.
- **Cost:** 74 calls, $0.5286.
- **Run 1 total including the re-test:** **$5.4544** (cap $10).
- **Result:** same outcome in 69/74 cases (93.2%, κ 0.85). See `r42_cross_run_stability.md` §5.

# r4.2 run 3 report

**Run directory:** `run_3/` (raw transcripts `live/raw_results.jsonl`, provider attempts `live/provider_attempts.jsonl`, evaluator outputs `eval_v2/`, summary `summary.json`).

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
| Tutor (harness metering) | 219 | 609,103 | 78,306 | 34,952 / 514 | $4.0121 |
| Official evaluator | 121 | 133,890 | 46,590 | 486,120 / 4,051 | $0.8410 |
| Independent evaluator | 122 | 134,648 | 120,945 | 490,171 / 4,051 | $0.0794 |
| **Run total** | | | | | **$4.9325** (cap $10) |

**Reconciliation against the app's own metering.**
- Harness tutor cost: $4.012106.
- The app's `recordAiCall` records (the same `priceCatalog` path that feeds `UsageLedger` writes inside the run's throwaway database): 219 records, $4.012106.
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
| Engine telemetry flags | {'possible_answer_leak_new_item': 21, 'possible_answer_leak': 12, 'assessment_marker_missing': 1} |

## 3. Outcomes (rubric v2 draft, evaluator core-2)

| | Official (Sonnet) | Independent (Haiku) |
|---|---:|---:|
| MEETS | **55** | **82** |
| PARTIAL | 65 | 36 |
| DOES_NOT_MEET / UNCERTAIN / INVALID | 0 / 0 / 0 | 0 / 2 / 0 |
| Unparseable evaluator output | 0 | 0 |
| Mean of case means | 2.985 | 3.093 |
| Case mean exactly 3.00 / within 3.00 ± 0.15 | 39 / 76 | 32 / 67 |
| Severity tags | {'minor': 115} | {'minor': 54, 'major': 4} |
| MEETS by cohort | {'adult': 19, 'child': 19, 'teen': 17} | {'adult': 31, 'child': 27, 'teen': 24} |
| MEETS by CEFR | {'A1': 14, 'A2': 17, 'B1': 24} | {'A1': 24, 'A2': 28, 'B1': 30} |

**Evaluator agreement on outcome:** 68.3%, κ 0.396 (n = 120).

**Reconciled:** {'PARTIAL': 47, 'UNCERTAIN': 21, 'MEETS': 52}. A disagreement whose official mean lies within 3.00 ± 0.15 is marked UNCERTAIN and needs human adjudication.

**MEETS by situation type (official):** {'T01': 3, 'T02': 4, 'T03': 4, 'T04': 2, 'T05': 5, 'T06': 1, 'T07': 1, 'T08': 0, 'T09': 7, 'T10': 9, 'T11': 7, 'T12': 6, 'T13': 6} (9 cases per type, 12 for T01).

## 4. Per-criterion results

Pass = score ≥ 3. The n/a and insufficient-evidence columns count cases where the dimension was **not scored**.

| Dimension | Official n | mean | sd | pass | n/a / ins. | Indep. n | mean | pass | n/a / ins. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| D1 context_grounding (core) | 120 | 3.11 | 0.44 | 95% | 0 / 0 | 120 | 3.13 | 97% | 0 / 0 |
| D2 task_alignment | 120 | 3.39 | 0.49 | 100% | 0 / 0 | 120 | 3.46 | 99% | 0 / 0 |
| D3 age_fit | 120 | 3.02 | 0.24 | 98% | 0 / 0 | 120 | 3.01 | 100% | 0 / 0 |
| D4 cefr_fit | 120 | 2.92 | 0.36 | 89% | 0 / 0 | 120 | 3.05 | 100% | 0 / 0 |
| D5 answer_judgement (core) | 78 | 3.03 | 0.36 | 95% | 42 / 0 | 66 | 3.00 | 86% | 52 / 2 |
| D6 scaffolding | 76 | 2.91 | 0.29 | 91% | 44 / 0 | 69 | 3.16 | 97% | 51 / 0 |
| D7 hint_leakage (core) | 99 | 2.52 | 0.50 | 52% | 21 / 0 | 96 | 2.92 | 80% | 24 / 0 |
| D8 independence | 37 | 2.87 | 0.34 | 86% | 71 / 12 | 43 | 2.88 | 88% | 66 / 11 |
| D9 formative_check | 97 | 2.81 | 0.41 | 80% | 23 / 0 | 99 | 3.03 | 95% | 20 / 1 |
| D10 grammar_accuracy (core) | 120 | 2.92 | 0.26 | 92% | 0 / 0 | 112 | 3.02 | 94% | 8 / 0 |
| D11 progression | 74 | 3.07 | 0.50 | 90% | 45 / 1 | 63 | 3.03 | 94% | 56 / 1 |

## 5. Failures and limitations in this run

- **Harness stop:** none.
- **Evaluator retries:** official 0, independent 0.
- **Format re-asks:** official 1, independent 2.
- **Evaluators are LLMs from the same provider and family as the tutor.** Their agreement is not independent validation.
- **Rubric v2 is an unvalidated draft.** The weakest criterion (D7 hint leakage) depends on a pending educator ruling for binary items.

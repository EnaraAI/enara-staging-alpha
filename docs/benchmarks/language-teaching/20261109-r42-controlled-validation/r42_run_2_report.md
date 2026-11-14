# r4.2 run 2 report

**Run directory:** `run_2/` (raw transcripts `live/raw_results.jsonl`, provider attempts `live/provider_attempts.jsonl`, evaluator outputs `eval_v2/`, summary `summary.json`).

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
| Tutor (harness metering) | 219 | 609,152 | 79,355 | 34,952 / 514 | $4.0333 |
| Official evaluator | 121 | 134,461 | 44,846 | 486,120 / 4,051 | $0.8247 |
| Independent evaluator | 121 | 133,690 | 118,468 | 486,120 / 4,051 | $0.0780 |
| **Run total** | | | | | **$4.9360** (cap $10) |

**Reconciliation against the app's own metering.**
- Harness tutor cost: $4.033282.
- The app's `recordAiCall` records (the same `priceCatalog` path that feeds `UsageLedger` writes inside the run's throwaway database): 219 records, $4.033282.
- Match: ✔. Unpriced app records: 0.

## 2. Engineering integrity

| Check | Result |
|---|---|
| Cases / turns completed | 120/120, 219/219 ✔ |
| HTTP 200 | 219/219 ✔ |
| Runtime parity (tutor received the answered item) | 72/72 ✔ |
| Accepted answers in tutor system prompts | 0 ✔ |
| Hidden marker visible to learner | 0 ✔ |
| Marker status | {'ok': 219} |
| Turns with state scope | 219/219 |
| Learner identifiers in provider payloads / blocked outbound | 0 / 0 ✔ |
| Provider non-200 / retried turns / unpriced | 0 / 0 / 0 |
| Models served | {'claude-opus-5-5': 219} |
| Answer revealed before a genuine attempt | 0 ✔ (answer-with-reasoning moves in total: 0) |
| Answer-key-verified successes | 27 |
| Learner intents | {'HELP_REQUEST': 82, 'UNRELATED': 38, 'ANSWER_ATTEMPT': 87, 'ANSWER_REQUEST': 9, 'PARTIAL_ANSWER_ATTEMPT': 3} |
| Engine telemetry flags | {'possible_answer_leak': 12, 'possible_answer_leak_new_item': 23} |

## 3. Outcomes (rubric v2 draft, evaluator core-2)

| | Official (Sonnet) | Independent (Haiku) |
|---|---:|---:|
| MEETS | **63** | **88** |
| PARTIAL | 57 | 31 |
| DOES_NOT_MEET / UNCERTAIN / INVALID | 0 / 0 / 0 | 0 / 1 / 0 |
| Unparseable evaluator output | 0 | 0 |
| Mean of case means | 2.983 | 3.106 |
| Case mean exactly 3.00 / within 3.00 ± 0.15 | 42 / 81 | 37 / 79 |
| Severity tags | {'minor': 107} | {'minor': 49} |
| MEETS by cohort | {'adult': 17, 'child': 24, 'teen': 22} | {'adult': 27, 'child': 30, 'teen': 31} |
| MEETS by CEFR | {'A1': 22, 'A2': 17, 'B1': 24} | {'A1': 31, 'A2': 26, 'B1': 31} |

**Evaluator agreement on outcome:** 58.3%, κ 0.1536 (n = 120).

**Reconciled:** {'UNCERTAIN': 33, 'PARTIAL': 36, 'MEETS': 51}. A disagreement whose official mean lies within 3.00 ± 0.15 is marked UNCERTAIN and needs human adjudication.

**MEETS by situation type (official):** {'T01': 7, 'T02': 4, 'T03': 6, 'T04': 2, 'T05': 4, 'T06': 2, 'T07': 3, 'T08': 1, 'T09': 5, 'T10': 9, 'T11': 7, 'T12': 6, 'T13': 7} (9 cases per type, 12 for T01).

## 4. Per-criterion results

Pass = score ≥ 3. The n/a and insufficient-evidence columns count cases where the dimension was **not scored**.

| Dimension | Official n | mean | sd | pass | n/a / ins. | Indep. n | mean | pass | n/a / ins. |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| D1 context_grounding (core) | 120 | 3.13 | 0.43 | 97% | 0 / 0 | 120 | 3.12 | 98% | 0 / 0 |
| D2 task_alignment | 120 | 3.38 | 0.50 | 99% | 0 / 0 | 120 | 3.43 | 99% | 0 / 0 |
| D3 age_fit | 120 | 3.02 | 0.16 | 100% | 0 / 0 | 120 | 3.03 | 100% | 0 / 0 |
| D4 cefr_fit | 120 | 2.91 | 0.34 | 89% | 0 / 0 | 120 | 3.02 | 97% | 0 / 0 |
| D5 answer_judgement (core) | 75 | 2.97 | 0.16 | 97% | 45 / 0 | 65 | 3.08 | 94% | 54 / 1 |
| D6 scaffolding | 73 | 2.89 | 0.31 | 89% | 47 / 0 | 67 | 3.06 | 96% | 53 / 0 |
| D7 hint_leakage (core) | 101 | 2.64 | 0.52 | 62% | 19 / 0 | 93 | 2.90 | 77% | 27 / 0 |
| D8 independence | 37 | 2.97 | 0.37 | 92% | 73 / 10 | 41 | 2.98 | 98% | 63 / 16 |
| D9 formative_check | 93 | 2.74 | 0.44 | 74% | 27 / 0 | 101 | 3.12 | 98% | 17 / 2 |
| D10 grammar_accuracy (core) | 120 | 2.91 | 0.29 | 91% | 0 / 0 | 113 | 3.11 | 100% | 7 / 0 |
| D11 progression | 73 | 2.99 | 0.39 | 92% | 47 / 0 | 61 | 3.08 | 95% | 56 / 3 |

## 5. Failures and limitations in this run

- **Harness stop:** none.
- **Evaluator retries:** official 0, independent 0.
- **Format re-asks:** official 1, independent 1.
- **Evaluators are LLMs from the same provider and family as the tutor.** Their agreement is not independent validation.
- **Rubric v2 is an unvalidated draft.** The weakest criterion (D7 hint leakage) depends on a pending educator ruling for binary items.

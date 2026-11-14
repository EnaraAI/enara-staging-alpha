# r4.2 Human adjudication queue

**Status: NOT STARTED.** No human review has taken place. Every outcome in this campaign is an automated provisional LLM score. No evaluator is independent of the provider.

## 1. Package (`adjudication_package/`)

| File | For | Contents |
|---|---|---|
| `cases/ADJ-###.md` (97 sheets) | **Reviewers** | Anonymised id. Learner profile (synthetic age band, CEFR estimate, situation type, the learner facts the tutor received). Lesson context exactly as the tutor received it (`evaluatorView`; **no answer keys**). Case guidance. The learner-visible conversation from one designated run. A blank scoring table for D1–D11 and the outcome. A reviewer id and independence declaration field. **No AI scores, outcomes or selection reasons.** |
| `rubric_criteria.md` | **Reviewers** | Rubric v2 criteria and anchors, verbatim from the draft |
| `SEALED_evaluator_positions.json` | Coordinator; open **after** both reviewers submit | Per case and run: official and independent outcome, mean, 11 scores and every failure tag with its quote |
| `SEALED_case_key.json` | Coordinator only | ADJ id → benchmark case id, selection reasons, and which run's transcript the sheet shows |
| `queue_summary.json` | Coordinator | Selection counts and priority order |

**Anonymisation:**
- Sheets contain no case id, synthetic name, school or learner id. Checked: 0 sheets match `LTB-`, `Qorvath`, `ltb-stu` or `bench.invalid`.
- ADJ numbers are assigned in a random order (seed 42), so numbering reveals nothing about priority or reason.
- The learners are synthetic. The sheets contain no real-learner data.

## 2. Selection rules (fixed before looking at any individual transcript)

| Code | Rule | Cases |
|---|---|---:|
| A | Official outcome changed across the three runs | 55 |
| B | Official and independent evaluators disagreed in ≥ 2 runs | 42 |
| C | Reconciled UNCERTAIN in ≥ 1 run (disagreement with the official mean within 3.00 ± 0.15) | 62 |
| D | Any critical or major tag from either evaluator in any run | 3 |
| E | Unparseable evaluator output | 0 |
| K | Calibration controls: stable, evaluators agreed in all runs; 3 per age band, seed 42 | 9 |

A case can meet several rules.
- Selected: **97 sheets** (88 flagged + 9 controls).
- By cohort: {'adult': 31, 'child': 35, 'teen': 31}. By CEFR: {'A1': 35, 'A2': 35, 'B1': 27}.

## 3. Tiers (review order)

| Tier | Rule | Sheets | Purpose |
|---|---|---:|---|
| **1** | Any D tag, **or** evaluators disagreed in all 3 runs, **or** UNCERTAIN in ≥ 2 runs | **31** | Where automated scoring is least trustworthy; minimum human workload |
| 2 | All other A, B or C cases | 57 | Boundary instability (mostly D7 hint leakage) |
| 3 | Calibration controls | 9 | Mixed in blind; measure human–AI agreement on cases the AIs agree on |

**Minimum for the next validation stage:** Tier 1 plus Tier 3, double-marked by two qualified EFL educators.

### Tier 1

| ADJ | Cohort | CEFR | Situation | Transcript run | Reasons |
|---|---|---|---|---:|---|
| ADJ-053 | adult | A2 | T05 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-061 | adult | A2 | T07 | 1 | A official outcome changed across runs; B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-038 | child | A1 | T01 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-060 | child | A1 | T07 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-095 | child | A1 | T13 | 1 | A official outcome changed across runs; B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 2, 3] |
| ADJ-042 | child | B1 | T03 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-024 | child | B1 | T13 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-019 | teen | A1 | T03 | 1 | A official outcome changed across runs; B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 2, 3] |
| ADJ-076 | teen | A1 | T13 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 3] |
| ADJ-069 | teen | A2 | T13 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 3] |
| ADJ-052 | teen | B1 | T01 | 2 | A official outcome changed across runs; B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-066 | teen | B1 | T04 | 1 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2]; D Counter({'major': 1}) tag(s) |
| ADJ-046 | teen | B1 | T12 | 2 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2, 3] |
| ADJ-058 | adult | A1 | T08 | 1 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 3] |
| ADJ-039 | adult | A2 | T04 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 2, 3] |
| ADJ-078 | adult | A2 | T06 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-006 | adult | B1 | T04 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 2, 3] |
| ADJ-022 | adult | B1 | T06 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-030 | adult | B1 | T08 | 1 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-017 | child | A1 | T02 | 3 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-075 | child | A2 | T05 | 2 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2, 3] |
| ADJ-034 | child | A2 | T08 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 3] |
| ADJ-068 | child | B1 | T02 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-004 | teen | A1 | T07 | 1 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1, 2] |
| ADJ-096 | teen | A2 | T04 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 3] |
| ADJ-093 | teen | A2 | T08 | 2 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-045 | teen | B1 | T08 | 1 | B evaluators disagreed in 3 runs; C reconciled UNCERTAIN in run(s) [1, 2, 3] |
| ADJ-070 | child | A2 | T03 | 1 | D Counter({'major': 2}) tag(s) |
| ADJ-044 | teen | A2 | T01 | 1 | D Counter({'major': 1}) tag(s) |
| ADJ-013 | adult | A1 | T02 | 1 | B evaluators disagreed in 3 runs |
| ADJ-073 | child | A1 | T09 | 1 | B evaluators disagreed in 3 runs |

### Tier 2

| ADJ | Cohort | CEFR | Situation | Transcript run | Reasons |
|---|---|---|---|---:|---|
| ADJ-077 | adult | A1 | T09 | 2 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-056 | adult | A2 | T11 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-040 | child | A1 | T12 | 3 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-026 | child | B1 | T06 | 2 | A official outcome changed across runs; B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-036 | adult | A1 | T01 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-092 | adult | A1 | T03 | 3 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-035 | adult | A1 | T04 | 3 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-008 | adult | A1 | T05 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-080 | adult | A1 | T07 | 3 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-094 | adult | A2 | T01 | 1 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-071 | adult | A2 | T12 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-003 | adult | A2 | T13 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-020 | adult | B1 | T01 | 1 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-037 | adult | B1 | T11 | 3 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-089 | child | A1 | T05 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-014 | child | A1 | T11 | 3 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-065 | child | A2 | T01 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-018 | child | A2 | T11 | 1 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-090 | child | A2 | T12 | 3 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [3] |
| ADJ-085 | child | A2 | T13 | 1 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-088 | child | B1 | T04 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-023 | child | B1 | T07 | 2 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-055 | child | B1 | T08 | 1 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-043 | teen | A1 | T02 | 2 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-007 | teen | A1 | T06 | 2 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-011 | teen | A1 | T08 | 2 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [2] |
| ADJ-072 | teen | A2 | T12 | 1 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-027 | teen | B1 | T03 | 1 | A official outcome changed across runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-012 | teen | B1 | T06 | 1 | B evaluators disagreed in 2 runs; C reconciled UNCERTAIN in run(s) [1] |
| ADJ-063 | adult | B1 | T09 | 2 | C reconciled UNCERTAIN in run(s) [2] |
| ADJ-028 | child | A1 | T03 | 3 | C reconciled UNCERTAIN in run(s) [3] |
| ADJ-079 | child | A2 | T04 | 1 | C reconciled UNCERTAIN in run(s) [1] |
| ADJ-097 | teen | A1 | T04 | 1 | C reconciled UNCERTAIN in run(s) [1] |
| ADJ-049 | teen | A1 | T05 | 1 | C reconciled UNCERTAIN in run(s) [1] |
| ADJ-091 | teen | B1 | T13 | 2 | C reconciled UNCERTAIN in run(s) [2] |
| ADJ-062 | teen | A1 | T12 | 1 | A official outcome changed across runs; B evaluators disagreed in 2 runs |
| ADJ-009 | adult | A1 | T06 | 2 | A official outcome changed across runs |
| ADJ-074 | adult | A1 | T11 | 2 | A official outcome changed across runs |
| ADJ-051 | adult | A1 | T13 | 1 | A official outcome changed across runs |
| ADJ-082 | adult | A2 | T08 | 1 | B evaluators disagreed in 2 runs |
| ADJ-031 | adult | B1 | T02 | 1 | A official outcome changed across runs |
| ADJ-010 | adult | B1 | T07 | 1 | A official outcome changed across runs |
| ADJ-067 | child | A1 | T06 | 1 | B evaluators disagreed in 2 runs |
| ADJ-015 | child | A1 | T08 | 1 | A official outcome changed across runs |
| ADJ-054 | child | A2 | T02 | 1 | A official outcome changed across runs |
| ADJ-021 | child | A2 | T06 | 1 | A official outcome changed across runs |
| ADJ-002 | child | A2 | T07 | 1 | A official outcome changed across runs |
| ADJ-029 | child | A2 | T09 | 1 | A official outcome changed across runs |
| ADJ-033 | child | B1 | T01 | 2 | A official outcome changed across runs |
| ADJ-047 | child | B1 | T05 | 1 | A official outcome changed across runs |
| ADJ-057 | teen | A1 | T01 | 1 | A official outcome changed across runs |
| ADJ-086 | teen | A1 | T01 | 1 | A official outcome changed across runs |
| ADJ-005 | teen | A2 | T02 | 2 | A official outcome changed across runs |
| ADJ-041 | teen | A2 | T03 | 1 | A official outcome changed across runs |
| ADJ-050 | teen | A2 | T06 | 1 | B evaluators disagreed in 2 runs |
| ADJ-081 | teen | A2 | T09 | 2 | A official outcome changed across runs |
| ADJ-001 | teen | A2 | T11 | 1 | A official outcome changed across runs |

### Tier 3

| ADJ | Cohort | CEFR | Situation | Transcript run | Reasons |
|---|---|---|---|---:|---|
| ADJ-064 | adult | A1 | T10 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-032 | adult | A2 | T09 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-059 | adult | B1 | T10 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-084 | child | A2 | T10 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-025 | child | B1 | T09 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-048 | child | B1 | T11 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-087 | teen | A1 | T11 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-016 | teen | A2 | T05 | 1 | K calibration control (stable, evaluators agreed in all runs) |
| ADJ-083 | teen | A2 | T07 | 1 | K calibration control (stable, evaluators agreed in all runs) |

> **Coordinator note.** This queue lists reasons, so it must **not** be given to reviewers. Reviewers receive only `cases/` and `rubric_criteria.md`.

## 4. Protocol (proposed; not executed)

1. **Reviewers.** Two qualified EFL educators, independent of ENARA product development, each signing an independence and conflict-of-interest declaration (POST-19).
2. **Blind scoring.** Each reviewer scores D1–D11 and the outcome per sheet, with no discussion and without the sealed files. Tier 3 controls are interleaved.
3. **Unsealing.** The coordinator compares reviewer vs reviewer (weighted κ per dimension; outcome κ), and reviewer vs each AI evaluator.
4. **Adjudication.** Disagreements are resolved in writing. Anchor problems go to the rubric revision log, never silently into scores.
5. **Decisions the panel must make first** (see `r42_academic_rubric_review.md` §8): binary-item cues for D7, `insufficient_evidence`, legitimate `n/a`, and the cut score.
6. **Reporting.** Human results are reported separately from AI results. No merged score.

**Do not report any of this as done until signed reviewer records exist.**

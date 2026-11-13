# Blind package audit (final reviewer packages)

**Run:** 2026-11-12T12:07:40+00:00 UTC. **Result: 17/17 checks PASS.**

**What changed from v1** (v1 is kept unchanged in the parent folder):
- Removed: scenario labels (`T##_…`), case-design notes (expected / unacceptable behaviour, expected next move, word limit), learner-turn script labels, extractor item-type labels and the evidence-locator section.
- Kept: learner profile (age band, CEFR), information the tutor received, lesson context, exercises and answer keys (expert-only), complete verbatim conversation, draft rubric Appendix A (labelled not validated).
- Added: allowed-values table in the instructions; score-sheet column `consulted_appendix_A_yes_no`.
- Same `EXP-xxxx` ids as v1; new independent random order per reviewer.

| # | Check | Result | Detail |
|---:|---|---|---|
| 1 | 40 cases present | PASS | 40 in mapping and in each package |
| 2 | 31 priority + 9 calibration | PASS | from restricted mapping |
| 3 | No AI judgments (automated or AI review) in reviewer materials | PASS | 675 rationale/note strings searched, 0 found |
| 4 | No outcome labels / evaluator names / telemetry | PASS | case sections + intro |
| 5 | Scenario labels and design notes removed | PASS | no T##_ labels, designer guidance, script labels or extractor labels |
| 6 | No designer guidance text | PASS | 120 expectedBehavior strings searched |
| 7 | No calibration/selection labels | PASS |  |
| 8 | Anonymisation | PASS |  |
| 9 | Exact tutor/learner wording; complete conversations | PASS | 80 turns verbatim in both |
| 10 | Lesson context and exercises preserved | PASS | objective + every exercise prompt + answer keys (expert-only) |
| 11 | Equivalent evidence A/B | PASS | identical case sections and appendix |
| 12 | Independent random order | PASS | 2/40 coincident positions |
| 13 | Score sheets match package order, empty | PASS |  |
| 14 | Reviewer folders contain only reviewer files | PASS | restricted material only in restricted/ and coordinator files |
| 15 | Workbook dry run passed | PASS | text + numeric paste modes |
| 16 | Rubric, scoring code, tutor code unchanged | PASS | 15 baseline files hash-verified |
| 17 | Decision worksheet restricted & unchanged | PASS |  |

**Limits:** string and pattern checks cannot judge whether reviewers could still infer a case's design intent from the lesson context itself; that residual risk is inherent to giving pedagogically necessary context.

# Workbook dry-run report (final_score_workbook.xlsx)

**Result: PASS in both paste modes.** Evidence (dummy data, kept OUT of the final package): `../dry_run_evidence/`.

## Method

1. Two dummy reviewer CSVs (`dummy_reviewer_A.csv`, `dummy_reviewer_B.csv`, 40 cases each, fixed seed) with deliberate edge cases: numbers with spaces (" 3", "4 "), lower-case `na`/`ie`, blanks, a fully blank case, out-of-range `5`, non-integer `2.5`, mis-cased categories (`Meets Expectations`, `limited`), an unlisted label (`Meets`, `maybe`), a forced blank-vs-0 pair and a forced NA-vs-IE pair.
2. Pasted into a **copy** of the workbook twice: every value as **text** (worst case), and numbers as **numbers**. Dummy calibration flags on every 4th case.
3. Recalculated in LibreOffice headless; every computed value compared with an independent Python reference implementation (same normalisation, Cohen κ quadratic-weighted / unweighted, Gwet AC2 / AC1).

## Results

| Check | Text paste | Numeric paste |
|---|---|---|
| Formula / reference error cells | 0 | 0 |
| Scores imported as numbers (text "3" → 3) | True | True |
| Comparison rows / class mismatches vs reference | 520 / 0 | 520 / 0 |
| Agreement rows / mismatches (pairs, exact %, within-1 %, κ, AC, missing, invalid, NA/IE counts) | 26 / 0 | 26 / 0 |
| Blank A vs B = 0 | class "missing A", not counted as agreement | same |
| NA vs IE; " limited" vs "LIMITED" | {'C2': 'NA vs IE', 'C9': 'exact'} | same |
| Calibration-only agreement rows computed separately | 13 | 13 |

Class distribution (text run): {'missing A': 56, 'exact': 176, 'invalid B': 32, 'scored vs NA/IE': 42, 'adjacent (1 point)': 59, 'substantive (2+ points)': 33, 'invalid A': 33, 'NA vs IE': 1, 'category disagreement': 47, 'missing B': 39, 'missing both': 2}.

**Missing never becomes zero:** blanks are classed `missing A/B/both`, excluded from matrices, and counted in their own column. **Invalid values** (5, 2.5, unlisted labels) are flagged `invalid A/B` and excluded.

## Final workbook state

The delivered `final_score_workbook.xlsx` was rebuilt clean and recalculated: 0 error cells, 0 data rows in A_raw/B_raw, 0 calibration flags filled, all 520 comparison rows `missing both`. No dummy data is present.

**Changes vs v1 template** (prompted by the coordinator AI review): text-to-number coercion, trim/case folding, invalid-value detection, split disagreement columns (scored vs NA/IE, NA vs IE, category, missing, invalid), Gwet AC alongside κ, CRITICAL/MAJOR agreement.

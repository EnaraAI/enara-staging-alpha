# ENARA r4.2: independent EFL expert review package

**Status: `READY_WITH_DISCLOSED_GAPS`** (see `extraction_validation_report.md`).

**What this package is:**
- A data extraction from the frozen r4.2 benchmark (fixture v2, r4.1 baseline) for independent human validation by qualified EFL educators.
- **No scoring has been done by humans.**
- **Nothing in the benchmark, tutor code, prompts, rubric or earlier reports was modified.**
- All learners are synthetic and scripted.

> **The rubric `ltb-rubric-v2` is a DRAFT and is not academically validated.** It is included only as a clearly labelled discussion reference.

## Who gets what

### Reviewer A only
- `reviewer_A_blind_package.md` (or `.pdf`): 40 anonymous cases in A's own random order, plus a draft-rubric appendix;
- `reviewer_A_score_sheet.csv`.

### Reviewer B only
- `reviewer_B_blind_package.md` (or `.pdf`): the same evidence in B's own random order;
- `reviewer_B_score_sheet.csv`.

Each reviewer receives **only their own two files**.

### Both reviewers, after both have submitted
- `educator_rubric_decisions.md` (or `.pdf`): the 9 rubric decisions, with independent-ruling and consensus fields.

### Coordinator only (RESTRICTED: never give to reviewers before both submissions)
| File | Contents |
|---|---|
| `restricted_case_mapping.json` | `EXP-xxxx` → original case id, earlier `ADJ-###` id, **calibration flag**, transcript run, turn ids, each reviewer's case position |
| `9_hidden_calibration_cases.json` | The 9 calibration cases (full context, answer keys, all 3 run transcripts) |
| `31_priority_cases.json` | The 31 Tier 1 cases (same structure) |
| `automated_evaluator_comparison_restricted.json` | Official and independent AI evaluator scores, rationales, outcomes, n/a / insufficient-evidence decisions, major/critical flags, cross-run disagreements, engine telemetry, evaluator re-test. Open **only after** both reviewers submit. |
| `reserve_cases_restricted.json` | The other 80 benchmark cases (context, all 3 run transcripts, automated results) |
| `reviewer_agreement_template.xlsx` | Paste both CSVs, then fill calibration flags after unsealing. It computes exact agreement, within-one agreement, weighted / unweighted Cohen's κ (all cases and calibration only), and classifies disagreements, with adjudication fields. |

### Provenance
| File | Contents |
|---|---|
| `source_manifest.json` | Commit, branch, uncommitted-diff hash, untracked paths, SHA-256 of all 28 source files, extraction timestamp, missing artifacts |
| `source_uncommitted_diff.patch`, `source_git_status.txt` | The r4.1 working-tree changes on top of the commit |
| `extraction_validation_report.md` (or `.pdf`) | 15 validation checks and the disclosed gaps |
| `tools/` | The scripts that produced every file (read-only on sources), for reproduction |
| `SHA256SUMS.txt` | Hashes of every file in this directory |

## Review procedure (for the coordinator)

1. **Recruit** two qualified EFL educators, independent of ENARA product development. Collect independence and conflict-of-interest declarations.
2. **Send** each reviewer their package and score sheet. They score the **ten criteria** independently, with no discussion and no AI information:
   - **C1–C8, C10:** 0–4 / NA / IE;
   - **C9 evidence sufficiency:** SUFFICIENT / LIMITED / INSUFFICIENT;
   - **plus** an overall category and critical/major defect flags.
3. **When both CSVs are back:** paste them into `A_raw` / `B_raw` in the workbook. Then open `restricted_case_mapping.json`, fill `Calibration_flags`, and read the `Agreement` sheet.
4. **Adjudicate** disagreements in the `Comparison` sheet, then open `automated_evaluator_comparison_restricted.json` to compare human and AI results. **Report human and AI results separately.**
5. **Rule on the rubric:** both educators complete `educator_rubric_decisions.md` independently, then record the consensus. Only after sign-off may the rubric and the scoring code be frozen together.

## Case selection

The exact **31 Tier 1** cases and **9 calibration controls** from `docs/benchmarks/language-teaching/20261109-r42-controlled-validation/r42_human_adjudication_queue.md`. **No case was replaced.**

**Each review sheet shows one complete conversation:** the run designated in the original queue. The restricted files hold all three runs.

**Anonymous ids (`EXP-xxxx`)** are new and unrelated to the earlier `ADJ-###` numbers. That queue document lists ADJ ids with tiers, so it must **not** be shared with reviewers.

## PDF exports

PDFs are provided for:
- `README`;
- both reviewer packages;
- the educator decision worksheet;
- the validation report.

JSON, CSV and XLSX files remain in their native formats, because they are data and worksheet files.

# Extraction validation report (r4.2 human review package)

**Extracted:** 2026-11-10T08:08:19+00:00 (UTC). **Source commit:** `fc6a487d287762a5f17ceadaf451f6c990347215`, plus the frozen r4.1 working tree. Its 18-file tracked diff is in `source_uncommitted_diff.patch`; the 22 untracked paths are listed in `source_manifest.json`.

**Final status: `READY_WITH_DISCLOSED_GAPS`.**
- Every required case and every conversation is complete and verified.
- The gaps in §3 are fields that do **not exist in the original artifacts**. They were not reconstructed.

## 1. Counts

| Item | Count |
|---|---:|
| Priority (Tier 1) cases, complete | **31 / 31** |
| Hidden calibration cases, complete | **9 / 9** |
| **Complete cases for review** | **40** |
| Incomplete cases | **0** |
| Turns in the review sheets (designated run) | 80 |
| Reserve cases (complete, all 3 runs; restricted) | 80 |
| Turns verified against source (40 + 80 cases × 3 runs) | 657 |
| Missing artifacts (unavailable in the sources; disclosed) | **4** (see §3) |
| Replacement cases | 0 |

## 2. Validation checks

| # | Check | Result | Detail |
|---:|---|---|---|
| 1 | 31 priority cases present | PASS | 31 records; ids equal the Tier 1 list in order |
| 2 | 9 calibration cases present | PASS | 9 records |
| 3 | No overlap / no replacement cases | PASS | 40 distinct cases, each traced to its earlier ADJ id |
| 4 | Reserve package | PASS | 80 remaining benchmark cases (complete fixture = 120) |
| 5 | Every case has complete conversation evidence (all 3 runs) | PASS | 657 turns checked against raw_results and fixture; problems: [] |
| 6 | Original wording preserved; no fabricated or reconstructed turns | PASS | every designated-run learner and tutor turn appears verbatim in both packages; turn counts equal fixture scripts; misses: [] |
| 7 | No AI evaluation results in blind packages | PASS | 635 evaluator rationale strings searched: 0 found; banned outcome/telemetry terms in case sections: {'A': [], 'B': []} |
| 8 | No calibration or selection labels exposed | PASS | searched case sections and introduction for calibration/tier/priority/ADJ/selection terms |
| 9 | Anonymisation | PASS | identifier patterns: {'A': [], 'B': []}; original case ids present: [] |
| 10 | Reviewer A and B receive equivalent evidence | PASS | 40 case sections identical as sets; introduction and appendix identical apart from reviewer letter |
| 11 | Case order randomised independently | PASS | 1/40 cases share the same position in both orders |
| 12 | Score sheets match packages | PASS | each CSV lists the 40 anonymous ids in that reviewer's package order; no scores pre-filled |
| 13 | Automated comparison complete (restricted) | PASS | 40 cases x 3 runs x 2 evaluators; retest available for 26/40 |
| 14 | Answer keys only in expert material | PASS | acceptable answers appear only in the expert packages under an "expert use only, never shown to learners" label; no learner-facing material is produced |
| 15 | Source traceability and baseline integrity | PASS | 28 source files hashed; frozen baseline files changed: [] |

**15/15 checks pass.** Incomplete fields found by the checks: 0.

**One check initially failed and was resolved.**
- The first anonymisation pattern `ltb-` matched only the rubric's own name, `ltb-rubric-v2`, in the reviewer introduction and appendix.
- That is not a learner or case identifier, so the check was narrowed to the synthetic identifier forms the harness generates (`ltb-stu-`, `ltb-school-`, `ltb-learner-`, …).
- It now passes. **No package content was changed** to make it pass.

## 3. Missing or unavailable artifacts (disclosed; not reconstructed)

| Artifact | Scope | Status |
|---|---|---|
| CEFR descriptor text | all cases | NOT PRESENT in any original artifact (fixture, rubric draft, transcripts). Only the CEFR level estimate (A1/A2/B1) exists. Not reconstructed. |
| Stored message timestamps | all turns | The harness raw results do not store message timestamps. Each tutor turn carries the provider attempt start time (startedAt) and latency from provider_attempts.jsonl; learner-message times are not recorded. Turn order is exact (learnerScript order). |
| Explicit "assessment type" field | all cases | Not a field in the fixture. Package shows the fixture situation type (caseType) and per-turn learner-script targets instead; nothing inferred beyond those labels. |
| Evaluator test-retest | run 1 only | Partial: 74/120 cases (container restart). Present only for cases in that subset. |

## 4. Method and limits of the checks

- **Fidelity.** Every learner and tutor turn in the restricted JSON files is compared character-for-character with `raw_results.jsonl` (file and line recorded) and with the fixture `learnerScript`. Every designated-run turn appears verbatim, as a block quote, in both reviewer packages.
- **AI leakage.** The case sections of the blind packages were searched for:
  - all 635 evaluator rationale strings longer than 30 characters;
  - outcome labels (MEETS / PARTIAL / DOES_NOT_MEET / UNCERTAIN);
  - evaluator and model names;
  - engine telemetry field names.
- **Calibration secrecy:**
  - no "calibration", tier, priority, ADJ or selection-reason text appears in the packages or score sheets;
  - the agreement workbook's calibration column is blank until the coordinator fills it after both submissions.
- **Anonymisation.** `EXP-xxxx` ids come from a system random source and are unrelated to the earlier `ADJ-###` numbering. Original case ids, synthetic names, schools, learner ids, emails and run references are absent from the packages.
- **Equivalence.** The 40 case sections are identical as sets across A and B. The introduction and appendix are identical apart from the reviewer letter. The orders are independently shuffled (1/40 positions coincide by chance).
- **Workbook.** The formulas in `reviewer_agreement_template.xlsx` were recalculated in LibreOffice on a separate test copy filled with synthetic test scores, and checked against an independent Python computation of exact agreement, within-one agreement and Cohen's κ (quadratic-weighted for 0–4 criteria, unweighted for categories), for all cases and the calibration subset: **22/22 rows matched**. The delivered template contains no test data and recalculates with 0 error cells.
- **What the checks cannot do.** They cannot judge whether the evidence is *pedagogically* sufficient. That is criterion C9 for the reviewers.

## 5. Blockers

**None for starting independent review.** Before review starts, the coordinator must:
1. recruit two qualified EFL educators and collect their independence and conflict-of-interest declarations;
2. give each reviewer **only** their package PDF/MD, their CSV score sheet and nothing else;
3. keep every restricted file (marked in `README.md`) away from reviewers until both score sheets are submitted.

Deliverable hashes: `SHA256SUMS.txt`.

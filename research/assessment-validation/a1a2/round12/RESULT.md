SIMULATION ONLY

# Round 12: fresh, blind check of rules E and F with no error-correction slip allowance. Result: PASS

**No AI or API calls.** Agents stood in for the answer writer and the scorers. lms-test/offline only; test.enara.app was not touched. No ESL6 round was run.

| Controlled items (n = 75) | Current grader (950ae1db) | **Fixed grader (round 12)** | Bar |
|---|---|---|---|
| **Agreement, all controlled** | 64/75 = 85.3% | **72/75 = 96.0%** | ≥95%: **pass** |
| ESL6 primary items (gap-fill + choice) | 43/50 = 86.0% | **48/50 = 96.0%** | ≥95%: pass |
| **False accepts** (ref 0, grader 1) / ref-0 answers | 4/30 = 13.3% | **0/30 = 0.0%** | fixed ≤ current: **pass** |
| Free/transfer QWK (n = 75) | 0.847 | **0.847** | ≥0.80: pass |

**By item type (fixed; current in brackets):** gap_fill 22/24 (17/24), controlled_gap_fill 9/9 (9/9), multiple_choice 11/11 (11/11), controlled_choice 6/6 (6/6), error_correction 21/22 (18/22), rewrite 3/3 (3/3).

**Verdict: PASS** on the plain bar (controlled ≥95%, false accepts not higher, QWK ≥0.80). Owner decision 1 (error correction secondary) was not needed.

## Set-up (as frozen in `PLAN.md`, commit 630ff924, before any answer existed)

- **Grader under test:** `backend/src/services/graderV2.ts` sha256 `f4df7ca84ce482e237ab37a4c7057d8b0cd9c5a1c234bcbb609f8a5afc7150ef` (commit 454d3374). Current grader: `80746e02f3c5b895f9d632d4d31f0ba56ec160187ff137115815d273b19915f4` (950ae1db). Both were run with `round8/rerun.ts` (graderV2 ON, deterministic path, B2 off) **before** the reference existed (`GRADER_CURRENT.json`, `GRADER_FIXED.json`).
- **Answers:** 150 new answers written by a separate cloud session. Its checkout was a sparse copy of `claude/grader-round8`, holding only the item bank and `docs/`. That branch does not contain this change, this plan or round 12, and the session was told not to open grader docs, code or git history. Split: 75 exact and 75 target-form, all 33 outcomes. The writer's design: 35% full, 35% partial or debatable, 30% zero. The set includes 10 whole-sentence gap answers, 8 contraction answers and 26 spelling traps.
- **Dedupe (`dedupe.py`, `DEDUPE.json`):** 25 of the writer's 150 answers repeated an earlier-round answer to the same item (918 earlier answers indexed). Each was replaced by an unused spare of the same scoring type. **Deviation from the plan:** the spares did not cover every outcome, so after dedupe all 33 outcomes are still covered, but 4 outcomes have fewer than 4 answers (word-order-svo 2; classroom-objects, past-simple-regular and appearance 3 each).
- **Reference:** 3 new scorers, each a separate cloud session with the same sparse checkout and the answers only (branch `claude/r12-scoring-input`), using the current rubric (§2.2 = 1A). **All 3 agreed on 148 of 150 answers**, with no three-way splits. Reference = majority vote (`REFERENCE.json`). Reference distribution: exact 45×1 / 30×0; free 27×2 / 32×1 / 16×0.

## What changed from the current grader on these answers

- **8 corrected, all in the expected direction:**
  - E/F, too strict before: R12-002, -007, -013, -039, -045.
  - Slip allowance removed, too lenient before: R12-003 "nures", R12-014 "bussy", R12-016 "My sisters" (a new mistake), R12-028 "fourty".
- **1 new disagreement:** R12-073, described below.
- Free items are unchanged (same QWK), because the change touches only the exact path.

## The 3 remaining controlled misses (fixed grader), by pattern

| Pattern | Answer | Ref | Grader |
|---|---|---|---|
| **E1.** Whole sentence in a gap with a misspelling **outside** the gap. The scorers ignore it (rubric rule 1: target only on gap items); E accepts only word-for-word sentences. | R12-054 "Last Sunday I went to the post **ofice**." | 1 | 0 |
| **E2.** Whole sentence in a gap that leaves out a lead-in word of the prompt ("Look!"). | R12-059 "The girls are singing in the garden." | 1 | 0 |
| **D.** Error correction: a different but correct rewrite (target fixed, "exercises" for "exercise"). This is the cost of dropping the slip allowance, and it was expected. | R12-073 "My father does exercises every evening." | 1 | 0 |

All 3 are **too strict**. None is a false accept. As the plan says, **no further fixes were made.**

## Free/transfer disagreements (fixed grader, 11 of 75; QWK 0.847)

R12-083, -085 (lower-case name: scorers 1, grader 2); R12-088, -099, -115, -120, -131, -138 (scorers 1, grader 0); R12-089 "My teacher car" (0 vs 2); R12-111 (2 vs 1); R12-122 "going to went" (1 vs 2). These are the same as for the current grader and do not affect the verdict.

## Limits

- The scorers are agents, not human raters.
- n = 75 per group.
- The rules are hand-written.
- The B2 model meaning check stays off and is not validated with the real model.
- Outcome coverage after dedupe is uneven (minimum 2 answers).
- One round can show agreement but cannot prove the rules generalise. Pattern D and E1 remain known strict spots.

## Files

`PLAN.md`, `ANSWERS_TASK.md`, `SCORER_TASK.md` (frozen before the answers), `REGRESSION.json` and `regression.py` (rounds 5–11 and 1A error correction), `answers_raw.json`, `spares.json`, `answers_design.json`, `answers.json`, `DEDUPE.json`, `scorer_S1-3.json`, `REFERENCE.json`, `GRADER_CURRENT.json`, `GRADER_FIXED.json`, `ANALYSIS.json`, `analyse.py`.

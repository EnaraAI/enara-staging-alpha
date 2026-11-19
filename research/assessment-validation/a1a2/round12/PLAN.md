SIMULATION ONLY

# Round 12: rules E and F, no error-correction slip allowance, then a fresh blind check

**Status: design frozen before any Round 12 answer exists.** Owner said "go" on 2026-11-19 with all three recommended decisions = yes. ESL6 stays stopped until this check passes. No AI or API calls: agents stand in for the answer writer and the scorers. lms-test / offline harness only; test.enara.app is frozen.

## Owner decisions (made before Round 12)

1. **Error correction secondary.** If overall controlled agreement is below 95% **only** because of error-correction rewrites, while the ESL6 primary items (gap-fill + choice) reach ≥95% and the fixed grader's false-accept rate is not higher than the current grader's, ESL6 may run with error correction kept secondary, as pre-registered.
2. **Drop the error-correction slip allowance** (match rubric §2.2, decision 1A).
3. **B2 (model meaning check) stays off** and outside this track.

## The change (`backend/src/services/graderV2.ts`, graderV2 ON only; commit 454d3374)

- **E.** A gap answer that is the item's whole sentence, word for word (after the usual case/punctuation/contraction normalisation), with an accepted answer in the gap, scores 1.
- **F.** A standard contraction of an accepted answer ('d, 'll, 'm, 're, 's, 've, n't), alone or with the words around the gap, scores 1.
- **Guard.** E and F are off on spelling- and capital-sensitive items (`spellingIsTarget`), on choice and error-correction items, and on items with more than one gap. E never accepts a misspelt word (word-for-word only).
- **Error correction:** the round-4 allowance of up to two slips outside the target is removed. The round-8 pattern-B rule (a harmless preposition swap outside the target, not before a time word) stays.
- New grader file sha256: `f4df7ca84ce482e237ab37a4c7057d8b0cd9c5a1c234bcbb609f8a5afc7150ef` (current/before: `80746e02f3c5b895f9d632d4d31f0ba56ec160187ff137115815d273b19915f4`).

## Automated checks before Round 12 (done; `REGRESSION.json`)

| Check | Result |
|---|---|
| Unit tests (`backend/test/graderV2.test.ts`, one block per rule, must-stay-0 cases) | 72/72 pass |
| Parity, graderV2 OFF (`graderV2Parity.test.ts`) | pass, unchanged |
| Full backend suite | 21 failing files, the **same 21** before and after the change (environment, unrelated to the grader) |
| Rounds 5–8 outside error correction | **0 new disagreements**; 2 fixed (R8-088 whole sentence, R8-115 "'d") |
| Error correction vs 1A references (rounds 8–11, n = 273) | 227 → **250 (91.6%)**; too lenient 24 → **0**; too strict 22 → 23 (R9-043 "my brothers phone": missing possessive apostrophe) |
| Round 8 controlled under 1A (post hoc, **not evidence**) | 67/75 → 73/75; false accepts 4/46 → 0/46 |
| ESL6 answer check (`esl6Study.ts answercheck`) | 810 keys, 753 wrong strings, **0 failures**, 15 grader-blind (unchanged) |

## Round 12 design

- **Answers:** 150 NEW simulated Arabic-L1 answers across all 33 outcomes (≥4 each), 75 controlled (`exact`) and 75 free/transfer (`target_form_0_1_2`); at least one third partial or debatable. Gap answers include whole sentences and contractions; corrections include spelling traps. Written by an agent that cannot see the grader, this change or earlier rounds (`ANSWERS_TASK.md`): a separate cloud session with a sparse checkout of only `data/assessments/outcomes` and `docs` on `claude/grader-round8`.
- **Dedupe:** an answer that repeats an earlier-round answer to the same item (normalised: case, spaces, quotes, final punctuation) is replaced by a spare from the writer's reserve, same scoring type, same outcome where possible (`dedupe.py`).
- **Reference:** 3 NEW independent agent scorers under the current rubric (§2.2 = 1A) (`SCORER_TASK.md`), each a separate session with the same sparse checkout; majority vote (`build_reference.py`; a three-way split takes the middle score).
- **Grading:** the current grader (950ae1db) and the fixed grader run blind on the same answers with `round8/rerun.ts` (`GRADER_CURRENT.json`, `GRADER_FIXED.json`).

## What is reported and the pass bar (`analyse.py`)

- **Controlled agreement (75): ≥95%.** Also by item type and for the ESL6 primary items (gap-fill + choice: `gap_fill`, `controlled_gap_fill`, `multiple_choice`, `controlled_choice`).
- **False-accept rate** = (reference 0 and grader 1) / (controlled answers with reference 0), for both graders. **The fixed grader's rate must not be higher than the current grader's.**
- **Free/transfer QWK ≥0.80** (reported, as before).
- **Pass** = controlled ≥95% and false-accept rule and QWK ≥0.80; or, under decision 1, controlled <95% only because of error-correction rewrites with primary ≥95% and the false-accept rule met ("pass with error correction secondary").
- **If it fails:** stop, report the misses by pattern, no further fixes. ESL6 stays stopped.

## Limits

Agent scorers, not human raters; n = 75 per group; hand-written rules; the model path stays not validated.

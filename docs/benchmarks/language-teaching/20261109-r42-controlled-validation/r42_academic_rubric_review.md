# r4.2 Academic review of `ltb-rubric-v2` (draft)

**What this is.** A structured desk review of the draft rubric. It is written by the engineering agent, Claude, and draws on:
- published language-teaching and assessment frameworks;
- the r4.2 run data in §7.

**What this is not:**
- **It is not a human expert review.** No qualified educator has reviewed or approved rubric v2. Nothing here substitutes for that.
- Every recommendation below is a **proposal** for the educator panel.
- **The rubric was not changed** during the campaign. Its SHA-256 is recorded in `r42_baseline.json`.

**Reviewed:**
- `20261109-full-remediation/rubric_v2_draft.md`, unchanged;
- its verbatim machine copy `20261109-post-remediation-final/rubric_v2_machine.json`;
- the outcome code `judge_v2_core.ts` (core-2).

## 1. Construct validity: does it measure tutoring quality in a language lesson?

**Intended construct.** The quality of an AI tutor's *turn-level teaching moves* in a short written EFL interaction, given a lesson and a learner profile. It is **not** learner proficiency, learning gain, or lesson design.

| Strength | Comment |
|---|---|
| Separates correctness (D5, D10) from pedagogy (D6, D7, D9) | Avoids the v1 conflation, where one "pedagogical appropriateness" score hid accuracy errors |
| Core floors (D1, D5, D7, D10 ≥ 3) | Encodes non-compensatory requirements: a grammatically wrong rule or a leaked answer cannot be averaged away. This is appropriate for formative tutoring, where one wrong rule can be learned. |
| Observable anchors with quote requirements | Supports reliability and auditability |

| Threat to construct validity | Evidence | Proposal |
|---|---|---|
| **Construct-irrelevant variance from scripted learners.** Many cases are one or two scripted turns; D6, D8, D9 and D11 often cannot be observed. | §7: high `n/a` rates for D8 and D11 on short cases | Report a "pedagogical evidence coverage" figure per case. Do not compare means across case types with different coverage. |
| **Under-representation.** No dimension for affect or motivation, learner agency, or L1 use, all of which matter in EFL (especially for children). L1 support appears only implicitly (D4 "glossed"). | Rubric text | Add an optional D12 *learner support and affect* (encouragement without false praise, judicious L1 use), or state explicitly that it is out of scope |
| **Overlaps (POST-18):** D5-2 / D11-1 double-penalise re-testing a demonstrated component; D8-3 and D9-3 both reward an unaided check after help | Rubric text | Assign re-testing to D11 only. Define D8 as *claims about evidence*, D9 as *the check itself*. |
| **Length enters D4 only through its "effect on comprehension"** | Rubric text | Keep. Avoid a hard word-count criterion inside the rubric; the deterministic word-limit check already exists. |

## 2. CEFR alignment

| Point | Assessment |
|---|---|
| D4 "proficiency appropriateness" judged against the CEFR estimate, never age | Correct separation. CEFR describes language ability, not age; the r3/r4 age × CEFR independence is preserved. |
| Anchors are not tied to CEFR descriptors | D4-3 "comprehensible at the level" relies on evaluator intuition. CEFR Companion Volume (2020) descriptors for *reception* (reading for orientation, A1–B1) and *mediation* ("explaining data", "facilitating understanding") give observable criteria. **Proposal:** anchor D4 to 2–3 CV descriptors per level (e.g. A1: "short, simple texts, a single phrase at a time"; B1: "straightforward factual texts"). |
| D9-4 "transfer task" for A1 children | May be inappropriate at A1 (POST-18). **Proposal:** at A1 a *guided* transfer (frame with one open slot) can score 4. |
| CEFR is an *estimate* in the fixture | The rubric correctly does not penalise a tutor for an estimate it was given. Evaluators should be reminded that the estimate may be wrong (D1 covers inventing a level, not using the given one). |
| Grammar points per level | The fixture's grammar targets (A1 *he/she*, A2 present simple *-s*, B1 present perfect vs past simple) match common syllabus placements. No mismatch found. |

## 3. Language-learning pedagogy

| Area | Assessment |
|---|---|
| **Corrective feedback (D5, D6)** | Consistent with SLA research favouring prompts (elicitation, metalinguistic clues) before recasts or explicit correction for learners able to self-repair (Lyster & Ranta 1997; Lyster 2004). D6-1 "jumps straight to a full explanation on a first error" fits this. **Caveat:** for A1 children, explicit correction plus a model is also well supported. Calibrate D6 by level (educator pack Q5). |
| **Hint ladder and leakage (D7)** | The ladder (attention cue → conceptual cue → partial structure → targeted support → worked example → direct explanation) matches graduated-assistance models (Aljaafreh & Lantolf 1994). D7 is the rubric's most consequential core dimension. Its anchor 2 ("on a binary or single-ending item, the first hint resolves the choice") is **the criterion most often failed in r4.1/r4.2** (§7). That is a policy question: on a two-option item almost any meaningful cue narrows to the answer. **The educator panel must decide what an acceptable L1/L2 cue is for binary items.** Without that ruling, D7 measures an unattainable standard on those items. |
| **Formative assessment (D8, D9)** | Aligned with formative-assessment practice: eliciting evidence and acting on it, with no mastery claims from single items (Black & Wiliam 1998). D8-0/1 forbid mastery claims. Good. |
| **Accuracy (D10)** | Correct to make it core: a wrong rule taught by a tutor is a high-cost error. The 0/1/2 boundary ("could mislead" vs "side point") needs worked examples (N2 in the educator pack). |
| **Age (D3)** | Register-only, without length. Appropriate, but anchor 4 "evident care" is judgement-heavy. |

## 4. Assessment validity and reliability

| Issue | Finding |
|---|---|
| **Scoring inference.** Can a single outcome (MEETS/PARTIAL) stand for "good tutoring" in a case? | Only with stable evaluation. §7 and `r42_cross_run_stability.md` show outcome instability concentrated where means sit near 3.00, so the MEETS/PARTIAL boundary carries large measurement error. **Proposal:** report the per-dimension profile and the core-floor pass/fail as primary results, and the MEETS rate as secondary, with its cross-run interval. |
| **Generalisation.** 120 cases, 13 situation types, 3 age bands × 3 CEFR levels | Cells are small (9 cases per situation type). Situation-type rates should not be reported as stable. |
| **Rater reliability** | Two LLM evaluators from one provider and family are **not independent raters**. Their agreement is evidence of shared reading, not validity. Human double-marking on a sample is required (`r42_human_adjudication_queue.md`). |
| **Thresholds** | Mean ≥ 3.00 and core ≥ 3 were fixed before scoring (good: not tuned). Their *cut-score validity* has not been studied (e.g. a contrasting-groups or Angoff-style standard setting with educators). |
| **Consequential validity** | The rubric could push tutor design toward minimal hints on binary items, which may frustrate A1 learners. That is a side effect worth naming for the panel. |

## 5. Insufficient-evidence handling (POST-16)

- **The draft's rule 3 is self-contradictory.** It says "give no score" **and** "it may be scored 3 with the flag set".
- **The evaluator's disclosed interpretation:** unscored; never counted as 3; a core dimension with insufficient evidence makes the case **UNCERTAIN**.

**Assessment:**
- The interpretation is the defensible reading. Scoring absent evidence as 3 inflates means and hides coverage gaps.
- **Risk:** evaluators may use `insufficient_evidence` and `n/a` inconsistently. §7 shows the frequencies per run and per evaluator.
- **Proposal for the panel:**
  1. Delete the "may be scored 3" clause.
  2. Define `insufficient_evidence` as "the dimension applies but the transcript is too short to show it", and require one sentence of justification.
  3. Count UNCERTAIN cases separately; never fold them into PARTIAL.

## 6. N/A scoring interpretation

- **The draft allows `n/a`** for single-turn cases (D6, D8, D11) and `check_not_due` (D9).
- **r4.1 found a bug in the outcome code (core-1):** it treated a core `n/a` as a failure. It was fixed in core-2: `n/a` is excluded from the mean and all floors, and a case with no scorable core dimension cannot MEET.

**Assessment.** Excluding `n/a` is consistent with the rubric. It has a consequence: **cases with fewer applicable dimensions are judged on fewer criteria and can pass more easily.**

**Proposal for the panel:**
1. List per dimension the situations where `n/a` is legitimate. D5 is n/a only when the learner gave no answer; D7 is n/a only when no hint was given or due.
2. Report the number of scored dimensions per case alongside the outcome.
3. Consider requiring ≥ 2 of the 4 core dimensions to be scorable for MEETS.

## 7. Empirical behaviour of the rubric in r4.2 (3 runs × 120 cases, LLM evaluators)

| Observation | Data | Implication |
|---|---|---|
| **Outcome depends on evidence coverage.** Pooled official outcomes by the number of dimensions actually scored per case: | 5 dims: **31/32 MEETS (97%)**; 6: 29/44; 7: 25/44; 8: 16/29; 9: 14/21; 10: 35/78; 11 dims: **19/112 (17%)**. By scorable core dimensions: 2 core: 47/61 (77%); 3: 49/76 (64%); 4 core: 73/223 (33%). | **Construct-validity threat (confirmed).** Short cases with few applicable dimensions pass far more easily than long ones. MEETS partly measures *case length*, not tutoring quality. This supports §6: report coverage per case, and require a minimum number of scorable (core) dimensions. |
| **D7 dominates the outcome** | Official D7 pass rate 45% / 62% / 52%; within-case SD 0.24; 45 of 89 cases changed D7 score across runs. Independent: 88% / 77% / 80%. | The core floor on D7 makes the binary-item cue policy decisive. The two LLM evaluators read the D7 anchors very differently, so **the anchor is not reliably interpretable** without educator exemplars. |
| **Threshold placement** | 105 / 120 cases have a mean within 3.00 ± 0.15 in at least one run; 54 of 55 outcome flips sit there | The MEETS cut sits on the mode of this tutor's distribution. Small evidence differences flip outcomes. Standard setting is needed (§4). |
| **Evaluator repeatability vs agreement** | Same evaluator on identical transcripts: κ 0.85 (74 cases). Official vs independent: κ 0.15–0.40. | The rubric can be applied consistently by one reader, but **two readers disagree substantially**. Inter-rater reliability with humans is unknown. |
| **`insufficient_evidence` usage** | Official used it almost only for D8 (8–12 per run); independent spread it over D5, D8, D9, D11 and produced 1–2 UNCERTAIN per run | The term is applied inconsistently between evaluators (§5 proposal). |
| **`n/a` usage** | Official n/a per run: D8 ≈ 73, D6 ≈ 45, D11 ≈ 45, D5 ≈ 43, D9 ≈ 25, D7 ≈ 23 | n/a is a structural feature of the fixture (1–2 turn cases), not an edge case. The outcome rule must be designed around it. |
| **Strong, stable criteria** | D2 99–100%, D3 98–100%, D5 95–97%, D1 93–97%, D10 91–93% pass, with low within-case SD | These anchors appear workable as written, pending human confirmation |
| **Severity** | 0 critical; 4 major (all from the independent evaluator, run 3) over 720 case evaluations | Severity tags are rare and evaluator-dependent; human confirmation is needed (adjudication Tier 1) |



## 8. Summary for the educator panel (decisions needed before the rubric is frozen)

1. **D7 on binary and single-ending items.** What cue is acceptable at L1/L2? This drives most PARTIAL outcomes and most run-to-run instability (§7).
2. **Coverage-adjusted outcome.** A minimum number of scorable dimensions, or reporting by coverage band (§7: 97% vs 17% MEETS by coverage).
3. **Insufficient evidence.** Remove the "may score 3" clause (POST-16).
4. **`n/a`.** Legitimate uses per dimension, and a minimum number of scorable core dimensions.
5. **Overlaps.** D5/D11 and D8/D9 (POST-18); adapt D9-4 at A1.
6. **CEFR descriptors** for D4 anchors.
7. **Standard setting** for the MEETS cut and the core floors.
8. **Blind, independent educator review protocol** (POST-19): pack without the draft's positions, independence declarations.

**Status: rubric v2 remains a DRAFT.** Academic validity is **not established**.

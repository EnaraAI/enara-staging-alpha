# Experiment 4 protocol (proposal; **not started**)

*14 Nov 2026. AI-simulated students only. This document is a proposal for the owner's approval. It must be preregistered and locked (SHA-256 recorded) before any Experiment 4 run, and no run is started by this document.*

## 1. Question and conditions

Does ENARA with targeted changes (the P0 items of `ENARA_TUTOR_IMPROVEMENT_ROADMAP.md`) teach simulated learners better than current ENARA, and better than a plain AI tutor?

| Condition | Definition |
|---|---|
| **A** Current ENARA | The code state used in Experiment 3 (commit `070458d`), unchanged, default settings. Tag it before starting. |
| **B** Improved ENARA | A and the P0 changes (closing recap / rule-in-own-words; strategy change on a repeated wrong belief; criterion coverage), implemented behind a default-off, non-production research flag, as the condition-E hook was. Nothing ships to production from this experiment. |
| **C** Plain AI tutor | The same prompt and model as Experiment 3 (`claude-opus-5-5`, minimal tutoring prompt plus the lesson spec). |

Tutor models, learner model (`claude-haiku-5-5`), turn budget, practice items and assessment path are identical to Experiment 3 so that A can be compared with it descriptively (A is rerun; Experiments are not pooled).

## 2. Hypotheses (preregistered)

- **H1 (primary 1).** Mean learning gain (post − pre) under B is higher than under A. Target effect worth detecting: **+0.08**.
- **H2 (primary 2).** Mean learning gain under B is higher than under C. Same target, +0.08.
- **Secondary:** transfer, delayed retention (1/7/30 days), mastery rate, independent performance, misconception correction (blocks whose pre-test shows the misconception), cost per block and cost per mastered outcome, and four process metrics: recap rate in the last tutor turn, rule-in-own-words rate, share of sessions with ≥ 3 consecutive same-shape hints, share of turns that concede a wrong belief.
- **Non-inferiority (secondary):** B is not worse than A on delayed retention by more than 0.03.
- **Descriptive only:** A vs C (a rerun of Experiment 3's contrast); no hypothesis, no Holm slot.
- Exploratory contrasts (domains, profiles, outcomes) are labelled exploratory with Benjamini–Hochberg q-values.

H1 and H2 are the confirmatory family; Holm–Bonferroni is applied across the two (α = 0.025 each in the sample-size formula below). A result counts as supported only if the Holm-adjusted p < 0.05 **and** the 95% CI excludes 0.

## 3. Design: matched blocks (the main change from Experiment 3)

In Experiment 3 each student met A and C on *different* outcomes, so block-level noise (outcome difficulty, item luck, student state) dominated: the student variance component was ≈ 0 and the variance of one A-minus-C block pair was **0.284** (sd 0.533). Because the learners are simulated and carry nothing between blocks except a self-written note, the same learner on the same outcome can be run under all three tutors without carry-over (the note is reset per block, the seeded hidden state and per-item behaviour flags depend only on student, outcome and replication, not on condition). So:

- **Unit of analysis: the matched triplet** (student, outcome, replication), each run once under A, B and C with identical hidden knowledge state, held misconception and seeded behaviour flags. The residual noise is then tutor-session sampling and answer sampling. (Model sampling remains independent per condition.)
- Each student-replication contains one outcome per area (6 triplets, 18 blocks), outcomes balanced by a seeded Latin design as before.
- Blocks within a triplet are run in randomised order, each with its own synthetic school and student records in the throwaway in-process database (as in Experiments 2–3); no information passes between conditions.
- **Limitation to state in the report:** the matched design removes variance that a real classroom cannot remove; its estimates apply to simulated learners.

### Development / hold-out split (guards against overfitting to this analysis)

The roadmap was derived from transcripts of eight outcomes (FN-01, GR-07, WR-05, WR-04, GR-01, RD-02, FN-07, RD-04) and from aggregate statistics over all outcomes. Before any change is implemented:
1. A **hold-out set of 16 outcomes** is drawn by a seeded random draw from the 40 outcomes not read in the casebook, stratified by area (2–3 per area). Identifiers and hash go into the preregistration. Nobody reads their transcripts or items until the analysis.
2. **Primary analysis uses the hold-out outcomes only.** The same analysis on all 48 outcomes is reported as secondary.

## 4. Assessment design

Unchanged from Experiment 3: the frozen 48-outcome benchmark (4 pre, 4 post, 4 transfer, 4 delayed items per outcome, deterministic key/rubric scoring, text-based listening, majority of 3 answer samples per item, seeded forgetting for delayed retention, outcome-specific mastery criteria). The item bank is hash-frozen in the manifest. Assessment items are never shown to any tutor.

## 5. Blind scoring and review

- The deterministic scorer receives only the item and the learner's answer (condition-blind by construction). Block records keep the condition label only in a column excluded from the scoring code path.
- The second judge model grades a seeded 10% sample of items without seeing the condition, the accepted-answer list or the deterministic verdict; agreement and κ are reported and disagreements exported.
- **Human transcript review:** 40 randomly drawn matched triplets with tutor labels replaced by random letters (A/B/C scrambled per triplet) and rated by the Section 6 rubric of the gap analysis by reviewers who do not know which tutor is which. Reviewer disagreement is reported. If no human reviewer is available, state it; do not substitute a model rating without labelling it as such.

## 6. Statistical analysis

- Primary estimator: mean of per-triplet differences (B − A; B − C) of gain, with a **two-way cluster bootstrap** (resample students and outcomes, 5,000+ resamples) for the 95% CI, and a **sign-flip permutation test** on per-student mean differences (unit = student; outcomes are the second cluster).
- Effect sizes: paired d_z with Hedges correction and the raw difference in points.
- Secondary measures: same machinery; proportions use Wilson intervals; Benjamini–Hochberg over the exploratory family.
- **Mixed-effects models** (student and outcome random effects) are the preferred analysis but need a statistics library not installed in this environment; if still unavailable the bootstrap above is the declared substitute and the limitation is stated.
- Missing or failed blocks stay in the data (reported, not dropped); a block failing because of provider errors is re-run once under a new attempt id and both attempts are kept.
- Process metrics: computed with a frozen, versioned script; the heuristics (regex) are stored with the manifest and any change after seeing results is disclosed.

## 7. Sample size (calculation, with its assumptions)

**Observed variability (Experiment 3, gain).** The variance of one A-minus-C block pair is 0.2845 (sd 0.533); the student variance component of the pairwise difference is about 0.00; the three-replication student mean has sd 0.30. Normal-approximation formula for a paired design: **N pairs = (z₁₋α/₂ + z₁₋β)² · σ²_d / Δ²**, with power 80%.

Unmatched design (as in Experiment 3), using σ²_d = 0.2845, α = 0.025 two-sided for each of the two primary contrasts (Holm-conservative):

| Target Δ (gain) | Block pairs needed per contrast |
|---|---|
| 0.05 | 1,082 |
| 0.08 | 423 |
| 0.10 | 271 |
| 0.12 | 188 |

(at α = 0.05 the same Δ values need 894, 349, 224, 156 pairs). These counts rely on the observed Experiment 3 variance and are **upper bounds for the matched design**, which should have lower variance but whose variance is **not yet known**.

**Matched design: do not guess, pilot it.** Stage 0 runs **60 matched triplets (all 48 outcomes' hold-out subset plus fillers) under A, B and C** to estimate σ²_d for B − A and B − C. Then:

> N_triplets = max(150, ceil(1.2 × 9.504 × σ̂²_d / 0.08²)), capped by the budget below,

where 9.504 = (2.241 + 0.842)² (α = 0.025, power 0.8) and 1.2 inflates for variance-estimation error. Pilot data are **not** pooled into the main analysis. If the pilot variance implies N above the budget cap, the protocol is to stop and report, not to run an underpowered study and call it conclusive.

Example outcomes of the rule, for planning only (σ̂²_d is unknown): σ̂²_d = 0.10 gives 179 triplets; 0.15 gives 268; 0.2845 (no variance reduction at all) gives 508 triplets.

## 8. Cost controls

Estimated cost per matched triplet (A and B assumed to cost the same, from Experiment 3 recorded cost per block: A $0.167, C $0.071, plus ≈ $0.00 judge) is **≈ $0.41** (estimate, not actual). Budget table: pilot 60 triplets ≈ $25; 150 triplets ≈ $61; 271 ≈ $110; 508 ≈ $205. Controls: a hard budget cap per stage in the config (the run stops safely before the next call and marks itself incomplete), every provider attempt logged including retries and failures, unknown costs kept as unknown (never invented), per-condition cost in the report, no change to production budgets or configuration, and the key read from a file path outside the repository. The owner approves the main-stage budget after the pilot.

## 9. Leakage controls

Same as Experiments 2–3 plus: (i) static validation that no assessment prompt or long accepted answer appears in tutor-visible text; (ii) outgoing-request scanner on tutor-side calls (phrases of at least 6 words); (iii) post-hoc scan of all transcripts and notes; (iv) the hold-out outcomes' items are never opened by anyone designing B; (v) B's research flag cannot read assessment content (it does not receive it).

## 10. Regression checks (before the main stage)

1. All existing research and backend suites pass (research tests, language-engine tests, `avatarLanguageLink`), and the default-off ablation test still shows production unaffected.
2. A fixed **behaviour regression set** of scripted learner dialogues run on A and B: (a) a confident wrong belief held for 4 turns (WR-04-style): B must still hold the correct line; (b) requests for the answer before trying; (c) Arabic input in an English lesson; (d) off-topic requests; (e) leakage-bait prompts. B must not exceed A's rate of answer leakage, Arabic replies or concession.
3. Production-safety check: the B flag is ignored when `NODE_ENV=production` (tested like `researchAblated`).

## 11. Decision rules

- B is declared better than A (or C) only if H1 (or H2) is supported after Holm correction; otherwise "not shown".
- If B is not better than A on the hold-out set, the P0 changes are **not** recommended, even if they look better on the development outcomes.
- If B ties A but costs less (P1-4), report that separately as a cost finding with the non-inferiority margin.
- All conclusions are labelled AI-simulation findings; none is evidence about real learners. Real-learner claims need the classroom pilot.

## 12. Timeline and approvals

1. Owner approves this protocol and the pilot budget (≈ $25).
2. Implement B behind the flag; run regression checks; draw and seal the hold-out set; write the preregistration and lock it.
3. Pilot (60 triplets), compute σ̂²_d, fix N by the rule, owner approves the main budget.
4. Main run, analysis with frozen code, report. Experiment 4 is not started until step 1 is approved.

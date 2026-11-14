# r4.2 Final release gate: ENARA Phase 1 language tutor

## Decision: `READY_FOR_NEXT_VALIDATION_STAGE`

The **next validation stage** is **qualified human (educator) adjudication and rubric freezing**. It is **not**:
- a production launch;
- real-learner exposure;
- another automated benchmark on the same draft rubric.

**This decision does not claim production readiness or real-learner readiness.**

**Baseline:**
- r4.1 (`ltc-v1-r4.1`), commit `fc6a487` plus the r4.1 working tree, unchanged throughout the campaign;
- every engine, metering, benchmark, fixture and rubric hash was re-verified after the last run (`r42_baseline.json`);
- no production code, prompt, scoring logic or rubric was modified.

**Campaign:**
- 3 independent full runs: 3 × 120 cases / 219 turns, real provider calls, synthetic learners;
- **$15.32 of $30** (per run: $5.45, $4.94, $4.93; all under the $10 cap).

## 1. Dimension-by-dimension verdict

| Dimension | Verdict | Evidence |
|---|---|---|
| **Engineering reliability** | **Established for the tested path** | 657/657 tutor turns HTTP 200; runtime parity 216/216; 0 answer keys in prompts; 0 visible markers; markers parsed 655/657 (2 missing, 0 malformed); 657/657 turns scoped; 0 identifier leaks; 0 provider retries, non-200 or unpriced calls; tutor cost matched the app's own metering to the cent in every run; 0 reveals before an attempt. |
| **Measurement reliability** | **Not established at the outcome level** | Official MEETS 51 / 63 / 55 (range 12). Cross-run outcome Fleiss' κ **0.39**; 55/120 cases flipped, 54 of them at a mean of 3.00 ± 0.15. Official vs independent κ 0.15–0.40. Same evaluator on identical transcripts κ 0.85 (74 cases), so most instability comes from tutor sampling at the threshold, not evaluator noise. Score-level variance is small (mean case SD ≈ 0.09). |
| **Academic validity** | **Not established** | Rubric v2 is an unvalidated draft. The desk review found a confirmed construct-validity threat: MEETS falls from 97% (5 scored dimensions) to 17% (11 scored dimensions). Other findings: D7 anchors read very differently by the two evaluators; `insufficient_evidence` and `n/a` rules unresolved (POST-16); no CEFR-descriptor anchoring; no standard setting. **No human expert has reviewed it.** |
| **Tutor response quality** (automated, draft rubric) | **Mixed, consistent profile** | Strong and stable: task alignment 99–100%, age fit 98–100%, answer judgement 95–97%, grounding 93–97%, grammar 91–93%, CEFR fit 89–92%. Weak: **D7 hint leakage 45–62%** (core; mostly minor near-reveals on binary items, POST-F1), D9 formative checks 74–80%; situation types T08 and T06 rarely MEET. 0 critical tags; 4 major tags (independent evaluator only), queued for humans. |
| **Cross-run stability** | **Fair; insufficient for single-run headlines** | 65/120 cases stable over three runs (29 always MEETS, 36 always PARTIAL). Engine decisions identical in 214/219 turns; tutor replies vary in 219/219. |
| **Learning efficacy** | **Not established, and not measurable by this benchmark** | Synthetic scripted learners; no learning outcomes measured; automated scoring only |

## 2. Why this status

| Status | Assessment |
|---|---|
| **`READY_FOR_NEXT_VALIDATION_STAGE`** (chosen) | The system ran three full paid campaigns with no security, privacy, parity, budget or structured-output violation. The remaining problems are in **measurement and academic validity** (rubric draft, threshold placement, coverage effect, D7 anchor). By design, those can only be resolved by the human validation stage. The campaign produced the inputs that stage needs: the adjudication package (97 blind sheets, 31 Tier 1), the rubric decision list, and the stability baselines. |
| `READY_WITH_RESTRICTIONS` | Would imply some form of use or deployment under restrictions. No use is justified before academic validity is established. |
| `NOT_READY_REQUIRES_REMEDIATION` | No engineering defect was found. Changing tutor prompts for D7 now would tune the tutor to an **unvalidated** standard. The D7 cue policy must be ruled on by educators first. |

## 3. Binding restrictions for the next stage

1. **No real learners. No production claims.** Results may be cited only with the limitations in §4.
2. **Freeze the rubric before using it again.**
   - Do not re-run an automated benchmark as a "result" until educators have:
     - ruled on D7 binary-item cues;
     - fixed `insufficient_evidence` and `n/a` (POST-16, coverage minimum);
     - set the cut score.
   - Then freeze `rubric_v2_machine.json` and `judge_v2_core.ts` together, by hash.
3. **Human adjudication.** Two independent qualified EFL educators, blind (`adjudication_package/cases/` and `rubric_criteria.md` only):
   - at minimum the Tier 1 cases (31) plus the Tier 3 controls (9);
   - each reviewer signs an independence and conflict-of-interest declaration (POST-19);
   - human results are reported separately from AI results.
4. **Report ranges, not single runs.** Quote the MEETS rate as the three-run range and report per-criterion profiles. Any future comparison needs ≥ 3 runs.
5. **Open product items before any real-learner pilot (unchanged from r4.1):**
   - POST-14: a pre-existing upload-path listing;
   - POST-07: per-session request serialisation;
   - POST-15: delimiter escaping;
   - POST-F1: binary-item near-reveals, after the educator ruling.

## 4. Limitations

- **Synthetic learners and scripted turns** (1–3 turns per case). This is not real learner behaviour.
- **All evaluators are LLMs from the same provider and model family as the tutor.** The "independent" evaluator is a different model, not an independent rater. **No human review has taken place.**
- **The evaluator test-retest is partial**: 74/120 cases, interrupted by a container restart and not resumed, to save budget.
- **UsageLedger.** The app's UsageLedger rows live in each run's throwaway database and were not exported (the frozen harness was not modified). Costs were reconciled against the app's `recordAiCall` records, which use the same price catalog. Evaluator calls are script-side and have no app ledger rows.
- **Provider sampling.** The route exposes no seed. "Independent sampling" means fresh sessions, a fresh database and provider-default sampling per run.

## 5. Deliverables

| File | Content |
|---|---|
| `r42_run_1_report.md`, `r42_run_2_report.md`, `r42_run_3_report.md` | Per run: cost, integrity, outcomes, per-criterion results |
| `r42_cross_run_stability.md` (+ `cross_run_stability.json`, `evaluator_test_retest.json`) | Transitions, κ, variance, boundary, evaluator disagreement, missing evidence |
| `r42_academic_rubric_review.md` | Construct validity, CEFR, pedagogy, assessment validity, insufficient evidence, n/a; empirical findings; 8 decisions for educators |
| `r42_human_adjudication_queue.md` (+ `adjudication_package/`) | 97 blind sheets, tiered; sealed evaluator positions and key |
| `r42_spend_ledger.json` | Preflights, per-component and per-call costs (1,457 calls), reconciliation |
| `r42_final_release_gate.md` | This decision |
| `r42_baseline.json` | Commit and configuration hashes |
| `run_{1,2,3}/` | Raw transcripts, provider attempts, evaluator outputs and attempts, console logs, summaries |

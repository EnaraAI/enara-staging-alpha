# Validation report: controlled validation campaign 1

**Simulation only.** 48 AI-simulated students, 288 blocks (48 per condition), 1 replication, real provider calls, hard cap $40. Raw data: `runs/validation-campaign-1/` (manifest, immutable raw blocks, audit log, every provider attempt, finished.json, nine generated reports). Smoke test before it: `runs/smoke-1-keep/` (36 blocks).

## What this campaign verified (integration)

- The actual ENARA tutor route was exercised in-process 47 + 45 times (conditions A and E), end to end, with its own provider calls metered in the ledger (`tutor` role, Opus). No mock stands in for the tutor; offline dry runs skip A/E rather than fake them.
- All six conditions ran; 5,751 provider attempts were recorded (56 failed, almost all HTTP 503; 53 failed attempts have no usage and are recorded as **unknown cost**, not zero).
- **Actual cost: $17.04** for the campaign (+ $0.97 smoke test = **$18.01 total**). Retry cost $0.004. Cap $40 not reached.
- Blind second judge: 368 judged items, raw agreement 95.9%, Cohen's κ = 0.91 vs the deterministic keys; disagreements exported to `disagreements_for_human_review.json`.

## Defects found by this campaign (reported, not hidden)

1. **4 of 288 blocks failed** (1.4%), all from the outgoing-request leakage guard aborting a call. Three were false positives caused by short generic phrases ("what does it mean", "what happened first"); I then tightened the scanner to phrases of at least 6 words (test added). One (WR-03, condition A) was a real coincidence: the tutor wrote a sentence identical to a word-order answer key. The failed blocks stay in the data and every report; the raw data was not edited. The "no leakage" check therefore shows FAIL for this run, honestly.
2. **The simulator is not sensitive enough to prior knowledge or difficulty.** Seeded "already knows this" blocks scored 24.2% at pre-test vs 25.4% for the others, and control accuracy did not fall with difficulty (r = +0.16). Pre-test accuracy is low overall (about 25%), so persona wording alone does not make the haiku-class student reflect its hidden knowledge state.
3. **Measurement is noisy.** Each stage has only 2 items (delayed 4), single sample per answer, so one student-block score is one of 0/50/100%. Pre-test means differ across conditions by chance (A 35%, D 16%) at n = 48.

## Simulator validation checks (`reports/9_simulator_validation.md`)

| Check | Result |
|---|---|
| No large learning jumps without teaching | PASS (8% of control blocks; mean control change −7.3 pts) |
| Sensitivity to difficulty | FAIL (r = +0.16) |
| Sensitivity to prior knowledge | FAIL (24.2% vs 25.4%) |
| No identical behaviour across students | PASS (30% of pairs coincide on short answers; threshold 50%) |
| Attention-lapse flag lowers accuracy | PASS (8.6% vs 29.3%) |
| Forgetting (day 1 ≥ day 30) | PASS (29.7% vs 24.2%) |
| No assessment leakage | FAIL (4 events recorded, see above) |
| Adversarial profiles learn less | PASS (3.4 vs 4.0 pts; small, not significant) |

Population checks (150 students, `tests/students.test.ts`): all pass (diversity, overlapping dimensions, no near-perfect correlation between dimensions). Repeat-run consistency and comparison of multiple simulator configurations were **not run** in this campaign (see blockers).

## Learning results (not evidence of real learning)

| Condition | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|
| A actual ENARA | 35.1% | 33.0% | 23.4% | 32.4% | 10.6% |
| B study notes | 27.1% | 30.2% | 28.1% | 26.6% | 2.1% |
| C generic AI tutor | 18.8% | 16.7% | 22.9% | 22.4% | 4.2% |
| D scripted tutor | 15.6% | 26.0% | 28.1% | 21.9% | 2.1% |
| E ENARA ablation | 22.2% | 32.2% | 33.3% | 30.6% | 6.7% |
| F no teaching | 32.3% | 25.0% | 18.8% | 38.0% | 0.0% |

Pre-registered contrasts (Holm-adjusted, 47 students): A−F gain +0.05 [−0.22, 0.32], adj. p = 1.0; A−B post +0.04, adj. p = 1.0; A−C post +0.16, adj. p = 0.09; A−E post 0.00, adj. p = 1.0; A−B transfer −0.04, adj. p = 1.0. **None is supported.** 78% of taught blocks showed no gain.

**Conclusion.** This campaign validates the platform (it runs, records, costs and audits correctly) but its learning measurements are too coarse and the simulator too weakly tied to its hidden knowledge state to detect a tutoring effect, positive or negative. It must not be read as "ENARA does not teach" nor "ENARA teaches". The earlier 360-student learning-outcome experiment (more items per outcome, 3 answer samples, stronger belief mechanics) did show a simulated signal; this engine needs the fixes below before a full run is informative.

## Recommended fixes before the full experiment

1. Answer each assessment item 3× and take the majority (as in the earlier experiment) to cut noise.
2. Strengthen the link between hidden knowledge and answers (state the held misconception/known rule explicitly as the learner's own memory at pre-test) and re-check difficulty/prior-knowledge sensitivity.
3. Add repeat-run consistency and a second simulator configuration (e.g. a larger student model) to the validity suite.
4. Then re-run a validation campaign; only then approve the full experiment (estimated ≈ $17 per 48-student replication → about $160–$200 for 150 students × 3 replications at the same settings).

---

## Update (14 Nov 2026): fixes, re-validation, voice benchmark

**Fixes applied after campaign 1:** majority of 3 answers per item; the learner's hidden knowledge state stated explicitly; a seeded difficulty "slip"; leak scanner needs ≥ 6 words; the generic WR-03 pre-test item replaced; two simulator checks redefined to be more informative (difficulty uses every block's pre-test; "identical behaviour" uses the full answer vector). The redefinition was made after seeing campaign 1, so it is flagged here.

**Campaign 2 (same 48 students, fixes on, $18.11):** ENARA post 52% vs no-teaching 25%; A−F gain +0.22 [−0.05, 0.52], raw p 0.016, Holm 0.079 (not significant). Prior-knowledge sensitivity now PASS (55% vs 17%). Judge agreement 95.7% (κ 0.91). 2 failed blocks (WR-03 coincidence, then fixed).

**Repeat-run consistency** (same seed, independent sampling, 24 students, conditions B and F): 89.4% agreement, κ = 0.76 over 480 items. **Second simulator configuration** (Sonnet-class learner instead of Haiku-class): prior-knowledge sensitivity much stronger (78% vs 35% at pre-test), lapse, forgetting and adversarial checks PASS; difficulty sensitivity near zero in both.

**Full experiment:** see `FULL_EXPERIMENT_REPORT.md` (50 students × 3 replications, $57.24; no pre-registered contrast supported).

**Voice vs chat benchmark** (24 sessions per channel, simulated learners, real ENARA tutor, avatar text path, no audio; `runs/voice-benchmark-1/`, $3.94):

| Metric | chat | voice |
|---|---|---|
| Arabic in any reply | 0/24 | 0/24 |
| Hidden assessment marker visible | 0/24 | 0/24 |
| Engine turn state stored on every turn | 24/24 | 24/24 |
| Words per reply | 85.7 | 60.3 |
| First reply shows an answer form (approximate text match) | 8/24 (33%) | 12/24 (50%) |
| Guard removals per session | 1.4 | 0.6 |

Reading: the shared engine's guarantees hold in voice (English only, no visible marker, state stored). Voice replies are shorter, as intended. The "answer form in first reply" rate is higher in voice (50% vs 33%) but the intervals overlap heavily (18–53% vs 31–69%) and the metric is a crude text match that also fires when the lesson item itself is shown; this needs a larger run and manual review before concluding anything. Caveats: 144 voice tutor attempts are recorded as **unknown cost** (streamed responses carry no parseable usage in the ledger), so the $3.94 is a lower bound for voice; the stored `version` field differs by channel (`enara-ai` in chat, `ltc-v1` stored by voice), which is a labelling difference, not a different engine; no real audio, latency or student was tested.

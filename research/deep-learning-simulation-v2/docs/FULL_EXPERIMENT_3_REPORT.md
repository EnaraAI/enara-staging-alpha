# Full experiment 3 report (4 items per stage) — stopped early at the owner's request

**Simulation only.** AI-simulated students. This is not evidence of learning in real humans. Source: `runs/full-experiment-3/` (raw blocks, provider ledger, manifest, generated reports 1–9).

## What was run

- Same design as experiment 2 (50 AI students, 3 independent replications, 6 conditions, same pre-registered tests, same locked pre-registration), but with a new seed and a more precise instrument: **4 questions per stage** (pre, post, transfer) instead of 2, 3 answer samples per question with majority vote, the FN-02 item reworded.
- **The run was stopped on request before it finished: 824 of 900 blocks.** Conditions A, B, C, D, F are complete (150 blocks each). Condition E (ablation) has only **74 of its 150 blocks**, so every comparison involving E is incomplete and should not be relied on. Zero blocks failed; zero leakage events.
- The process stopped by itself twice during the run (session resets) and was resumed each time; resume skips finished blocks, so no block was repeated or lost.

## Result

| Condition | blocks | pre | post | transfer | delayed | mastery |
|---|---|---|---|---|---|---|
| A actual ENARA tutor | 150 | 31.0% | 43.2% | 43.0% | 41.0% | 16.0% |
| B study notes | 150 | 31.3% | 39.3% | 39.2% | 37.0% | 14.0% |
| C generic AI tutor | 150 | 31.3% | 47.5% | 46.2% | 39.0% | 14.7% |
| D scripted human-like tutor | 150 | 27.7% | 28.5% | 29.3% | 28.5% | 6.0% |
| E ENARA ablation (**incomplete: 74 blocks**) | 74 | 20.3% | 44.6% | 45.9% | 37.8% | 17.6% |
| F no teaching | 150 | 29.2% | 25.3% | 22.8% | 31.7% | 3.3% |

Pre-registered confirmatory contrasts (gain = post − pre; 50 students; Holm-adjusted; two-way cluster-bootstrap 95% CI):

| Contrast | difference | 95% CI | adj. p | supported? |
|---|---|---|---|---|
| ENARA − no teaching (gain) | **+0.16** | [0.03, 0.31] | **0.003** | **Yes** |
| ENARA − study notes (gain) | +0.04 | [−0.09, 0.18] | 1.00 | No |
| ENARA − generic AI tutor (gain) | −0.04 | [−0.18, 0.11] | 1.00 | No |
| ENARA − ablated ENARA (gain) *(E incomplete)* | −0.12 | [−0.29, 0.06] | 0.12 | No (unreliable) |
| ENARA − study notes (transfer) | +0.04 | [−0.12, 0.20] | 1.00 | No |

**Reading, without spin.**
- With the more precise instrument, **ENARA clearly beats no teaching** in simulated students (+16 points of gain, Hedges g 0.86), and this is the only pre-registered result that holds after correction. In experiment 2 (2 items per stage) the same contrast was positive but not significant, so the extra questions mattered.
- **No evidence that ENARA beats study notes, or a plain AI tutor.** The generic AI tutor's gain is numerically a little higher (+0.16 vs +0.12) and the difference is well within noise. The scripted tutor (D) barely improved on no teaching.
- The ablation comparison is not usable because condition E is only half finished, and its early blocks started with a lower pre-test (20% vs 31%), which by itself inflates its gain.
- Taken together with experiment 2 (50 students, 2 items per stage, which showed no supported contrast): both runs agree that interactive AI tutoring lifts simulated learners above no teaching, and neither shows that ENARA's own pedagogy adds learning beyond a plain AI tutor.

## Cost (actual, recorded)

**$50.84** for 51,133 provider attempts. 783 attempts failed (HTTP 503/529 from the provider, all retried automatically); their cost is unknown because failed calls return no usage, and the ledger records them as **unknown cost (777 attempts), not zero**. So $50.84 is a lower bound by a few cents at most. Total recorded spend across the whole research task (every run's ledger): **$164.43** = smoke $0.97 + validation 1 $17.04 + validation 2 $18.11 + repeat/second-model runs $2.69 + aborted 150-student run $13.61 + experiment 2 $57.24 + experiment 3 $50.84 + voice benchmark $3.94 (voice figure is a lower bound: 144 streamed calls have unknown cost).

## Instrument quality

All simulator checks passed this time: sensitivity to prior knowledge (60% vs 18% at pre-test), sensitivity to difficulty (r = −0.20), no unrealistic learning jumps without teaching (2% of control blocks), attention-lapse, forgetting, adversarial-profile checks, and zero leakage. Blind judge agreement and repeat-run consistency are in `VALIDATION_REPORT.md`.

## Limitations

Simulated learners only; the simulator is a language model prompted from numeric parameters and has not been validated against real learners; listening is text-based; delayed retention is simulated; condition E incomplete; mixed-effects models not run; challenge test C (recovery after a failed session) not measured. The experiment cannot say whether ENARA's tutoring helps real students.

## What this means for the product

Do not claim from this that ENARA out-teaches other AI tutors. The defensible statement is narrower: in a simulation, ENARA's tutoring raised scores clearly above no teaching and about as much as a plain AI tutor. The open question is whether ENARA's guarded "try first, hints later" style pays off over longer practice or with real learners, which needs the classroom pilot.

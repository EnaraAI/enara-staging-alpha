# Experiment 4 report: current ENARA (A) vs improved ENARA (B) vs plain AI tutor (C)

*14 Nov 2026. **AI-simulation findings only: nothing here is evidence about real learners.** Source: `runs/exp4-main/` (immutable raw blocks, provider ledger, manifest), analysis `reports/exp4/exp4_analysis.py`, outputs in `reports/exp4/main/`. The picture is `EXPLANATORY_PICTURE.png`.*

## Decision (pre-registered rule applied)

**Neither confirmatory hypothesis is supported.** Improved ENARA (B) is not shown to teach better than current ENARA (A) or than the plain AI tutor (C). Under the preregistered decision rule ("if B is not better than A on the hold-out set, the P0 changes are not recommended"), **the three fixes are not recommended on this evidence.**

## What was run

- 300 matched triplets (50 simulated students × 6 areas × 1 replication), each run under A, B and C with identical hidden learner state and seeded behaviour flags: 900 blocks, **all recorded, 0 failed, 0 leakage events**.
- **Hold-out outcomes only**: the 16 outcomes drawn and sealed before the fixes were written (FN-04, FN-06, FN-08, GR-02, GR-04, GR-06, LS-02, LS-05, LS-08, RD-06, RD-07, RD-08, VO-02, VO-04, WR-02, WR-06). Because the main stage used only these, a separate "all 48 outcomes" secondary analysis does not exist.
- Preregistration locked (`preregistration_exp4.lock`), sample size from the pilot by the preregistered rule (the main run is 300 triplets; the rule applied to the main run's own variance would give 272, so the study is adequately sized by its own rule). Code commit of the final manifest `95fd576`, tree clean.
- Instrument: 4 items per stage, 3 answer samples per item (majority), deterministic scoring; blind judge agreement 94.3% (κ 0.89) on 1,089 sampled items.

## Confirmatory results (learning gain = post − pre; 300 triplets; two-way student × outcome cluster bootstrap 95% CI; sign-flip test; Holm over two)

| Contrast | difference | 95% CI | raw p | Holm p | Supported? |
|---|---|---|---|---|---|
| **H1: improved ENARA − current ENARA** | **+0.033** | −0.044 to +0.107 | 0.17 | 0.35 | **No** |
| **H2: improved ENARA − plain AI tutor** | **−0.010** | −0.086 to +0.067 | 0.70 | 0.70 | **No** |
| (descriptive) current ENARA − plain AI tutor | −0.043 | −0.117 to +0.033 | 0.043 (not in the confirmatory family) | n/a | Not tested |

Mean gains: A 0.151, B 0.184, C 0.194. The H1 estimate is positive but small and its interval includes zero; the study was powered for +0.08 (80%), so a true effect of that size would likely have shown, while a smaller one cannot be excluded.

## Secondary results (not corrected; labelled secondary)

| Measure | A | B | C | B − A [95% CI] | B − C [95% CI] |
|---|---|---|---|---|---|
| Transfer | 0.418 | 0.451 | 0.440 | +0.033 [−0.023, 0.092] | +0.011 [−0.071, 0.084] |
| Delayed retention | 0.383 | 0.386 | 0.376 | +0.003 [−0.043, 0.051] | +0.010 [−0.038, 0.061] |
| Mastery rate (blocks mastered) | 13.3% (40) | 16.3% (49) | 18.7% (56) | +3.0 pts [−3.7, 9.7] | −2.3 pts [−10.3, 5.6] |
| Misconception recovered (blocks with the misconception) | 13.1% (259) | 15.5% (264) | 19.2% (261) | not tested | not tested |

**Non-inferiority (B not worse than A on delayed retention by more than 0.03):** the point estimate is +0.003, but the lower bound is −0.043, below the −0.03 margin, so **non-inferiority is not established** (the interval is too wide to rule out a loss of 4 points).

## Did the fixes change what the tutor does? Yes.

Text-pattern process metrics (frozen heuristics `exp4-pm-v1`): the last tutor turn contains a recap in **A 7%, B 89%, C 31%** of sessions; the tutor asks the learner to state the rule in their own words in **A 13%, B 100%, C 3%**; three or more consecutive same-shape hint turns occur in **A 21%, B 14%, C 30%**; strict concession phrases occur in about 0% of sessions in all three. So the behaviours were implemented as intended and the "same hint repeated" pattern fell, but that did not translate into measurably more learning in this simulation. Words per tutor turn: A 96.5, B 98.6, C 115.2. A tutor reply contains a full accepted practice-answer sentence (3 or more words) in 28.0% of A blocks, 27.7% of B and 30.7% of C: **B is not more disclosing than A**.

## Cost (actual recorded usage × catalogue price; $119.43 for the whole run)

| | Total | Per block | Per mastered outcome |
|---|---|---|---|
| A current ENARA | $48.07 | $0.160 | $1.20 |
| B improved ENARA | $49.83 | $0.166 | $1.02 |
| C plain AI tutor | $21.54 | $0.072 | $0.38 |

58,845 provider attempts, 156 failed and retried; 132 failed attempts carry no usage and are recorded as unknown cost, not zero. B costs 3.7% more than A per block and both cost 2.2× the plain tutor.

## Reading, without spin

1. **The fixes did not produce a measurable learning gain** on hold-out outcomes: +3.3 points over current ENARA, interval −4.4 to +10.7. This is consistent with the "closing" and "strategy" behaviours being worth up to about +10 points or being worth nothing; the data cannot separate those.
2. **ENARA still does not beat a plain AI tutor.** Across Experiments 2, 3 and 4 the A − C estimate is −8, −4 and −4.3 points (all intervals include zero). Improved ENARA is level with the plain tutor (−1.0 point).
3. **ENARA's clear result remains its advantage over no teaching** (Experiment 3: +16 points).
4. **Cost.** Neither ENARA variant buys a measurable learning advantage over the plain tutor, and both cost about 2.2× more per block.
5. A plausible but untested reading: in these short simulated sessions the learner's only memory is a self-written note, so what matters is how much clear rule text the learner can absorb; behaviours that add recap should help, and they did not clearly help. The simulator may not reward them.

## Limitations

Simulated learners (a language model with note-only memory, not validated against real students); six tutor turns per block, and the closing turn (5) coincides with that cap; 16 outcomes (2–3 per area), so domain-level conclusions are not possible; 1 replication per student; text-pattern process metrics; no mixed-effects model (two-way cluster bootstrap instead). The hold-out protects against transcript-level tuning only: the author had seen aggregate per-outcome results for all 48 outcomes (disclosed in the preregistration). The regression check used a post hoc redefinition of two metrics (disclosed in `reports/exp4/EXP4_PILOT_AND_REGRESSION.md`).

## What this suggests next

1. **Do not ship the three fixes as a learning improvement.** If kept, justify them on behaviour (recaps, learner-stated rules) and note they are cost-neutral (+3.7%), not on measured learning.
2. The remaining question about ENARA's value is not answerable by more simulation of the same kind. The decisive evidence is a **classroom pilot with real learners and teacher review** (`PILOT_PROTOCOL_learning_outcomes.md` exists).
3. If more simulation is wanted: a longer multi-session design (several lessons, spaced practice), where "try first" and rule-in-own-words may matter, and a second learner model, to see whether the null result depends on this simulator.
4. Reduce ENARA's prompt cost (roadmap P1-4); this is the one change that could make ENARA "better" in a defensible sense on cost without hurting learning.

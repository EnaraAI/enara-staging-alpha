# Agent-run pilot: ENARA now (A) vs ENARA with new switches (B) vs plain tutor (C) — no API

*13 Nov 2026. **Pilot with 6 matched triplets. AI agents play the student and the tutor; AI raters judge. Not evidence about real learners, and too small to decide anything.***

## Method
- 6 simulated students (seeded personas from the research population, each holding a mistaken idea) × 6 hold-out outcomes (GR-02, WR-02, RD-06, LS-02, VO-02, FN-04) × 3 tutors = 18 six-message sessions. The same student card is used under all three tutors.
- **A**: the real ENARA engine prompt, no switches. **B**: the same engine with `all` + `closing` + `selfCheck` + `clarity`. **C**: the research's plain-tutor prompt. For A and B the real engine rebuilds the teaching instructions every turn and the real reply guards are applied (`src/offline/agentSession.ts`).
- One agent ran each session, alternating the student role (told only the learner card) and the tutor role (told only the tutor instructions). Student and tutor are therefore the same model in one context: some leakage of tutor knowledge into the student is possible, equally across A, B and C.
- Four blind raters (2 passes × 3 triplets, scrambled letters) scored eight criteria 1–5 (`reports/analysis/rating_analysis.py`).
- Limits of this set-up vs the earlier experiments: the engine's learner history is reconstructed from the dialogue; tutor agents are given the language-engine instructions only (not the full production base prompt); no post-test, so **no learning outcome was measured**.

## Results (mean score; difference with bootstrap 95% CI over 6 triplets; uncorrected)
| Criterion | A now | B new | C plain | B − C | B − A |
|---|---|---|---|---|---|
| Overall | 2.58 | 3.83 | 3.67 | +0.17 [−0.17, +0.58] | **+1.25** [+0.50, +2.00] |
| Explanation clarity | 2.75 | 3.92 | 4.17 | −0.25 [−0.83, +0.33] | +1.17 [+0.50, +1.75] |
| Targets the misconception | 2.92 | 4.25 | 3.67 | +0.58 [−0.08, +1.17] | +1.33 |
| Makes the student reason | 3.75 | 4.33 | 3.17 | **+1.17** [+0.83, +1.42] | +0.58 |
| Hint progression | 2.50 | 3.33 | 3.67 | −0.33 | +0.83 [−0.17, +1.75] |
| Answer protection | 4.17 | 4.00 | 3.17 | **+0.83** [+0.17, +1.50] | −0.17 |
| Consolidation | 1.17 | 3.75 | 2.58 | **+1.17** [+0.83, +1.58] | **+2.58** |

Ranked first (12 ratings): B 8, C 4, A 0. Ranked last: A 9, B 2, C 1. Process counts: last tutor turn recaps A 1/6, B 6/6, C 1/6; asked "rule in your own words" A 3/6, B 6/6, C 0/6; words per turn about 48 / 50 / 47.

## Reading
1. **B vs plain tutor: level on overall (+0.17, interval includes zero), but ahead on making students reason (+1.2), protecting answers (+0.8) and consolidation (+1.2).** Clarity is still slightly behind (−0.25, not clear). This is the first set-up where ENARA with the new switches is not behind the plain tutor on overall transcript quality, but with 6 triplets it is only a hint.
2. **B vs current ENARA is large (+1.25 overall)**, mostly recap and clarity. Caution: current ENARA scored much lower here (2.6) than in the Experiment 5b transcript rating (3.6), so this agent set-up probably penalises the old prompt more than the real route does (for example no production base prompt, constant agent obedience to instruction text). Do not read +1.25 as the true gain.
3. Rater agreement is moderate (top pick agrees 33%, pairwise 63%, score correlation 0.49); with 6 triplets, treat everything as a pilot.
4. The B tutor is recognisable (it asks for the rule "in your own words" every time), so the raters were not fully blind in practice.

## What this does and does not support
It supports going on with the new switches (they changed what raters see in the intended direction without a visible loss on answer protection or reasoning). It does **not** show that students learn more, and it does not meet the ship bar. Next step options: scale this up (24–36 triplets, matched, with a post-test the student agent answers from its own record), and run the paid pre-registered comparison once credit works.

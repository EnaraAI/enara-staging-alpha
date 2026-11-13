# Agent-run study, 18 matched triplets (no API): ENARA now (A) vs ENARA + new switches (B) vs plain tutor (C)

*13 Nov 2026. **AI agents play student and tutor; AI raters judge. Nothing here is evidence about real learners, and no learning outcome (post-test) was measured.** Pools the 6-triplet pilot (`AGENT_SIM_PILOT.md`) with 12 new triplets run the same way. Method, set-up limits and the rating rubric are unchanged from the pilot (`src/offline/agentSession.ts`, `reports/analysis/rating_analysis.py`). Sessions and ratings: `agent_sim_18/`.*

## Results (18 triplets, 2 blind raters each; mean 1–5; difference with bootstrap 95% CI over triplets; uncorrected)
| Criterion | A now | B new | C plain | B − C | B − A |
|---|---|---|---|---|---|
| **Overall** | 2.81 | 3.72 | 3.94 | −0.22 [−0.78, +0.36] | **+0.92** [+0.33, +1.42] |
| Explanation clarity | 2.94 | 3.83 | 4.31 | **−0.47** [−0.92, −0.03] | +0.89 [+0.44, +1.33] |
| Targets the misconception | 3.31 | 4.28 | 3.92 | +0.36 [−0.14, +0.83] | +0.97 |
| Makes the student reason | 4.11 | 4.11 | 3.28 | **+0.83** [+0.42, +1.22] | 0.00 |
| Hint progression | 2.78 | 3.33 | 3.58 | −0.25 [−0.56, +0.08] | +0.56 |
| Answer protection | 4.25 | 4.00 | 3.31 | **+0.69** [+0.33, +1.08] | −0.25 [−0.44, −0.06] |
| Consolidation | 1.36 | 3.47 | 3.61 | −0.14 [−0.89, +0.58] | **+2.11** [+1.69, +2.53] |

Ranked first (36 ratings): C 17, B 17, A 2. Ranked last: A 24, C 6, B 6. Best by mean overall per triplet: C 7, B 6, A 1, tied 4. Rater agreement: same top pick 61%, same pairwise order 80%, overall-score correlation 0.75 (better than the pilot).
Process counts over 18 sessions: last tutor turn recaps A 3, B 18, C 7; asked for the rule in own words A 13, B 18, C 0; words per turn 57 / 60 / 48.
The 12 new triplets alone: overall B − C −0.42 [−1.17, +0.42], B − A +0.75 [−0.04, +1.42].

## Reading
1. **The pilot's "level with the plain tutor" did not strengthen.** With 18 triplets B is slightly behind C overall (−0.22, interval spans zero) and clearly behind on clarity (−0.47). B beats C on making students reason (+0.8) and answer protection (+0.7). So the picture is the same as in the Experiment 5b transcript rating: ENARA's strengths are reasoning and answer protection; the plain tutor's are clearer explanations. The new switches closed the recap gap (consolidation B 3.5 vs C 3.6) but not the clarity gap.
2. **The new switches are a big improvement over current ENARA in this set-up** (+0.9 overall), mostly consolidation and clarity. Treat the size with caution: current ENARA scores lower here (2.8) than in the 5b rating (3.6), so this agent set-up probably penalises the old prompt harder than the real route does.
3. **No clear ENARA win over the plain tutor, so the ship bar is still not met.** If anything the plain tutor is slightly ahead on overall transcript quality.
4. **What to work on next:** explanation clarity and hint progression (B is behind C on both). Reasoning should be protected.

## Limits
Student and tutor roles are played by the same model inside one agent context (some leakage possible); tutors see only the language-engine instructions (not the production base prompt); engine history reconstructed from dialogue; 6 messages per session; AI raters of the same family; no post-test; 18 triplets, uncorrected intervals; B is recognisable by its "own words" ask, so raters were not fully blind.

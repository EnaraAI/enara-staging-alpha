# Blind transcript rating of Experiment 5b (AI raters)

*13 Nov 2026. **AI raters reading AI-simulated students. Not human teachers, not real learners.** Tutor names were hidden and letters scrambled; raters saw only the dialogue, lesson title/objective and the student's starting mistaken idea.*

## Design
- 48 complete matched triplets from `runs/exp5b-main` (8 per skill area, seed 20261114), each shown to **two different raters** (pass 1 and pass 2, different groupings and re-scrambled letters). 16 rater agents (Sonnet), 96 ratings of each tutor.
- Tutors: **A** current ENARA, **B** ENARA with engine v2 switches, **C** plain AI tutor. Key kept outside the raters' reach, applied only after all ratings were in.
- Scores 1–5 on eight criteria, plus a best-to-worst ranking. CIs are bootstrap over triplets (per-triplet mean of the two raters). Uncorrected; exploratory.
- Code: `reports/analysis/rating_analysis.py`; output `reports/exp4/rating5b/RATING_SUMMARY.json`.

## Results (mean score; differences with 95% CI)
| Criterion | A | B | C | A − C | B − C | B − A |
|---|---|---|---|---|---|---|
| Explanation clarity | 3.79 | 3.80 | 4.15 | **−0.35** [−0.62,−0.07] | −0.34 [−0.71,0.00] | +0.01 |
| Targets the misconception | 4.06 | 3.93 | 4.04 | +0.02 | −0.11 | −0.14 |
| Holds correct position (when pushed) | 4.43 | 4.51 | 4.39 | +0.03 | +0.14 | +0.04 |
| Elicits reasoning | 4.02 | 3.65 | 3.15 | **+0.88** [+0.54,+1.20] | **+0.50** [+0.15,+0.85] | **−0.38** [−0.64,−0.12] |
| Hint progression | 3.58 | 3.29 | 3.34 | +0.24 | −0.05 | **−0.29** [−0.51,−0.06] |
| Answer protection | 3.88 | 3.85 | 2.79 | **+1.08** [+0.88,+1.29] | **+1.06** [+0.82,+1.30] | −0.02 |
| Consolidation (recap) | 2.38 | 2.25 | 3.55 | **−1.18** [−1.50,−0.84] | **−1.30** [−1.60,−1.00] | −0.12 |
| **Overall teaching quality** | 3.59 | 3.46 | 3.60 | −0.01 [−0.38,+0.35] | −0.15 [−0.55,+0.27] | −0.14 [−0.40,+0.12] |

Rankings (96 per tutor): ranked first A 29, B 26, C 41; ranked last A 26, B 36, C 34. Best by mean overall per triplet: C 17, A 10, B 10, ties 11.

## Reading
1. **No overall winner.** Overall quality is level between ENARA (current) and the plain tutor (−0.01), and the v2 variant is slightly lower (−0.15, n.s.). This matches the learning-outcome results: no clear ENARA lead.
2. **Where ENARA is clearly better:** it makes the learner think (+0.9) and does not give the answer away (+1.1). The plain tutor often hands answers over (2.8/5).
3. **Where ENARA is clearly worse:** it rarely consolidates (recap/rule check, −1.2) and its explanations are rated less clear (−0.35). These are the same weaknesses seen in Experiments 2–4.
4. **v2 did not improve what raters see.** B is not better than A on any criterion, and is lower on reasoning and hint progression. The v2 switches were designed to fix belief-holding and hints; raters did not see that.
5. Rater reliability is moderate: same top pick in 69% of triplets, same pairwise order 76%, overall-score correlation 0.62. Differences below about 0.3 points should not be trusted.

## Limits
AI raters (same model family as the tutors, possible style bias); transcripts only, not outcomes; 48 triplets from 196; the plain tutor's longer replies may be favoured on clarity; no human check. This does not change the ship bar: ENARA has not clearly beaten the plain tutor.

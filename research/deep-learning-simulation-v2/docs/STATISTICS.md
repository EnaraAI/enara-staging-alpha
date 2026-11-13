# Statistics

Implemented in `src/stats/stats.ts` (no scipy/statsmodels available), each unit-tested against hand-computed values (`tests/core.test.ts`).

- **Gains:** raw gain (post−pre), Hake normalised gain, Hedges g (bias-corrected), paired d_z.
- **Uncertainty:** two-way (student × outcome) cluster bootstrap, 2000 resamples, percentile 95% CI; Wilson intervals for proportions.
- **Tests:** sign-flip permutation test on per-student paired differences (10 000 flips; unit = student).
- **Multiple comparisons:** Holm–Bonferroni over the pre-registered confirmatory family; Benjamini–Hochberg q-values over exploratory contrasts. Labels `confirmatory` / `exploratory` appear in every table.
- **Agreement:** Cohen's κ and raw agreement between the deterministic key and the blind judge.
- **Subgroups:** by overlapping behaviour tags (exploratory), by area, difficulty and outcome.
- **Missing data:** failed blocks are kept and counted; contrasts use students with both conditions present; unknown costs are reported as unknown.
- **Not done:** mixed-effects regression models (no library available); the cluster bootstrap and permutation tests are the inferential tools.

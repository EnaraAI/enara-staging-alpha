# Synthetic LAILA-shaped rubric fixture (tests only)

Same file layout and level structure as the official LAILA rubrics (7 traits; relevance 0-2, others 0-5; 8 prompts).
Level wording is synthetic test text, except two items already present in `src/services/candidateV2/lailaR1.ts`:
the official level-0 sentence of the non-relevance traits, and the dataset README rule quoted below.
Set LAILA_RUBRICS_DIR to run the same tests against the official files (git-ignored data).

If an essay receives a score of 0 in Relevance, all other traits are automatically assigned a score of 0.

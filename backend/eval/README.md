# Subject test set

Fake course passages and student questions (maths, science and Arabic) in `subjects/*.json`. `npm run eval:subjects` loads them into a throwaway local database as a fake school, runs the tutor's real retrieval on every question, and reports three things:
- hit@3 for questions in the material's language;
- hit@3 for questions in the other language (Arabic ↔ English);
- whether the off-material questions find nothing.

- **CI:** the workflow `tutor subject eval` runs it in a Mongo container on retrieval changes, or on demand. It has no key, so it measures the keyword baseline.
- **With the query rewrite** (`ragRewrite`), on a trusted computer: you need a local Mongo and an Anthropic key in your shell (never committed). Then run:

  ```bash
  MONGODB_URI=mongodb://localhost:27017/enara_subject_eval ENARA_ENGINE_V2=ragRewrite npm run eval:subjects
  ```
- **Refuses** any database that isn't `mongodb://localhost`.

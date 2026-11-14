# Preflight: remediation re-run r1 (informational, not a cap)

Written before the first paid call of this run.

- **Cases:** the frozen 120 cases and 219 learner turns. They are byte-identical copies of the baseline files (SHA-256 `725edb2b…56a2bb`), run in the same order.
- **Runner:** `backend/benchmarks/ltc-v1/run.ts`, unchanged (hash verified). Same in-process route `POST /api/me/tutor/sessions/:id/messages`, same throwaway in-memory database and same fixtures, including the T10 "General practice" artefact.
- **Tutor:** `claude-opus-5-5`, effort `low`, up to 4,000 output tokens. Gateway `maxAttempts: 2`, SDK retries 0, 25 s timeout, concurrency 1. **219 calls planned.**
- **Judge:** `judge.ts`, unchanged: `claude-sonnet-5-5`, effort `medium`, up to 6,000 output tokens, at most 1 retry and 1 re-ask, the same 12 repeat cases. **132 calls planned (+ ≤ 132 re-asks).**
- **Estimate (current catalogue: Opus 5.5 $4 / $20 per million input / output tokens, Sonnet 5.5 $2 / $10):**
  - tutor about $2.50–$4 (the prompt is about 15% longer, replies are expected to be shorter);
  - judge about $1.80–$2.50;
  - **total about $4.50–$6.50.**
- **Runaway guards (not budgets):** runner `--cap 100` and judge `--cap 50`. The runner also sets the app's local test-spend cap in the throwaway database only. Staging and production caps, `AI_TEST_SPEND_ID`, budgets and ledgers are untouched.
- **Key handling:** the key you pasted into this session is passed to the runner through an in-memory pipe (`/dev/fd`). No key file is written and the key is never printed.
- **Data:** synthetic only. The leak scan covers every provider request, as in the baseline.

# Execution guide

All commands run from `backend/` (it provides `tsx`/`vitest`). The key file is read via `ENARA_KEY_FILE` and never printed.

```bash
cd backend
# 1. Check the 48-outcome benchmark
npx tsx ../research/deep-learning-simulation-v2/src/cli.ts validate-benchmark
# 2. Run the research tests (offline, no provider calls)
npx vitest run --root .. research/deep-learning-simulation-v2/tests
# 3. Offline pipeline check (A and E are skipped, never faked)
npx tsx ../research/deep-learning-simulation-v2/src/cli.ts run ../research/deep-learning-simulation-v2/config/validation_campaign.json --dry
# 4. Controlled validation campaign (real provider calls, strict $40 cap)
ENARA_KEY_FILE=/path/to/key npx tsx ../research/deep-learning-simulation-v2/src/cli.ts run ../research/deep-learning-simulation-v2/config/validation_campaign.json
npx tsx ../research/deep-learning-simulation-v2/src/cli.ts analyze-extra ../research/deep-learning-simulation-v2/runs/validation-campaign-1
# 5. COMPLETE experiment (150 students × 6 conditions × 3 replications; needs explicit budget approval)
npx tsx ../research/deep-learning-simulation-v2/src/cli.ts lock-prereg      # commit the lock first
ENARA_KEY_FILE=/path/to/key npx tsx ../research/deep-learning-simulation-v2/src/cli.ts run ../research/deep-learning-simulation-v2/config/full_experiment.json
npx tsx ../research/deep-learning-simulation-v2/src/cli.ts analyze-extra ../research/deep-learning-simulation-v2/runs/full-experiment-1
# Regenerate reports from recorded raw results only
npx tsx ../research/deep-learning-simulation-v2/src/cli.ts report ../research/deep-learning-simulation-v2/runs/full-experiment-1
```

A run can be stopped and resumed (completed blocks are skipped). The budget cap (`budgetCapUsd`) stops the run safely before the next call and marks it incomplete.

// Operator-only: start a new environment-wide AI test-spend window (P22).
//
// The staging cap is enforced on one environment counter
// (test_spend:__environment__) that a new AI_TEST_SPEND_ID does NOT reset.
// Starting over needs the owner's recorded approval and reconciliation
// evidence (provider console/invoice compared with the usage ledger). This
// script archives the current counter under a dated id and writes an audit
// event; the next AI call creates a fresh counter, seeded only from per-ID
// counters created after the archive.
//
// Never run in this repository's tests or by an agent. Usage (operator):
//   npx tsx src/scripts/resetTestSpendWindow.ts --approved-by "<owner name>" \
//     --reconciliation "<ticket or document reference>" --execute
// Without --execute it only prints what it would do.
import mongoose from 'mongoose';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const approvedBy = arg('approved-by');
  const reconciliation = arg('reconciliation');
  const execute = process.argv.includes('--execute');
  if (!approvedBy || !reconciliation) {
    console.error('Refused: --approved-by and --reconciliation are required (owner approval and reconciliation evidence).');
    process.exit(2);
  }
  const { getConfig } = await import('../config/env');
  const { connectDB } = await import('../config/db');
  const { BudgetCounter } = await import('../models/OrgBudget');
  const { TEST_SPEND_ENVIRONMENT_COUNTER, TEST_SPEND_TENANT } = await import('../services/aiBudget');
  const { recordAudit } = await import('../services/auditTrail');
  getConfig();
  await connectDB();
  const current = await BudgetCounter.findById(TEST_SPEND_ENVIRONMENT_COUNTER).lean();
  const archiveId = `test_spend:__environment__:archived:${new Date().toISOString()}`;
  const earlier = await BudgetCounter.find({ _id: { $regex: '^test_spend:', $ne: TEST_SPEND_ENVIRONMENT_COUNTER }, institutionId: TEST_SPEND_TENANT }).select('_id').lean();
  console.log(JSON.stringify({ execute, environmentCommittedMicros: current?.committedMicros ?? 0, archiveId, perIdCountersToRetire: earlier.length }, null, 2));
  if (!execute) {
    await mongoose.disconnect();
    return;
  }
  if (current) {
    const { _id: _ignored, ...rest } = current as Record<string, unknown>;
    await BudgetCounter.create({ ...rest, _id: archiveId });
    await BudgetCounter.deleteOne({ _id: TEST_SPEND_ENVIRONMENT_COUNTER });
  }
  // Retire per-ID counters too, so the new environment counter is not seeded from them.
  for (const c of earlier) {
    const doc = await BudgetCounter.findById(c._id).lean();
    if (!doc) continue;
    const { _id: id, ...rest } = doc as Record<string, unknown>;
    await BudgetCounter.create({ ...rest, _id: `${String(id)}:archived:${new Date().toISOString()}`, institutionId: `${TEST_SPEND_TENANT}:archived` });
    await BudgetCounter.deleteOne({ _id: id });
  }
  await recordAudit('test_spend_window_reset', { id: `operator:${approvedBy}`, role: 'operator' }, { type: 'budget_counter', id: TEST_SPEND_ENVIRONMENT_COUNTER }, { approvedBy, reconciliation, archivedAs: archiveId, previousCommittedMicros: current?.committedMicros ?? 0 });
  await mongoose.disconnect();
}

void main().catch((error) => {
  console.error('reset failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

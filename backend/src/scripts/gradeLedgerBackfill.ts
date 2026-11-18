import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { backfillGradeLedger } from '../services/gradeLedgerBackfill';

// Grade ledger backfill (docs/lms/GRADE_LEDGER_NOTES.md, part g).
//   npm run ledger:backfill                                  DRY RUN (default): reads only, prints counts
//   npm run ledger:backfill -- --institution LT-SCHOOL-A     limit to one school
//   npm run ledger:backfill -- --apply --confirm             write (inserts only; idempotent)
// Owner: lms-test only for now. The output has counts only (no names).
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--confirm')) throw new Error('Writing needs --confirm. Run without --apply for a dry run.');
  const limit = arg('--limit') ? Number(arg('--limit')) : undefined;
  await openMongo();
  const out = await backfillGradeLedger({ apply, institutionId: arg('--institution'), limit });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', database: mongoose.connection.db!.databaseName, ...out }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

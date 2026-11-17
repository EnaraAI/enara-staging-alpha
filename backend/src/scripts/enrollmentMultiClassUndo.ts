import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { endExtraMemberships } from '../services/multiClass';

// Undo for multi-class step 6 (docs/multi-class/STEP_6_NOTES.md), after
// ENROLLMENT_MULTI_CLASS is turned off: every second membership (a group that
// is not the student's main group, or a class added outside the class's own
// list) goes inactive. Rows are kept as history. Counts only, no names.
//   npm run enrollment:multi-class-undo                          DRY RUN (default)
//   npm run enrollment:multi-class-undo -- --institution ID      one school
//   npm run enrollment:multi-class-undo -- --confirm             write
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--confirm');
  await openMongo();
  const out = await endExtraMemberships({ institutionId: arg('--institution'), apply, by: 'script:enrollment-multi-class-undo' });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', database: mongoose.connection.db!.databaseName, ...out }, null, 2));
  if (!apply) console.log('Nothing changed. Re-run with --confirm to end these memberships.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

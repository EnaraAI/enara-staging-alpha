import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { applyBackfill, planBackfill, undoBackfill } from '../services/enrollmentBackfill';

// Multi-class step 3 backfill (docs/multi-class/STEP_3_NOTES.md).
//   npm run enrollment:backfill                         DRY RUN (default): reads only, writes a report
//   npm run enrollment:backfill -- --institution ID     limit to one school
//   npm run enrollment:backfill -- --apply --confirm    write the plan
//   npm run enrollment:backfill -- --undo --confirm     delete exactly the backfilled rows
// On the real database: only with the owner's approval, after a full backup
// and a reviewed dry-run report. Reports contain IDs and counts only.
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const undo = process.argv.includes('--undo');
  const confirm = process.argv.includes('--confirm');
  const institutionId = arg('--institution');
  if ((apply || undo) && !confirm) throw new Error('Writing needs --confirm. Run without --apply/--undo for a dry run.');
  if (apply && undo) throw new Error('Choose --apply or --undo, not both.');
  await openMongo();
  const db = mongoose.connection.db!.databaseName;
  let out: unknown;
  if (undo) out = { mode: 'undo', database: db, ...(await undoBackfill({ institutionId })) };
  else if (apply) out = { mode: 'apply', database: db, ...(await applyBackfill({ institutionId })) };
  else out = { mode: 'dry-run', database: db, writes: 0, report: await planBackfill({ institutionId }) };
  const file = path.resolve(`enrollment-backfill-${apply ? 'apply' : undo ? 'undo' : 'dry-run'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), ...(out as object) }, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nReport saved: ${file}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

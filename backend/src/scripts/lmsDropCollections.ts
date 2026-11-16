import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { LMS_MODELS } from '../integrations/lms/models';

// Removes every LMS collection (the "down" for the Phase 0 migration; the
// migration runner only goes forward). DELETES ALL LMS DATA, including the
// signing keys every registered LMS trusts. Never run automatically.
//   npm run lms:drop -- --confirm
async function main() {
  if (!process.argv.includes('--confirm')) {
    console.log('Would drop:', LMS_MODELS.map((m) => m.collection.name).join(', '));
    console.log('Nothing changed. Re-run with --confirm to drop them.');
    return;
  }
  await openMongo();
  for (const model of LMS_MODELS) {
    const name = model.collection.name;
    const exists = (await mongoose.connection.db!.listCollections({ name }).toArray()).length > 0;
    if (exists) await mongoose.connection.db!.dropCollection(name);
    console.log(`${exists ? 'dropped' : 'absent '}  ${name}`);
  }
  await mongoose.connection.db!.collection('migrations').deleteOne({ _id: '2026-11-16-lms-phase0-indexes' as unknown as never });
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

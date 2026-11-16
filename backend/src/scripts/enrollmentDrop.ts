import mongoose from 'mongoose';
import { openMongo } from '../config/db';

// Undo for multi-class step 1: drops class_enrollments and forgets its
// migration. Safe only while nothing reads the collection (before step 5).
//   npm run enrollment:drop             shows what would happen
//   npm run enrollment:drop -- --confirm
const COLLECTION = 'class_enrollments';
const MIGRATION_ID = '2026-11-17-class-enrollments-step1';

async function main() {
  if (!process.argv.includes('--confirm')) {
    console.log(`Would drop ${COLLECTION} and forget migration ${MIGRATION_ID}. Nothing changed. Re-run with --confirm.`);
    return;
  }
  await openMongo();
  const db = mongoose.connection.db!;
  const exists = (await db.listCollections({ name: COLLECTION }).toArray()).length > 0;
  if (exists) await db.dropCollection(COLLECTION);
  await db.collection('migrations').deleteOne({ _id: MIGRATION_ID as unknown as never });
  console.log(`${exists ? 'dropped' : 'absent'} ${COLLECTION}; migration record cleared`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

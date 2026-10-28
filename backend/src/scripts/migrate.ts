import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { MIGRATIONS } from '../migrations';
import { pendingMigrations, runMigrations } from '../migrations/runner';

// npm run migrate            apply pending migrations
// npm run migrate -- --status list pending migrations only
async function main() {
  await connectDB();
  if (process.argv.includes('--status')) {
    const pending = await pendingMigrations(MIGRATIONS);
    console.log(pending.length ? pending.map((m) => `pending  ${m.id}  ${m.description}`).join('\n') : 'No pending migrations.');
  } else {
    const applied = await runMigrations(MIGRATIONS);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations.');
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

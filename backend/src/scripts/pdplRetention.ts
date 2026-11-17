import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { runPdplRetention } from '../services/pdplRetention';

// PDPL retention (docs/multi-class/ARCHIVE_NOTES.md). Dry run by default.
//   npm run pdpl:retention              report what would change
//   npm run pdpl:retention -- --apply   change it
// - P2: delete kept safety alerts of permanently deleted students older than
//   SAFETY_ALERT_RETENTION_DAYS (default 730).
// - P5: remove user/student/request IDs from AI call records older than
//   DATA_LOG_RETENTION_DAYS (default 30). Sign-in history and the sent-email
//   log expire by TTL index (migration 2026-11-17-pdpl-data-log-retention).
async function main() {
  await connectDB();
  const out = await runPdplRetention({ apply: process.argv.includes('--apply') });
  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

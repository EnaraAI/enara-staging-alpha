import mongoose from 'mongoose';
import { openMongo } from '../config/db';
import { shadowReport } from '../services/enrollmentShadowReport';

// Multi-class step 4: read-only report of the shadow checks (counts only).
//   npm run enrollment:shadow-report                          last 14 days, 7 clean days required
//   npm run enrollment:shadow-report -- --days 30 --required 3
function arg(name: string): number | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) || undefined : undefined;
}

async function main() {
  await openMongo();
  console.log(JSON.stringify(await shadowReport({ days: arg('--days'), requiredCleanDays: arg('--required') }), null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

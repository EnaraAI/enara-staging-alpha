// Vercel serverless entry: wraps the Express app and reuses one MongoDB
// connection per warm function instance. Local and Docker runs use src/index.ts.
import { createApp } from './app';
import { getConfig } from './config/env';
import { assertStagingEntry } from './config/stagingGuard';
import { connectDB } from './config/db';
import { connectPostgres } from './config/postgres';
import { serverlessHandler } from './serverlessHandler';

// This entry serves only the staging Vercel project. Refuse to load without
// staging identity, and run the full guard (getConfig) before any database
// connection or migration.
assertStagingEntry(process.env);
getConfig();
const app = createApp();
export default serverlessHandler(app as never, () => Promise.all([connectDB(), connectPostgres()]).then(() => undefined));

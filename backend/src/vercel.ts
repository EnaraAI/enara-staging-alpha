// Vercel serverless entry: wraps the Express app and reuses one MongoDB
// connection per warm function instance. Local and Docker runs use src/index.ts.
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './app';
import { getConfig } from './config/env';
import { assertStagingEntry } from './config/stagingGuard';
import { connectDB } from './config/db';
import { connectPostgres } from './config/postgres';

// This entry serves only the staging Vercel project. Refuse to load without
// staging identity, and run the full guard (getConfig) before any database
// connection or migration.
assertStagingEntry(process.env);
getConfig();
const app = createApp();
let ready: Promise<void> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!ready) {
    ready = Promise.all([connectDB(), connectPostgres()]).then(() => undefined);
    ready.catch(() => {
      ready = undefined;
    });
  }
  await ready;
  return app(req as never, res as never);
}

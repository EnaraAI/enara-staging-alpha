// Vercel serverless entry: wraps the Express app and reuses one MongoDB
// connection per warm function instance. Local and Docker runs use src/index.ts.
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './app';
import { connectDB } from './config/db';
import { connectPostgres } from './config/postgres';

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

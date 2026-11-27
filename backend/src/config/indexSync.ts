// lms-speed-4b: the indexes of every model, built once per deploy instead of by every new serverless instance.
//
// Mongoose autoIndex makes each fresh instance send createIndexes for every model it loads (about 140) while it
// serves its first requests. After a deploy several instances start at once, so the free Atlas tier gets hundreds of
// commands in a few seconds and the first page loads wait 15-30 s. The lms-test entry (vercel.ts) turns autoIndex off,
// and the deploy pipeline's migration step (POST /api/maintenance/migrate) calls ensureAllIndexes(): it loads every
// model file in this build, including models other code loads only on demand, and builds their indexes, as autoIndex
// would. Like autoIndex, a model whose index cannot be built is reported and logged, and the others go on.
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { logger, serializeError } from '../utils/logging';

const MODEL_DEFINITION = /\bmodel(<[^>]*>)?\(\s*['"`][A-Z]/;
const SKIP_DIR = new Set(['scripts', 'node_modules', 'test', 'tests', '__tests__']);

/** Files of this build that define a Mongoose model (scripts and tests excluded). */
export function modelFiles(root = path.resolve(__dirname, '..')): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p); continue; }
      if (!/\.(js|ts)$/.test(e.name) || /\.(d|test|spec)\.ts$|\.test\.js$/.test(e.name)) continue;
      if (MODEL_DEFINITION.test(fs.readFileSync(p, 'utf8'))) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

export interface IndexSyncResult { files: number; models: number; failed: { model: string; error: string }[]; ms: number }

export async function ensureAllIndexes(files = modelFiles()): Promise<IndexSyncResult> {
  const t0 = Date.now();
  for (const f of files) await import(f);
  const names = mongoose.modelNames();
  const failed: IndexSyncResult['failed'] = [];
  // A few at a time: gentle on the free tier, fast enough for the deploy step.
  const queue = [...names];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      try {
        await mongoose.model(name).createIndexes();
      } catch (error) {
        failed.push({ model: name, error: String((error as Error)?.message ?? error).slice(0, 200) });
        logger.error('index_sync_failed', { model: name, error: serializeError(error) });
      }
    }
  }));
  const result = { files: files.length, models: names.length, failed, ms: Date.now() - t0 };
  logger.info('index_sync', { files: result.files, models: result.models, failed: failed.length, ms: result.ms });
  return result;
}

import { timingSafeEqual } from 'crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { getConfig } from '../config/env';
import { MIGRATIONS } from '../migrations';
import { pendingMigrations, runMigrations } from '../migrations/runner';
import { logger } from '../utils/logging';
import { applyBackfill, planBackfill, undoBackfill } from '../services/enrollmentBackfill';
import { shadowReport } from '../services/enrollmentShadowReport';
import { seedLmsTest } from './lmsTestSeed';

// Maintenance for the LMS TEST deployment only (lms-test.enara.app). This
// sandbox and the operator's tools can't reach the test database directly, so
// migrations and the fake seed run inside the deployed app. Every request must
// pass ALL of these, or the route answers 404 as if it did not exist:
//   1. MAINTENANCE_ENDPOINTS_ENABLED=true (set only on the test project);
//   2. MONGODB_URI points at the test cluster (host starts "enara-lms-test.");
//   3. Authorization: Bearer <MAINTENANCE_TOKEN> (>= 32 chars), constant-time.
// test.enara.app never has the switch or the token, and its database is a
// different cluster, so these routes cannot run there.
export const TEST_CLUSTER_HOST_PREFIX = 'enara-lms-test.';

export function mongoHost(uri: string): string | null {
  const m = /^mongodb(?:\+srv)?:\/\/([^/?]*)/.exec(uri.trim());
  if (!m) return null;
  const hosts = m[1].slice(m[1].lastIndexOf('@') + 1); // after the credentials (last @)
  const first = hosts.split(',')[0].split(':')[0];
  return first ? first.toLowerCase() : null;
}

export function maintenanceAllowed(env: NodeJS.ProcessEnv, mongoUri: string): boolean {
  if (env.MAINTENANCE_ENDPOINTS_ENABLED !== 'true') return false;
  if ((env.MAINTENANCE_TOKEN ?? '').length < 32) return false;
  return (mongoHost(mongoUri) ?? '').startsWith(TEST_CLUSTER_HOST_PREFIX);
}

function authorised(header: unknown, token: string): boolean {
  const given = Buffer.from(typeof header === 'string' ? header : '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!maintenanceAllowed(process.env, getConfig().mongoUri)) return next('router');
  if (!authorised(req.headers.authorization, process.env.MAINTENANCE_TOKEN!)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

router.get('/status', async (_req, res, next) => {
  try {
    const pending = await pendingMigrations(MIGRATIONS);
    const collections = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name).sort();
    res.json({ database: mongoose.connection.db!.databaseName, pendingMigrations: pending.map((m) => m.id), collections: collections.length });
  } catch (e) {
    next(e);
  }
});

router.post('/migrate', async (_req, res, next) => {
  try {
    const applied = await runMigrations(MIGRATIONS);
    logger.info('maintenance_migrate', { applied: applied.length });
    res.json({ applied, pending: (await pendingMigrations(MIGRATIONS)).map((m) => m.id) });
  } catch (e) {
    next(e);
  }
});

router.post('/seed-lms-test', async (req, res, next) => {
  try {
    const password = (req.body as { password?: unknown })?.password;
    if (typeof password !== 'string' || password.length < 12) {
      res.status(400).json({ error: 'password (at least 12 characters) is required' });
      return;
    }
    const result = await seedLmsTest(password);
    logger.info('maintenance_seed', result as unknown as Record<string, unknown>);
    res.json({ seeded: result });
  } catch (e) {
    next(e);
  }
});

// Multi-class step 3 backfill on the test database (fake data only).
// mode: dry-run (default, writes nothing) | apply | undo. apply and undo need
// "confirm": true, like the npm script.
router.post('/enrollment-backfill', async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { mode?: unknown; confirm?: unknown; institutionId?: unknown };
    const mode = body.mode ?? 'dry-run';
    const opts = typeof body.institutionId === 'string' ? { institutionId: body.institutionId } : {};
    if (mode === 'dry-run') {
      res.json({ mode, report: await planBackfill(opts) });
      return;
    }
    if ((mode === 'apply' || mode === 'undo') && body.confirm !== true) {
      res.status(400).json({ error: `${mode} needs "confirm": true` });
      return;
    }
    if (mode === 'apply') {
      const r = await applyBackfill(opts);
      logger.info('maintenance_enrollment_backfill', { mode, created: r.created, reactivated: r.reactivated });
      res.json({ mode, created: r.created, reactivated: r.reactivated, report: r.report });
      return;
    }
    if (mode === 'undo') {
      const r = await undoBackfill(opts);
      logger.info('maintenance_enrollment_backfill', { mode, deleted: r.deleted });
      res.json({ mode, ...r });
      return;
    }
    res.status(400).json({ error: 'mode must be dry-run, apply or undo' });
  } catch (e) {
    next(e);
  }
});

// Multi-class step 4 shadow report (counts only).
router.get('/enrollment-shadow-report', async (req, res, next) => {
  try {
    const n = (v: unknown) => (typeof v === 'string' && Number(v) > 0 ? Number(v) : undefined);
    res.json(await shadowReport({ days: n(req.query.days), requiredCleanDays: n(req.query.required) }));
  } catch (e) {
    next(e);
  }
});

export default router;

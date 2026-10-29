import { timingSafeEqual } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { logger, serializeError } from '../utils/logging';

// TEMPORARY staging-only maintenance endpoint (owner request 2026-10-29): runs
// migrations and the synthetic-school seed from inside the deployment, because
// the operator has no trusted shell that can reach the database. Mounted only
// when ENARA_STAGING=true AND STAGING_MAINTENANCE_TOKEN (32+ chars) is set;
// deleting that variable disables it. Remove this file once staging is set up.

export const MIN_MAINTENANCE_TOKEN_LENGTH = 32;
const INSTITUTION_ID = /^[a-z0-9-]{3,60}$/;

export interface MaintenanceDeps {
  pending: () => Promise<{ id: string; description: string }[]>;
  migrate: () => Promise<string[]>;
  seed: (institution: string, opts: { emitSetupLinks: boolean }) => Promise<Record<string, unknown>>;
}

const sameToken = (given: unknown, expected: string) => {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function maintenanceToken(source: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = (source.STAGING_MAINTENANCE_TOKEN ?? '').trim();
  return token.length >= MIN_MAINTENANCE_TOKEN_LENGTH ? token : undefined;
}

export function stagingMaintenanceRouter(token: string, deps: MaintenanceDeps): Router {
  const router = Router();
  router.post('/', async (req: Request, res: Response) => {
    if (!sameToken(req.get('x-staging-maintenance-token'), token)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
    }
    const action = String(req.body?.action ?? '');
    try {
      if (action === 'status') {
        const pending = await deps.pending();
        return res.json({ action, pending: pending.map((m) => m.id) });
      }
      if (action === 'migrate') {
        const applied = await deps.migrate();
        logger.info('staging_maintenance_migrate', { applied: applied.length });
        return res.json({ action, applied });
      }
      if (action === 'seed') {
        const institution = String(req.body?.institution ?? '');
        if (!INSTITUTION_ID.test(institution)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'institution must be 3-60 lowercase letters, digits or dashes' } });
        const out = await deps.seed(institution, { emitSetupLinks: req.body?.emitSetupLinks === true });
        logger.info('staging_maintenance_seed', { institution, setupLinks: Boolean(req.body?.emitSetupLinks) });
        return res.json({ action, ...out });
      }
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'action must be status, migrate or seed' } });
    } catch (error) {
      logger.error('staging_maintenance_failed', { action, error: serializeError(error) });
      return res.status(500).json({ error: { code: 'MAINTENANCE_FAILED', message: error instanceof Error ? error.message : 'failed' } });
    }
  });
  return router;
}

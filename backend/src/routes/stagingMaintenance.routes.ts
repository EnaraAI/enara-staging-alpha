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
  // One global ENARA admin for staging set-up. Returns an access token and/or
  // a single-use setup link only when asked.
  createEnaraAdmin: (opts: { accessToken: boolean; setupLink: boolean }) => Promise<Record<string, unknown>>;
  // Shape of the R2 settings and one HeadBucket result; never any value.
  r2Diagnose: () => Promise<Record<string, unknown>>;
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
      if (action === 'create-enara-admin') {
        const out = await deps.createEnaraAdmin({ accessToken: req.body?.accessToken === true, setupLink: req.body?.setupLink === true });
        logger.info('staging_maintenance_enara_admin', { accessToken: req.body?.accessToken === true, setupLink: req.body?.setupLink === true });
        return res.json({ action, ...out });
      }
      if (action === 'r2-diagnose') return res.json({ action, ...(await deps.r2Diagnose()) });
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'action must be status, migrate, seed, create-enara-admin or r2-diagnose' } });
    } catch (error) {
      logger.error('staging_maintenance_failed', { action, error: serializeError(error) });
      return res.status(500).json({ error: { code: 'MAINTENANCE_FAILED', message: error instanceof Error ? error.message : 'failed' } });
    }
  });
  return router;
}

export const STAGING_ENARA_ADMIN_EMAIL = 'enara.admin@enara-staging-school.demo.enara.test';

// Creates (or reuses) the staging ENARA admin. Refuses to touch an existing
// account with that address unless it already is that ENARA admin.
export async function createStagingEnaraAdmin(opts: { accessToken: boolean; setupLink: boolean }) {
  const { randomBytes } = await import('crypto');
  const bcrypt = (await import('bcryptjs')).default;
  const { User } = await import('../models/User');
  const { signAccessToken } = await import('../auth/jwt');
  const { requestPasswordReset } = await import('../services/accountTokens');
  const { getConfig } = await import('../config/env');
  const email = STAGING_ENARA_ADMIN_EMAIL;
  const existing = await User.findOne({ email }).select('role institutionId').lean();
  if (existing && (existing.role !== 'enara-admin' || existing.institutionId)) throw new Error(`refusing to change existing account ${email}`);
  const user = await User.findOneAndUpdate(
    { email },
    {
      $set: { role: 'enara-admin', name: 'ENARA Staging Admin', status: 'active' },
      $setOnInsert: { email, password: await bcrypt.hash(randomBytes(32).toString('hex'), 10) },
    },
    { upsert: true, new: true },
  );
  const out: Record<string, unknown> = { email, created: !existing };
  if (opts.accessToken) out.accessToken = signAccessToken({ id: user!._id.toString(), email, role: 'enara-admin' } as never);
  if (opts.setupLink) {
    const token = await requestPasswordReset(email, { sendMail: false });
    if (token) out.setupLink = `${getConfig().appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  }
  return out;
}

// Describes the R2 settings without revealing them: lengths and formats only,
// plus the outcome of one HeadBucket call against the configured bucket.
export function r2Shape(source: NodeJS.ProcessEnv = process.env) {
  const shape = (raw: string | undefined) => {
    const v = raw ?? '';
    return {
      set: v.length > 0,
      length: v.length,
      trimmedLength: v.trim().length,
      hasWhitespace: /\s/.test(v),
      hasQuotes: /["']/.test(v),
      looksLikeUrl: /^https?:|\.r2\.cloudflarestorage\.com|\//i.test(v),
      hex32: /^[0-9a-f]{32}$/.test(v.trim()),
      hexOnlyLowercase: /^[0-9a-f]+$/.test(v.trim()),
    };
  };
  return {
    R2_ACCOUNT_ID: shape(source.R2_ACCOUNT_ID),
    R2_ACCESS_KEY_ID: shape(source.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: { set: Boolean(source.R2_SECRET_ACCESS_KEY), length: (source.R2_SECRET_ACCESS_KEY ?? '').length, hasWhitespace: /\s/.test(source.R2_SECRET_ACCESS_KEY ?? '') },
    R2_BUCKET: source.R2_BUCKET ?? null,
  };
}

export async function diagnoseR2() {
  const out: Record<string, unknown> = { shape: r2Shape() };
  try {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const { getConfig } = await import('../config/env');
    const r2 = getConfig().r2;
    if (!r2) return { ...out, headBucket: 'R2 not configured' };
    const client = new S3Client({ region: 'auto', endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey } });
    await client.send(new HeadBucketCommand({ Bucket: r2.bucket }));
    out.headBucket = 'ok';
  } catch (error) {
    const e = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
    out.headBucket = { name: e.name ?? null, code: e.code ?? null, httpStatus: e.$metadata?.httpStatusCode ?? null };
  }
  return out;
}

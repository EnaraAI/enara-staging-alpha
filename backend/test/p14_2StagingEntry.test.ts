import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGING_DB_NAME, assertStagingEntry, stagingFlagProblem, stagingProblems } from '../src/config/stagingGuard';

// P14.2: the Vercel staging entry fails closed without staging identity, and
// validates before any database connection or migration. Mocked
// configuration only; the database layer is mocked, nothing is contacted.

const db = vi.hoisted(() => ({ connectDB: vi.fn(async () => undefined), connectPostgres: vi.fn(async () => undefined) }));
vi.mock('../src/config/db', () => ({ connectDB: db.connectDB }));
vi.mock('../src/config/postgres', () => ({ connectPostgres: db.connectPostgres }));

const SECRET_JWT = 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PASSWORD = 'p4ssw0rd-never-printed';
const base = (over: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  NODE_ENV: 'development',
  ENARA_STAGING: 'true',
  VERCEL: '1',
  MONGODB_URI: `mongodb+srv://stage_user:${PASSWORD}@cluster.example.mongodb.net/${STAGING_DB_NAME}`,
  JWT_SECRET: SECRET_JWT,
  INGEST_HMAC_SECRET: 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
  CRON_SECRET: 'cron-staging-secret-ccccccccccccccccccccccccccc',
  RUN_MIGRATIONS_ON_START: 'false',
  R2_ACCOUNT_ID: 'acct', R2_BUCKET: 'enara-staging-alpha-uploads', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
  SERVE_LOCAL_UPLOADS: 'false',
  TRUST_PROXY: '1',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
  FRONTEND_URL: 'https://staging.example.test',
  ...over,
});

describe('staging identity flag', () => {
  it('unset, empty and boolean values are accepted unchanged; anything else is refused', () => {
    for (const v of [undefined, '', 'true', 'TRUE', '1', 'yes', 'false', '0', 'no']) expect(stagingFlagProblem({ ENARA_STAGING: v }), String(v)).toBeNull();
    for (const v of ['ture', 'on', 'staging', 'enabled', 'y']) expect(stagingFlagProblem({ ENARA_STAGING: v }), v).toMatch(/ENARA_STAGING must be true or false/);
  });

  it('the staging entry needs ENARA_STAGING=true: missing, false or invalid identity is refused', () => {
    expect(() => assertStagingEntry({ ENARA_STAGING: 'true' })).not.toThrow();
    for (const v of [undefined, '', 'false', '0']) expect(() => assertStagingEntry({ ENARA_STAGING: v }), String(v)).toThrow(/needs ENARA_STAGING=true/);
    expect(() => assertStagingEntry({ ENARA_STAGING: 'ture' })).toThrow(/ENARA_STAGING must be true or false/);
  });

  it('config loading refuses an invalid flag, and non-staging loading is unchanged', async () => {
    const { loadConfig } = await import('../src/config/env');
    expect(() => loadConfig(base({ ENARA_STAGING: 'ture' }) as NodeJS.ProcessEnv)).toThrow(/ENARA_STAGING must be true or false/);
    const normal = loadConfig({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://h:27017/enara', JWT_SECRET: SECRET_JWT, INGEST_HMAC_SECRET: SECRET_JWT, CORS_ALLOWED_ORIGINS: 'https://enara.app' });
    expect(normal).toMatchObject({ stagingMode: false, aiPaused: false });
    expect(normal.aiTestSpend).toBeUndefined();
  });

  it('a provider key in staging needs the test-spend cap; the cap must be valid', async () => {
    expect(stagingProblems(base({ ANTHROPIC_API_KEY: 'sk-test' }) as NodeJS.ProcessEnv).join(' ')).toMatch(/AI_TEST_SPEND_CAP_USD and AI_TEST_SPEND_ID must be set/);
    expect(stagingProblems(base({ ANTHROPIC_API_KEY: 'sk-test', AI_TEST_SPEND_CAP_USD: '5', AI_TEST_SPEND_ID: 'p14' }) as NodeJS.ProcessEnv)).toEqual([]);
    const { loadConfig } = await import('../src/config/env');
    const ok = loadConfig(base({ AI_TEST_SPEND_CAP_USD: '5', AI_TEST_SPEND_ID: 'p14' }) as NodeJS.ProcessEnv);
    expect(ok.aiTestSpend).toEqual({ id: 'p14', capUsd: 5 });
    for (const cap of ['0', '-1', 'five', 'NaN']) expect(() => loadConfig(base({ AI_TEST_SPEND_CAP_USD: cap, AI_TEST_SPEND_ID: 'p14' }) as NodeJS.ProcessEnv), cap).toThrow(/AI_TEST_SPEND_CAP_USD/);
    expect(() => loadConfig(base({ AI_TEST_SPEND_CAP_USD: '5' }) as NodeJS.ProcessEnv)).toThrow(/AI_TEST_SPEND_ID/);
    expect(() => loadConfig(base({ AI_TEST_SPEND_ID: 'p14' }) as NodeJS.ProcessEnv)).toThrow(/needs AI_TEST_SPEND_CAP_USD/);
  });
});

describe('Vercel staging entry (backend/src/vercel.ts)', () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = { ...process.env };
    db.connectDB.mockClear();
    db.connectPostgres.mockClear();
    vi.resetModules();
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
  const setEnv = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    for (const k of ['AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID']) {
      if (!(k in env)) delete process.env[k];
    }
  };
  const loadEntry = async () => {
    // Each import is a fresh cold start; models from the last one are dropped.
    mongoose.deleteModel(/.+/);
    try {
      await import('../src/vercel');
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };

  it('missing staging identity: refuses to load, no database connection', async () => {
    setEnv(base({ ENARA_STAGING: undefined }));
    expect(await loadEntry()).toMatch(/Staging entry refused: .*needs ENARA_STAGING=true/);
    expect(db.connectDB).not.toHaveBeenCalled();
  }, 30_000); // first cold import of the whole app

  it('false or invalid staging identity: refuses to load, no database connection', async () => {
    for (const v of ['false', 'ture']) {
      vi.resetModules();
      setEnv(base({ ENARA_STAGING: v }));
      expect(await loadEntry(), v).toMatch(/Staging entry refused/);
    }
    expect(db.connectDB).not.toHaveBeenCalled();
  });

  it('staging identity with a failing isolation check: refuses before connecting or migrating, values never printed', async () => {
    setEnv(base({ MONGODB_URI: `mongodb+srv://stage_user:${PASSWORD}@cluster.example.mongodb.net/enara`, RUN_MIGRATIONS_ON_START: undefined }));
    const message = await loadEntry();
    expect(message).toMatch(/Staging isolation check failed/);
    expect(message).toMatch(/RUN_MIGRATIONS_ON_START/);
    for (const secret of [PASSWORD, 'stage_user', 'cluster.example', SECRET_JWT]) expect(message).not.toContain(secret);
    expect(db.connectDB).not.toHaveBeenCalled();
  });

  it('a provider key without the test-spend cap is refused at load', async () => {
    setEnv(base({ ANTHROPIC_API_KEY: 'sk-test-not-real' }));
    const message = await loadEntry();
    expect(message).toMatch(/AI_TEST_SPEND_CAP_USD/);
    expect(message).not.toContain('sk-test-not-real');
    expect(db.connectDB).not.toHaveBeenCalled();
  });

  it('a valid staging configuration loads, and connects only on the first request', async () => {
    setEnv(base());
    expect(await loadEntry()).toBe('');
    const mod = await import('../src/vercel');
    expect(typeof mod.default).toBe('function');
    expect(db.connectDB).not.toHaveBeenCalled();
  });
});

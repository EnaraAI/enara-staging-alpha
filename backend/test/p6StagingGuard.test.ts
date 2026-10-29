import path from 'path';
import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { STAGING_DB_NAME, mongoDbName, stagingProblems } from '../src/config/stagingGuard';

// P6 staging isolation guard. Mocked configuration only; the one database is
// a local in-memory server. No remote service is contacted.

const SECRET_JWT = 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SECRET_HMAC = 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SECRET_CRON = 'cron-staging-secret-ccccccccccccccccccccccccccc';
const PASSWORD = 'p4ssw0rd-never-printed';
const base = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  ENARA_STAGING: 'true',
  MONGODB_URI: `mongodb://stage_user:${PASSWORD}@db.internal.example:27017/${STAGING_DB_NAME}?authSource=${STAGING_DB_NAME}`,
  JWT_SECRET: SECRET_JWT,
  INGEST_HMAC_SECRET: SECRET_HMAC,
  CRON_SECRET: SECRET_CRON,
  RUN_MIGRATIONS_ON_START: 'false',
  R2_ACCOUNT_ID: 'a', R2_BUCKET: 'enara-staging-alpha-uploads', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
  FRONTEND_URL: 'https://staging.example.test',
  ...over,
});
const load = async (env: NodeJS.ProcessEnv) => (await import('../src/config/env')).loadConfig(env);

describe('staging guard rules', () => {
  it('accepts an isolated staging configuration', () => {
    expect(stagingProblems(base())).toEqual([]);
    expect(stagingProblems(base({ SERVE_LOCAL_UPLOADS: 'false' }))).toEqual([]);
    expect(mongoDbName(base().MONGODB_URI!)).toBe(STAGING_DB_NAME);
    expect(mongoDbName(`mongodb+srv://u:p@c.example/${STAGING_DB_NAME}`)).toBe(STAGING_DB_NAME);
  });

  it('rejects the wrong or a missing database name', () => {
    for (const uri of ['mongodb://u:p@h:27017/enara', 'mongodb://u:p@h:27017/', 'mongodb://u:p@h:27017', 'mongodb://u:p@h/enara_staging_alpha_x', 'not-a-uri']) {
      expect(stagingProblems(base({ MONGODB_URI: uri })).join(' ')).toMatch(/MONGODB_URI must name the database/);
    }
  });

  it('requires R2 for every staging file: missing, partial, local-directory or non-staging storage is refused', () => {
    const noR2 = { R2_ACCOUNT_ID: undefined, R2_BUCKET: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined };
    expect(stagingProblems(base(noR2)).join(' ')).toMatch(/must all be set \(staging stores files only in R2\)/);
    expect(stagingProblems(base({ ...noR2, UPLOAD_DIR: '/srv/enara-staging/uploads' })).join(' ')).toMatch(/must all be set/);
    expect(stagingProblems(base({ R2_SECRET_ACCESS_KEY: undefined })).join(' ')).toMatch(/must all be set/);
    expect(stagingProblems(base({ R2_BUCKET: 'enara-uploads' })).join(' ')).toMatch(/R2_BUCKET must be a staging bucket/);
    expect(stagingProblems(base({ R2_BUCKET: 'enara-sandbox-uploads' })).join(' ')).toMatch(/R2_BUCKET must be a staging bucket/);
    expect(stagingProblems(base({ SERVE_LOCAL_UPLOADS: 'true' })).join(' ')).toMatch(/SERVE_LOCAL_UPLOADS must be false in staging/);
  });

  it('requires distinct staging secrets, deliberate migrations, invite-only, and a test email inbox', () => {
    expect(stagingProblems(base({ CRON_SECRET: undefined })).join(' ')).toMatch(/CRON_SECRET must be set/);
    expect(stagingProblems(base({ JWT_SECRET: 'short' })).join(' ')).toMatch(/JWT_SECRET must be set/);
    expect(stagingProblems(base({ CRON_SECRET: SECRET_JWT })).join(' ')).toMatch(/must all be different/);
    expect(stagingProblems(base({ RUN_MIGRATIONS_ON_START: undefined })).join(' ')).toMatch(/RUN_MIGRATIONS_ON_START must be "false"/);
    expect(stagingProblems(base({ RUN_MIGRATIONS_ON_START: 'true' })).join(' ')).toMatch(/RUN_MIGRATIONS_ON_START/);
    expect(stagingProblems(base({ REGISTRATION_INVITE_ONLY: 'false' })).join(' ')).toMatch(/REGISTRATION_INVITE_ONLY/);
    expect(stagingProblems(base({ REMINDERS_ENABLED: 'true' })).join(' ')).toMatch(/REMINDER_TEST_RECIPIENT/);
    expect(stagingProblems(base({ REMINDERS_ENABLED: 'true', REMINDER_TEST_RECIPIENT: 'qa@example.test' }))).toEqual([]);
    expect(stagingProblems(base({ DEMO_MODE_ENABLED: 'true' })).join(' ')).toMatch(/DEMO_MODE_ENABLED/);
  });
});

describe('staging CORS origins', () => {
  const problems = (over: Record<string, string | undefined>) => stagingProblems(base(over)).join(' ');
  it('must be set explicitly', () => {
    expect(problems({ CORS_ALLOWED_ORIGINS: undefined })).toMatch(/CORS_ALLOWED_ORIGINS must be set explicitly/);
    expect(problems({ CORS_ALLOWED_ORIGINS: '   ' })).toMatch(/CORS_ALLOWED_ORIGINS must be set explicitly/);
  });
  it('rejects empty entries, wildcards and non-origins', () => {
    expect(problems({ CORS_ALLOWED_ORIGINS: 'https://staging.example.test,,' })).toMatch(/empty entries/);
    expect(problems({ CORS_ALLOWED_ORIGINS: '*' })).toMatch(/wildcard/);
    expect(problems({ CORS_ALLOWED_ORIGINS: 'https://staging.example.test,https://*.example.test' })).toMatch(/wildcard/);
    expect(problems({ CORS_ALLOWED_ORIGINS: 'https://staging.example.test,staging.example.test' })).toMatch(/full origins/);
  });
  it('rejects known production and shared ENARA domains', () => {
    for (const d of ['https://enara.app', 'https://www.enara.app', 'https://ENARA.app', 'https://enara-sandbox-frontend.vercel.app', 'https://backend-engine-copy-production.up.railway.app', 'https://backend-engine-vhcz.onrender.com']) {
      expect(problems({ CORS_ALLOWED_ORIGINS: `https://staging.example.test,${d}` }), d).toMatch(/production or shared ENARA domain/);
    }
    expect(problems({ FRONTEND_URL: 'https://enara.app', CORS_ALLOWED_ORIGINS: 'https://enara.app' })).toMatch(/FRONTEND_URL must not be a production/);
  });
  it('requires the staging frontend origin to be allowlisted', () => {
    expect(problems({ FRONTEND_URL: undefined })).toMatch(/FRONTEND_URL must be set/);
    expect(problems({ FRONTEND_URL: 'https://other-staging.example.test' })).toMatch(/must include the staging frontend origin/);
    // Path or trailing slash on FRONTEND_URL compares by origin.
    expect(stagingProblems(base({ FRONTEND_URL: 'https://staging.example.test/app/' }))).toEqual([]);
    expect(stagingProblems(base({ CORS_ALLOWED_ORIGINS: 'https://staging.example.test, https://staging-admin.example.test' }))).toEqual([]);
  });
  it('without ENARA_STAGING the normal CORS behaviour is unchanged', async () => {
    const { loadConfig } = await import('../src/config/env');
    const cfg = loadConfig({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://h:27017/enara', JWT_SECRET: SECRET_JWT, INGEST_HMAC_SECRET: SECRET_HMAC });
    expect(cfg.corsAllowedOrigins).toEqual(expect.arrayContaining(['https://enara.app', 'http://localhost:5173']));
    expect(loadConfig({ NODE_ENV: 'development', MONGODB_URI: 'mongodb://h:27017/enara', JWT_SECRET: SECRET_JWT, INGEST_HMAC_SECRET: SECRET_HMAC, CORS_ALLOWED_ORIGINS: 'https://enara.app' }).corsAllowedOrigins).toEqual(['https://enara.app']);
  });
});

describe('config loading', () => {
  it('fails before anything starts, naming variables but never values', async () => {
    const env = base({ MONGODB_URI: `mongodb://stage_user:${PASSWORD}@db.internal.example:27017/enara`, CRON_SECRET: SECRET_JWT, R2_BUCKET: 'secret-bucket-name' });
    let message = '';
    try {
      await load(env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Staging isolation check failed/);
    for (const secret of [PASSWORD, SECRET_JWT, SECRET_HMAC, SECRET_CRON, 'db.internal.example', 'secret-bucket-name', 'stage_user']) expect(message).not.toContain(secret);
  });

  it('staging defaults: AI paused and invite-only unless set explicitly; NODE_ENV alone means nothing', async () => {
    const cfg = await load(base());
    expect(cfg).toMatchObject({ stagingMode: true, aiPaused: true, registrationInviteOnly: true });
    expect(cfg.email.enabled).toBe(false);
    expect((await load(base({ AI_PAUSED: 'false' }))).aiPaused).toBe(false);
    // Without ENARA_STAGING nothing changes (legacy defaults), whatever NODE_ENV is.
    const normal = await load({ ...base({ ENARA_STAGING: undefined, MONGODB_URI: 'mongodb://h:27017/enara' }) });
    expect(normal).toMatchObject({ stagingMode: false, aiPaused: false, registrationInviteOnly: false });
  });

  it('a .env file is refused in staging (no inherited values)', async () => {
    expect(stagingProblems(base(), ['MONGODB_URI', 'ANTHROPIC_API_KEY']).join(' ')).toMatch(/a \.env file supplied 2 variable/);
  });

  it('a misconfigured staging start exits before listening', () => {
    const root = path.join(__dirname, '..');
    const r = spawnSync('npx', ['tsx', 'src/index.ts'], {
      cwd: root,
      timeout: 60_000,
      encoding: 'utf8',
      // Only these variables (no .env values reach the guard check first).
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...base({ MONGODB_URI: `mongodb://u:${PASSWORD}@127.0.0.1:1/enara` }), PORT: '0', DOTENV_CONFIG_PATH: '/nonexistent' },
    });
    const out = `${r.stdout}${r.stderr}`;
    expect(r.status).not.toBe(0);
    expect(out).toMatch(/Staging isolation check failed/);
    expect(out).not.toMatch(/server_started/);
    expect(out).not.toContain(PASSWORD);
  }, 90_000);
});

describe('runtime database check and grading', () => {
  let mongo: MongoMemoryServer | undefined;
  afterEach(async () => {
    await mongoose.disconnect();
  });
  afterAll(async () => {
    await mongo?.stop();
    (await import('../src/config/env')).resetConfigForTests();
  });

  it('connects to the staging database, and grading still runs while AI is paused', async () => {
    mongo = await MongoMemoryServer.create();
    const env = base({ MONGODB_URI: `${mongo.getUri()}${STAGING_DB_NAME}`, NODE_ENV: 'test' });
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const { resetConfigForTests, getConfig, setDotenvKeysForTests } = await import('../src/config/env');
      // This checkout has a local backend/.env; the guard would rightly refuse it.
      for (const k of ['AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) delete process.env[k];
      setDotenvKeysForTests([]);
      resetConfigForTests();
      expect(getConfig().aiPaused).toBe(true);
      const { connectDB } = await import('../src/config/db');
      await connectDB();
      expect(mongoose.connection.db?.databaseName).toBe(STAGING_DB_NAME);
      const { forgetAiBudgetCache, reserveAiBudget } = await import('../src/services/aiBudget');
      forgetAiBudgetCache();
      // Ordinary AI is refused while paused ...
      await expect(reserveAiBudget({ key: 'k1', feature: 'educator_chat', provider: 'anthropic', institutionId: 'synthetic', userId: 'u', upperBoundUsd: 0.01 })).rejects.toMatchObject({ code: 'AI_PAUSED' });
      // ... autonomous grading is not held.
      await expect(reserveAiBudget({ key: 'k2', feature: 'ai_grading', provider: 'anthropic', institutionId: 'synthetic', userId: 'u', upperBoundUsd: 0.01 })).resolves.toBeTruthy();
    } finally {
      for (const k of Object.keys(env)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  }, 60_000);
});

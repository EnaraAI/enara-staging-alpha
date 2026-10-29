import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { STAGING_DB_NAME, stagingProblems } from '../src/config/stagingGuard';

// P14.3: staging never migrates on start, every paid provider path needs the
// test-spend cap, and Vercel has no entry point around the staging guard.
// In-memory MongoDB; migrations are mocked; nothing remote is contacted.

const migrations = vi.hoisted(() => ({ run: vi.fn(async () => [] as string[]) }));
vi.mock('../src/migrations/runner', () => ({ runMigrations: migrations.run }));

const ROOT = path.join(__dirname, '../..');
const base = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  ENARA_STAGING: 'true',
  MONGODB_URI: `mongodb://h:27017/${STAGING_DB_NAME}`,
  JWT_SECRET: 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  INGEST_HMAC_SECRET: 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
  CRON_SECRET: 'cron-staging-secret-ccccccccccccccccccccccccccc',
  RUN_MIGRATIONS_ON_START: 'false',
  R2_ACCOUNT_ID: 'a', R2_BUCKET: 'enara-staging-alpha-uploads', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
  SERVE_LOCAL_UPLOADS: 'false',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
  FRONTEND_URL: 'https://staging.example.test',
  ...over,
});

describe('migrations on start', () => {
  it('staging never migrates on start, whatever the switch spelling; other modes are unchanged', async () => {
    const { migrateOnStart } = await import('../src/config/db');
    for (const v of ['false', 'FALSE', ' false', 'False', undefined, 'true']) {
      expect(migrateOnStart({ NODE_ENV: 'development', RUN_MIGRATIONS_ON_START: v }, true), String(v)).toBe(false);
    }
    expect(migrateOnStart({ NODE_ENV: 'development', RUN_MIGRATIONS_ON_START: 'false' }, false)).toBe(false);
    expect(migrateOnStart({ NODE_ENV: 'development' }, false)).toBe(true);
    expect(migrateOnStart({ NODE_ENV: 'development', RUN_MIGRATIONS_ON_START: 'FALSE' }, false)).toBe(true); // legacy exact match kept
    expect(migrateOnStart({ NODE_ENV: 'test' }, false)).toBe(false);
  });

  it('the guard accepts "FALSE", which the old start-up check would have migrated on', () => {
    expect(stagingProblems(base({ RUN_MIGRATIONS_ON_START: 'FALSE' }))).toEqual([]);
  });

  describe('connectDB against a database', () => {
    let mongo: MongoMemoryServer;
    let saved: NodeJS.ProcessEnv;
    beforeAll(async () => {
      mongo = await MongoMemoryServer.create();
      saved = { ...process.env };
    });
    afterEach(async () => {
      await mongoose.disconnect();
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      (await import('../src/config/env')).resetConfigForTests();
      migrations.run.mockClear();
    });
    afterAll(async () => {
      await mongo.stop();
    });
    const start = async (env: NodeJS.ProcessEnv) => {
      for (const k of ['AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'ENARA_API_KEY', 'ENARA_ORCHESTRATOR_URL', 'AI_ENGINE_URL']) delete process.env[k];
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      (await import('../src/config/env')).resetConfigForTests();
      await (await import('../src/config/db')).connectDB();
    };

    it('staging with RUN_MIGRATIONS_ON_START=FALSE connects to the staging database and runs no migration', async () => {
      await start(base({ MONGODB_URI: `${mongo.getUri()}${STAGING_DB_NAME}`, RUN_MIGRATIONS_ON_START: 'FALSE' }));
      expect(mongoose.connection.db?.databaseName).toBe(STAGING_DB_NAME);
      expect(migrations.run).not.toHaveBeenCalled();
    });

    it('control: outside staging, an unset switch still migrates on start (the mock is live)', async () => {
      await start({ ...base({ ENARA_STAGING: undefined, MONGODB_URI: `${mongo.getUri()}enara_local`, RUN_MIGRATIONS_ON_START: undefined }) });
      expect(migrations.run).toHaveBeenCalledTimes(1);
    });
  });
});

describe('paid provider paths need the test-spend cap in staging', () => {
  const paths = { ANTHROPIC_API_KEY: 'x', ELEVENLABS_API_KEY: 'x', ANAM_API_KEY: 'x', ENARA_API_KEY: 'x', ENARA_ORCHESTRATOR_URL: 'https://orchestrator.example.test', AI_ENGINE_URL: 'https://engine.example.test' };
  it.each(Object.entries(paths))('%s without the cap and id is refused; with both it is accepted', (name, value) => {
    expect(stagingProblems(base({ [name]: value })).join(' ')).toMatch(/AI_TEST_SPEND_CAP_USD and AI_TEST_SPEND_ID must be set/);
    expect(stagingProblems(base({ [name]: value, AI_TEST_SPEND_CAP_USD: '5' })).join(' ')).toMatch(/AI_TEST_SPEND_ID/);
    expect(stagingProblems(base({ [name]: value, AI_TEST_SPEND_CAP_USD: '5', AI_TEST_SPEND_ID: 'p14' }))).toEqual([]);
  });

  it('no paid path: no cap needed (public and non-AI testing unchanged)', () => {
    expect(stagingProblems(base())).toEqual([]);
  });
});

describe('no entry point around the guard on Vercel', () => {
  it('the deployment has exactly one function, and it loads only the staging entry', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    expect(Object.keys(cfg.functions)).toEqual(['api/index.js']);
    // Vercel turns every file under api/ into a function: only the one entry may exist.
    expect(fs.readdirSync(path.join(ROOT, 'api'))).toEqual(['index.js']);
    const entry = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(entry.match(/require\(/g)).toHaveLength(1);
    expect(entry).toMatch(/require\('\.\.\/backend\/dist\/vercel\.js'\)/);
    // No backend-level Vercel config or function folder (removed from the snapshot).
    expect(fs.existsSync(path.join(ROOT, 'backend/vercel.json'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'backend/api'))).toBe(false);
  });

  it('the staging entry checks identity and loads config before creating the app, and connects only inside the handler', () => {
    const src = fs.readFileSync(path.join(ROOT, 'backend/src/vercel.ts'), 'utf8');
    const at = (s: string) => src.indexOf(s);
    expect(at('assertStagingEntry(process.env);')).toBeGreaterThan(0);
    expect(at('assertStagingEntry(process.env);')).toBeLessThan(at('getConfig();'));
    expect(at('getConfig();')).toBeLessThan(at('const app = createApp();'));
    expect(at('connectDB()')).toBeGreaterThan(at('export default async function handler'));
  });
});

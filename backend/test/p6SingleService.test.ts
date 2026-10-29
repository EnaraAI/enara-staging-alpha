import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STAGING_DB_NAME } from '../src/config/stagingGuard';
import { idleDbController, mountStagingFrontend } from '../src/config/stagingSingleService';

// $0 Railway staging plan: one service serves the API and the built SPA, and
// closes the idle Mongo connection so the container can sleep. Local only.

const base = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  ENARA_STAGING: 'true',
  MONGODB_URI: `mongodb://u:p@db.internal.example:27017/${STAGING_DB_NAME}`,
  JWT_SECRET: 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  INGEST_HMAC_SECRET: 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
  CRON_SECRET: 'cron-staging-secret-ccccccccccccccccccccccccccc',
  RUN_MIGRATIONS_ON_START: 'false',
  R2_ACCOUNT_ID: 'a', R2_BUCKET: 'enara-staging-alpha-uploads', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test',
  FRONTEND_URL: 'https://staging.example.test',
  SERVE_FRONTEND_DIR: '/app/public',
  DB_IDLE_DISCONNECT_MS: '240000',
  ...over,
});

describe('single-service switches', () => {
  it('are honoured only in staging', async () => {
    const { loadConfig, setDotenvKeysForTests } = await import('../src/config/env');
    setDotenvKeysForTests([]);
    const staging = loadConfig(base());
    expect(staging.frontendDir).toBe('/app/public');
    expect(staging.dbIdleDisconnectMs).toBe(240_000);
    const plain = loadConfig(base({ ENARA_STAGING: undefined, NODE_ENV: 'test' }));
    expect(plain.frontendDir).toBeUndefined();
    expect(plain.dbIdleDisconnectMs).toBeUndefined();
    expect(() => loadConfig(base({ DB_IDLE_DISCONNECT_MS: '1000' }))).toThrow(/DB_IDLE_DISCONNECT_MS must be >= 30000/);
  });

  it('the single-service build does not change the existing deployment files', () => {
    const root = path.join(__dirname, '../..');
    const toml = fs.readFileSync(path.join(root, 'railway.staging-single.toml'), 'utf8');
    expect(toml).toMatch(/dockerfilePath = "Dockerfile\.staging-single"/);
    expect(toml).toMatch(/healthcheckPath = "\/ready"/);
    const docker = fs.readFileSync(path.join(root, 'Dockerfile.staging-single'), 'utf8');
    expect(docker).toMatch(/VITE_API_URL=\/api/);
    expect(docker).toMatch(/npm prune --omit=dev/);
    expect(docker).not.toMatch(/NODE_ENV=|_SECRET|MONGODB_URI|API_KEY|vercel\.app|onrender\.com|railway\.app|enara\.app/);
  });
});

describe('frontend API base', () => {
  it('every browser API path follows VITE_API_URL (so the single service can use /api)', () => {
    const fe = path.join(__dirname, '../../frontend');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (['node_modules', 'dist', 'worker'].includes(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && e.name !== 'server.ts') files.push(p);
      }
    };
    walk(fe);
    const hardCoded = files.filter((f) =>
      fs.readFileSync(f, 'utf8').split('\n').some((l) => /[`'"]\/api\/railway/.test(l) && !/VITE_API_URL/.test(l) && !/^\s*(\/\/|\*)/.test(l)),
    );
    expect(hardCoded.map((f) => path.relative(fe, f))).toEqual([]);
  });
});

describe('staging SPA hosting', () => {
  let dir: string;
  let app: express.Express;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enara-spa-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>ENARA</title>');
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
    app = express();
    app.use((_req, res, next) => {
      res.setHeader('Content-Security-Policy', "default-src 'self'");
      next();
    });
    app.get('/api/health-like', (_req, res) => res.json({ ok: true }));
    mountStagingFrontend(app, dir);
    app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND' }));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('serves the SPA and its assets, with client-side routes falling back to index.html', async () => {
    for (const url of ['/', '/teaching/dashboard', '/workspace/usage']) {
      const r = await request(app).get(url);
      expect(r.status, url).toBe(200);
      expect(r.text).toMatch(/<title>ENARA<\/title>/);
      expect(r.headers['content-security-policy']).toBeUndefined();
    }
    const js = await request(app).get('/assets/app.js');
    expect(js.status).toBe(200);
    expect(js.text).toBe('console.log(1)');
  });

  it('never answers API, upload or health paths with the SPA', async () => {
    expect((await request(app).get('/api/health-like')).body).toEqual({ ok: true });
    for (const url of ['/api/unknown', '/api', '/uploads/x.png', '/ready', '/health']) {
      const r = await request(app).get(url);
      expect(r.status, url).toBe(404);
      expect(r.body, url).toEqual({ code: 'NOT_FOUND' });
    }
    const api = await request(app).get('/api/unknown');
    expect(api.headers['content-security-policy']).toBe("default-src 'self'");
  });

  it('keeps the legacy direct-provider route closed', async () => {
    const r = await request(app).post('/api/gemini/generate').send({ prompt: 'x' });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ message: 'Not available in staging' });
  });

  it('refuses a directory without a built SPA', () => {
    expect(() => mountStagingFrontend(express(), path.join(dir, 'assets'))).toThrow(/SERVE_FRONTEND_DIR has no index\.html/);
  });
});

describe('idle database disconnect', () => {
  let mongo: MongoMemoryServer;
  let opens = 0;
  const open = async () => {
    opens += 1;
    await mongoose.connect(mongo.getUri());
  };
  const until = async (cond: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    return cond();
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('closes the connection when idle, keeps it while a request runs, and reconnects on the next request', async () => {
    const ctl = idleDbController(150, open, 20);
    let release: () => void = () => {};
    const app = express();
    app.use(ctl.middleware);
    app.get('/api/ping', (_req, res) => res.json({ state: mongoose.connection.readyState }));
    app.get('/api/slow', (_req, res) => {
      release = () => res.json({ state: mongoose.connection.readyState });
    });
    app.get('/assets/x.js', (_req, res) => res.send('x'));
    try {
      expect((await request(app).get('/api/ping')).body.state).toBe(1);
      expect(opens).toBe(1);

      // Idle: the connection is closed so nothing keeps the container awake.
      expect(await until(() => mongoose.connection.readyState === 0)).toBe(true);

      // Static files don't reopen it.
      await request(app).get('/assets/x.js');
      expect(mongoose.connection.readyState).toBe(0);

      // The next API request reconnects before the handler runs.
      expect((await request(app).get('/api/ping')).body.state).toBe(1);
      expect(opens).toBe(2);

      // A long request holds the connection open past the idle time.
      const slow = request(app).get('/api/slow').then((r) => r.body);
      await until(() => opens === 2 && mongoose.connection.readyState === 1);
      await new Promise((r) => setTimeout(r, 400));
      expect(mongoose.connection.readyState).toBe(1);
      release();
      expect((await slow).state).toBe(1);
      expect(await until(() => mongoose.connection.readyState === 0)).toBe(true);
    } finally {
      ctl.stop();
    }
  });

  it('opens once for concurrent requests after an idle close', async () => {
    const ctl = idleDbController(100_000, open, 50);
    const app = express();
    app.use(ctl.middleware);
    app.get('/api/ping', (_req, res) => res.json({ state: mongoose.connection.readyState }));
    try {
      await mongoose.disconnect();
      const before = opens;
      const states = await Promise.all([1, 2, 3, 4].map(() => request(app).get('/api/ping').then((r) => r.body.state)));
      expect(states).toEqual([1, 1, 1, 1]);
      expect(opens - before).toBe(1);
    } finally {
      ctl.stop();
    }
  });
});

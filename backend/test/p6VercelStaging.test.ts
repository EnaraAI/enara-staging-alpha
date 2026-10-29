import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { KNOWN_NON_STAGING_HOSTS, STAGING_DB_NAME, stagingProblems } from '../src/config/stagingGuard';

// Vercel Hobby staging project: one deployment serves the built SPA as static
// files and the backend as one function; every upload lives in R2. Offline.

const ROOT = path.join(__dirname, '../..');
const base = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development',
  ENARA_STAGING: 'true',
  VERCEL: '1',
  MONGODB_URI: `mongodb+srv://u:p@cluster.example.mongodb.net/${STAGING_DB_NAME}`,
  JWT_SECRET: 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  INGEST_HMAC_SECRET: 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
  CRON_SECRET: 'cron-staging-secret-ccccccccccccccccccccccccccc',
  RUN_MIGRATIONS_ON_START: 'false',
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'enara-staging-alpha-uploads',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  SERVE_LOCAL_UPLOADS: 'false',
  TRUST_PROXY: '1',
  CORS_ALLOWED_ORIGINS: 'https://enara-staging-alpha.vercel.app',
  FRONTEND_URL: 'https://enara-staging-alpha.vercel.app',
  ...over,
});

describe('Vercel staging storage rule', () => {
  it('accepts R2 on Vercel', () => {
    expect(stagingProblems(base())).toEqual([]);
  });

  it('refuses a local upload directory or local serving on Vercel: files are stored only in R2', () => {
    const noR2 = { R2_ACCOUNT_ID: undefined, R2_BUCKET: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined };
    expect(stagingProblems(base({ ...noR2, UPLOAD_DIR: '/tmp/enara-staging/uploads' })).join(' ')).toMatch(/staging stores files only in R2/);
    expect(stagingProblems(base({ SERVE_LOCAL_UPLOADS: 'true' })).join(' ')).toMatch(/SERVE_LOCAL_UPLOADS must be false in staging/);
    expect(stagingProblems(base({ R2_BUCKET: 'enara-sandbox-uploads' })).join(' ')).toMatch(/R2_BUCKET must be a staging bucket/);
  });

  it('requires a proxy hop count, not a blanket trust', () => {
    expect(stagingProblems(base({ TRUST_PROXY: 'true' })).join(' ')).toMatch(/TRUST_PROXY must be a hop count/);
    expect(stagingProblems(base({ TRUST_PROXY: '1' }))).toEqual([]);
  });

  it('R2 is mandatory off Vercel too (Railway, Docker): no local-directory fallback in staging', () => {
    const noR2 = { R2_ACCOUNT_ID: undefined, R2_BUCKET: undefined, R2_ACCESS_KEY_ID: undefined, R2_SECRET_ACCESS_KEY: undefined };
    expect(stagingProblems(base({ ...noR2, VERCEL: undefined, UPLOAD_DIR: '/srv/enara-staging/uploads' })).join(' ')).toMatch(/staging stores files only in R2/);
  });

  it('a Vercel domain of the existing sandbox is still refused as the staging origin', () => {
    expect(stagingProblems(base({ CORS_ALLOWED_ORIGINS: 'https://enara-sandbox-frontend.vercel.app', FRONTEND_URL: 'https://enara-sandbox-frontend.vercel.app' })).length).toBeGreaterThan(0);
  });
});

describe('vercel.json', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

  it('routes only to this deployment: no external rewrites, no crons', () => {
    for (const r of cfg.rewrites) expect(r.destination, r.source).toMatch(/^\//);
    const text = JSON.stringify(cfg);
    for (const h of KNOWN_NON_STAGING_HOSTS) expect(text).not.toContain(h);
    expect(cfg.crons).toBeUndefined();
  });

  it('sends API, uploads and health paths to the function before the SPA fallback', () => {
    const sources = cfg.rewrites.map((r: { source: string }) => r.source);
    const spa = sources.indexOf('/((?!assets/).*)');
    for (const s of ['/api/:path*', '/uploads/:path*', '/ready', '/health']) {
      expect(sources.indexOf(s), s).toBeGreaterThanOrEqual(0);
      expect(sources.indexOf(s), s).toBeLessThan(spa);
    }
    expect(cfg.rewrites.filter((r: { destination: string }) => r.destination === '/api')).toHaveLength(4);
  });

  it('builds the SPA same-origin, deploys only staging-alpha, and keeps the function near the database', () => {
    expect(cfg.buildCommand).toMatch(/VITE_API_URL=\/api/);
    expect(cfg.outputDirectory).toBe('frontend/dist');
    expect(cfg.git.deploymentEnabled).toEqual({ main: false, 'staging-alpha': true });
    expect(cfg.regions).toEqual(['iad1']);
    expect(Object.keys(cfg.functions)).toEqual(['api/index.js']);
  });

  it('the function entry loads the compiled backend handler, and no secret is committed', () => {
    const entry = fs.readFileSync(path.join(ROOT, 'api/index.js'), 'utf8');
    expect(entry).toMatch(/require\('\.\.\/backend\/dist\/vercel\.js'\)/);
    expect(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).not.toMatch(/SECRET|MONGODB_URI|API_KEY|"env"/);
  });
});

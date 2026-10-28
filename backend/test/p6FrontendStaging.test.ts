import fs from 'fs';
import net from 'net';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { KNOWN_NON_STAGING_HOSTS as BACKEND_HOSTS } from '../src/config/stagingGuard';
import { KNOWN_NON_STAGING_HOSTS as FRONTEND_HOSTS, frontendStagingProblems } from '../../frontend/stagingGuard';

// Railway staging frontend (enara-staging-frontend): the server must proxy only
// to an explicit staging backend, carry no direct provider keys, and keep the
// legacy direct-provider routes off. Local processes only; nothing remote.

const FRONTEND = path.join(__dirname, '../../frontend');
const good = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  ENARA_STAGING: 'true',
  NODE_ENV: 'production',
  BACKEND_URL: 'https://enara-staging-backend.example.test',
  ...over,
});

describe('frontend staging guard', () => {
  it('accepts a staging backend over https or Railway private networking', () => {
    expect(frontendStagingProblems(good())).toEqual([]);
    expect(frontendStagingProblems(good({ BACKEND_URL: 'http://enara-staging-backend.railway.internal:8080' }))).toEqual([]);
  });

  it('refuses a missing, plain-http, local or existing-deployment backend', () => {
    expect(frontendStagingProblems(good({ BACKEND_URL: undefined })).join(' ')).toMatch(/BACKEND_URL must be set/);
    expect(frontendStagingProblems(good({ BACKEND_URL: 'not a url' })).join(' ')).toMatch(/BACKEND_URL must be set/);
    expect(frontendStagingProblems(good({ BACKEND_URL: 'http://staging.example.test' })).join(' ')).toMatch(/must use https/);
    expect(frontendStagingProblems(good({ BACKEND_URL: 'https://localhost:3001' })).join(' ')).toMatch(/must not be localhost/);
    for (const h of BACKEND_HOSTS) {
      expect(frontendStagingProblems(good({ BACKEND_URL: `https://${h}` })).join(' '), h).toMatch(/production or shared ENARA backend/);
    }
  });

  it('refuses direct provider keys and a non-production server mode', () => {
    expect(frontendStagingProblems(good({ GEMINI_API_KEY: 'x' })).join(' ')).toMatch(/GEMINI_API_KEY must be unset/);
    expect(frontendStagingProblems(good({ AVATAR_API_KEY: 'x' })).join(' ')).toMatch(/AVATAR_API_KEY must be unset/);
    expect(frontendStagingProblems(good({ NODE_ENV: 'development' })).join(' ')).toMatch(/NODE_ENV must be production/);
  });

  it('frontend and backend guards list the same existing-deployment hosts', () => {
    expect([...FRONTEND_HOSTS].sort()).toEqual([...BACKEND_HOSTS].sort());
  });

  it('staging config files do not touch the existing deployment files', () => {
    const fe = fs.readFileSync(path.join(FRONTEND, 'railway.staging.toml'), 'utf8');
    expect(fe).toMatch(/dockerfilePath = "Dockerfile\.staging"/);
    expect(fe).toMatch(/healthcheckPath = "\/api\/health"/);
    const be = fs.readFileSync(path.join(__dirname, '../railway.staging.toml'), 'utf8');
    expect(be).toMatch(/healthcheckPath = "\/ready"/);
    const docker = fs.readFileSync(path.join(FRONTEND, 'Dockerfile.staging'), 'utf8');
    expect(docker).toMatch(/npm ci --omit=dev/);
    expect(docker).not.toMatch(/vercel\.app|railway\.app|onrender\.com|enara\.app/);
  });
});

const hasFrontendDeps = fs.existsSync(path.join(FRONTEND, 'node_modules', '.bin', 'tsx'));
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

describe.skipIf(!hasFrontendDeps)('frontend server in staging mode (local process)', () => {
  const env = (over: Record<string, string | undefined>) => ({ PATH: process.env.PATH, HOME: process.env.HOME, ...good(over) }) as NodeJS.ProcessEnv;

  it('exits before listening when the backend target is not staging', () => {
    const r = spawnSync(path.join(FRONTEND, 'node_modules', '.bin', 'tsx'), ['server.ts'], { cwd: FRONTEND, env: env({ BACKEND_URL: 'https://enara-sandbox-backend.vercel.app', PORT: '0' }), timeout: 60_000, encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/Frontend staging isolation check failed/);
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/Server listening/);
  }, 90_000);

  it('serves health, turns off the legacy provider routes, and sends no open CORS header', async () => {
    const port = await freePort();
    const child = spawn(path.join(FRONTEND, 'node_modules', '.bin', 'tsx'), ['server.ts'], { cwd: FRONTEND, env: env({ PORT: String(port) }) });
    try {
      let up = false;
      for (let i = 0; i < 120 && !up; i++) {
        await new Promise((r) => setTimeout(r, 250));
        up = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.ok).catch(() => false);
      }
      expect(up).toBe(true);
      const health = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Origin: 'https://evil.example' } });
      expect(health.headers.get('access-control-allow-origin')).toBeNull();
      for (const [method, url] of [['POST', '/api/avatar/config'], ['POST', '/api/gemini/generate'], ['GET', '/api/avatar/list']] as const) {
        const r = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
        expect(r.status, url).toBe(404);
      }
    } finally {
      child.kill('SIGTERM');
    }
  }, 90_000);
});

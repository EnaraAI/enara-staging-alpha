import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomBytes } from 'crypto';

// One test of every environment variable, Part 2 (maintenance/envCheck.ts). Every outside call is stubbed; the checks must report
// names and states only and never a value.
const SECRETS = { jwt: 'j'.repeat(40), hmac: 'h'.repeat(40), resend: 're_SECRETVALUE_resend', anam: 'anam-SECRETVALUE', el: 'el-SECRETVALUE', anth: 'sk-ant-SECRETVALUE', r2s: 'r2-SECRETVALUE', cron: 'c'.repeat(40) };
const KEK = randomBytes(32);
let cfg: Record<string, unknown>;
vi.mock('../src/config/env', () => ({ getConfig: () => cfg }));
vi.mock('../src/config/postgres', () => ({ getPostgresPool: () => ({ query: async () => ({}) }) }));
let keyState = 'accepted';
vi.mock('../src/services/modelFallback', () => ({ keyStatus: vi.fn(async () => keyState), fallbackKey: () => undefined }));
vi.mock('./../src/maintenance/llmCheck', () => ({ llmPing: vi.fn(async () => ({ ok: true })) }));
let pingOk = true;
vi.mock('mongoose', () => ({ default: { connection: { db: { admin: () => ({ ping: async () => { if (!pingOk) throw new Error('down'); } }) } } } }));
let r2Ok = true;
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: class { async send() { if (!r2Ok) throw new Error('denied'); return {}; } }, ListObjectsV2Command: class { constructor(public input: unknown) {} } }));

const { runEnvCheck, stateOfStatus } = await import('../src/maintenance/envCheck');
const env = { MAINTENANCE_TOKEN: 'm'.repeat(40), TUTOR_LLM_BASE_URL: 'https://x', SEED_USER_PASSWORD: 'p'.repeat(16), VERCEL: '1' } as NodeJS.ProcessEnv;
const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  pingOk = true; r2Ok = true; keyState = 'accepted';
  cfg = {
    jwtSecret: SECRETS.jwt, ingestHmacSecret: SECRETS.hmac, cronSecret: SECRETS.cron, anthropicApiKey: SECRETS.anth,
    lms: { kek: KEK, ltiEnabled: true }, r2: { accountId: 'acc', bucket: 'b', accessKeyId: 'id', secretAccessKey: SECRETS.r2s },
    email: { resendApiKey: SECRETS.resend, from: 'ENARA <noreply@enara.app>', enabled: false },
    anam: { apiKey: SECRETS.anam }, elevenlabs: { apiKey: SECRETS.el }, googleClientId: '123-abc.apps.googleusercontent.com',
  };
});
const okFetch = vi.fn(async (url: string) => (String(url).includes('resend') ? reply(200, { data: [{ name: 'enara.app', status: 'verified' }] }) : reply(200)));
const state = (r: Awaited<ReturnType<typeof runEnvCheck>>, name: string) => r.checks.find((c) => c.name === name)?.state;

describe('env check (read-only, names and states only)', () => {
  it('all good: every check ok, the sender domain verified, no value anywhere in the reply', async () => {
    const r = await runEnvCheck({ fetch: okFetch as unknown as typeof fetch, env });
    expect(r.ok).toBe(true);
    for (const n of ['mongo', 'login tokens', 'ingest signatures', 'LMS key', 'file storage (R2)', 'email (Resend)', 'avatar (Anam)', 'speech (ElevenLabs)', 'Anthropic key', 'tutor model (DeepSeek)', 'cron caller', 'maintenance tokens', 'Google sign-in']) expect(state(r, n), n).toBe('ok');
    expect(r.checks.find((c) => c.name === 'email (Resend)')?.note).toBe('sender domain verified');
    const text = JSON.stringify(r);
    for (const v of [...Object.values(SECRETS), KEK.toString('base64'), env.MAINTENANCE_TOKEN!]) expect(text).not.toContain(v);
  });
  it('only read-only calls: GET to the providers, no body', async () => {
    const f = vi.fn(okFetch);
    await runEnvCheck({ fetch: f as unknown as typeof fetch, env });
    for (const [, init] of f.mock.calls as unknown as [string, RequestInit][]) { expect(init?.method ?? 'GET').toBe('GET'); expect(init?.body).toBeUndefined(); }
  });
  it('a refused provider key is "rejected" and only warns; a broken database or storage fails (required)', async () => {
    const f = vi.fn(async (url: string) => (String(url).includes('anam') ? reply(401) : okFetch(url)));
    keyState = 'rejected';
    const r = await runEnvCheck({ fetch: f as unknown as typeof fetch, env });
    expect(state(r, 'avatar (Anam)')).toBe('rejected');
    expect(state(r, 'Anthropic key')).toBe('rejected');
    expect(r.ok).toBe(true);
    pingOk = false; r2Ok = false;
    const bad = await runEnvCheck({ fetch: okFetch as unknown as typeof fetch, env });
    expect(state(bad, 'mongo')).toBe('error');
    expect(state(bad, 'file storage (R2)')).toBe('rejected');
    expect(bad.ok).toBe(false);
  });
  it('a send-only Resend key counts as valid', async () => {
    const f = vi.fn(async (url: string) => (String(url).includes('resend') ? reply(401, { name: 'restricted_api_key' }) : okFetch(url)));
    const r = await runEnvCheck({ fetch: f as unknown as typeof fetch, env });
    expect(state(r, 'email (Resend)')).toBe('ok');
  });
  it('short secrets are "weak"; missing ones "not_configured"', async () => {
    cfg = { ...cfg, jwtSecret: 'short', cronSecret: undefined, anam: undefined };
    const r = await runEnvCheck({ fetch: okFetch as unknown as typeof fetch, env });
    expect(state(r, 'login tokens')).toBe('weak');
    expect(r.ok).toBe(false);
    expect(state(r, 'cron caller')).toBe('not_configured');
    expect(state(r, 'avatar (Anam)')).toBe('not_configured');
  });
  it('status mapping', () => {
    expect([200, 204, 401, 403, 404, 500].map(stateOfStatus)).toEqual(['ok', 'ok', 'rejected', 'rejected', 'error', 'error']);
  });
});

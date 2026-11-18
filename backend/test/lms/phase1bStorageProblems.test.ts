import { createHash, randomBytes } from 'crypto';
import vm from 'vm';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';
import { MockPlatform } from './mockPlatform';

// LMS Phase 1b (docs/lms/PHASE_1B_NOTES.md), parts B:
//  - LTI platform storage (lti_storage_target, lti.put_data / lti.get_data):
//    the login and launch pages, their CSP, the verify step, the fallback to
//    the cookieless path, the refusal of a sign-in that did not start in this
//    browser, and the audit codes. The pages' script really runs (node vm)
//    against a simulated platform storage frame.
//  - The Problems view: permissions, school isolation, grouping and counts,
//    open dead grade jobs and failed roster syncs, texts in both languages.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL', 'LMS_PLATFORM_STORAGE_ENABLED'];
const ON = { LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK };

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'lms1b-school-a';
const B = 'lms1b-school-b';
let mongo: MongoMemoryServer;
let app: Awaited<ReturnType<typeof makeApp>>;
let pA: MockPlatform;
const auth: Record<string, string> = {};
let M: typeof import('../../src/integrations/lms/models');

async function makeApp() {
  return (await import('../../src/app')).createApp();
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL']) delete process.env[k];
  setLmsEnv(ON);
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  const { User } = await import('../../src/models/User');
  await User.createIndexes();
  const { Institution } = await import('../../src/models/Institution');
  await Institution.create([{ id: A, name: 'School A' }, { id: B, name: 'School B' }]);
  const { signAccessToken } = await import('../../src/auth/jwt');
  const mk = async (key: string, role: string, institutionId?: string) => {
    const u = await User.create({ email: `${key}@staff1b.test`, password: 'x', role, name: key, institutionId });
    auth[key] = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId } as never)}`;
  };
  await mk('enara', 'enara-admin');
  await mk('adminA', 'admin', A);
  await mk('adminB', 'admin', B);
  await mk('teacherA', 'teacher', A);
  await mk('managerA', 'academic_manager', A);
  await mk('studentA', 'student', A);
  pA = await new MockPlatform('https://moodle.school-a.test', 'client-1b-a').start();
  const { resetPlatformKeySetsForTests } = await import('../../src/integrations/lms/adapters/lti13/jwks');
  resetPlatformKeySetsForTests({ cooldownMs: 0 });
  app = await makeApp();
  const r = await request(app).post('/api/lms/platforms').set('Authorization', auth.enara).send({
    institutionId: A, vendor: 'moodle', issuer: pA.issuer, clientId: pA.clientId,
    authLoginUrl: pA.authLoginUrl, keysetUrl: pA.keysetUrl, authTokenUrl: `${pA.issuer}/mod/lti/token.php`, deploymentIds: [pA.deploymentId],
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
}, 120_000);

afterAll(async () => {
  setLmsEnv({});
  await pA?.stop();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
});

// ---------------------------------------------------------------- helpers

const PLATFORM_ORIGIN = 'https://moodle.school-a.test';
const csp = (r: request.Response) => String(r.headers['content-security-policy'] ?? '');
const directive = (r: request.Response, name: string) => new RegExp(`(?:^|; )${name} ([^;]+)`).exec(csp(r))?.[1] ?? '';

function loginForm(extra: Record<string, string> = {}) {
  return { iss: pA.issuer, login_hint: 'hint-1', target_link_uri: `${TOOL}/lti/launch`, client_id: pA.clientId, lti_deployment_id: pA.deploymentId, lti_message_hint: 'mh', ...extra };
}

/** The page's JSON data block and inline script. */
function pageParts(html: string) {
  const data = /<script type="application\/json" id="lti-storage-data">([\s\S]*?)<\/script>/.exec(html)?.[1];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return { data: data ? JSON.parse(data) : undefined, scripts };
}

/**
 * A simulated platform window holding a storage frame (spec: keys scoped to the
 * sender's origin). `mode`: answer normally, never answer, or answer from a
 * wrong origin.
 */
class FakePlatformStorage {
  store = new Map<string, string>();
  messages: Record<string, unknown>[] = [];
  mode: 'answer' | 'silent' | 'wrong_origin' | 'error' = 'answer';
  constructor(public origin = PLATFORM_ORIGIN) {}
}

interface RunResult {
  replacedWith?: string;
  submitted?: Record<string, string>;
  posted: { msg: Record<string, unknown>; targetOrigin: string }[];
}

/** Runs a storage page's script in a sandbox, as the tool frame inside the platform page. */
async function runStoragePage(html: string, storage: FakePlatformStorage, opts: { frameName?: string; timeoutMs?: number; toolOrigin?: string } = {}): Promise<RunResult> {
  const { data, scripts } = pageParts(html);
  expect(scripts).toHaveLength(1);
  if (opts.timeoutMs) data.timeoutMs = opts.timeoutMs;
  const listeners: ((ev: { origin: string; data: unknown }) => void)[] = [];
  const out: RunResult = { posted: [] };
  const fields: Record<string, { value: string }> = {};
  for (const m of html.matchAll(/<input type="hidden" name="(\w+)" value="([^"]*)">/g)) fields[m[1]] = { value: m[2] };
  let finish!: () => void;
  const finished = new Promise<void>((r) => (finish = r));
  const toolOrigin = opts.toolOrigin ?? TOOL;
  const deliver = (payload: unknown, origin: string) => setTimeout(() => listeners.slice().forEach((l) => l({ origin, data: payload })), 5);
  const storageFrame = {
    postMessage(msg: Record<string, unknown>, targetOrigin: string) {
      out.posted.push({ msg, targetOrigin });
      storage.messages.push(msg);
      if (targetOrigin !== storage.origin || storage.mode === 'silent') return;
      const from = storage.mode === 'wrong_origin' ? 'https://evil.example' : storage.origin;
      const key = `${toolOrigin}|${String(msg.key)}`;
      const reply: Record<string, unknown> = { subject: `${String(msg.subject)}.response`, message_id: msg.message_id };
      if (storage.mode === 'error') reply.error = { code: 'unsupported_subject', message: 'no' };
      else if (msg.subject === 'lti.put_data') {
        storage.store.set(key, String(msg.value));
        Object.assign(reply, { key: msg.key, value: msg.value });
      } else if (msg.subject === 'lti.get_data') {
        if (storage.store.has(key)) Object.assign(reply, { key: msg.key, value: storage.store.get(key) });
        else reply.error = { code: 'key_not_found', message: 'not found' };
      }
      deliver(reply, from);
    },
  };
  const parent: Record<string, unknown> = { frames: {} as Record<string, unknown> };
  if (!opts.frameName || opts.frameName === '_parent') Object.assign(parent, { postMessage: storageFrame.postMessage });
  else (parent.frames as Record<string, unknown>)[opts.frameName] = storageFrame;
  const document = {
    getElementById(id: string) {
      if (id === 'lti-storage-data') return { textContent: JSON.stringify(data) };
      if (id === 'lti-storage-form') {
        return {
          elements: { namedItem: (n: string) => (fields[n] ??= { value: '' }) },
          submit() {
            out.submitted = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value]));
            finish();
          },
        };
      }
      return null;
    },
  };
  const window: Record<string, unknown> = {
    parent,
    opener: null,
    crypto: { randomUUID: () => randomBytes(16).toString('hex') },
    addEventListener: (t: string, l: (ev: { origin: string; data: unknown }) => void) => t === 'message' && listeners.push(l),
    removeEventListener: (t: string, l: (ev: { origin: string; data: unknown }) => void) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    location: {
      replace: (u: string) => {
        out.replacedWith = u;
        finish();
      },
    },
  };
  vm.runInNewContext(scripts[0], { window, document, setTimeout, JSON, String, Date, Math });
  await Promise.race([finished, new Promise((r) => setTimeout(r, 10_000))]);
  return out;
}

/** Storage login: the page; then (as the browser) the platform auth URL it goes on to. */
async function storageLogin(storage: FakePlatformStorage, target = 'post_message_forwarding') {
  const r = await request(app).post('/lti/login').type('form').send(loginForm({ lti_storage_target: target }));
  expect(r.status, r.text).toBe(200);
  const ran = await runStoragePage(r.text, storage, { frameName: target });
  expect(ran.replacedWith).toBeTruthy();
  const location = new URL(ran.replacedWith!);
  const cookie = ([] as string[]).concat(r.headers['set-cookie'] ?? [])[0].split(';')[0];
  return { r, ran, state: location.searchParams.get('state')!, nonce: location.searchParams.get('nonce')!, cookie, location };
}

async function storageLaunch(storage: FakePlatformStorage, over: Record<string, unknown> = {}, target = 'post_message_forwarding') {
  const l = await storageLogin(storage, target);
  const idToken = await pA.sign(pA.claims(l.nonce, TOOL, over));
  const launch = await request(app).post('/lti/launch').type('form').send({ id_token: idToken, state: l.state });
  return { l, idToken, launch };
}

async function expectLtiError(res: request.Response, code: string, status?: number) {
  expect(res.text, `expected ${code}`).toContain(`<code>${code}</code>`);
  if (status) expect(res.status).toBe(status);
  const row = await M.LmsAuditLog.findOne({ code }).sort({ createdAt: -1 }).lean();
  expect(row?.outcome).toBe('fail');
}

const platformRow = async () => (await M.LmsPlatform.findOne({ issuer: pA.issuer, clientId: pA.clientId }).lean())!;

// ------------------------------------------------------- platform storage

describe('platform storage: login', () => {
  it('without lti_storage_target: unchanged (302 to the platform, state cookie, no page)', async () => {
    const r = await request(app).post('/lti/login').type('form').send(loginForm());
    expect(r.status).toBe(302);
    expect(String(r.headers['set-cookie'])).toMatch(/^lti_st_[0-9a-f]{16}=1;/);
    expect(directive(r, 'script-src')).toBe('');
    const row = await M.LmsOidcState.findOne({ stateHash: createHash('sha256').update(new URL(r.headers.location).searchParams.get('state')!).digest('hex') }).lean();
    expect(row?.storageTarget).toBeUndefined();
  });

  it('with lti_storage_target: a framed page that puts state and nonce into the storage frame (platform origin only), then goes to the auth URL', async () => {
    const storage = new FakePlatformStorage();
    const { r, ran, state, nonce, location } = await storageLogin(storage);
    // The page: framed by the platform only, one script allowed by its hash, nothing else.
    expect(r.headers['content-type']).toMatch(/html/);
    expect(r.headers['x-frame-options']).toBeUndefined();
    expect(directive(r, 'frame-ancestors')).toContain(PLATFORM_ORIGIN);
    expect(directive(r, 'frame-ancestors').split(' ')).not.toContain('*');
    expect(directive(r, 'default-src')).toBe("'none'");
    expect(directive(r, 'form-action')).toBe("'none'");
    const { STORAGE_SCRIPT_HASH } = await import('../../src/integrations/lms/adapters/lti13/platformStorage');
    expect(directive(r, 'script-src')).toBe(`'${STORAGE_SCRIPT_HASH}'`);
    const { scripts, data } = pageParts(r.text);
    expect(`sha256-${createHash('sha256').update(scripts[0], 'utf8').digest('base64')}`).toBe(STORAGE_SCRIPT_HASH);
    expect(data).toMatchObject({ mode: 'put', subject: 'lti.put_data', target: 'post_message_forwarding', origin: PLATFORM_ORIGIN });
    expect(r.text).not.toMatch(/unsafe-inline'[^;]*script|script-src[^;]*unsafe/);
    // The state cookie is still set (used when the browser keeps it).
    expect(String(r.headers['set-cookie'])).toMatch(/^lti_st_[0-9a-f]{16}=1; Path=\/lti;.*Partitioned/);
    // The messages: lti.put_data with state_<state> and nonce_<nonce>, to the platform's auth origin only.
    expect(ran.posted.map((p) => p.targetOrigin)).toEqual([PLATFORM_ORIGIN, PLATFORM_ORIGIN]);
    expect(ran.posted.map((p) => p.msg)).toEqual([
      { subject: 'lti.put_data', message_id: expect.any(String), key: `state_${state}`, value: state },
      { subject: 'lti.put_data', message_id: expect.any(String), key: `nonce_${nonce}`, value: nonce },
    ]);
    // Then the normal OIDC redirect.
    expect(location.origin + location.pathname).toBe(pA.authLoginUrl);
    expect(location.searchParams.get('redirect_uri')).toBe(`${TOOL}/lti/launch`);
    // The login is recorded as using storage (on the state row and in the audit).
    const row = await M.LmsOidcState.findOne({ stateHash: createHash('sha256').update(state).digest('hex') }).lean();
    expect(row?.storageTarget).toBe('post_message_forwarding');
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.login' }).sort({ createdAt: -1 }).lean();
    expect(audit?.refIds).toMatchObject({ storage: true });
  });

  it('"_parent" targets the parent window itself', async () => {
    const storage = new FakePlatformStorage();
    const { ran } = await storageLogin(storage, '_parent');
    expect(ran.posted).toHaveLength(2);
    expect(storage.store.size).toBe(2);
  });

  it('a storage frame that never answers: the login still goes on after the timeout', async () => {
    const storage = new FakePlatformStorage();
    storage.mode = 'silent';
    const r = await request(app).post('/lti/login').type('form').send(loginForm({ lti_storage_target: 'post_message_forwarding' }));
    const ran = await runStoragePage(r.text, storage, { frameName: 'post_message_forwarding', timeoutMs: 50 });
    expect(new URL(ran.replacedWith!).origin + new URL(ran.replacedWith!).pathname).toBe(pA.authLoginUrl);
  });

  it('an invalid target name, or LMS_PLATFORM_STORAGE_ENABLED=false: the normal redirect', async () => {
    const bad = await request(app).post('/lti/login').type('form').send(loginForm({ lti_storage_target: '"><script>alert(1)</script>' }));
    expect(bad.status).toBe(302);
    expect(bad.text).not.toContain('<script>alert');
    setLmsEnv({ ...ON, LMS_PLATFORM_STORAGE_ENABLED: 'false' });
    try {
      const off = await request(app).get('/lti/login').query(loginForm({ lti_storage_target: 'post_message_forwarding' }));
      expect(off.status).toBe(302);
      const audit = await M.LmsAuditLog.findOne({ event: 'lti.login' }).sort({ createdAt: -1 }).lean();
      expect(audit?.refIds).toMatchObject({ storage: false });
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('platform storage: launch', () => {
  it('the cookie came back: the normal launch, no storage page', async () => {
    const storage = new FakePlatformStorage();
    const l = await storageLogin(storage);
    const idToken = await pA.sign(pA.claims(l.nonce, TOOL, { sub: 'ps-cookie' }));
    const r = await request(app).post('/lti/launch').type('form').set('Cookie', l.cookie).send({ id_token: idToken, state: l.state });
    expect(r.status, r.text).toBe(303);
    expect(new URL(r.headers.location).hash).not.toContain('c=1');
  });

  it('no cookie: a page reads state and nonce back from the storage; the id_token stays on the server; verified -> signed in, not cookieless', async () => {
    const storage = new FakePlatformStorage();
    const before = await platformRow();
    const { l, idToken, launch } = await storageLaunch(storage, { sub: 'ps-ok' });
    expect(launch.status, launch.text).toBe(200);
    // The page never carries the id_token; it carries the state, nonce keys and a one-time handle.
    expect(launch.text).not.toContain(idToken);
    expect(launch.text).not.toContain(idToken.split('.')[1]);
    expect(directive(launch, 'frame-ancestors')).toContain(PLATFORM_ORIGIN);
    expect(directive(launch, 'form-action')).toBe(TOOL);
    expect(directive(launch, 'script-src')).toMatch(/^'sha256-/);
    const { data } = pageParts(launch.text);
    expect(data).toMatchObject({ mode: 'get', subject: 'lti.get_data', origin: PLATFORM_ORIGIN, items: [{ key: `state_${l.state}` }, { key: `nonce_${l.nonce}` }] });
    // Server side: the id_token is parked encrypted on the state row, behind the handle's hash.
    const stateHash = createHash('sha256').update(l.state).digest('hex');
    const held = await M.LmsOidcState.findOne({ stateHash }).select('+idTokenEnc').lean();
    expect(held?.heldAt).toBeTruthy();
    expect(held?.idTokenEnc).toBeTruthy();
    expect(held!.idTokenEnc).not.toContain(idToken.split('.')[1]);
    expect(held!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 2 * 60_000 + 1000);

    const ran = await runStoragePage(launch.text, storage, { frameName: 'post_message_forwarding' });
    expect(ran.posted.map((p) => p.msg.subject)).toEqual(['lti.get_data', 'lti.get_data']);
    expect(ran.posted.every((p) => p.targetOrigin === PLATFORM_ORIGIN)).toBe(true);
    expect(ran.submitted).toMatchObject({ state: l.state, r: 'ok', s: l.state, n: l.nonce });
    expect(ran.submitted!.h).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const v = await request(app).post('/lti/launch/verify').type('form').send(ran.submitted!);
    expect(v.status, v.text).toBe(303);
    const frag = new URLSearchParams(new URL(v.headers.location).hash.slice(1));
    expect(frag.get('c')).toBeNull();
    const ex = await request(app).post('/api/lms/launch/exchange').send({ token: frag.get('lt') });
    expect(ex.status, JSON.stringify(ex.body)).toBe(200);
    expect(ex.body.launch.cookieless).toBe(false);
    const after = await platformRow();
    expect(after.storageLaunchCount).toBe((before.storageLaunchCount ?? 0) + 1);
    expect(after.cookielessLaunchCount).toBe(before.cookielessLaunchCount ?? 0);
    const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch' }).sort({ createdAt: -1 }).lean();
    expect(audit).toMatchObject({ outcome: 'ok', refIds: { binding: 'storage', cookieless: false } });
    expect(audit?.code).toBeUndefined();
    expect(JSON.stringify(audit)).not.toMatch(/Layla|Hassan|layla@/);
    expect(await M.LmsAuditLog.exists({ event: 'lti.storage_check', outcome: 'ok' })).toBeTruthy();
    // Used once: the same verify post again is refused, and the row is gone.
    expect(await M.LmsOidcState.exists({ stateHash })).toBeNull();
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send(ran.submitted!), 'state_invalid', 400);
  });

  it('a sign-in that did not start in this browser (the storage does not know the keys): refused with storage_mismatch', async () => {
    const attacker = new FakePlatformStorage();
    const victim = new FakePlatformStorage();
    const { launch } = await storageLaunch(attacker, { sub: 'ps-csrf' });
    const ran = await runStoragePage(launch.text, victim, { frameName: 'post_message_forwarding' });
    expect(ran.submitted?.r).toBe('missing');
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send(ran.submitted!), 'storage_mismatch', 400);
  });

  it('wrong values posted for an ok answer: refused (storage_mismatch); a wrong handle: state_invalid', async () => {
    const storage = new FakePlatformStorage();
    const { launch, l } = await storageLaunch(storage, { sub: 'ps-wrong' });
    const ran = await runStoragePage(launch.text, storage, { frameName: 'post_message_forwarding' });
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send({ ...ran.submitted!, h: randomBytes(32).toString('base64url') }), 'state_invalid', 400);
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send({ ...ran.submitted!, n: 'not-the-nonce' }), 'storage_mismatch', 400);
    // The hold was used up by that refusal.
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send(ran.submitted!), 'state_invalid', 400);
    expect(l.state).toBeTruthy();
  });

  it('the storage does not answer (timeout), answers from another origin, or answers with an error: the cookieless path, counted, audit code storage_unavailable', async () => {
    for (const mode of ['silent', 'wrong_origin', 'error'] as const) {
      const storage = new FakePlatformStorage();
      const before = await platformRow();
      const { launch } = await storageLaunch(storage, { sub: `ps-${mode}` });
      storage.mode = mode;
      const ran = await runStoragePage(launch.text, storage, { frameName: 'post_message_forwarding', timeoutMs: 60 });
      expect(ran.submitted).toMatchObject({ r: 'unavailable', s: '', n: '' });
      const v = await request(app).post('/lti/launch/verify').type('form').send(ran.submitted!);
      expect(v.status, v.text).toBe(303);
      expect(new URLSearchParams(new URL(v.headers.location).hash.slice(1)).get('c')).toBe('1');
      const after = await platformRow();
      expect(after.cookielessLaunchCount).toBe((before.cookielessLaunchCount ?? 0) + 1);
      expect(after.storageLaunchCount ?? 0).toBe(before.storageLaunchCount ?? 0);
      const audit = await M.LmsAuditLog.findOne({ event: 'lti.launch' }).sort({ createdAt: -1 }).lean();
      expect(audit).toMatchObject({ outcome: 'warn', code: 'storage_unavailable', refIds: { binding: 'storage_unavailable', cookieless: true } });
    }
  });

  it('no storage frame in the parent: unavailable at once (fallback)', async () => {
    const storage = new FakePlatformStorage();
    const { launch } = await storageLaunch(storage, { sub: 'ps-noframe' });
    const ran = await runStoragePage(launch.text, storage, { frameName: '_parent_missing_', timeoutMs: 5000 });
    expect(ran.posted).toHaveLength(0);
    expect(ran.submitted?.r).toBe('unavailable');
  });

  it('a bad id_token is refused before any storage page, and its state is used up', async () => {
    const storage = new FakePlatformStorage();
    const l = await storageLogin(storage);
    const bad = await pA.sign(pA.claims(l.nonce, TOOL), { key: await pA.foreignKey() });
    await expectLtiError(await request(app).post('/lti/launch').type('form').send({ id_token: bad, state: l.state }), 'invalid_signature', 401);
    expect(await M.LmsOidcState.exists({ stateHash: createHash('sha256').update(l.state).digest('hex') })).toBeNull();
    const good = await pA.sign(pA.claims(l.nonce, TOOL));
    await expectLtiError(await request(app).post('/lti/launch').type('form').send({ id_token: good, state: l.state }), 'state_invalid', 400);
  });

  it('a held state cannot be launched again through /lti/launch (with or without a cookie)', async () => {
    const storage = new FakePlatformStorage();
    const { l, idToken, launch } = await storageLaunch(storage, { sub: 'ps-replay' });
    expect(launch.status).toBe(200);
    await expectLtiError(await request(app).post('/lti/launch').type('form').send({ id_token: idToken, state: l.state }), 'state_invalid', 400);
    await expectLtiError(await request(app).post('/lti/launch').type('form').set('Cookie', l.cookie).send({ id_token: idToken, state: l.state }), 'state_invalid', 400);
  });

  it('an expired hold is refused', async () => {
    const storage = new FakePlatformStorage();
    const { launch, l } = await storageLaunch(storage, { sub: 'ps-expired' });
    const ran = await runStoragePage(launch.text, storage, { frameName: 'post_message_forwarding' });
    await M.LmsOidcState.updateOne({ stateHash: createHash('sha256').update(l.state).digest('hex') }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send(ran.submitted!), 'state_invalid', 400);
  });

  it('verify with missing fields: state_missing; the verify route is the normal 404 with LMS off', async () => {
    await expectLtiError(await request(app).post('/lti/launch/verify').type('form').send({ state: 'x' }), 'state_missing', 400);
    setLmsEnv({});
    try {
      expect((await request(app).post('/lti/launch/verify').type('form').send({ state: 'x', h: 'y' })).status).toBe(404);
    } finally {
      setLmsEnv(ON);
    }
  });
});

// ------------------------------------------------------------- problems

describe('Problems view (GET /api/lms/problems)', () => {
  const H = 3600_000;
  const now = Date.now();
  let seeded = false;
  async function seed() {
    if (seeded) return;
    seeded = true;
    await M.LmsAuditLog.deleteMany({});
    const rows = [
      // School A: 3 x state_invalid (fail) in the last day, on two platforms and contexts.
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'fail', code: 'state_invalid', refIds: { contextId: 'ctx-1' }, createdAt: new Date(now - 1 * H) },
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'fail', code: 'state_invalid', refIds: { contextId: 'ctx-2' }, createdAt: new Date(now - 2 * H) },
      { institutionId: A, platformId: 'plat-a2', event: 'lti.launch', outcome: 'fail', code: 'state_invalid', refIds: {}, createdAt: new Date(now - 3 * H) },
      // School A: cookieless warnings (2 in the day, 1 three days ago).
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'warn', code: 'cookieless', refIds: { contextId: 'ctx-1' }, createdAt: new Date(now - 4 * H) },
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'warn', code: 'cookieless', refIds: { contextId: 'ctx-1' }, createdAt: new Date(now - 5 * H) },
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'warn', code: 'cookieless', refIds: { contextId: 'ctx-1' }, createdAt: new Date(now - 72 * H) },
      // School A: a grade failure 5 days ago; an ok launch (never shown); something 10 days ago (never shown).
      { institutionId: A, platformId: 'plat-a1', event: 'grade.failed', outcome: 'fail', code: 'score_http_403', refIds: { contextId: 'ctx-1' }, createdAt: new Date(now - 120 * H) },
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'ok', refIds: {}, createdAt: new Date(now - 1 * H) },
      { institutionId: A, platformId: 'plat-a1', event: 'lti.launch', outcome: 'fail', code: 'invalid_signature', refIds: {}, createdAt: new Date(now - 240 * H) },
      // School A: a registration duplicate and an unknown code.
      { institutionId: A, platformId: 'plat-a3', event: 'registration.complete', outcome: 'warn', code: 'duplicate_lms', refIds: {}, createdAt: new Date(now - 6 * H) },
      { institutionId: A, event: 'test_ws.call', outcome: 'fail', code: 'weird_new_code', refIds: {}, createdAt: new Date(now - 7 * H) },
      // School B: its own failure (never shown to school A).
      { institutionId: B, platformId: 'plat-b1', event: 'lti.launch', outcome: 'fail', code: 'state_invalid', refIds: { contextId: 'ctx-b' }, createdAt: new Date(now - 1 * H) },
      { institutionId: B, platformId: 'plat-b1', event: 'roster.sync', outcome: 'fail', code: 'memberships_http_403', refIds: { contextId: 'ctx-b' }, createdAt: new Date(now - 1 * H) },
      // No school (unknown platform): ENARA admins only.
      { event: 'lti.login', outcome: 'fail', code: 'unknown_platform', refIds: {}, createdAt: new Date(now - 1 * H) },
    ];
    // 12 platforms with the same failure (the ID lists are capped at 10).
    for (let i = 0; i < 12; i++) rows.push({ institutionId: A, platformId: `plat-many-${String(i).padStart(2, '0')}`, event: 'lti.launch', outcome: 'fail', code: 'jwks_unavailable', refIds: {}, createdAt: new Date(now - 2 * H) });
    await M.LmsAuditLog.insertMany(rows);
    // Still open: dead grade jobs and a failed roster sync (A and B).
    const job = (inst: string, id: string, lastError: string, ctx: string) => ({
      id, idempotencyKey: id, institutionId: inst, platformId: `plat-${inst}`, contextId: ctx, lineItemRef: 'x', lmsUserId: 'lu', enaraAttemptId: `att-${id}`,
      scoreGiven: 1, scoreMaximum: 1, scoreTimestamp: new Date(), status: 'dead', attempts: 9, lastError, lastErrorAt: new Date(now - 30 * 24 * H),
    });
    await M.LmsGradeSyncJob.insertMany([job(A, 'j1', 'lineitem_gone', 'ctx-1'), job(A, 'j2', 'lineitem_gone', 'ctx-2'), job(B, 'j3', 'timeout', 'ctx-b'), { ...job(A, 'j4', 'timeout', 'ctx-1'), status: 'sent' }]);
    await M.LmsContext.insertMany([
      { id: 'ctx-r-a', platformId: 'plat-a1', institutionId: A, externalContextId: 'c1', rosterSync: { outcome: 'failed', lastErrorCode: 'nrps_not_allowed', lastErrorAt: new Date(now - H) } },
      { id: 'ctx-r-a-ok', platformId: 'plat-a1', institutionId: A, externalContextId: 'c2', rosterSync: { outcome: 'ok' } },
      { id: 'ctx-r-b', platformId: 'plat-b1', institutionId: B, externalContextId: 'c3', rosterSync: { outcome: 'failed', lastErrorCode: 'no_class' } },
    ]);
  }
  beforeEach(seed);

  const get = (who: string | undefined, query: Record<string, string> = {}) => {
    const r = request(app).get('/api/lms/problems').query(query);
    return who ? r.set('Authorization', auth[who]) : r;
  };
  const find = (body: { problems: { code: string | null; event: string }[] }, code: string, event = 'lti.launch') => body.problems.find((p) => p.code === code && p.event === event) as Record<string, unknown> & { help: { known: boolean; en: { what: string; fix: string }; ar: { what: string; fix: string } } };

  it('permissions: ENARA admins and school admins; teachers, academic managers, students: 403; signed out: 401', async () => {
    expect((await get('enara')).status).toBe(200);
    expect((await get('adminA')).status).toBe(200);
    for (const who of ['teacherA', 'managerA', 'studentA']) expect((await get(who)).status, who).toBe(403);
    expect((await get(undefined)).status).toBe(401);
    expect((await get('enara', { days: '3' })).status).toBe(400);
    expect((await get('enara', { days: 'abc' })).status).toBe(400);
  });

  it('school isolation: a school admin sees their own school only, even when asking for another', async () => {
    for (const q of [{}, { institutionId: B }]) {
      const r = await get('adminA', q);
      expect(r.status).toBe(200);
      expect(r.body.institutionId).toBe(A);
      const text = JSON.stringify(r.body);
      expect(text).not.toContain('plat-b1');
      expect(text).not.toContain('ctx-b');
      expect(text).not.toContain('unknown_platform');
      expect(r.body.problems.every((p: { institutionIds?: unknown }) => p.institutionIds === undefined)).toBe(true);
      expect(r.body.open.deadGradeJobs.map((d: { code: string }) => d.code)).toEqual(['lineitem_gone']);
      expect(r.body.open.failedRosterSyncs.map((d: { code: string }) => d.code)).toEqual(['nrps_not_allowed']);
    }
    const b = await get('adminB');
    expect(JSON.stringify(b.body)).not.toContain('plat-a1');
    expect(find(b.body, 'memberships_http_403', 'roster.sync')).toBeTruthy();
  });

  it('ENARA admins: every school (and rows without a school), or one school with ?institutionId=', async () => {
    const all = await get('enara');
    expect(all.body.institutionId).toBeNull();
    expect(find(all.body, 'unknown_platform', 'lti.login')).toBeTruthy();
    const si = find(all.body, 'state_invalid');
    expect(si.count).toBe(4);
    expect(new Set(si.institutionIds as string[])).toEqual(new Set([A, B]));
    expect(all.body.open.deadGradeJobs.map((d: { code: string }) => d.code).sort()).toEqual(['lineitem_gone', 'timeout']);
    const onlyB = await get('enara', { institutionId: B });
    expect(onlyB.body.institutionId).toBe(B);
    expect(find(onlyB.body, 'state_invalid').count).toBe(1);
    expect(JSON.stringify(onlyB.body)).not.toContain('plat-a1');
  });

  it('grouping and counts: by code and event, fail vs warn, first/last seen, IDs capped, the 24 h and 7 day windows', async () => {
    const day = (await get('adminA', { days: '1' })).body;
    expect(day.days).toBe(1);
    const si = find(day, 'state_invalid');
    expect(si).toMatchObject({ count: 3, failCount: 3, warnCount: 0, severity: 'fail', area: 'launch', platformIds: ['plat-a1', 'plat-a2'], platformCount: 2, contextIds: ['ctx-1', 'ctx-2'], contextCount: 2 });
    expect(new Date(si.lastSeen as string).getTime()).toBe(now - 1 * H);
    expect(new Date(si.firstSeen as string).getTime()).toBe(now - 3 * H);
    expect(find(day, 'cookieless')).toMatchObject({ count: 2, severity: 'warn', warnCount: 2 });
    expect(find(day, 'score_http_403', 'grade.failed')).toBeUndefined();
    const many = find(day, 'jwks_unavailable');
    expect(many).toMatchObject({ count: 12, platformCount: 12 });
    expect((many.platformIds as string[]).length).toBe(10);
    // ok rows are never problems.
    expect(day.problems.every((p: { failCount: number; warnCount: number }) => p.failCount + p.warnCount > 0)).toBe(true);

    const week = (await get('adminA', { days: '7' })).body;
    expect(find(week, 'cookieless').count).toBe(3);
    const grade = find(week, 'score_http_403', 'grade.failed');
    expect(grade).toMatchObject({ count: 1, area: 'grades' });
    expect(grade.help.en.what).toContain('HTTP 403');
    expect(grade.help.ar.what).toContain('HTTP 403');
    expect(find(week, 'invalid_signature')).toBeUndefined();
  });

  it('every row has its explanation and fix in English and Arabic; registration duplicate says "already connected"; unknown codes get a generic text with the code', async () => {
    const week = (await get('adminA', { days: '7' })).body;
    for (const p of [...week.problems, ...week.open.deadGradeJobs, ...week.open.failedRosterSyncs]) {
      for (const lang of ['en', 'ar']) {
        expect(p.help[lang].what.length, `${p.code} ${lang}`).toBeGreaterThan(10);
        expect(p.help[lang].fix.length, `${p.code} ${lang}`).toBeGreaterThan(5);
      }
    }
    const dup = find(week, 'duplicate_lms', 'registration.complete');
    expect(dup).toMatchObject({ area: 'registration' });
    expect(dup.help.known).toBe(true);
    expect(dup.help.en.what).toMatch(/already connected/i);
    expect(dup.help.ar.what).toContain('متصل بالفعل');
    const unknown = find(week, 'weird_new_code', 'test_ws.call');
    expect(unknown.help.known).toBe(false);
    expect(unknown.help.en.what).toContain('weird_new_code');
    expect(unknown.help.ar.what).toContain('weird_new_code');
    expect(week.open.deadGradeJobs[0]).toMatchObject({ code: 'lineitem_gone', count: 2, contextIds: ['ctx-1', 'ctx-2'] });
    expect(week.open.deadGradeJobs[0].help.known).toBe(true);
  });

  it('no names or emails, only IDs and codes', async () => {
    const r = await get('enara', { days: '7' });
    expect(JSON.stringify(r.body)).not.toMatch(/Layla|Hassan|@school\.example|@staff1b\.test/);
  });

  it('LMS off: the normal 404', async () => {
    setLmsEnv({});
    try {
      expect((await get('enara')).status).toBe(404);
    } finally {
      setLmsEnv(ON);
    }
  });
});

describe('Problems texts table', () => {
  it('covers every LTI error code and the required grade/roster/registration/binding codes, in both languages', async () => {
    const { LTI_ERRORS } = await import('../../src/integrations/lms/adapters/lti13/errors');
    const { helpFor, knownProblemCodes } = await import('../../src/integrations/lms/core/problemHelp');
    const known = new Set(knownProblemCodes());
    const required = [
      ...Object.keys(LTI_ERRORS),
      'registration.duplicate_lms', 'identity_suppressed', 'lms_role_not_supported', 'role_not_supported', 'storage_unavailable', 'storage_mismatch', 'cookieless',
      'lineitem_gone', 'no_line_item', 'not_eligible', 'timeout', 'network', 'no_token_url', 'platform_not_active',
      'no_memberships_url', 'nrps_not_allowed', 'no_class', 'empty_roster', 'roster_truncated', 'staff_as_learner', 'account_error',
      'launch_token_used', 'handoff_code_used', 'account_unavailable', 'over_seat_limit', 'seat_limit_reached',
    ];
    for (const code of required) expect(known.has(code), code).toBe(true);
    const arabic = /[؀-ۿ]/;
    const easternDigits = /[٠-٩۰-۹]/;
    for (const code of known) {
      const h = helpFor(code, code.includes('.') ? code.split('.')[0] : undefined);
      expect(h.known, code).toBe(true);
      for (const t of [h.en.what, h.en.fix, h.ar.what, h.ar.fix]) expect(t.trim().length, code).toBeGreaterThan(5);
      expect(arabic.test(h.ar.what) && arabic.test(h.ar.fix), `${code} ar`).toBe(true);
      expect(arabic.test(h.en.what) || arabic.test(h.en.fix), `${code} en`).toBe(false);
      expect(easternDigits.test(h.ar.what + h.ar.fix), `${code} digits`).toBe(false);
    }
    // HTTP families and the event-area lookup.
    expect(helpFor('memberships_http_503').en.what).toContain('HTTP 503');
    expect(helpFor('token_http_401').known).toBe(true);
    expect(helpFor('duplicate_lms', 'registration.complete').known).toBe(true);
    expect(helpFor('duplicate_lms').known).toBe(false);
  });
});

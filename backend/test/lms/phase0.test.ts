import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SignJWT, createLocalJWKSet, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseLmsConfig, resetConfigForTests } from '../../src/config/env';

// LMS Phase 0 (docs/lms/IMPLEMENTATION_PLAN.md): config and flags, KEK
// encryption, role map, presets/registry/capabilities, models, the index
// migration, signing keys + JWKS, locks, audit sanitising, and that every
// LMS route is inert with the flags off.

const KEK = randomBytes(32).toString('base64');
const KEK2 = randomBytes(32).toString('base64');
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_DRAIN_TRIGGERS'];

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

let mongo: MongoMemoryServer;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL']) delete process.env[k];
  setLmsEnv({ LMS_KEK: KEK });
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  setLmsEnv({});
  await mongoose.disconnect();
  await mongo.stop();
});

describe('config and flags', () => {
  it('everything is off by default and an unset LMS needs nothing', () => {
    const c = parseLmsConfig({});
    expect(c).toMatchObject({ ltiEnabled: false, googleClassroomEnabled: false, gradePassbackEnabled: false, problem: undefined });
    expect(c.drainTriggers).toEqual(['inline', 'piggyback', 'targeted', 'daily']);
  });
  it('a malformed KEK, or a flag on without a KEK or base URL, is a problem (named, never echoed)', () => {
    const bad = parseLmsConfig({ LMS_KEK: 'c2hvcnQ=' });
    expect(bad.problem).toMatch(/LMS_KEK must be 32 random bytes/);
    expect(bad.problem).not.toContain('c2hvcnQ');
    expect(bad.kek).toBeUndefined();
    expect(parseLmsConfig({ LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: 'https://test.enara.app' }).problem).toMatch(/LMS_KEK is required/);
    expect(parseLmsConfig({ LMS_LTI_ENABLED: 'true', LMS_KEK: KEK }).problem).toMatch(/LMS_TOOL_BASE_URL is required/);
    expect(parseLmsConfig({ LMS_TOOL_BASE_URL: 'http://evil.example' }).problem).toMatch(/https origin/);
    expect(parseLmsConfig({ LMS_DRAIN_TRIGGERS: 'inline,every_second' }).problem).toMatch(/unknown trigger/);
  });
  it('a valid setup has no problem; the base URL is normalised to its origin', () => {
    const c = parseLmsConfig({ LMS_LTI_ENABLED: 'true', LMS_KEK: KEK, LMS_TOOL_BASE_URL: 'https://test.enara.app/some/path', LMS_DRAIN_TRIGGERS: 'inline,daily,cron' });
    expect(c.problem).toBeUndefined();
    expect(c.toolBaseUrl).toBe('https://test.enara.app');
    expect(c.kek?.length).toBe(32);
    expect(c.drainTriggers).toEqual(['inline', 'daily', 'cron']);
  });
  it('effective flags are off whenever the config has a problem', async () => {
    const { lmsFlags } = await import('../../src/integrations/lms/core/flags');
    setLmsEnv({ LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: 'https://test.enara.app', LMS_KEK: 'bm90LTMyLWJ5dGVz' });
    expect(lmsFlags()).toMatchObject({ lti: false });
    setLmsEnv({ LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: 'https://test.enara.app', LMS_KEK: KEK });
    expect(lmsFlags()).toMatchObject({ lti: true, googleClassroom: false, gradePassback: false });
    setLmsEnv({ LMS_KEK: KEK });
  });
});

describe('KEK encryption (AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', async () => {
    const { encryptSecret, decryptSecret } = await import('../../src/integrations/lms/core/crypto');
    const ct = encryptSecret('refresh-token-value', 'google_connections:g1');
    expect(ct.startsWith('lk1.')).toBe(true);
    expect(ct).not.toContain('refresh-token-value');
    expect(decryptSecret(ct, 'google_connections:g1')).toBe('refresh-token-value');
    expect(encryptSecret('same', 'a')).not.toBe(encryptSecret('same', 'a')); // fresh IV
  });
  it('rejects tampering, a different record (AAD), and an unknown key', async () => {
    const { encryptSecret, decryptSecret } = await import('../../src/integrations/lms/core/crypto');
    const ct = encryptSecret('secret', 'lms_tool_keys:k1');
    const parts = ct.split('.');
    const flipped = Buffer.from(parts[4], 'base64url');
    flipped[0] ^= 1;
    expect(() => decryptSecret([...parts.slice(0, 4), flipped.toString('base64url')].join('.'), 'lms_tool_keys:k1')).toThrow(/Decryption failed/);
    expect(() => decryptSecret(ct, 'lms_tool_keys:k2')).toThrow(/Decryption failed/);
    expect(() => decryptSecret('garbage', 'x')).toThrow(/Unrecognised/);
    setLmsEnv({ LMS_KEK: KEK2 });
    expect(() => decryptSecret(ct, 'lms_tool_keys:k1')).toThrow(/unknown key/);
    setLmsEnv({ LMS_KEK: KEK });
  });
  it('rotation: LMS_KEK_PREVIOUS still decrypts and flags re-encryption', async () => {
    const { encryptSecret, decryptSecret, needsReencrypt } = await import('../../src/integrations/lms/core/crypto');
    const old = encryptSecret('v', 'r');
    setLmsEnv({ LMS_KEK: KEK2, LMS_KEK_PREVIOUS: KEK });
    expect(decryptSecret(old, 'r')).toBe('v');
    expect(needsReencrypt(old)).toBe(true);
    expect(needsReencrypt(encryptSecret('v', 'r'))).toBe(false);
    setLmsEnv({ LMS_KEK: KEK });
  });
  it('refuses to work without a KEK', async () => {
    const { encryptSecret } = await import('../../src/integrations/lms/core/crypto');
    setLmsEnv({});
    expect(() => encryptSecret('x', 'y')).toThrow(/LMS_KEK is not set/);
    setLmsEnv({ LMS_KEK: KEK });
  });
});

describe('role map (Spec §5.4)', () => {
  const M = 'http://purl.imsglobal.org/vocab/lis/v2/membership#';
  it('maps the standard roles, with the highest winning', async () => {
    const { mapLtiRoles } = await import('../../src/integrations/lms/core/roleMap');
    expect(mapLtiRoles([`${M}Learner`]).role).toBe('student');
    expect(mapLtiRoles([`${M}Instructor`]).role).toBe('teacher');
    expect(mapLtiRoles([`${M}ContentDeveloper`]).role).toBe('teacher');
    expect(mapLtiRoles(['http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant']).role).toBe('teacher');
    expect(mapLtiRoles(['http://purl.imsglobal.org/vocab/lis/v2/membership/Learner#NonCreditLearner']).role).toBe('student');
    expect(mapLtiRoles([`${M}Learner`, `${M}Instructor`]).role).toBe('teacher');
    expect(mapLtiRoles(['Instructor']).role).toBe('teacher');
  });
  it('Administrator is admin only when the platform allows it, else teacher', async () => {
    const { mapLtiRoles } = await import('../../src/integrations/lms/core/roleMap');
    const inst = 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator';
    expect(mapLtiRoles([inst])).toEqual({ role: 'teacher', warnings: ['admin_downgraded'] });
    expect(mapLtiRoles([inst], { allowAdminRole: true }).role).toBe('admin');
  });
  it('Mentor is an observer (logged, never linked); unknown and missing roles are student with a warning', async () => {
    const { mapLtiRoles } = await import('../../src/integrations/lms/core/roleMap');
    expect(mapLtiRoles([`${M}Mentor`])).toEqual({ role: 'observer', warnings: ['observer_ignored'] });
    expect(mapLtiRoles([`${M}Mentor`, `${M}Learner`]).role).toBe('student');
    expect(mapLtiRoles(['urn:custom:Wizard'])).toEqual({ role: 'student', warnings: ['unknown_roles'] });
    expect(mapLtiRoles([])).toEqual({ role: 'student', warnings: ['no_roles'] });
    expect(mapLtiRoles('not-an-array')).toEqual({ role: 'student', warnings: ['no_roles'] });
  });
  it('per-platform overrides win', async () => {
    const { mapLtiRoles } = await import('../../src/integrations/lms/core/roleMap');
    expect(mapLtiRoles(['urn:custom:Wizard'], { overrides: { 'urn:custom:Wizard': 'teacher' } })).toEqual({ role: 'teacher', warnings: [] });
  });
});

describe('presets, registry, capabilities', () => {
  it('release 1 ships moodle and generic presets only', async () => {
    const { listPresets, isKnownVendor } = await import('../../src/integrations/lms/presets');
    expect(listPresets().map((p) => p.id).sort()).toEqual(['generic', 'moodle']);
    expect(isKnownVendor('moodle')).toBe(true);
    expect(isKnownVendor('canvas')).toBe(false);
  });
  it('the registry has only the built-in adapters (lti13 since Phase 1a) and refuses duplicates', async () => {
    const { listProviders, registerProvider, resetProvidersForTests, getProvider } = await import('../../src/integrations/lms/registry');
    expect(listProviders().map((p) => p.kind)).toEqual(['lti13']);
    const fake = { kind: 'contract_fake', capabilities: () => ({ launch: false, roster: false, grades: false, deepLinking: false, lineItemCreate: false, submissionReview: false }) };
    registerProvider(fake);
    expect(getProvider('contract_fake')).toBe(fake);
    expect(() => registerProvider(fake)).toThrow(/registered twice/);
    resetProvidersForTests();
    expect(listProviders().map((p) => p.kind)).toEqual(['lti13']);
  });
  it('capabilities = preset ceiling narrowed by granted scopes', async () => {
    const { resolveCapabilities, AGS_SCOPE, NRPS_SCOPE } = await import('../../src/integrations/lms/core/capabilities');
    const { getPreset } = await import('../../src/integrations/lms/presets');
    const moodle = getPreset('moodle')!;
    expect(resolveCapabilities(moodle, {})).toMatchObject({ launch: true, roster: false, grades: false, lineItemCreate: false });
    expect(resolveCapabilities(moodle, { scopes: [AGS_SCOPE.score, AGS_SCOPE.lineItem, NRPS_SCOPE] })).toMatchObject({ roster: true, grades: true, lineItemCreate: true });
    expect(resolveCapabilities(moodle, { deepLinking: false }).deepLinking).toBe(false);
  });
});

describe('models', () => {
  it('every school-owned record requires institutionId', async () => {
    const m = await import('../../src/integrations/lms/models');
    const tooWide = new Set(['lms_tool_keys', 'lms_locks', 'lms_audit_log']);
    for (const model of m.LMS_MODELS) {
      const name = model.collection.name;
      const path = model.schema.path('institutionId') as { isRequired?: boolean } | undefined;
      if (tooWide.has(name)) continue;
      expect(path?.isRequired, name).toBe(true);
    }
    expect(m.LMS_MODELS).toHaveLength(14);
  });
  it('a platform needs a known vendor preset', async () => {
    const { LmsPlatform } = await import('../../src/integrations/lms/models');
    const base = { institutionId: 'org1', provider: 'lti13', issuer: 'https://moodle.test', clientId: 'c1', registeredVia: 'manual' };
    expect(new LmsPlatform({ ...base, vendor: 'moodle' }).validateSync()).toBeUndefined();
    expect(new LmsPlatform({ ...base, vendor: 'canvas' }).validateSync()?.errors.vendor).toBeDefined();
    expect(new LmsPlatform({ ...base, vendor: 'moodle', institutionId: undefined }).validateSync()?.errors.institutionId).toBeDefined();
  });
});

describe('index migration', () => {
  it('creates all 14 collections and their key indexes, and is safe to run twice', async () => {
    const { MIGRATIONS } = await import('../../src/migrations');
    const mig = MIGRATIONS.find((x) => x.id === '2026-11-16-lms-phase0-indexes')!;
    expect(mig).toBeDefined();
    await mig.up();
    await mig.up();
    const names = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name);
    const { LMS_MODELS } = await import('../../src/integrations/lms/models');
    for (const model of LMS_MODELS) expect(names).toContain(model.collection.name);
    const jobIdx = await mongoose.connection.db!.collection('lms_grade_sync_jobs').indexes();
    expect(jobIdx.some((i) => i.key.idempotencyKey === 1 && i.unique)).toBe(true);
    const ttl = await mongoose.connection.db!.collection('lms_oidc_state').indexes();
    expect(ttl.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
  });
});

describe('signing keys and JWKS', () => {
  beforeEach(async () => {
    const { LmsToolKey } = await import('../../src/integrations/lms/models');
    await LmsToolKey.deleteMany({});
    await LmsToolKey.createIndexes();
  });

  it('10 simultaneous first requests create exactly one active key', async () => {
    const { ensureActiveKey } = await import('../../src/integrations/lms/core/keys');
    const { LmsToolKey } = await import('../../src/integrations/lms/models');
    const kids = await Promise.all(Array.from({ length: 10 }, () => ensureActiveKey()));
    expect(new Set(kids).size).toBe(1);
    expect(await LmsToolKey.countDocuments({ status: 'active' })).toBe(1);
  });

  it('the private key is stored encrypted and the JWKS has no private parts', async () => {
    const { ensureActiveKey, getPublicJwks } = await import('../../src/integrations/lms/core/keys');
    const { LmsToolKey } = await import('../../src/integrations/lms/models');
    const kid = await ensureActiveKey();
    const raw = await mongoose.connection.db!.collection('lms_tool_keys').findOne({ kid });
    expect(String(raw!.privateKeyEnc).startsWith('lk1.')).toBe(true);
    expect(JSON.stringify(raw)).not.toMatch(/PRIVATE KEY/);
    expect((await LmsToolKey.findOne({ kid }).lean())!.privateKeyEnc).toBeUndefined(); // not selected by default
    const jwks = await getPublicJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', kid, alg: 'RS256', use: 'sig', e: 'AQAB' });
    for (const priv of ['d', 'p', 'q', 'dp', 'dq', 'qi']) expect(jwks.keys[0]).not.toHaveProperty(priv);
    expect(Buffer.from(jwks.keys[0].n!, 'base64url').length).toBe(256); // RSA-2048
  });

  it('a token signed with the active key verifies against the published JWKS', async () => {
    const { getSigningKey, getPublicJwks } = await import('../../src/integrations/lms/core/keys');
    const { kid, key } = await getSigningKey();
    const jwt = await new SignJWT({ hello: 'lms' }).setProtectedHeader({ alg: 'RS256', kid }).setIssuer('https://test.enara.app').setIssuedAt().setExpirationTime('5m').sign(key);
    const { payload } = await jwtVerify(jwt, createLocalJWKSet(await getPublicJwks()), { issuer: 'https://test.enara.app' });
    expect(payload.hello).toBe('lms');
  });

  it('rotation: next is published alongside active; after promotion the old key is retired and unpublished', async () => {
    const { ensureActiveKey, createNextKey, promoteNextKey, getPublicJwks } = await import('../../src/integrations/lms/core/keys');
    const first = await ensureActiveKey();
    const next = await createNextKey();
    expect(await createNextKey()).toBe(next); // idempotent
    expect((await getPublicJwks()).keys.map((k) => k.kid).sort()).toEqual([first, next].sort());
    expect(await promoteNextKey()).toBe(next);
    expect((await getPublicJwks()).keys.map((k) => k.kid)).toEqual([next]);
    await expect(promoteNextKey()).rejects.toThrow(/No next key/);
  });

  it('a key encrypted under another KEK cannot be used', async () => {
    const { ensureActiveKey, getSigningKey } = await import('../../src/integrations/lms/core/keys');
    await ensureActiveKey();
    setLmsEnv({ LMS_KEK: KEK2 });
    await expect(getSigningKey()).rejects.toThrow(/unknown key/);
    setLmsEnv({ LMS_KEK: KEK });
  });
});

describe('locks and audit', () => {
  it('a lock is held by one caller until it expires', async () => {
    const { tryLock, releaseLock } = await import('../../src/integrations/lms/core/locks');
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => tryLock('drain-test', 60_000, `o${i}`)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await tryLock('short', 1, 'a')).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(await tryLock('short', 60_000, 'b')).toBe(true);
    await releaseLock('short', 'b');
    expect(await tryLock('short', 60_000, 'c')).toBe(true);
  });

  it('audit rows keep IDs and drop personal data', async () => {
    const { writeLmsAudit, sanitizeRefIds } = await import('../../src/integrations/lms/core/audit');
    const { LmsAuditLog } = await import('../../src/integrations/lms/models');
    expect(sanitizeRefIds({ platformId: 'p1', email: 'a@b.c', givenName: 'Omar', attempts: 2, nested: { x: 1 }, comment: 'hi' })).toEqual({ platformId: 'p1', attempts: 2 });
    await writeLmsAudit({ event: 'launch', outcome: 'fail', institutionId: 'org1', refIds: { deploymentId: 'd1', email: 'x@y.z' }, code: 'unknown_deployment' });
    const row = await LmsAuditLog.findOne({ event: 'launch' }).lean();
    expect(row).toMatchObject({ outcome: 'fail', institutionId: 'org1', code: 'unknown_deployment', refIds: { deploymentId: 'd1' } });
  });
});

describe('HTTP: inert with the flags off', () => {
  async function app() {
    return (await import('../../src/app')).createApp();
  }

  it('flags off: /lti/jwks and /.well-known/jwks.json are 404 and create no key', async () => {
    const { LmsToolKey } = await import('../../src/integrations/lms/models');
    await LmsToolKey.deleteMany({});
    setLmsEnv({ LMS_KEK: KEK });
    const a = await app();
    expect((await request(a).get('/lti/jwks')).status).toBe(404);
    expect((await request(a).get('/.well-known/jwks.json')).status).toBe(404);
    expect(await LmsToolKey.countDocuments()).toBe(0);
  }, 60_000); // the first import of the whole app is slow on a loaded machine

  it('flag on with a broken KEK: still 404', async () => {
    setLmsEnv({ LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: 'https://test.enara.app', LMS_KEK: 'YnJva2Vu' });
    expect((await request(await app()).get('/lti/jwks')).status).toBe(404);
  });

  it('flag on: both URLs serve the same valid public JWKS', async () => {
    setLmsEnv({ LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: 'https://test.enara.app', LMS_KEK: KEK });
    const a = await app();
    const r1 = await request(a).get('/lti/jwks');
    const r2 = await request(a).get('/.well-known/jwks.json');
    expect(r1.status).toBe(200);
    expect(r1.headers['content-type']).toMatch(/application\/json/);
    expect(r1.headers['cache-control']).toBe('public, max-age=300');
    expect(r1.body.keys).toHaveLength(1);
    expect(r1.body.keys[0]).not.toHaveProperty('d');
    expect(r2.body).toEqual(r1.body);
    setLmsEnv({ LMS_KEK: KEK });
  });
});

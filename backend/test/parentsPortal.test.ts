import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ageOn, canDo, controlsModeFor, tierOf, transcriptExpired, visibilityFor, visibilityNotice, wordingFor } from '../src/parents/policy';
import { computeLevel, formOutcomes, subLevelName, checkpointLevel } from '../src/parents/levels';
import { CODE_ALPHABET, generateCode, hashCode, normalizeCode } from '../src/parents/codes';
import { cairoDay, weekDays, weekStartDay, weekdayOf } from '../src/parents/time';
import { methodWords } from '../src/parents/service';

// Parents Portal MVP: policy (tier wording/controls, full visibility for every
// age once linked), link codes (school admin issues, parent redeems), access
// control, 90-day transcript retention, mock flagging, on-demand sharing.
// Email is mocked: no Resend calls.

const mail = vi.hoisted(() => ({ send: vi.fn(async () => ({ ok: true as const, id: 'mock-email-id' })) }));
vi.mock('../src/email/sendTemplate', async (orig) => ({ ...(await orig<object>()), sendTemplate: mail.send }));

// "Continue with Google": verifyIdToken is mocked (no calls to Google). A token
// is a key into G_TOKENS; the mock checks the audience like the real library.
const GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const g = vi.hoisted(() => ({ tokens: {} as Record<string, Record<string, unknown>>, verify: vi.fn() }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken(opts: { idToken: string; audience: string }) { return g.verify(opts); }
  },
}));
g.verify.mockImplementation(async ({ idToken, audience }: { idToken: string; audience: string }) => {
  const p = g.tokens[idToken];
  if (!p) throw new Error('Invalid token signature');
  if (p.aud !== audience) throw new Error('Wrong recipient, payload audience != requiredAudience');
  return { getPayload: () => p };
});
const gTok = (key: string, over: Record<string, unknown> = {}) => {
  g.tokens[key] = { iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, sub: `sub-${key}`, email: `${key}@gmail.test`, email_verified: true, name: `G ${key}`, ...over };
  return key;
};

const NOW = new Date('2026-11-16T12:00:00Z'); // Monday in Cairo

describe('policy', () => {
  it('birth date wins over the age band; under 13 = kid', () => {
    expect(tierOf({ birthDate: new Date('2016-03-01'), learnerAgeBand: 'adult' }, NOW)).toMatchObject({ tier: 'kid', source: 'birth_date', age: 10 });
    expect(tierOf({ birthDate: new Date('2013-11-16'), learnerAgeBand: 'child' }, NOW)).toMatchObject({ tier: '13plus', source: 'birth_date', age: 13 });
    expect(tierOf({ birthDate: new Date('2013-11-17') }, NOW).tier).toBe('kid'); // the day before the 13th birthday
  });
  it('age band: child -> kid, teen/adult -> 13plus, unknown -> 13plus default', () => {
    expect(tierOf({ learnerAgeBand: 'child' })).toEqual({ tier: 'kid', source: 'age_band' });
    expect(tierOf({ learnerAgeBand: 'teen' }).tier).toBe('13plus');
    expect(tierOf({ learnerAgeBand: 'adult' }).tier).toBe('13plus');
    expect(tierOf({ learnerAgeBand: 'Child' })).toEqual({ tier: '13plus', source: 'unknown_default' });
    expect(tierOf({})).toEqual({ tier: '13plus', source: 'unknown_default' });
    expect(ageOn(new Date('2006-01-01'), NOW)).toBe(20);
  });
  it('visibility: everything for every tier with an active link, nothing otherwise', () => {
    for (const tier of ['kid', '13plus'] as const) {
      expect(visibilityFor({ status: 'active' }, tier)).toEqual({ summaries: true, progress: true, transcripts: true, audio: true, alertExcerpts: true });
      expect(Object.values(visibilityFor({ status: 'pending' }, tier)).some(Boolean)).toBe(false);
    }
    expect(Object.values(visibilityFor(null)).some(Boolean)).toBe(false);
  });
  it('roles: view reads only; full also controls and shares; owner manages guardians and billing; pending nothing', () => {
    expect(canDo({ status: 'active', role: 'view' }, 'read')).toBe(true);
    expect(canDo({ status: 'active', role: 'view' }, 'change_controls')).toBe(false);
    expect(canDo({ status: 'active', role: 'full' }, 'share_report')).toBe(true);
    expect(canDo({ status: 'active', role: 'full' }, 'manage_billing')).toBe(false);
    expect(canDo({ status: 'active', role: 'owner' }, 'manage_guardians')).toBe(true);
    expect(canDo({ status: 'pending', role: 'owner' }, 'read')).toBe(false);
  });
  it('tiers only change wording and controls', () => {
    expect(controlsModeFor('kid')).toBe('parent_sets');
    expect(controlsModeFor('13plus')).toBe('co_set');
    expect(wordingFor('kid').viewNotice).toBe('kid_full');
    expect(wordingFor('13plus')).toMatchObject({ viewNotice: 'teen_full_transparent', controlsNote: 'learner_accepts' });
  });
  it('learner notice says the parent sees conversations; 13+ are told settings are suggestions', () => {
    const n = visibilityNotice('13plus', [{ name: 'Mona', role: 'owner' }]);
    expect(n.canSee).toContain('conversations_transcripts');
    expect(n.message.en).toMatch(/full conversations/);
    expect(n.message.en).toMatch(/suggestion/);
    expect(visibilityNotice('kid', [{ name: 'Mona', role: 'owner' }]).message.en).not.toMatch(/suggestion/);
  });
  it('90-day retention', () => {
    expect(transcriptExpired(new Date(NOW.getTime() - 89 * 86_400_000), NOW)).toBe(false);
    expect(transcriptExpired(new Date(NOW.getTime() - 91 * 86_400_000), NOW)).toBe(true);
  });
});

describe('levels, codes, time', () => {
  it('sub-level halves, Pre-A1 steps, level-up needs 80% plus a passed checkpoint', () => {
    expect(subLevelName('A1', 49)).toBe('A1.1');
    expect(subLevelName('A1', 50)).toBe('A1.2');
    expect(subLevelName('Pre-A1', 70)).toBe('Pre-A1 step 3 of 3');
    const a1 = formOutcomes('A1').map((o) => o.id);
    expect(a1.length).toBeGreaterThan(0);
    expect(computeLevel(new Set(), new Set(), false)).toBeNull();
    const all = new Set(a1);
    expect(computeLevel(all, new Set(), true)).toMatchObject({ cefr: 'A1', subLevelPct: 100, subLevel: 'A1.2' });
    expect(computeLevel(all, new Set(['A1']), true)).toMatchObject({ cefr: 'A2', subLevelPct: 0, subLevel: 'A2.1' });
    expect(checkpointLevel('Unit 3 A1 checkpoint', 82)).toBe('A1');
    expect(checkpointLevel('Unit 3 A1 checkpoint', 40)).toBeNull();
  });
  it('codes: ENR-XXXX-XXXX (8 chars) without confusables, normalised input; old 6-char format is invalid', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c.display).toMatch(/^ENR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c.normalized).toHaveLength(8);
      expect([...c.normalized].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
      expect(c.normalized).not.toMatch(/[0O1IL]/);
    }
    expect(normalizeCode('enr-abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('ENR-ABCD-EFGH')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCDEFGH')).toBe('ABCDEFGH');
    expect(normalizeCode('abcd efgh')).toBe('ABCDEFGH');
    expect(normalizeCode('ENRABCDEFGH')).toBe('ABCDEFGH');
    expect(normalizeCode(' enr abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeCode('ENR-AB0D-EFGH')).toBeNull();
    expect(normalizeCode('ENR-ABCD-EFG')).toBeNull();
    // Old format (ENR-XXXX-XX): no longer valid.
    expect(normalizeCode('ENR-ABCD-EF')).toBeNull();
    expect(normalizeCode('ABCDEF')).toBeNull();
    expect(normalizeCode({})).toBeNull();
  });
  it('code input mask (frontend parents/codeFormat.ts)', async () => {
    const { formatCodeInput } = await import('../../frontend/parents/codeFormat');
    expect(formatCodeInput('')).toBe('');
    expect(formatCodeInput('a')).toBe('ENR-A');
    expect(formatCodeInput('ENR-ABCD')).toBe('ENR-ABCD');
    expect(formatCodeInput('ENR-ABCDE')).toBe('ENR-ABCD-E');
    expect(formatCodeInput('enr-abcd-efgh')).toBe('ENR-ABCD-EFGH');
    expect(formatCodeInput('abcdefgh')).toBe('ENR-ABCD-EFGH');
    expect(formatCodeInput('ENR ABCD EFGH')).toBe('ENR-ABCD-EFGH');
    expect(formatCodeInput('ENRXABCD')).toBe('ENR-ENRX-ABCD'); // a code that starts with ENR
    expect(formatCodeInput('ENR-ABCD-EFGHJK')).toBe('ENR-ABCD-EFGH');
    expect(formatCodeInput('ENR-')).toBe('');
  });
  it('weeks start on Saturday in Cairo time', () => {
    expect(weekStartDay(NOW)).toBe('2026-11-14');
    expect(weekdayOf(weekDays(NOW)[0])).toBe(6);
    expect(weekDays(NOW)).toHaveLength(7);
    // 23:30 UTC Friday is already Saturday in Cairo (UTC+2).
    expect(cairoDay(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21');
    expect(weekStartDay(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21');
  });
  it('teaching methods in parent words', () => {
    expect(methodWords('spaced_repetition').en).toBe('Spaced word review');
    expect(methodWords('some_new_method').en).toBe('Some new method');
  });
});

describe('login routing (frontend services/roleRouting.ts)', () => {
  it('a parent account opens only the parents area, from the Parents tab; other roles are unchanged', async () => {
    const rr = await import('../../frontend/services/roleRouting');
    expect(rr.uiRoleFor('parent', 'parent')).toBe('parent');
    for (const c of ['student', 'admin', 'enara-admin'] as const) expect(rr.uiRoleFor('parent', c)).toBeNull();
    for (const role of ['student', 'teacher', 'academic_manager', 'admin', 'enara-admin']) expect(rr.uiRoleFor(role, 'parent')).toBeNull();
    expect(rr.uiRoleFor('student', 'student')).toBe('student');
    expect(rr.uiRoleFor('teacher', 'admin')).toBe('admin');
    expect(rr.uiRoleFor('academic_manager', 'admin')).toBe('academic-manager');
    expect(rr.restoreUiRole('parent', 'parent')).toBe('parent');
    expect(rr.restoreUiRole('parent', 'admin')).toBeNull();
    expect(rr.restoreUiRole('student', 'parent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;
const tok: Record<string, string> = {};
const PW = 'parents-portal-test-password';

const as = (who: string) => ({
  get: (p: string) => request(app).get(p).set('Authorization', tok[who] ?? ''),
  post: (p: string, b: object = {}) => request(app).post(p).set('Authorization', tok[who] ?? '').send(b),
  put: (p: string, b: object = {}) => request(app).put(p).set('Authorization', tok[who] ?? '').send(b),
  del: (p: string) => request(app).delete(p).set('Authorization', tok[who] ?? ''),
});

async function issue(who: string, studentId: string): Promise<string> {
  const r = await as(who).post(`/api/students/${studentId}/parent-codes`);
  expect(r.status).toBe(201);
  return r.body.code;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    GOOGLE_CLIENT_ID,
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'Student', 'TutorSession', 'TutorMessage', 'StudentObjectiveMastery', 'ParentLinkCode', 'ParentLearnerLink', 'AuditEvent', 'SafetyAlert']) M[name] = (await import(`../src/models/${name}`))[name];
  const hash = bcrypt.hashSync(PW, 4);
  for (const inst of ['pp-A', 'pp-B']) {
    await M.Institution.create({ id: inst, name: `School ${inst}`, features: {} });
    for (const role of ['admin', 'teacher']) await M.User.create({ email: `${role}@${inst}.test`, password: hash, role, name: `${role} ${inst}`, status: 'active', institutionId: inst });
  }
  await M.User.create({ email: 'ea@enara.test', password: hash, role: 'enara-admin', name: 'ENARA admin', status: 'active' });
  // kid (age band child), teen (birth date), adult (age band), and a learner in school B.
  await M.Student.create({ id: 'kid1', name: 'Omar Hassan', email: 'kid1@pp-A.test', institutionId: 'pp-A', learnerAgeBand: 'child' });
  await M.Student.create({ id: 'teen1', name: 'Laila Mostafa', email: 'teen1@pp-A.test', institutionId: 'pp-A', birthDate: new Date('2011-05-02') });
  await M.Student.create({ id: 'adult1', name: 'Youssef Adel', email: 'adult1@pp-A.test', institutionId: 'pp-A', learnerAgeBand: 'adult' });
  await M.Student.create({ id: 'b1', name: 'Bassem Nabil', email: 'b1@pp-B.test', institutionId: 'pp-B' });
  for (const id of ['kid1', 'teen1']) await M.User.create({ email: `${id}@pp-A.test`, password: hash, role: 'student', name: id, status: 'active', institutionId: 'pp-A', studentId: id });

  // teen: one recent tutor session and one 100 days old.
  const now = Date.now();
  await M.TutorSession.create({ id: 'ts-recent', studentId: 'teen1', institutionId: 'pp-A', title: 'Debate practice', lessonTitle: 'Opinions', mode: 'chat', teachingMethod: 'socratic', lastMessageAt: new Date(now - 3600_000) });
  await M.TutorMessage.create({ id: 'm1', sessionId: 'ts-recent', studentId: 'teen1', institutionId: 'pp-A', role: 'user', text: 'I think uniforms are boring', timestamp: new Date(now - 20 * 60_000), meta: { teaching: { primary: 'spaced_repetition', objectiveResolution: 'x', decisionVersion: '1', registryVersion: '1' } } });
  await M.TutorMessage.create({ id: 'm2', sessionId: 'ts-recent', studentId: 'teen1', institutionId: 'pp-A', role: 'ai', text: 'Why do you think so?', timestamp: new Date(now - 3600_000) });
  await M.TutorSession.create({ id: 'ts-old', studentId: 'teen1', institutionId: 'pp-A', title: 'Old chat', mode: 'chat', lastMessageAt: new Date(now - 100 * 86_400_000) });
  await M.TutorMessage.create({ id: 'm3', sessionId: 'ts-old', studentId: 'teen1', institutionId: 'pp-A', role: 'user', text: 'old words', timestamp: new Date(now - 100 * 86_400_000) });
  // A real (non-beta) safety alert with an excerpt for the teen.
  await M.SafetyAlert.create({ id: 'sa1', studentId: 'teen1', institutionId: 'pp-A', category: 'personal_details', subtype: 'phone', actionTaken: 'Reminded not to share numbers', excerpt: 'call me on 01•••', detector: 'pattern', beta: false, reviewRequired: false, createdAt: new Date(now - 20 * 86_400_000) });
  await M.SafetyAlert.create({ id: 'sa2', studentId: 'teen1', institutionId: 'pp-A', category: 'distress', actionTaken: 'Flagged', excerpt: 'beta excerpt', detector: 'classifier', beta: true, reviewRequired: true, createdAt: new Date(now - 20 * 86_400_000) });
  // kid: mastery on every A1 form outcome -> real level, A1.2.
  for (const o of formOutcomes('A1')) await M.StudentObjectiveMastery.create({ studentId: 'kid1', objectiveId: o.id, masteryStatus: 'mastered', evidenceStrength: 'moderate', lastMasteryUpdateAt: new Date(), modelVersion: 't' });

  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  for (const inst of ['pp-A', 'pp-B']) for (const role of ['admin', 'teacher']) tok[`${role}@${inst}`] = await login(`${role}@${inst}.test`);
  tok.ea = await login('ea@enara.test');
  for (const id of ['kid1', 'teen1']) tok[id] = await login(`${id}@pp-A.test`);
  for (const p of ['p1', 'p2', 'p3', 'p4']) {
    const r = await request(app).post('/api/parents/register').send({ email: `${p}@parents.test`, password: PW, name: `Parent ${p}` });
    expect(r.status).toBe(201);
    tok[p] = `Bearer ${r.body.token}`;
  }
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('parent sign-up and login', () => {
  it('creates role parent only, never escalates', async () => {
    const u = await M.User.findOne({ email: 'p1@parents.test' }).lean();
    expect(u).toMatchObject({ role: 'parent' });
    expect(u.institutionId).toBeUndefined();
    expect((await request(app).post('/api/parents/register').send({ email: 'x@parents.test', password: PW, role: 'admin' })).status).toBe(403);
    expect((await request(app).post('/api/parents/register').send({ email: 'y@parents.test', password: PW, institutionId: 'pp-A' })).status).toBe(403);
    expect(await M.User.exists({ email: 'x@parents.test' })).toBeNull();
    const login = await request(app).post('/api/auth/login').send({ email: 'p1@parents.test', password: PW });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('parent');
  });
  it('a parent cannot use staff or student APIs', async () => {
    expect((await as('p1').get('/api/students')).status).toBe(403);
    expect((await as('p1').get('/api/me/dashboard')).status).toBeGreaterThanOrEqual(403);
  });
});

describe('continue with Google (parents)', () => {
  const google = (credential: unknown, extra: object = {}) => request(app).post('/api/parents/google').send({ credential, ...extra });
  it('auth-config exposes the public client ID when configured', async () => {
    const r = await request(app).get('/api/parents/auth-config');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ google: true, clientId: GOOGLE_CLIENT_ID });
  });
  it('a new Google user becomes a parent (never another role); the next sign-in matches on googleSub', async () => {
    const r = await google(gTok('newparent'), { language: 'ar', role: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(true);
    expect(r.body.user.role).toBe('parent');
    const u = await M.User.findOne({ email: 'newparent@gmail.test' }).lean();
    expect(u).toMatchObject({ role: 'parent', googleSub: 'sub-newparent', name: 'G newparent' });
    expect(u.institutionId).toBeUndefined();
    expect(await M.AuditEvent.exists({ action: 'parent_registered', targetId: String(u._id), 'detail.method': 'google' })).toBeTruthy();
    // Same session as a normal login: the token opens the parent API.
    expect((await request(app).get('/api/parents/learners').set('Authorization', `Bearer ${r.body.token}`)).status).toBe(200);
    // The Google email changed but the subject is the same: still the same account.
    gTok('newparent2', { sub: 'sub-newparent', email: 'renamed@gmail.test' });
    const again = await google('newparent2');
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);
    expect(again.body.user.id ?? again.body.user._id).toBe(r.body.user.id ?? r.body.user._id);
    expect(await M.User.countDocuments({ googleSub: 'sub-newparent' })).toBe(1);
    expect(await M.AuditEvent.exists({ action: 'parent_google_signin', targetId: String(u._id) })).toBeTruthy();
  });
  it('an existing email/password parent signs in with Google; googleSub is stored', async () => {
    const before = await M.User.findOne({ email: 'p2@parents.test' }).lean();
    const r = await google(gTok('p2g', { email: 'P2@parents.test' }));
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(false);
    expect(r.body.user.role).toBe('parent');
    const after = await M.User.findOne({ email: 'p2@parents.test' }).select('+password').lean();
    expect(String(after._id)).toBe(String(before._id));
    expect(after.googleSub).toBe('sub-p2g');
    // Email/password sign-in still works.
    expect((await request(app).post('/api/auth/login').send({ email: 'p2@parents.test', password: PW })).status).toBe(200);
    // A different Google account for the same parent is refused.
    expect((await google(gTok('p2other', { email: 'p2@parents.test' }))).status).toBe(403);
  });
  it('an email that belongs to a student, teacher or admin is refused with 403 and nothing changes', async () => {
    for (const email of ['kid1@pp-A.test', 'teacher@pp-A.test', 'admin@pp-A.test', 'ea@enara.test']) {
      const before = await M.User.findOne({ email }).lean();
      const r = await google(gTok(`np-${email}`, { email }));
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('GOOGLE_ACCOUNT_NOT_PARENT');
      expect(r.body.message).toMatch(/school account/);
      expect(r.body.token).toBeUndefined();
      const after = await M.User.findOne({ email }).lean();
      expect(after.role).toBe(before.role);
      expect(after.googleSub).toBeUndefined();
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    }
  });
  it('email_verified false -> 401, no account', async () => {
    const r = await google(gTok('unverified', { email_verified: false }));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
    expect(await M.User.exists({ email: 'unverified@gmail.test' })).toBeNull();
  });
  it('wrong audience, wrong issuer, invalid or missing token -> 401', async () => {
    for (const cred of [gTok('wrongaud', { aud: 'someone-else.apps.googleusercontent.com' }), gTok('wrongiss', { iss: 'evil.example' }), 'not-a-real-token', '', undefined, { $gt: '' }]) {
      const r = await google(cred);
      expect([400, 401]).toContain(r.status);
      if (typeof cred === 'string') expect(r.status).toBe(401);
    }
    expect(await M.User.exists({ email: { $in: ['wrongaud@gmail.test', 'wrongiss@gmail.test'] } })).toBeNull();
  });
  it('not configured -> 503 google_not_configured, and auth-config hides Google', async () => {
    const env = await import('../src/config/env');
    delete process.env.GOOGLE_CLIENT_ID;
    env.resetConfigForTests();
    try {
      expect((await request(app).get('/api/parents/auth-config')).body).toEqual({ google: false });
      const r = await google(gTok('nocfg'));
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('google_not_configured');
      expect(await M.User.exists({ email: 'nocfg@gmail.test' })).toBeNull();
    } finally {
      process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
      env.resetConfigForTests();
    }
  });
});

describe('link codes (school admin issues, parent redeems)', () => {
  it('only an admin of the learner\'s school (or ENARA admin) can create codes', async () => {
    expect((await as('admin@pp-B').post('/api/students/kid1/parent-codes')).status).toBe(403);
    expect((await as('teacher@pp-A').post('/api/students/kid1/parent-codes')).status).toBe(403);
    expect((await as('kid1').post('/api/students/kid1/parent-codes')).status).toBe(403);
    expect((await as('p1').post('/api/students/kid1/parent-codes')).status).toBe(403);
    expect((await as('ea').post('/api/students/b1/parent-codes')).status).toBe(201);
  });
  it('stores only a hash, and the list never shows the code', async () => {
    const code = await issue('admin@pp-A', 'kid1');
    const raw = code.replace(/^ENR-/, '').replace('-', '');
    const docs = await M.ParentLinkCode.find({ studentId: 'kid1' }).select('+codeHash').lean();
    expect(JSON.stringify(docs)).not.toContain(raw);
    expect(docs.some((d: { codeHash: string }) => d.codeHash === hashCode(raw))).toBe(true);
    const list = await as('admin@pp-A').get('/api/students/kid1/parent-codes');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(raw);
    expect((await as('admin@pp-B').get('/api/students/kid1/parent-codes')).status).toBe(403);
  });
  it('preview reveals only first name + last initial and school', async () => {
    const code = await issue('admin@pp-A', 'kid1');
    const r = await as('p1').post('/api/parents/link/preview', { code });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ learner: 'Omar H.', school: 'School pp-A' });
  });
  it('confirm creates an ACTIVE owner link; the code is single use; the next parent is full', async () => {
    const code = await issue('admin@pp-A', 'kid1');
    const r = await as('p1').post('/api/parents/link/confirm', { code: code.toLowerCase() });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ studentId: 'kid1', role: 'owner', status: 'active', consent: 'pending' });
    const again = await as('p2').post('/api/parents/link/confirm', { code });
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Code not valid or expired');
    const second = await as('p2').post('/api/parents/link/confirm', { code: await issue('admin@pp-A', 'kid1') });
    expect(second.body).toMatchObject({ role: 'full', status: 'active' });
    expect(await M.AuditEvent.exists({ action: 'parent_code_redeemed', targetId: 'kid1' })).toBeTruthy();
  });
  it('expired and revoked codes are refused with the same message', async () => {
    const code = await issue('admin@pp-A', 'adult1');
    await M.ParentLinkCode.updateOne({ studentId: 'adult1', status: 'active' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await as('p4').post('/api/parents/link/preview', { code });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Code not valid or expired');
    const code2 = await issue('admin@pp-A', 'adult1');
    const list = await as('admin@pp-A').get('/api/students/adult1/parent-codes');
    expect((await as('admin@pp-A').del(`/api/students/adult1/parent-codes/${list.body.codes[0].id}`)).status).toBe(200);
    expect((await as('p4').post('/api/parents/link/preview', { code: code2 })).body.message).toBe('Code not valid or expired');
  });
  it('5 wrong codes lock the parent account for 15 minutes', async () => {
    for (let i = 0; i < 5; i++) expect((await as('p3').post('/api/parents/link/preview', { code: 'ENR-ZZZZ-ZZZZ' })).status).toBe(400);
    const good = await issue('admin@pp-A', 'adult1');
    const locked = await as('p3').post('/api/parents/link/preview', { code: good });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('REDEEM_LOCKED');
  });
  it('teen: link is active on confirm and the learner is notified and sees the notice', async () => {
    const r = await as('p1').post('/api/parents/link/confirm', { code: await issue('admin@pp-A', 'teen1') });
    expect(r.body).toMatchObject({ status: 'active', consent: 'not_required' });
    const v = await as('teen1').get('/api/parents/learner/visibility');
    expect(v.status).toBe(200);
    expect(v.body.tier).toBe('13plus');
    expect(v.body.canSee).toContain('conversations_transcripts');
    expect(v.body.parents).toEqual([{ name: 'Parent p1', role: 'owner' }]);
    expect(v.body.notices).toHaveLength(1);
    await as('teen1').post('/api/parents/learner/visibility/read');
    expect((await as('teen1').get('/api/parents/learner/visibility')).body.notices).toHaveLength(0);
    expect((await as('p1').get('/api/parents/learner/visibility')).status).toBe(403);
  });
});

describe('access control', () => {
  it('no link / other parent -> 403 on every learner endpoint', async () => {
    for (const p of ['status', 'home', 'progress', 'activity', 'alerts', 'report', 'controls', 'sessions/ts-recent/transcript']) {
      expect((await as('p4').get(`/api/parents/learners/teen1/${p}`)).status).toBe(403);
    }
    // p2 is linked to kid1 only.
    expect((await as('p2').get('/api/parents/learners/teen1/home')).status).toBe(403);
    expect((await as('admin@pp-A').get('/api/parents/learners/teen1/home')).status).toBe(403);
  });
  it('a pending link sees nothing', async () => {
    await M.ParentLearnerLink.create({ id: 'pll-pending', parentUserId: String((await M.User.findOne({ email: 'p4@parents.test' }))._id), studentId: 'teen1', role: 'owner', status: 'pending' });
    expect((await as('p4').get('/api/parents/learners/teen1/home')).status).toBe(403);
    const list = await as('p4').get('/api/parents/learners');
    expect(list.body.learners).toEqual([]);
    expect(list.body.pending).toEqual([{ linkId: 'pll-pending', status: 'pending', createdAt: expect.any(String) }]);
    expect(JSON.stringify(list.body)).not.toContain('Laila');
    await M.ParentLearnerLink.deleteOne({ id: 'pll-pending' });
  });
  it('active link: 13+ transcripts and alert excerpts are returned (visibility decision)', async () => {
    const t = await as('p1').get('/api/parents/learners/teen1/sessions/ts-recent/transcript');
    expect(t.status).toBe(200);
    expect(t.body.learner.tier).toBe('13plus');
    expect(t.body.messages.map((m: { from: string; text: string }) => [m.from, m.text])).toEqual([['enara', 'Why do you think so?'], ['learner', 'I think uniforms are boring']]);
    expect(JSON.stringify(t.body)).not.toContain('spaced_repetition');
    expect(t.body.audio).toEqual({ available: false });
    const a = await as('p1').get('/api/parents/learners/teen1/alerts');
    expect(a.body.alerts.mock).toBe(false);
    expect(a.body.alerts.items).toHaveLength(1); // beta alert awaiting review is held back
    expect(a.body.alerts.items[0]).toMatchObject({ category: 'personal_details', excerpt: 'call me on 01•••' });
  });
  it('transcripts older than 90 days -> 410 with summary only', async () => {
    const r = await as('p1').get('/api/parents/learners/teen1/sessions/ts-old/transcript');
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('TRANSCRIPT_EXPIRED');
    expect(r.body.summary.title).toBe('Old chat');
    expect(JSON.stringify(r.body)).not.toContain('old words');
    const act = await as('p1').get('/api/parents/learners/teen1/activity');
    const old = act.body.sessions.find((s: { id: string }) => s.id === 'ts-old');
    expect(old).toBeUndefined(); // outside the 31-day log
  });
  it('view role reads but cannot change controls; 13+ changes need the learner to accept', async () => {
    const p2 = String((await M.User.findOne({ email: 'p2@parents.test' }))._id);
    const link = await M.ParentLearnerLink.findOne({ parentUserId: p2, studentId: 'kid1' }).lean();
    expect((await as('p1').put(`/api/parents/learners/kid1/guardians/${link.id}`, { role: 'view' })).status).toBe(200);
    expect((await as('p2').get('/api/parents/learners/kid1/home')).status).toBe(200);
    expect((await as('p2').put('/api/parents/learners/kid1/controls', { weeklyGoalMin: 120 })).status).toBe(403);
    expect((await as('p2').post('/api/parents/learners/kid1/report/share', { channel: 'whatsapp' })).status).toBe(403);
    const kid = await as('p1').put('/api/parents/learners/kid1/controls', { weeklyGoalMin: 120 });
    expect(kid.body.controls.weeklyGoalMin).toBe(120);
    expect(kid.body.mode).toBe('parent_sets');
    const teen = await as('p1').put('/api/parents/learners/teen1/controls', { weeklyGoalMin: 150 });
    expect(teen.body).toMatchObject({ mode: 'co_set', enforced: false, controls: { weeklyGoalMin: 150, learnerAccepted: false } });
  });
});

describe('real vs mock data', () => {
  it('status is real; AI text and missing sources are mock-flagged', async () => {
    const h = await as('p1').get('/api/parents/learners/teen1/home');
    expect(h.status).toBe(200);
    expect(h.body.status.mock).toBe(false);
    expect(h.body.status.sessions).toBeGreaterThanOrEqual(0);
    expect(h.body.learned).toMatchObject({ mock: true, aiWritten: true });
    expect(h.body.tryAtHome.mock).toBe(true);
    expect(h.body.upcoming.mock).toBe(true);
    expect(h.body.level.mock).toBe(true); // no outcome evidence for the teen
    expect(h.body.hearProgress).toEqual({ available: false });
    expect(typeof h.body.generatedAt).toBe('string');
    const p = await as('p1').get('/api/parents/learners/teen1/progress');
    expect(p.body.skills.mock).toBe(true);
    expect(p.body.trend.mock).toBe(true);
    expect(p.body.assessments.mock).toBe(false);
    const act = await as('p1').get('/api/parents/learners/teen1/activity');
    const s = act.body.sessions.find((x: { id: string }) => x.id === 'ts-recent');
    expect(s).toMatchObject({ mock: false, durationMin: 40, insight: { mock: true, aiWritten: true } });
    expect(s.methods.map((m: { en: string }) => m.en)).toEqual(expect.arrayContaining(['Spaced word review', 'Guided questions']));
    expect(act.body.calendar.days).toHaveLength(14);
  });
  it('kid level comes from outcome mastery (real) and mock alerts hide beta items', async () => {
    const p = await as('p1').get('/api/parents/learners/kid1/progress');
    expect(p.body.level).toMatchObject({ mock: false, cefr: 'A1', subLevel: 'A1.2', subLevelPct: 100 });
    expect(p.body.canDos.mock).toBe(false);
    const a = await as('p1').get('/api/parents/learners/kid1/alerts');
    expect(a.body.alerts.mock).toBe(true);
    expect(a.body.alerts.items.every((x: { category: string }) => x.category !== 'distress')).toBe(true);
    expect(a.body.alerts.items[0].excerpt).toBeTruthy();
  });
  it('account: learners, guardians, mock plan, preferences', async () => {
    const r = await as('p1').get('/api/parents/account');
    expect(r.body.learners.map((l: { studentId: string; tier: string }) => [l.studentId, l.tier]).sort()).toEqual([['kid1', 'kid'], ['teen1', '13plus']]);
    expect(r.body.plan.mock).toBe(true);
    expect(r.body.preferences.summary).toBe('on_demand');
    const kidGuardians = r.body.guardians.byLearner.find((g: { studentId: string }) => g.studentId === 'kid1');
    expect(kidGuardians.items.map((i: { role: string }) => i.role).sort()).toEqual(['owner', 'view']);
  });
});

describe('share this week (on demand)', () => {
  it('email goes through sendTemplate(enara-weekly-progress) — mocked; WhatsApp is a stub', async () => {
    mail.send.mockClear();
    const e = await as('p1').post('/api/parents/learners/kid1/report/share', { channel: 'email' });
    expect(e.status).toBe(200);
    expect(mail.send).toHaveBeenCalledTimes(1);
    const [alias, to, vars] = mail.send.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(alias).toBe('enara-weekly-progress');
    expect(to).toBe('p1@parents.test');
    expect(Object.keys(vars).sort()).toEqual(['CHILD_NAME', 'LESSONS_DONE', 'NAME', 'OUTCOMES_MASTERED', 'PRACTICE_TIP', 'TIME_SPENT']);
    const w = await as('p1').post('/api/parents/learners/kid1/report/share', { channel: 'whatsapp' });
    expect(w.body).toMatchObject({ ok: true, channel: 'whatsapp', stub: true });
    expect(w.body.preview).toMatch(/Omar/);
    const rep = await as('p1').get('/api/parents/learners/kid1/report');
    expect(rep.body.report).toMatchObject({ portalPath: '/parents', learned: { mock: true } });
  });
});

describe('unlink', () => {
  it('school admin of another school cannot unlink; own admin can; access is gone after', async () => {
    const p1 = String((await M.User.findOne({ email: 'p1@parents.test' }))._id);
    const link = await M.ParentLearnerLink.findOne({ parentUserId: p1, studentId: 'teen1' }).lean();
    expect((await as('admin@pp-B').del(`/api/students/teen1/parent-links/${link.id}`)).status).toBe(403);
    expect((await as('admin@pp-A').del(`/api/students/teen1/parent-links/${link.id}`)).status).toBe(200);
    expect((await as('p1').get('/api/parents/learners/teen1/home')).status).toBe(403);
    expect((await as('p1').get('/api/parents/learners/teen1/sessions/ts-recent/transcript')).status).toBe(403);
    expect(await M.AuditEvent.exists({ action: 'parent_link_removed', targetId: 'teen1' })).toBeTruthy();
  });
  it('a parent can unlink themself', async () => {
    const p2 = String((await M.User.findOne({ email: 'p2@parents.test' }))._id);
    const link = await M.ParentLearnerLink.findOne({ parentUserId: p2, studentId: 'kid1' }).lean();
    expect((await as('p1').del(`/api/parents/links/${link.id}`)).status).toBe(404);
    expect((await as('p2').del(`/api/parents/links/${link.id}`)).status).toBe(200);
    expect((await as('p2').get('/api/parents/learners/kid1/home')).status).toBe(403);
  });
});

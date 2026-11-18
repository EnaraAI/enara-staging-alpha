import { createHash, randomBytes } from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigForTests } from '../../src/config/env';

// LMS mic / new tab (MIC_NEWTAB_PLAN.md):
//  2. "Open in new tab" handoff code: an opaque 32-byte code (base64url) in
//     the URL fragment (#hc=...), stored only as SHA-256, 60 seconds, used
//     once (atomic), bound to the account, school, LMS link and activity,
//     target and issuing session; minting and exchange are rate-limited; the
//     audit holds IDs only.
//  6. Mic telemetry: strict body (no PII, no user-agent), daily counts per
//     school, rate-limited, read by ENARA admins (every school) and school
//     admins (their own).
// No network: rows are made directly; nothing calls an LMS.

const KEK = randomBytes(32).toString('base64');
const TOOL = 'https://tool.enara.test';
const BASE_ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
};
const LMS_KEYS = ['LMS_LTI_ENABLED', 'LMS_GOOGLE_CLASSROOM_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'LMS_TOOL_BASE_URL', 'LMS_KEK', 'LMS_KEK_PREVIOUS', 'LMS_SCHOOL_CONNECTIONS_REQUIRE_APPROVAL'];

function setLmsEnv(vars: Record<string, string | undefined>) {
  for (const k of LMS_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  resetConfigForTests();
}

const A = 'mic-school-a';
const B = 'mic-school-b';
let mongo: MongoMemoryServer;
let app: import('express').Express;
let M: typeof import('../../src/integrations/lms/models');
let User: typeof import('../../src/models/User').User;
let Assignment: typeof import('../../src/models/Assignment').Assignment;
let signToken: typeof import('../../src/controllers/auth.controller').signToken;
const ids: Record<string, string> = {};
const bearer: Record<string, string> = {};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const codeOf = (r: request.Response) => new URLSearchParams(new URL(r.body.url).hash.slice(1)).get('hc')!;

async function mkUser(key: string, role: string, institutionId?: string) {
  const u = await User.create({ email: `${key}@mic.test`, password: 'x', role, name: `Name ${key}`, institutionId });
  ids[key] = u._id.toString();
  bearer[key] = `Bearer ${signToken(u)}`;
  return u;
}

async function refreshBearer(key: string) {
  bearer[key] = `Bearer ${signToken((await User.findById(ids[key]))!)}`;
}

const mint = (key: string, body: Record<string, unknown> = {}) => request(app).post('/api/lms/launch/handoff').set('Authorization', bearer[key]).send(body);
const exchange = (code: unknown) => request(app).post('/api/lms/launch/handoff/exchange').send({ code });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, BASE_ENV, { MONGODB_URI: mongo.getUri() });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL']) delete process.env[k];
  setLmsEnv({ LMS_LTI_ENABLED: 'true', LMS_TOOL_BASE_URL: TOOL, LMS_KEK: KEK });
  await mongoose.connect(mongo.getUri());
  M = await import('../../src/integrations/lms/models');
  for (const model of M.ALL_LMS_MODELS) await (model as { createIndexes(): Promise<unknown> }).createIndexes();
  ({ User } = await import('../../src/models/User'));
  await User.createIndexes();
  ({ Assignment } = await import('../../src/models/Assignment'));
  ({ signToken } = await import('../../src/controllers/auth.controller'));
  const { Institution } = await import('../../src/models/Institution');
  await Institution.create([{ id: A, name: 'School A' }, { id: B, name: 'School B' }]);

  await mkUser('student', 'student', A);
  await mkUser('student2', 'student', A);
  await mkUser('parent', 'parent', A);
  await mkUser('plainTeacher', 'teacher', A); // not from an LMS
  await mkUser('adminA', 'admin', A);
  await mkUser('adminB', 'admin', B);
  await mkUser('enara', 'enara-admin');
  await mkUser('studentB', 'student', B);

  await M.LmsUser.create([
    { id: 'lmsu_student', platformId: 'plat-a', institutionId: A, externalUserId: 'ext-1', enaraUserId: ids.student },
    { id: 'lmsu_student2', platformId: 'plat-a', institutionId: A, externalUserId: 'ext-2', enaraUserId: ids.student2 },
    { id: 'lmsu_parent', platformId: 'plat-a', institutionId: A, externalUserId: 'ext-p', enaraUserId: ids.parent },
    { id: 'lmsu_studentB', platformId: 'plat-b', institutionId: B, externalUserId: 'ext-b', enaraUserId: ids.studentB },
  ]);
  await M.LmsContext.create([
    { id: 'ctx_a', platformId: 'plat-a', institutionId: A, externalContextId: 'course-a', status: 'active' },
    { id: 'ctx_b', platformId: 'plat-b', institutionId: B, externalContextId: 'course-b', status: 'active' },
  ]);
  await M.LmsResourceLink.create([
    { id: 'rl_a', contextId: 'ctx_a', institutionId: A, externalResourceLinkId: 'link-a', enaraActivityId: 'ASG-A', presentation: 'iframe' },
    { id: 'rl_b', contextId: 'ctx_b', institutionId: B, externalResourceLinkId: 'link-b', enaraActivityId: 'ASG-B', presentation: 'iframe' },
  ]);
  const asg = (id: string, institutionId: string) => ({ id, institutionId, assessmentId: 'AS-1', assessmentVersion: 1, title: id, classId: 'class-1', opensAt: new Date(), dueAt: new Date(Date.now() + 86_400_000), createdBy: 'x' });
  await Assignment.create([asg('ASG-A', A), asg('ASG-A2', A), asg('ASG-B', B)]);
  app = (await import('../../src/app')).createApp();
}, 120_000);

afterAll(async () => {
  setLmsEnv({});
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.collection('rate_limits').deleteMany({}).catch(() => undefined);
});

describe('"Open in new tab" handoff code', () => {
  it('is an opaque 32-byte code in the fragment, stored only as SHA-256, valid 60 s, with the target in the row (not the URL)', async () => {
    const h = await mint('student', { resourceLinkId: 'rl_a', classId: 'not-a-class' });
    expect(h.status, JSON.stringify(h.body)).toBe(200);
    expect(h.body.url).toMatch(new RegExp(`^${TOOL}/lms/launch#hc=[A-Za-z0-9_-]{43}$`));
    expect(h.body.expiresIn).toBe(60);
    expect(h.body.token).toBeUndefined();
    const code = codeOf(h);
    expect(Buffer.from(code, 'base64url')).toHaveLength(32);
    expect(h.body.url).not.toContain('ASG-A');
    expect(h.body.url).not.toContain('rl_a');
    const row = await M.LmsHandoffCode.findOne({ codeHash: sha256(code) }).lean();
    expect(row).toMatchObject({ enaraUserId: ids.student, institutionId: A, platformId: 'plat-a', lmsUserId: 'lmsu_student', contextId: 'ctx_a', resourceLinkId: 'rl_a', targetAssignmentId: 'ASG-A', enaraRole: 'student', accountRole: 'student', sessionVersion: 0 });
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(60_000);
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row!.enaraClassId).toBeUndefined(); // an unknown class is dropped
  });

  it('opens a normal session on the same step, exactly once', async () => {
    const code = codeOf(await mint('student', { resourceLinkId: 'rl_a' }));
    const ex = await exchange(code);
    expect(ex.status, JSON.stringify(ex.body)).toBe(200);
    expect(ex.body.user.id ?? ex.body.user._id ?? ex.body.user.email).toBeTruthy();
    expect(ex.body.launch).toMatchObject({ purpose: 'handoff', role: 'student', presentation: 'window', cookieless: false, resourceLinkId: 'rl_a', target: { kind: 'assignment', assignmentId: 'ASG-A' } });
    // The session works.
    expect((await request(app).get('/api/auth/session').set('Authorization', `Bearer ${ex.body.token}`)).status).toBe(200);
    const again = await exchange(code);
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe('HANDOFF_CODE_USED');
  });

  it('is single use under a race: one session between five tabs', async () => {
    const code = codeOf(await mint('student', { assignmentId: 'ASG-A2' }));
    const results = await Promise.all(Array.from({ length: 5 }, () => exchange(code)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 410)).toHaveLength(4);
    expect(results.find((r) => r.status === 200)!.body.launch.target).toEqual({ kind: 'assignment', assignmentId: 'ASG-A2' });
  });

  it('expires after 60 seconds', async () => {
    const { consumeHandoffCode, HandoffCodeError } = await import('../../src/integrations/lms/core/handoffCode');
    const early = codeOf(await mint('student'));
    expect((await consumeHandoffCode(early, new Date(Date.now() + 59_000))).enaraUserId).toBe(ids.student);
    const late = codeOf(await mint('student'));
    await expect(consumeHandoffCode(late, new Date(Date.now() + 61_000))).rejects.toBeInstanceOf(HandoffCodeError);
    await expect(consumeHandoffCode(late, new Date(Date.now() + 61_000))).rejects.toMatchObject({ code: 'handoff_code_expired' });
    // Over HTTP too: the row's 60 s are over.
    const stale = codeOf(await mint('student'));
    await M.LmsHandoffCode.updateOne({ codeHash: sha256(stale) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await exchange(stale);
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('HANDOFF_CODE_EXPIRED');
  });

  it('refuses garbage and unknown codes', async () => {
    for (const bad of [undefined, '', 'abc', 123, 'x'.repeat(44), { $ne: null }]) {
      const r = await exchange(bad);
      expect(r.status, String(bad)).toBe(400);
      expect(r.body.error.code).toBe('HANDOFF_CODE_INVALID');
    }
    const unknown = await exchange(randomBytes(32).toString('base64url'));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('HANDOFF_CODE_INVALID');
    // The LTI launch exchange does not take a handoff code, nor the reverse.
    const code = codeOf(await mint('student'));
    expect((await request(app).post('/api/lms/launch/exchange').send({ token: code })).status).toBe(400);
    expect((await exchange(code)).status).toBe(200);
  });

  it('is bound to the issuing session: after a sign-out the code is refused (and spent)', async () => {
    const code = codeOf(await mint('student2'));
    expect((await request(app).post('/api/auth/logout').set('Authorization', bearer.student2)).status).toBe(204);
    const r = await exchange(code);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('LMS_HANDOFF_SESSION_ENDED');
    expect((await exchange(code)).body.error.code).toBe('HANDOFF_CODE_USED');
    await refreshBearer('student2');
    expect((await exchange(codeOf(await mint('student2')))).status).toBe(200);
  });

  it('is bound to the user: a changed LMS link, a school move or a role change refuses it', async () => {
    // The LMS link now belongs to another ENARA account.
    let code = codeOf(await mint('student2'));
    await M.LmsUser.updateOne({ id: 'lmsu_student2' }, { $set: { enaraUserId: ids.student } });
    let r = await exchange(code);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('LMS_ACCOUNT_UNAVAILABLE');
    await M.LmsUser.updateOne({ id: 'lmsu_student2' }, { $set: { enaraUserId: ids.student2 } });
    // The account moved to another school.
    code = codeOf(await mint('student2'));
    await User.updateOne({ _id: ids.student2 }, { $set: { institutionId: B } });
    r = await exchange(code);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('LMS_ACCOUNT_UNAVAILABLE');
    await User.updateOne({ _id: ids.student2 }, { $set: { institutionId: A } });
    // The account's role changed.
    code = codeOf(await mint('student2'));
    await User.updateOne({ _id: ids.student2 }, { $set: { role: 'teacher' } });
    r = await exchange(code);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('LMS_ACCOUNT_UNAVAILABLE');
    await User.updateOne({ _id: ids.student2 }, { $set: { role: 'student' } });
    // A disabled account.
    code = codeOf(await mint('student2'));
    await User.updateOne({ _id: ids.student2 }, { $set: { status: 'disabled' } });
    expect((await exchange(code)).status).toBe(403);
    await User.updateOne({ _id: ids.student2 }, { $set: { status: 'active' } });
  });

  it('only LMS accounts mint; parents never (they never come from an LMS); signed out: 401', async () => {
    expect((await mint('plainTeacher')).status).toBe(403);
    const parent = await mint('parent');
    expect(parent.status).toBe(403);
    expect(parent.body.error.code).toBe('LMS_ACCOUNT_REQUIRED');
    expect((await mint('enara')).status).toBe(403);
    expect((await request(app).post('/api/lms/launch/handoff').send({})).status).toBe(401);
  });

  it('is bound to the target: another school\'s activity or assignment, or a mismatch, is refused at mint', async () => {
    let r = await mint('student', { resourceLinkId: 'rl_b' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('LMS_HANDOFF_TARGET_NOT_FOUND');
    r = await mint('student', { assignmentId: 'ASG-B' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('LMS_HANDOFF_TARGET_NOT_FOUND');
    r = await mint('student', { resourceLinkId: 'rl_a', assignmentId: 'ASG-A2' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('LMS_HANDOFF_TARGET_MISMATCH');
    for (const page of ['../admin', 'A', 'x'.repeat(41), 42, 'dash board']) {
      expect((await mint('student', { page })).status, String(page)).toBe(400);
    }
    // A page is kept in the row (not the URL) and the new tab reopens it.
    const p = await mint('student', { page: 'courses' });
    expect(p.status).toBe(200);
    expect(p.body.url).not.toContain('courses');
    const ex = await exchange(codeOf(p));
    expect(ex.body.launch.target).toEqual({ kind: 'page', page: 'courses' });
  });

  it('is bound to the target: an activity re-bound or an assignment moved since then refuses it', async () => {
    let code = codeOf(await mint('student', { resourceLinkId: 'rl_a' }));
    await M.LmsResourceLink.updateOne({ id: 'rl_a' }, { $set: { enaraActivityId: 'ASG-A2' } });
    let r = await exchange(code);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LMS_HANDOFF_TARGET_CHANGED');
    await M.LmsResourceLink.updateOne({ id: 'rl_a' }, { $set: { enaraActivityId: 'ASG-A' } });
    code = codeOf(await mint('student', { assignmentId: 'ASG-A2' }));
    await Assignment.updateOne({ id: 'ASG-A2' }, { $set: { institutionId: B } });
    r = await exchange(code);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('LMS_HANDOFF_TARGET_CHANGED');
    await Assignment.updateOne({ id: 'ASG-A2' }, { $set: { institutionId: A } });
  });

  it('a preview stays a preview in the new tab', async () => {
    const { signAccessToken } = await import('../../src/auth/jwt');
    await M.LmsUser.create({ id: 'lmsu_teacher', platformId: 'plat-a', institutionId: A, externalUserId: 'ext-t', enaraUserId: ids.plainTeacher });
    const u = (await User.findById(ids.plainTeacher))!;
    const pv = `Bearer ${signAccessToken({ id: u._id.toString(), email: u.email, role: u.role, institutionId: u.institutionId, tokenVersion: u.tokenVersion, preview: true })}`;
    const h = await request(app).post('/api/lms/launch/handoff').set('Authorization', pv).send({});
    expect(h.status, JSON.stringify(h.body)).toBe(200);
    const ex = await exchange(codeOf(h));
    expect(ex.body.launch).toMatchObject({ role: 'student', preview: true });
    await M.LmsUser.deleteOne({ id: 'lmsu_teacher' });
  });

  it('rate-limits minting per account and the exchange per address', async () => {
    const { HANDOFF_MINT_PER_MINUTE, HANDOFF_EXCHANGE_PER_MINUTE } = await import('../../src/integrations/lms/admin/routes');
    for (let i = 0; i < HANDOFF_MINT_PER_MINUTE; i++) expect((await mint('student')).status).toBe(200);
    const over = await mint('student');
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect((await mint('student2')).status).toBe(200); // another account is not affected
    for (let i = 0; i < HANDOFF_EXCHANGE_PER_MINUTE; i++) expect((await exchange('bad')).status).toBe(400);
    const slow = await exchange('bad');
    expect(slow.status).toBe(429);
    expect(slow.body.error.code).toBe('RATE_LIMITED');
  });

  it('audits with IDs only: never the code, its hash, a name or an email', async () => {
    await M.LmsAuditLog.deleteMany({});
    const h = await mint('student', { resourceLinkId: 'rl_a' });
    const code = codeOf(h);
    await exchange(code);
    await exchange(code); // a refused second use
    const rows = await M.LmsAuditLog.find({}).lean();
    const minted = rows.find((r) => r.event === 'lms.handoff')!;
    const row = await M.LmsHandoffCode.findOne({ codeHash: sha256(code) }).lean();
    expect(minted).toMatchObject({ outcome: 'ok', institutionId: A, platformId: 'plat-a', actor: 'lmsu_student' });
    expect(minted.refIds).toMatchObject({ handoffId: row!.id, enaraUserId: ids.student, resourceLinkId: 'rl_a', assignmentId: 'ASG-A' });
    const session = rows.find((r) => r.event === 'lms.session' && r.outcome === 'ok')!;
    expect(session.refIds).toMatchObject({ purpose: 'handoff', handoffId: row!.id });
    expect(rows.find((r) => r.event === 'lms.session' && r.outcome === 'fail')).toMatchObject({ code: 'handoff_code_used' });
    const all = JSON.stringify(rows);
    expect(all).not.toContain(code);
    expect(all).not.toContain(sha256(code));
    expect(all).not.toContain('@mic.test');
    expect(all).not.toContain('Name student');
  });
});

describe('mic telemetry (IDs only)', () => {
  const post = (key: string, body: unknown) => request(app).post('/api/lms/telemetry/mic').set('Authorization', bearer[key]).send(body as object);
  const read = (key: string, q = '') => request(app).get(`/api/lms/telemetry/mic${q}`).set('Authorization', bearer[key]);

  it('accepts only the four enumerated fields; anything else (a user-agent, a name) is refused and nothing is stored', async () => {
    await M.LmsMicDaily.deleteMany({});
    const ok = { event: 'mic_blocked_in_frame', browserFamily: 'safari', inFrame: true, feature: 'speaking' };
    for (const bad of [
      {},
      { ...ok, event: 'mic_maybe' },
      { ...ok, browserFamily: 'netscape' },
      { ...ok, inFrame: 'yes' },
      { ...ok, feature: 'camera' },
      { ...ok, userAgent: 'Mozilla/5.0 (Macintosh) Safari/605.1.15' },
      { ...ok, name: 'Student Name' },
      [ok],
    ]) {
      const r = await post('student', bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await M.LmsMicDaily.countDocuments()).toBe(0);
    expect((await request(app).post('/api/lms/telemetry/mic').send(ok)).status).toBe(401);
  });

  it('counts per school and day; the stored row holds no user, name or user-agent', async () => {
    await M.LmsMicDaily.deleteMany({});
    const ev = { event: 'mic_blocked_in_frame', browserFamily: 'safari', inFrame: true, feature: 'speaking' };
    expect((await post('student', ev)).status).toBe(204);
    expect((await post('student2', ev)).status).toBe(204);
    expect((await post('student', { ...ev, event: 'mic_ok', browserFamily: 'chrome' })).status).toBe(204);
    expect((await post('student', { event: 'new_tab_opened', browserFamily: 'chrome', inFrame: true })).status).toBe(204); // no feature: 'none'
    expect((await post('studentB', { event: 'mic_denied', browserFamily: 'firefox', inFrame: false, feature: 'avatar' })).status).toBe(204);
    expect((await post('enara', ev)).status).toBe(204); // no school: nothing counted
    const rows = await M.LmsMicDaily.find({}).lean();
    expect(rows).toHaveLength(4);
    const blocked = rows.find((r) => r.event === 'mic_blocked_in_frame')!;
    expect(blocked).toMatchObject({ institutionId: A, browserFamily: 'safari', inFrame: true, feature: 'speaking', count: 2, day: new Date().toISOString().slice(0, 10) });
    expect(rows.find((r) => r.event === 'new_tab_opened')!.feature).toBe('none');
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['_id', 'browserFamily', 'count', 'day', 'dayStart', 'event', 'feature', 'inFrame', 'institutionId']);
    }
    const all = JSON.stringify(rows);
    for (const key of ['student', 'student2', 'studentB']) expect(all).not.toContain(ids[key]);
    expect(all).not.toContain('@mic.test');
  });

  it('admins read counts per school: ENARA admins every school, a school admin their own, others never', async () => {
    const enara = await read('enara');
    expect(enara.status).toBe(200);
    const a = enara.body.schools.find((s: { institutionId: string }) => s.institutionId === A);
    const b = enara.body.schools.find((s: { institutionId: string }) => s.institutionId === B);
    expect(a.totals).toEqual({ mic_blocked_in_frame: 2, mic_ok: 1, new_tab_opened: 1 });
    expect(b.totals).toEqual({ mic_denied: 1 });
    expect(a.rows).toContainEqual({ event: 'mic_blocked_in_frame', browserFamily: 'safari', inFrame: true, feature: 'speaking', count: 2 });
    expect((await read('enara', `?institutionId=${B}`)).body.schools.map((s: { institutionId: string }) => s.institutionId)).toEqual([B]);
    const own = await read('adminA', `?institutionId=${B}`); // cannot ask for another school
    expect(own.status).toBe(200);
    expect(own.body.schools.map((s: { institutionId: string }) => s.institutionId)).toEqual([A]);
    expect((await read('adminB')).body.schools.map((s: { institutionId: string }) => s.institutionId)).toEqual([B]);
    expect((await read('student')).status).toBe(403);
    expect((await read('plainTeacher')).status).toBe(403);
    expect((await request(app).get('/api/lms/telemetry/mic')).status).toBe(401);
    // Older days fall outside the window.
    const { recordMicTelemetry } = await import('../../src/integrations/lms/core/micTelemetry');
    await recordMicTelemetry(A, { event: 'mic_busy', browserFamily: 'edge', inFrame: false, feature: 'tutor_voice' }, new Date(Date.now() - 10 * 86_400_000));
    expect((await read('adminA', '?days=7')).body.schools[0].totals.mic_busy).toBeUndefined();
    expect((await read('adminA', '?days=30')).body.schools[0].totals.mic_busy).toBe(1);
  });

  it('is rate-limited per account', async () => {
    const { MIC_TELEMETRY_PER_MINUTE } = await import('../../src/integrations/lms/admin/routes');
    const ev = { event: 'mic_ok', browserFamily: 'chrome', inFrame: true, feature: 'tutor_voice' };
    for (let i = 0; i < MIC_TELEMETRY_PER_MINUTE; i++) expect((await post('student', ev)).status).toBe(204);
    const over = await post('student', ev);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
  });
});

import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Read-only account check (src/maintenance/accountCheck.ts): says whether a
// sign-in fails because the account is unknown, disabled or the password is
// wrong, and returns codes, roles, IDs and times only.

const TOKEN = 't'.repeat(40);
const TEST_URI = 'mongodb+srv://u:p@enara-lms-test.abc123.mongodb.net/enara_staging_alpha';
let mongo: MongoMemoryServer;
let resetConfig: () => void;
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  resetConfig();
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  resetConfig = (await import('../src/config/env')).resetConfigForTests;
  setEnv({ MONGODB_URI: mongo.getUri() });
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  setEnv({ MAINTENANCE_ENDPOINTS_ENABLED: undefined, MAINTENANCE_TOKEN: undefined });
  await mongoose.disconnect();
  await mongo.stop();
});

const FORBIDDEN = /password|hash|token"|"ip"|userAgent|"name"|"email"|@/i;

describe('accountCheck', () => {
  it('unknown account: not found, with the unknown_account sign-ins', async () => {
    const { accountCheck, sha256Email } = await import('../src/maintenance/accountCheck');
    const { SignInEvent } = await import('../src/models/SignInEvent');
    await SignInEvent.create({ at: new Date(), email: 'ghost@school.test', result: 'unknown_account', ip: '1.2.3.4' });
    const out = await accountCheck(sha256Email('Ghost@School.test'));
    expect(out.found).toBe(false);
    expect(out.signIns.map((s) => s.result)).toEqual(['unknown_account']);
    expect(out.verdict).toMatch(/No account/);
    expect(JSON.stringify(out)).not.toMatch(FORBIDDEN);
  });

  it('archived student: disabled, archived, and the audit row; no personal data in the reply', async () => {
    const { accountCheck, sha256Email } = await import('../src/maintenance/accountCheck');
    const { User } = await import('../src/models/User');
    const { Student } = await import('../src/models/Student');
    const { AuditEvent } = await import('../src/models/AuditEvent');
    const { SignInEvent } = await import('../src/models/SignInEvent');
    await Student.create({ id: 'STU-AC-1', name: 'Kid One', email: 'kid1@school.test', grade: '', avatar: 'KO', institutionId: 'SCH-1', archivedAt: new Date('2026-11-19T10:00:00Z') });
    const u = await User.create({ email: 'kid1@school.test', password: 'x'.repeat(60), role: 'student', name: 'Kid One', institutionId: 'SCH-1', studentId: 'STU-AC-1', status: 'disabled' });
    await AuditEvent.create({ at: new Date('2026-11-19T10:00:00Z'), action: 'student.archived', actorId: 'admin-1', actorRole: 'school-admin', targetType: 'student', targetId: 'STU-AC-1' });
    await SignInEvent.create({ at: new Date(), email: 'kid1@school.test', userId: String(u._id), result: 'account_disabled', ip: '1.2.3.4' });
    const out = await accountCheck(sha256Email('kid1@school.test'));
    expect(out.found).toBe(true);
    expect(out.account).toMatchObject({ role: 'student', status: 'disabled', institutionId: 'SCH-1' });
    expect(out.student).toMatchObject({ studentId: 'STU-AC-1', archivedAt: '2026-11-19T10:00:00.000Z', deleted: false });
    expect(out.auditEvents.map((a) => a.action)).toEqual(['student.archived']);
    expect(out.signIns[0].result).toBe('account_disabled');
    expect(out.verdict).toMatch(/disabled because the student was archived/);
    expect(JSON.stringify(out)).not.toMatch(FORBIDDEN);
  });

  it('active account with a used reset link: says the password was changed', async () => {
    const { accountCheck, sha256Email } = await import('../src/maintenance/accountCheck');
    const { User } = await import('../src/models/User');
    const { PasswordReset } = await import('../src/models/AccountToken');
    const u = await User.create({ email: 'teacher2@school.test', password: 'x'.repeat(60), role: 'teacher', name: 'T Two', institutionId: 'SCH-1' });
    await PasswordReset.create({ userId: String(u._id), tokenHash: 'h'.repeat(64), expiresAt: new Date(Date.now() + 3600_000), usedAt: new Date('2026-11-20T09:00:00Z') });
    const out = await accountCheck(sha256Email('teacher2@school.test'));
    expect(out.account?.status).toBe('active');
    expect(out.passwordResets30d).toHaveLength(1);
    expect(out.verdict).toMatch(/changed through a reset link/);
    expect(JSON.stringify(out)).not.toMatch(FORBIDDEN);
  });

  it('active account, wrong password: says so', async () => {
    const { accountCheck, sha256Email } = await import('../src/maintenance/accountCheck');
    const { User } = await import('../src/models/User');
    const { SignInEvent } = await import('../src/models/SignInEvent');
    const u = await User.create({ email: 'parent3@school.test', password: 'x'.repeat(60), role: 'parent', name: 'P Three' });
    await SignInEvent.create({ at: new Date(), email: 'parent3@school.test', userId: String(u._id), result: 'wrong_password' });
    const out = await accountCheck(sha256Email('parent3@school.test'));
    expect(out.verdict).toMatch(/wrong_password/);
  });

  it('rejects anything but a 64-hex hash', async () => {
    const { accountCheck } = await import('../src/maintenance/accountCheck');
    await expect(accountCheck('kid1@school.test')).rejects.toThrow(/64 hex/);
  });
});

describe('route', () => {
  it('404 off the test cluster, 401 without the token, 400 on a bad hash, 200 with it', async () => {
    const { sha256Email } = await import('../src/maintenance/accountCheck');
    setEnv({ MONGODB_URI: mongo.getUri(), MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN });
    let a = (await import('../src/app')).createApp();
    expect((await request(a).post('/api/maintenance/account-check').set('Authorization', `Bearer ${TOKEN}`).send({ emailSha256: sha256Email('x@y.test') })).status).toBe(404);
    setEnv({ MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN });
    a = (await import('../src/app')).createApp();
    expect((await request(a).post('/api/maintenance/account-check').send({ emailSha256: sha256Email('x@y.test') })).status).toBe(401);
    expect((await request(a).post('/api/maintenance/account-check').set('Authorization', `Bearer ${TOKEN}`).send({ emailSha256: 'kid1@school.test' })).status).toBe(400);
    const ok = await request(a).post('/api/maintenance/account-check').set('Authorization', `Bearer ${TOKEN}`).send({ emailSha256: sha256Email('kid1@school.test') });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ found: true, account: { status: 'disabled' } });
  });
});

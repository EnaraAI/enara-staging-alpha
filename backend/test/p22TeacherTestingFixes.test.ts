import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P22: fixes required before invited external teacher testing (readiness
// audit 2026-11-01, actions 2-8). Real MongoDB in memory, synthetic records.
// No AI provider is called or faked: every path here stops before a call.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p22-uploads-'));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'true', UPLOAD_DIR: uploadDir,
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'DATABASE_URL', 'API_DOCS_PASSWORD']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const n of ['User', 'Institution', 'Assignment', 'AssessmentAttempt']) M[n] = (await import(`../src/models/${n}`))[n];
  const a = await import('../src/models/Assessment');
  M.AssessmentVersion = a.AssessmentVersion;
  M.CurriculumFileJob = (await import('../src/models/CurriculumChunk')).CurriculumFileJob;
  const b = await import('../src/models/OrgBudget');
  M.BudgetReservation = b.BudgetReservation;
  M.BudgetCounter = b.BudgetCounter;
  app = (await import('../src/app')).createApp();
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); fs.rmSync(uploadDir, { recursive: true, force: true }); });
beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  (await import('../src/middleware/auth.middleware')).forgetInstitutionStatus();
});

let n = 0;
async function account(role: string, institutionId = 'school-a', extra: Record<string, unknown> = {}) {
  n += 1;
  const email = `${role}${n}@p22.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, ...extra });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId, ...extra } as any)}`;
  return { id: user._id.toString(), auth };
}

describe('action 2: API docs are closed without a password', () => {
  it('answers 404 in a non-production environment when no password is set', async () => {
    process.env.NODE_ENV = 'development';
    try {
      for (const url of ['/api/docs/ui', '/api/docs.json', '/api-docs/ui']) expect((await request(app).get(url)).status, url).toBe(404);
    } finally { process.env.NODE_ENV = 'test'; }
  });
});

describe('action 3 / workstream B: original downloads, ownership and signed links', () => {
  const signFor = async (p: string, owner: string) => (await import('../src/utils/uploadSigning')).signUploadPath(p, owner);
  const put = (name: string) => fs.writeFileSync(path.join(uploadDir, name), 'synthetic file');
  const job = (fileUrl: string, scanStatus: string, extra: Record<string, unknown> = {}) =>
    M.CurriculumFileJob.create({ id: `job-${fileUrl}`, institutionId: 'school-a', curriculumId: 'cur', lessonId: 'ch', fileUrl, fileName: 'f.pdf', status: 'pending', scanStatus, ...extra });

  it('never serves an original that was not scanned clean, to anyone, even with a valid link', async () => {
    for (const [name, scan, extra] of [['school-a~00000000-0000-4000-8000-000000000001-pending.pdf', 'pending', {}], ['school-a~00000000-0000-4000-8000-000000000002-deferred.pdf', 'deferred', {}],
      ['school-a~00000000-0000-4000-8000-000000000003-failed.pdf', 'failed', {}], ['school-a~00000000-0000-4000-8000-000000000004-notreq.pdf', 'not_required', {}],
      ['school-a~00000000-0000-4000-8000-000000000005-infected.pdf', 'infected', {}], ['school-a~00000000-0000-4000-8000-000000000006-removed.pdf', 'clean', { status: 'removed' }]] as const) {
      put(name);
      await job(`/uploads/${name}`, scan, extra);
      const r = await request(app).get(await signFor(`/uploads/${name}`, 'school-a'));
      expect(r.status, name).toBe(404);
      expect(r.body.error.code).toBe('FILE_NOT_AVAILABLE');
    }
    // Legacy files with no document record are unscanned too.
    put('school-a~00000000-0000-4000-8000-000000000007-legacy.pdf');
    expect((await request(app).get(await signFor('/uploads/school-a~00000000-0000-4000-8000-000000000007-legacy.pdf', 'school-a'))).status).toBe(404);
  });

  it('serves a clean original and lesson media only with a link signed for the owning school', async () => {
    const clean = 'school-a~00000000-0000-4000-8000-000000000010-clean.pdf';
    put(clean);
    put('school-a~00000000-0000-4000-8000-000000000011-lesson.mp4');
    await job(`/uploads/${clean}`, 'clean');
    expect((await request(app).get(await signFor(`/uploads/${clean}`, 'school-a'))).status).toBe(200);
    expect((await request(app).get(await signFor('/uploads/school-a~00000000-0000-4000-8000-000000000011-lesson.mp4', 'school-a'))).status).toBe(200);
    // A link signed for another school does not open this school's file.
    expect((await request(app).get(await signFor(`/uploads/${clean}`, 'school-b'))).status).toBe(403);
    expect((await request(app).get(`/uploads/${clean}`)).status).toBe(403);
  });

  it('signs links for ~15 minutes only and rejects longer-lived ones', async () => {
    const { LINK_TTL_SECONDS, signUploadPath, isValidUploadSignature } = await import('../src/utils/uploadSigning');
    expect(LINK_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
    const link = signUploadPath('/uploads/x.pdf', 'school-a', Date.now());
    const exp = Number(new URL(`http://h${link}`).searchParams.get('exp'));
    expect(exp * 1000 - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    const later = signUploadPath('/uploads/x.pdf', 'school-a', Date.now() + 2 * 3600_000);
    const q = new URL(`http://h${later}`).searchParams;
    expect(isValidUploadSignature('x.pdf', q.get('exp'), q.get('sig'), 'school-a')).toBe(false);
  });

  it("signs paths in responses only for the caller's own school and only when downloadable", async () => {
    const { signUploadPathsFor } = await import('../src/utils/uploadSigning');
    const mine = '/uploads/school-a~00000000-0000-4000-8000-000000000020-ok.pdf';
    const theirs = '/uploads/school-b~00000000-0000-4000-8000-000000000021-ok.pdf';
    const unscanned = '/uploads/school-a~00000000-0000-4000-8000-000000000022-u.pdf';
    await job(mine, 'clean');
    await M.CurriculumFileJob.create({ id: 'jb', institutionId: 'school-b', curriculumId: 'c', lessonId: 'l', fileUrl: theirs, status: 'pending', scanStatus: 'clean' });
    await job(unscanned, 'deferred');
    const out = await signUploadPathsFor({ a: mine, b: [theirs, unscanned] }, { institutionId: 'school-a', role: 'teacher' });
    expect(out.a).toMatch(/\?exp=\d+&sig=/);
    expect(out.b).toEqual([theirs, unscanned]);
    expect((await signUploadPathsFor({ a: mine }, undefined)).a).toBe(mine);
    const admin = await signUploadPathsFor({ b: theirs }, { role: 'enara-admin' });
    expect(admin.b).toMatch(/sig=/);
  });

  it("never attaches, signs or deletes another school's file through a curriculum", async () => {
    await M.Institution.create([{ id: 'school-a', name: 'A' }, { id: 'school-b', name: 'B' }]);
    const Curriculum = (await import('../src/models/Curriculum')).Curriculum;
    await Curriculum.deleteMany({});
    const foreign = '/uploads/school-b~00000000-0000-4000-8000-000000000030-secret.pdf';
    put(path.basename(foreign));
    await Curriculum.create({ id: 'cur-b', name: 'B', courseName: 'B', institutionId: 'school-b', summary: 's', lastUpdated: '2026-01-01', status: 'draft', assignedBatches: [], chapters: [{ id: 'ch', title: 'L', uploads: [foreign] }] });
    await Curriculum.create({ id: 'cur-a', name: 'A', courseName: 'A', institutionId: 'school-a', summary: 's', lastUpdated: '2026-01-01', status: 'draft', assignedBatches: [], chapters: [{ id: 'ch', title: 'L', uploads: [] }] });
    const admin = await account('admin');
    const r = await request(app).patch('/api/curriculums/cur-a').set('Authorization', admin.auth).send({ chapters: [{ id: 'ch', title: 'L', uploads: [foreign, 'https://example.test/x'] }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const saved = await Curriculum.findOne({ id: 'cur-a' }).lean();
    expect(saved!.chapters[0].uploads).toEqual(['https://example.test/x']);
    // Deleting by a foreign path removes nothing from storage.
    await request(app).delete(`/api/curriculums/cur-a/chapters/ch/uploads?uploadPath=${encodeURIComponent(foreign)}`).set('Authorization', admin.auth);
    expect(fs.existsSync(path.join(uploadDir, path.basename(foreign)))).toBe(true);
  });

  it('lists only downloadable originals as course materials', async () => {
    const { resolveUploads } = await import('../src/services/uploadAccess');
    await job('/uploads/school-a~00000000-0000-4000-8000-000000000040-d.pdf', 'deferred');
    await job('/uploads/school-a~00000000-0000-4000-8000-000000000041-c.pdf', 'clean');
    const info = await resolveUploads(['/uploads/school-a~00000000-0000-4000-8000-000000000040-d.pdf', '/uploads/school-a~00000000-0000-4000-8000-000000000041-c.pdf']);
    expect(info.get('/uploads/school-a~00000000-0000-4000-8000-000000000040-d.pdf')!.eligibility).toEqual({ downloadable: false, reason: 'deferred' });
    expect(info.get('/uploads/school-a~00000000-0000-4000-8000-000000000041-c.pdf')!.eligibility.downloadable).toBe(true);
  });

  it('keeps signed link parameters out of every log line', async () => {
    const { logPath } = await import('../src/middleware/requestContext');
    expect(logPath('/uploads/x.pdf?exp=1&sig=abc')).toBe('/uploads/x.pdf');
    const { redactSignedLinks } = await import('../src/utils/logging');
    const text = redactSignedLinks('GET /uploads/a.pdf?exp=123&sig=deadbeef and https://r2.example/x?X-Amz-Signature=zzz&X-Amz-Credential=kkk');
    expect(text).not.toMatch(/deadbeef|zzz|kkk|exp=123/);
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((l: string) => { lines.push(l); });
    try {
      const { logger } = await import('../src/utils/logging');
      logger.info('download /uploads/a.pdf?exp=1&sig=cafebabe', { path: '/uploads/a.pdf?exp=1&sig=cafebabe', nested: { url: 'x?sig=cafebabe' } });
    } finally { spy.mockRestore(); }
    expect(lines.join('\n')).not.toContain('cafebabe');
  });
});

describe('action 4: spend that has no price is never settled as free', () => {
  it('prices speaking-exam speech-to-text (audio seconds) as unpriced, not $0', async () => {
    const { priceUsage } = await import('../src/services/priceCatalog');
    expect(priceUsage('elevenlabs', 'scribe_v2', { audioSeconds: 42 })).toMatchObject({ costUsd: null, status: 'unpriced' });
    expect(priceUsage('elevenlabs', 'eleven_flash_v2_5', { characters: 1000 })).toMatchObject({ costUsd: 0.08, status: 'estimated' });
    const { UNKNOWN_PRICED_TOOLS } = await import('../src/services/aiBudget');
    expect(UNKNOWN_PRICED_TOOLS).toContain('elevenlabs:speaking_exam_stt');
  });

  it("settles an avatar call's start, language switches and test-spend copies together", async () => {
    const later = new Date(Date.now() + 3_600_000);
    const base = { institutionId: 'school-a', feature: 'avatar_session', provider: 'anam', kind: 'standard', amountMicros: 100_000, counters: [], status: 'reserved', expiresAt: later };
    for (const id of ['avatar:s1', 'avatar:s1:test_spend', 'avatar:s1:switch:u1', 'avatar:s1:switch:u1:test_spend', 'avatar:s10']) await M.BudgetReservation.create({ _id: id, ...base });
    const { settleReservationsUnder } = await import('../src/services/aiBudget');
    expect(await settleReservationsUnder('avatar:s1', null)).toBe(4);
    const rows = await M.BudgetReservation.find({}).lean();
    expect(rows.filter((r: any) => r.status === 'settled').map((r: any) => r._id).sort()).toEqual(['avatar:s1', 'avatar:s1:switch:u1', 'avatar:s1:switch:u1:test_spend', 'avatar:s1:test_spend']);
    expect(rows.find((r: any) => r._id === 'avatar:s10').status).toBe('reserved');
  });
});

describe('action 5: manual release holds results', () => {
  const Q = [{ id: 'q1', type: 'multiple-choice', text: 'Pick 2', options: ['1', '2'], correctAnswer: '2', points: 2 }];
  async function submitted(releasePolicy: 'auto' | 'manual') {
    await M.Institution.create({ id: 'school-a', name: 'A', features: { teaching_workflow_enabled: true } });
    await M.AssessmentVersion.create({ assessmentId: 'as1', institutionId: 'school-a', version: 1, title: 'Quiz', subject: 'Math', questions: Q, totalPoints: 2 });
    await M.Assignment.create({ id: 'asg', institutionId: 'school-a', assessmentId: 'as1', assessmentVersion: 1, title: 'Quiz', classId: 'cls', state: 'published',
      opensAt: new Date(Date.now() - 3_600_000), dueAt: new Date(Date.now() + 3_600_000), createdBy: 't', releasePolicy });
    const { gradeAnswers } = await import('../src/services/grading');
    await M.AssessmentAttempt.create({ id: 'att', assessmentId: 'as1', assessmentTitle: 'Quiz', subject: 'Math', studentId: 'stu', institutionId: 'school-a', status: 'submitted',
      assignmentId: 'asg', assessmentVersion: 1, gradingStatus: 'grading_queued', submittedAt: new Date(), startedAt: new Date(), answers: gradeAnswers(Q as any, { q1: '2' }) });
  }

  it('finalizes without releasing when the assignment says manual', async () => {
    await submitted('manual');
    const { processAttempt } = await import('../src/services/autoGrading');
    expect(await processAttempt('att')).toBe('finalized');
    const t = await M.AssessmentAttempt.findOne({ id: 'att' }).lean();
    expect(t.gradingStatus).toBe('finalized');
    expect(t.releasedAt).toBeFalsy();
    expect(t.history.map((h: any) => h.action)).not.toContain('released');
  });

  it('still releases at once when the assignment says auto', async () => {
    await submitted('auto');
    const { processAttempt } = await import('../src/services/autoGrading');
    expect(await processAttempt('att')).toBe('released');
    expect((await M.AssessmentAttempt.findOne({ id: 'att' }).lean()).gradingStatus).toBe('released');
  });
});

describe('action 6: disabling accounts', () => {
  it('lets a school admin disable and re-enable a teacher; the teacher is signed out at once', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A' });
    const admin = await account('admin');
    const teacher = await account('teacher');
    expect((await request(app).get('/api/auth/me').set('Authorization', teacher.auth)).status).not.toBe(401);
    const r = await request(app).put(`/api/workspace/users/${teacher.id}/status`).set('Authorization', admin.auth).send({ status: 'disabled' });
    expect(r.status).toBe(200);
    expect((await M.User.findById(teacher.id).lean()).status).toBe('disabled');
    expect((await request(app).get('/api/teaching/features').set('Authorization', teacher.auth)).status).toBe(401);
    expect((await request(app).put(`/api/workspace/users/${teacher.id}/status`).set('Authorization', admin.auth).send({ status: 'active' })).status).toBe(200);
    expect((await M.User.findById(teacher.id).lean()).status).toBe('active');
  });

  it('refuses self-disable, another school admin, other schools and bad values', async () => {
    await M.Institution.create([{ id: 'school-a', name: 'A' }, { id: 'school-b', name: 'B' }]);
    const admin = await account('admin');
    const otherAdmin = await account('admin');
    const elsewhere = await account('teacher', 'school-b');
    const teacher = await account('teacher');
    const put = (id: string, status: unknown, who = admin.auth) => request(app).put(`/api/workspace/users/${id}/status`).set('Authorization', who).send({ status });
    expect((await put(admin.id, 'disabled')).status).toBe(400);
    expect((await put(otherAdmin.id, 'disabled')).status).toBe(403);
    expect((await put(elsewhere.id, 'disabled')).status).toBe(404);
    expect((await put(teacher.id, 'gone')).status).toBe(400);
    expect((await put(teacher.id, 'disabled', teacher.auth)).status).toBe(403);
  });
});

describe('action 7 / workstream C: the analytics assistant never sends student records', () => {
  it('builds model input from school aggregates only: no names, IDs, scores or risk flags per student', async () => {
    const { assistantData, nameRedactor } = await import('../src/services/dataAssistant');
    const overview: any = {
      generatedAt: 'now', definitions: {}, totals: { students: 2, avgScore: 70 }, subjects: [], topics: [], courses: [{ courseName: 'Science', students: 2, avgScore: 70, atRiskStudents: 1 }],
      students: [
        { id: 'STU-SYN-1', name: 'Laila Hassan', email: 'laila@synthetic.test', status: 'at risk', avgScore: 41, riskFlags: ['low_scores'] },
        { id: 'STU-SYN-2', name: 'Omar Said', email: 'omar@synthetic.test', status: 'on track', avgScore: 99, riskFlags: [] },
      ],
    };
    const sent = JSON.stringify(assistantData(overview));
    expect(sent).not.toMatch(/Laila|Hassan|Omar|Said|STU-SYN|synthetic\.test|low_scores|\b41\b|\b99\b/);
    expect(JSON.parse(sent).studentCounts).toEqual({ total: 2, byStatus: { 'at risk': 1, 'on track': 1 }, withRiskFlags: 1 });
    const redact = nameRedactor(['Laila Hassan', 'Omar Said']);
    expect(redact('How is Laila Hassan doing, and laila alone? And Omar?')).not.toMatch(/laila|hassan|omar/i);
  });

  it('refuses academic managers, ENARA admins and students, before any AI work', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A' });
    for (const role of ['academic_manager', 'enara-admin', 'student']) {
      const who = await account(role, 'school-a', role === 'student' ? { studentId: 'STU-X' } : {});
      const r = await request(app).post('/api/analytics/assistant').set('Authorization', who.auth).send({ message: 'How is the school doing?' });
      expect(r.status, role).toBe(403);
    }
  });
});

describe('workstream A: suspension and docs', () => {
  it("stops a suspended school's users on their next request, not only at sign-in", async () => {
    await M.Institution.create({ id: 'school-a', name: 'A', features: { teaching_workflow_enabled: true } });
    const teacher = await account('teacher');
    const enara = await account('enara-admin', undefined as never);
    expect((await request(app).get('/api/teaching/features').set('Authorization', teacher.auth)).status).toBe(200);
    expect((await request(app).put('/api/integrations/institutions/school-a/status').set('Authorization', enara.auth).send({ status: 'suspended' })).status).toBe(200);
    const blocked = await request(app).get('/api/teaching/features').set('Authorization', teacher.auth);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('INSTITUTION_SUSPENDED');
    const audit = await mongoose.connection.collection('audit_events').find({ action: 'institution_status_changed' }).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ institutionId: 'school-a', detail: { from: 'active', to: 'suspended' } });
    expect((await request(app).put('/api/integrations/institutions/school-a/status').set('Authorization', enara.auth).send({ status: 'active' })).status).toBe(200);
    expect((await request(app).get('/api/teaching/features').set('Authorization', teacher.auth)).status).toBe(200);
  });

  it('lets an academic manager mark only its own tour, and nothing else', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A' });
    const am = await account('academic_manager');
    expect((await request(app).post('/api/auth/tour/complete').set('Authorization', am.auth)).status).toBeLessThan(300);
    const u = await M.User.findById(am.id).lean();
    expect(u.tourCompletedAt).toBeTruthy();
    expect(u.role).toBe('academic_manager');
    await M.User.updateOne({ _id: am.id }, { $set: { status: 'disabled' } });
    expect((await request(app).post('/api/auth/tour/complete').set('Authorization', am.auth)).status).toBe(401);
  });

  it('keeps the audit trail append-only', async () => {
    const { recordAudit } = await import('../src/services/auditTrail');
    await recordAudit('test_action', { id: 'u1', role: 'admin' }, { institutionId: 'school-a', type: 'x', id: '1' }, { a: 1 });
    const { AuditEvent } = await import('../src/models/AuditEvent');
    await expect(AuditEvent.updateOne({ action: 'test_action' }, { $set: { action: 'changed' } })).rejects.toThrow(/append-only/);
    await expect(AuditEvent.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe('action 8: Arabic AI assessment drafting is switched off', () => {
  it('refuses an Arabic AI draft before any AI work', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A', features: { teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true } });
    const Curriculum = (await import('../src/models/Curriculum')).Curriculum;
    await Curriculum.deleteMany({});
    await Curriculum.create({ id: 'cur-a', name: 'Science', courseName: 'Science', institutionId: 'school-a', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: [], chapters: [] });
    const admin = await account('admin');
    const r = await request(app).post('/api/assessments/generate').set('Authorization', admin.auth).send({ curriculumId: 'cur-a', language: 'ar', counts: { 'multiple-choice': 1 } });
    expect(r.status, JSON.stringify(r.body)).toBe(400);
    expect(r.body.error.code).toBe('LANGUAGE_NOT_SUPPORTED');
  });
});

describe('workstream D: the staging test-spend cap is environment-wide and cannot be reset by a new ID', () => {
  async function withCap<T>(cap: string, id: string, fn: () => Promise<T>): Promise<T> {
    Object.assign(process.env, { AI_TEST_SPEND_CAP_USD: cap, AI_TEST_SPEND_ID: id });
    (await import('../src/config/env')).resetConfigForTests();
    try { return await fn(); } finally {
      delete process.env.AI_TEST_SPEND_CAP_USD; delete process.env.AI_TEST_SPEND_ID;
      (await import('../src/config/env')).resetConfigForTests();
    }
  }
  const reserve = async (key: string, usd: number, feature = 'tutor_chat') =>
    (await import('../src/services/aiBudget')).reserveAiBudget({ key, feature, provider: 'anthropic', institutionId: 'school-a', userId: 'u', upperBoundUsd: usd });

  it('keeps counting across spend IDs, so a new ID does not open a fresh allowance', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A' });
    await withCap('1', 'p22-window-a', async () => {
      await reserve('k1', 0.6);
      await expect(reserve('k2', 0.6)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    });
    await withCap('1', 'p22-window-b', async () => {
      // Window B is new, but the environment has 0.6 committed of 1.0.
      await expect(reserve('k3', 0.6)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
      await reserve('k4', 0.3);
    });
    const env = await M.BudgetCounter.findById('test_spend:__environment__').lean();
    expect(env.committedMicros).toBe(900_000);
  });

  it('seeds the environment counter from earlier spend IDs when it is first created', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A' });
    await M.BudgetCounter.create({ _id: 'test_spend:old-window', institutionId: '__test_spend__', committedMicros: 950_000, settledMicros: 950_000, unknownMicros: 0, alerts: [], expiresAt: new Date(Date.now() + 86400_000) });
    await withCap('1', 'p22-window-c', async () => {
      await expect(reserve('k5', 0.1)).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
      await reserve('k6', 0.04);
    });
  });

  it('applies to grading too: no grade, no provider call, a retryable failure instead', async () => {
    await M.Institution.create({ id: 'school-a', name: 'A' });
    await withCap('1', 'p22-window-d', async () => {
      await reserve('fill', 0.99);
      await expect(reserve('g1', 0.05, 'ai_grading')).rejects.toMatchObject({ code: 'AI_TEST_SPEND_CAP' });
    });
  });
});

describe('workstream E: one score definition everywhere', () => {
  it('counts only final grades, the latest per student and work, in the window, and never missing work as zero', async () => {
    const { latestCountedPerWork, scoresInWindow } = await import('../src/services/scoreMetrics');
    const d = (h: number) => new Date(Date.now() - h * 3600_000);
    const t = [
      { id: 'a1', studentId: 's1', assignmentId: 'A', status: 'submitted', gradingStatus: 'released', score: 40, submittedAt: d(5) },
      { id: 'a2', studentId: 's1', assignmentId: 'A', status: 'submitted', gradingStatus: 'released', score: 90, submittedAt: d(1) }, // later attempt wins
      { id: 'a3', studentId: 's2', assignmentId: 'A', status: 'submitted', gradingStatus: 'needs_review', score: 10, submittedAt: d(1) }, // awaiting review
      { id: 'a4', studentId: 's3', assignmentId: 'A', status: 'in-progress', score: 0, submittedAt: d(1) }, // draft
      { id: 'a5', studentId: 's4', assignmentId: 'F', status: 'submitted', gradingStatus: 'finalized', score: 70, submittedAt: d(1) }, // future assignment
      { id: 'a6', studentId: 's5', assessmentId: 'legacy', status: 'submitted', score: 60, submittedAt: d(2) }, // self-paced, in window
      { id: 'a7', studentId: 's6', assessmentId: 'legacy', status: 'submitted', score: 60, submittedAt: d(24 * 200) }, // too old
    ];
    expect(latestCountedPerWork(t).map((x) => x.id).sort()).toEqual(['a2', 'a5', 'a6', 'a7']);
    const due = new Map([['A', { dueAt: d(2), state: 'published' }], ['F', { dueAt: new Date(Date.now() + 86400_000), state: 'published' }]]);
    const inWindow = scoresInWindow(t, { from: d(24 * 90), to: new Date() }, (id) => due.get(id));
    expect(inWindow.map((x) => x.id).sort()).toEqual(['a2', 'a6']);
  });
});

describe('owner decisions of 2026-11-01 (follow-up)', () => {
  it('OD-6: AI assessment drafting defaults to Sonnet 5.5; grading and the tutor keep the tutor model', async () => {
    const { getConfig, resetConfigForTests } = await import('../src/config/env');
    resetConfigForTests();
    expect(getConfig().anthropicDraftModel).toBe('claude-sonnet-5-5');
    const src = fs.readFileSync(path.join(__dirname, '../src/services/educatorAi.ts'), 'utf8');
    for (const feature of ['ai_assessment_draft', 'ai_question_regenerate']) {
      expect(src).toMatch(new RegExp(`feature: '${feature}',\\n\\s+model: getConfig\\(\\)\\.anthropicDraftModel`));
    }
    const { hasTokenPrices } = await import('../src/services/priceCatalog');
    expect(hasTokenPrices('claude-sonnet-5-5')).toBe(true);
  });

  it('OD-1: speaking-exam speech-to-text and live calls need no per-service ceiling; cost stays unpriced, never $0', async () => {
    const { voiceConfigured } = await import('../src/services/speakingExam');
    process.env.ELEVENLABS_API_KEY = 'synthetic-not-a-key';
    try {
      (await import('../src/config/env')).resetConfigForTests();
      expect(voiceConfigured()).toBe(true);
    } finally {
      delete process.env.ELEVENLABS_API_KEY;
      (await import('../src/config/env')).resetConfigForTests();
    }
    const { priceUsage } = await import('../src/services/priceCatalog');
    expect(priceUsage('elevenlabs', 'scribe_v2', { audioSeconds: 30 }).status).toBe('unpriced');
  });

  it('OD-5: one-month retention on conversations, usage ledger, audit and alerts', async () => {
    expect((await import('../src/models/EducatorConversation')).EDUCATOR_CHAT_RETENTION_DAYS).toBe(30);
    const ttl = (schema: any) => schema.indexes().find(([, o]: any) => o?.name === 'retention_30d')?.[1]?.expireAfterSeconds;
    expect(ttl((await import('../src/models/UsageLedger')).UsageLedger.schema)).toBe(30 * 86400);
    expect(ttl((await import('../src/models/AuditEvent')).AuditEvent.schema)).toBe(30 * 86400);
    expect(ttl((await import('../src/models/AlertEvent')).AlertEvent.schema)).toBe(30 * 86400);
  });
});

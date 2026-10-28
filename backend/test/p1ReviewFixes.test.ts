import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACADEMIC_MANAGER_PAGES, academicManagerPage, restoreUiRole, uiRoleFor } from '../../frontend/services/roleRouting';

// P1 review fixes: the academic manager's own read-only portal, and demo/live
// views on teacher and class dashboards (default live; legacy records without
// an origin are live; views never widen tenant or class scope). Offline.
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn() };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

describe('portal routing (frontend services/roleRouting.ts)', () => {
  it('sends academic managers to their read-only portal, never the admin portal', () => {
    expect(uiRoleFor('academic_manager', 'admin')).toBe('academic-manager');
    expect(uiRoleFor('academic_manager', 'enara-admin')).toBeNull();
    expect(uiRoleFor('academic_manager', 'student')).toBeNull();
    // A stale stored "admin" portal cannot put an academic manager there.
    expect(restoreUiRole('academic_manager', 'admin')).toBe('academic-manager');
    expect(restoreUiRole('admin', 'academic-manager')).toBeNull();
  });

  it('keeps teacher, workspace admin, ENARA admin and student routing unchanged', () => {
    expect(uiRoleFor('teacher', 'admin')).toBe('admin');
    expect(uiRoleFor('admin', 'admin')).toBe('admin');
    expect(uiRoleFor('enara-admin', 'enara-admin')).toBe('enara-admin');
    expect(uiRoleFor('enara-admin', 'admin')).toBe('admin');
    expect(uiRoleFor('student', 'student')).toBe('student');
    expect(uiRoleFor('teacher', 'enara-admin')).toBeNull();
    expect(restoreUiRole('teacher', 'admin')).toBe('admin');
    expect(restoreUiRole('teacher', 'enara-admin')).toBeNull();
    expect(restoreUiRole(undefined, 'admin')).toBeNull();
  });

  it('the academic manager portal offers only school insights; other pages fall back to it', () => {
    expect(ACADEMIC_MANAGER_PAGES.map((p) => p.page)).toEqual(['dashboard']);
    for (const page of ['students', 'curriculum', 'assignments', 'grading', 'credits', 'live-avatars', 'teaching']) expect(academicManagerPage(page)).toBe('dashboard');
  });
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', BCRYPT_ROUNDS: '10',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'Assignment', 'AssessmentAttempt', 'LearningEvent', 'LearningIntervention', 'TimeToUnderstand']) M[n] = (await import(`../src/models/${n}`))[n];
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

type Who = { id: string; get: (u: string) => request.Test };
async function who(role: string, institutionId?: string): Promise<Who> {
  const email = `${role}-${Math.random().toString(36).slice(2)}@t.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId })}`;
  return { id: user._id.toString(), get: (u: string) => request(app).get(u).set('Authorization', auth) };
}

const FLAGS = { teaching_workflow_enabled: true, learning_intelligence_enabled: true, teacher_learning_insights_enabled: true };
const DAY = 86_400_000;
let T: Who, T2: Who, AM: Who, WA: Who, TB: Who;

beforeEach(async () => {
  for (const m of Object.values(M)) await m.deleteMany({});
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([{ id: 'instA', name: 'A', features: FLAGS }, { id: 'instB', name: 'B', features: FLAGS }]);
  T = await who('teacher', 'instA');
  T2 = await who('teacher', 'instA');
  AM = await who('academic_manager', 'instA');
  WA = await who('admin', 'instA');
  TB = await who('teacher', 'instB');
  await M.Student.create([
    { id: 'live1', name: 'Live One', email: 'l1@x.test', grade: '8', institutionId: 'instA' },
    { id: 'demo1', name: 'Demo One', email: 'd1@x.test', grade: '8', institutionId: 'instA', origin: 'demo_seed' },
    { id: 'b1', name: 'Other School', email: 'b1@x.test', grade: '8', institutionId: 'instB' },
  ]);
  // A legacy record written before P1: no origin field at all (live).
  await M.Student.collection.insertOne({ id: 'legacy1', name: 'Legacy One', email: 'g1@x.test', grade: '8', institutionId: 'instA' });
  await M.CourseInstance.create([
    // A live class with a demo student enrolled in it too.
    { id: 'classA', courseId: 'c', courseName: 'Live 8A', institutionId: 'instA', academicYear: '2026', batchId: 'nb', instructorIds: [T.id], studentIds: ['live1', 'legacy1', 'demo1'], visibility: 'student' },
    { id: 'classDemo', courseId: 'cd', courseName: 'Demo 8A', institutionId: 'instA', academicYear: '2026', batchId: 'nb2', instructorIds: [T.id], studentIds: ['demo1'], origin: 'demo_seed', visibility: 'student' },
    { id: 'classOther', courseId: 'co', courseName: 'Other teacher', institutionId: 'instA', academicYear: '2026', batchId: 'nb3', instructorIds: [T2.id], studentIds: ['live1'], visibility: 'student' },
    { id: 'classB', courseId: 'cb', courseName: 'School B', institutionId: 'instB', academicYear: '2026', batchId: 'nb4', instructorIds: [TB.id], studentIds: ['b1'], visibility: 'student' },
  ]);
  const now = Date.now();
  const assignment = (id: string, classId: string, extra: object = {}) => ({
    id, institutionId: 'instA', assessmentId: 'asm', assessmentVersion: 1, title: id, classId, state: 'published',
    opensAt: new Date(now - 2 * DAY), dueAt: new Date(now + 2 * DAY), createdBy: T.id, ...extra,
  });
  await M.Assignment.create([assignment('asgLive', 'classA'), assignment('asgDemo', 'classA', { origin: 'demo_seed' })]);
  await M.Assignment.collection.insertOne({ ...assignment('asgLegacy', 'classA'), state: 'published' });
  const attempt = (id: string, studentId: string, assignmentId: string, extra: object = {}) => ({
    id, assessmentId: 'asm', assessmentTitle: 'A', studentId, institutionId: 'instA', assignmentId, status: 'submitted', submittedAt: new Date(now - DAY), gradingStatus: 'needs_review', ...extra,
  });
  await M.AssessmentAttempt.create([attempt('tLive', 'live1', 'asgLive'), attempt('tDemo', 'demo1', 'asgDemo', { origin: 'demo_seed' }), attempt('tDemoOnLive', 'demo1', 'asgLive', { origin: 'demo_seed' })]);
  await M.AssessmentAttempt.collection.insertOne({ ...attempt('tLegacy', 'legacy1', 'asgLive') });
  await M.LearningEvent.create([
    { id: 'eLive', institutionId: 'instA', studentId: 'live1', type: 'lesson_viewed', source: 'lesson', verified: true, at: new Date(now - DAY) },
    { id: 'eDemo', institutionId: 'instA', studentId: 'demo1', type: 'lesson_viewed', source: 'lesson', verified: true, at: new Date(now - 1000), origin: 'demo_seed' },
    // A demo event wrongly attached to a live student: still not live activity.
    { id: 'eDemoOnLive', institutionId: 'instA', studentId: 'live1', type: 'lesson_viewed', source: 'lesson', verified: true, at: new Date(now - 1000), origin: 'demo_seed' },
  ]);
  await M.LearningIntervention.create([
    { id: 'iLive', institutionId: 'instA', studentId: 'live1', interventionType: 'teacher_assigned', assignedBy: 'teacher', ownerId: T.id, status: 'assigned' },
    { id: 'iDemo', institutionId: 'instA', studentId: 'demo1', interventionType: 'teacher_assigned', assignedBy: 'teacher', ownerId: T.id, status: 'assigned' },
  ]);
  const ttu = (id: string, studentId: string) => ({ id, institutionId: 'instA', studentId, objectiveId: 'o', gapDetectedAt: new Date(), status: 'verified', activeInstructionSeconds: 600, measurementVersion: 'v1', lastComputedAt: new Date() });
  await M.TimeToUnderstand.create([ttu('ttuLive', 'live1'), ttu('ttuDemo', 'demo1')]);
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('teacher dashboard: GET /api/teaching/overview', () => {
  it('defaults to live: demo classes, students and activity are not counted; legacy records are live', async () => {
    const r = await T.get('/api/teaching/overview');
    expect(r.status).toBe(200);
    expect(r.body.origin).toBe('live');
    expect(ids(r.body.classes)).toEqual(['classA']);
    const a = r.body.classes[0];
    expect(a.students).toBe(2); // live1 + legacy1, not demo1
    expect(a.activeAssignments).toBe(2); // asgLive + asgLegacy, not asgDemo
    expect(r.body.review.needsReview).toBe(2); // tLive + tLegacy
    expect(r.body.followUps.map((f: { id: string }) => f.id)).toEqual(['iLive']);
  });

  it('demo_seed shows only seeded data; all shows both; aggregates follow the same view', async () => {
    const demo = await T.get('/api/teaching/overview?origin=demo_seed');
    expect(demo.body.origin).toBe('demo_seed');
    expect(ids(demo.body.classes)).toEqual(['classDemo']);
    expect(demo.body.followUps.map((f: { id: string }) => f.id)).toEqual(['iDemo']);
    const all = await T.get('/api/teaching/overview?origin=all');
    expect(ids(all.body.classes)).toEqual(['classA', 'classDemo']);
    expect(all.body.classes.find((c: { id: string }) => c.id === 'classA').students).toBe(3);
    expect(all.body.review.needsReview).toBe(4);
    expect(all.body.followUps).toHaveLength(2);
    // An unknown value is the default live view, never a wider one.
    expect((await T.get('/api/teaching/overview?origin=everything')).body.origin).toBe('live');
  });

  it('origin never widens scope: other teachers\' and other schools\' classes stay out', async () => {
    for (const v of ['live', 'demo_seed', 'all']) {
      const r = await T.get(`/api/teaching/overview?origin=${v}`);
      expect(ids(r.body.classes)).not.toContain('classOther');
      expect(ids(r.body.classes)).not.toContain('classB');
    }
  });
});

describe('class roster: GET /api/teaching/classes/:id/roster', () => {
  it('live by default, with live-only counts, assignments and last activity', async () => {
    const r = await T.get('/api/teaching/classes/classA/roster');
    expect(r.status).toBe(200);
    expect(r.body.origin).toBe('live');
    expect(ids(r.body.students)).toEqual(['legacy1', 'live1']);
    expect(r.body.assignments).toBe(2);
    const live = r.body.students.find((s: { id: string }) => s.id === 'live1');
    expect(live.submitted).toBe(1);
    // The demo event on this student (newer) is not live activity.
    expect(new Date(live.lastActiveAt).getTime()).toBeLessThan(Date.now() - DAY / 2);
    const all = await T.get('/api/teaching/classes/classA/roster?origin=all');
    expect(ids(all.body.students)).toEqual(['demo1', 'legacy1', 'live1']);
    expect(all.body.assignments).toBe(3);
    const demo = await T.get('/api/teaching/classes/classA/roster?origin=demo_seed');
    expect(ids(demo.body.students)).toEqual(['demo1']);
    expect(demo.body.assignments).toBe(1);
  });

  it('a teacher cannot reach another teacher\'s or another school\'s class with any origin', async () => {
    for (const v of ['live', 'demo_seed', 'all']) {
      expect([403, 404]).toContain((await T.get(`/api/teaching/classes/classOther/roster?origin=${v}`)).status);
      expect([403, 404]).toContain((await T.get(`/api/teaching/classes/classB/roster?origin=${v}`)).status);
    }
  });
});

describe('learner profile: GET /api/teaching/students/:id/profile', () => {
  it('a demo student is outside the live view; their seeded activity shows only on request', async () => {
    expect((await T.get('/api/teaching/students/demo1/profile')).status).toBe(404);
    const demo = await T.get('/api/teaching/students/demo1/profile?origin=demo_seed');
    expect(demo.status).toBe(200);
    expect(demo.body.origin).toBe('demo_seed');
    const live = await T.get('/api/teaching/students/live1/profile');
    expect(live.status).toBe(200);
    expect(JSON.stringify(live.body)).not.toContain('tDemo');
    expect([403, 404]).toContain((await T.get('/api/teaching/students/b1/profile?origin=all')).status);
  });
});

describe('interventions and class insights', () => {
  it('GET /api/teaching/interventions follows the view', async () => {
    expect((await T.get('/api/teaching/interventions')).body.interventions.map((i: { id: string }) => i.id)).toEqual(['iLive']);
    expect((await T.get('/api/teaching/interventions?origin=all')).body.interventions.map((i: { id: string }) => i.id).sort()).toEqual(['iDemo', 'iLive']);
  });

  it('GET /api/learning/classes and /classes/:id/insights follow the view within class scope', async () => {
    const list = await T.get('/api/learning/classes');
    expect(list.status).toBe(200);
    expect(ids(list.body.classes)).toEqual(['classA']);
    expect(ids((await T.get('/api/learning/classes?origin=all')).body.classes)).toEqual(['classA', 'classDemo']);
    const insight = await T.get('/api/learning/classes/classA/insights');
    expect(insight.status).toBe(200);
    expect(insight.body.origin).toBe('live');
    expect(insight.body.heatmap.map((h: { studentId: string }) => h.studentId).sort()).toEqual(['legacy1', 'live1']);
    expect(insight.body.diagnostics.students).toBe(2);
    expect([403, 404]).toContain((await T.get('/api/learning/classes/classOther/insights?origin=all')).status);
  });

  it('TTU analytics count only live students by default, school-wide and per class', async () => {
    const school = await WA.get('/api/learning/analytics/ttu');
    expect(school.status).toBe(200);
    expect(school.body.origin).toBe('live');
    expect(school.body.counts.verified).toBe(1);
    expect((await WA.get('/api/learning/analytics/ttu?origin=demo_seed')).body.counts.verified).toBe(1);
    expect((await WA.get('/api/learning/analytics/ttu?origin=all')).body.counts.verified).toBe(2);
    expect((await T.get('/api/learning/analytics/ttu')).body.counts.verified).toBe(1);
  });
});

describe('academic manager stays read-only', () => {
  it('reads school analytics; teaching dashboards and every write stay denied, whatever the origin', async () => {
    expect((await AM.get('/api/analytics/overview?origin=all')).status).toBe(200);
    for (const u of ['/api/teaching/overview?origin=all', '/api/teaching/classes/classA/roster', '/api/learning/classes', '/api/teaching/interventions', '/api/teaching/ops', '/api/learning/analytics/ttu', '/api/curriculums', '/api/workspace/users']) {
      expect((await AM.get(u)).status).toBe(403);
    }
  });

  it('the workspace admin\'s school view keeps working with the view selector', async () => {
    const r = await WA.get('/api/teaching/overview');
    expect(r.status).toBe(200);
    expect(ids(r.body.classes)).toEqual(['classA', 'classOther']);
    const ops = await WA.get('/api/teaching/ops');
    expect(ops.status).toBe(200);
    expect(ops.body.origin).toBe('live');
  });
});

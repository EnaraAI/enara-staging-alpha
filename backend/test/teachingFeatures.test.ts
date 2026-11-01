import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// GET /api/teaching/features: which AI tools the caller's own school has on,
// so teacher pages hide buttons that would fail. Yes/no answers only, never
// another school's, and the same answers the AI endpoints act on. No AI
// provider is called or faked here: every AI request below is refused by the
// school's switch before any model call.

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
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  M = {};
  for (const name of ['User', 'Institution', 'Curriculum', 'CourseInstance']) M[name] = (await import(`../src/models/${name}`))[name];
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let n = 0;
async function bearer(role: 'student' | 'teacher' | 'admin' | 'enara-admin', institutionId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role, institutionId } as any)}`;
  return {
    id: user._id.toString(),
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body),
  };
}

beforeEach(async () => {
  await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  await M.Institution.create([
    // School A: AI question drafts on; lesson planning and documents off.
    { id: 'instA', name: 'A', features: { teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true } },
    // School B: everything on.
    { id: 'instB', name: 'B', features: { teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true, ai_lesson_planning_enabled: true, documents_workspace_enabled: true } },
    // School C: AI flags set, but the teaching workflow (their master switch) is off.
    { id: 'instC', name: 'C', features: { ai_assessment_authoring_enabled: true, ai_lesson_planning_enabled: true } },
  ]);
  await M.Curriculum.create({ id: 'curA', name: 'Fractions', courseName: 'Fractions', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'], chapters: [] });
});

describe('GET /api/teaching/features', () => {
  it("returns the caller's own school's switches", async () => {
    const teacherA = await bearer('teacher', 'instA');
    const r = await teacherA.get('/api/teaching/features');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ aiAssessmentDrafts: true, aiLessonPlans: false, documents: false });
    const adminB = await bearer('admin', 'instB');
    expect((await adminB.get('/api/teaching/features')).body).toEqual({ aiAssessmentDrafts: true, aiLessonPlans: true, documents: true });
  });

  it("never answers for another school", async () => {
    const teacherA = await bearer('teacher', 'instA');
    const r = await teacherA.get('/api/teaching/features?institutionId=instB');
    expect(r.body).toEqual({ aiAssessmentDrafts: true, aiLessonPlans: false, documents: false });
  });

  it('is for staff only, and follows the teaching workflow switch', async () => {
    const student = await bearer('student', 'instA');
    expect((await student.get('/api/teaching/features')).status).toBe(403);
    const teacherC = await bearer('teacher', 'instC');
    const r = await teacherC.get('/api/teaching/features');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('agrees with the AI endpoints: a feature it reports off is refused there', async () => {
    const teacherA = await bearer('teacher', 'instA');
    await M.CourseInstance.create({ id: 'clsA', courseId: 'fr', courseName: 'Fractions 6A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'curA', studentIds: [], instructorIds: [teacherA.id], visibility: 'student' });
    expect((await teacherA.get('/api/teaching/features')).body.aiLessonPlans).toBe(false);
    const plan = await teacherA.post('/api/lesson-plans/generate', { curriculumId: 'curA', durationMinutes: 45 });
    expect(plan.status).toBe(404);
    expect(plan.body.error.code).toBe('FEATURE_DISABLED');
  });
});

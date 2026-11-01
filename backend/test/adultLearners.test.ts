import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Adult education schools (learningSettings.adultLearners): every student is
// taught as an adult, whatever the grade on their profile, so every teaching
// method is open. Real MongoDB in memory, synthetic records; no AI provider
// is called or faked.
let mongo: MongoMemoryServer;
let M: Record<string, mongoose.Model<any>>;
let ctx: typeof import('../src/services/learningContext');
let flags: typeof import('../src/services/featureFlags');
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
const FEATURES = { learning_intelligence_enabled: true, adaptive_pedagogy_enabled: true };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'AI_TEST_SPEND_CAP_USD', 'AI_TEST_SPEND_ID', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const n of ['Institution', 'LearningObjective', 'StudentObjectiveMastery', 'PedagogicalDecision', 'Student', 'Curriculum', 'User']) M[n] = (await import(`../src/models/${n}`))[n];
  ctx = await import('../src/services/learningContext');
  flags = await import('../src/services/featureFlags');
  ({ signAccessToken } = await import('../src/auth/jwt'));
  app = (await import('../src/app')).createApp();
  for (const [id, adult] of [['school-kids', false], ['school-adults', true]] as const) {
    await M.Institution.create({ id, name: id, features: FEATURES, ...(adult ? { learningSettings: { adultLearners: true } } : {}) });
    await M.Curriculum.create({ id: `cur-${id}`, name: 'Ethics', courseName: 'Ethics', institutionId: id, summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: [], chapters: [] });
    await M.Student.create({ id: `stu-${id}`, name: 'Synthetic', email: `s@${id}.test`, grade: 'Grade 6', institutionId: id });
    await M.LearningObjective.create({ id: `obj-${id}`, institutionId: id, curriculumId: `cur-${id}`, courseId: 'course', code: 'E1', title: 'Weigh an ethical dilemma', lessonIds: ['L1'], status: 'approved', prerequisiteObjectiveIds: [] });
    await M.StudentObjectiveMastery.create({ institutionId: id, studentId: `stu-${id}`, objectiveId: `obj-${id}`, masteryEstimate: 0.95, masteryStatus: 'mastered', evidenceStrength: 'substantial', lastMasteryUpdateAt: new Date(), modelVersion: 'mastery-v1' });
  }
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await M.PedagogicalDecision.deleteMany({}); flags.forgetFeatureFlags(); });

const planFor = async (school: string) =>
  (await ctx.buildObjectiveContext({ institutionId: school, studentId: `stu-${school}`, objectiveId: `obj-${school}`, record: false }))!.decision;

describe('adult education schools', () => {
  it('teach every student as an adult: grade-gated methods open even with "Grade 6" on the profile', async () => {
    // Same learner, same evidence: Case-Based learning needs grade 9.
    expect((await planFor('school-kids')).primary).toBe('retrieval_practice');
    expect((await planFor('school-adults')).primary).toBe('case_based');
    expect(ctx.ADULT_GRADE_LEVEL).toBeGreaterThanOrEqual(13);
  });

  it('can be switched on by the school admin (validated), and is read by the tutor at once', async () => {
    await M.Institution.create({ id: 'school-new', name: 'New', features: FEATURES });
    const admin = await M.User.create({ email: 'admin@new.test', password: 'x', role: 'admin', name: 'Admin', status: 'active', institutionId: 'school-new' });
    const auth = `Bearer ${signAccessToken({ id: admin._id.toString(), email: 'admin@new.test', role: 'admin', institutionId: 'school-new' } as any)}`;
    expect((await request(app).get('/api/learning/settings').set('Authorization', auth)).body.settings.adultLearners).toBe(false);
    expect(await flags.isAdultSchool('school-new')).toBe(false);
    expect((await request(app).put('/api/learning/settings').set('Authorization', auth).send({ adultLearners: 'yes' })).status).toBe(400);
    const r = await request(app).put('/api/learning/settings').set('Authorization', auth).send({ adultLearners: true });
    expect(r.status).toBe(200);
    expect(r.body.settings.adultLearners).toBe(true);
    expect(await flags.isAdultSchool('school-new')).toBe(true);
    const student = await M.User.create({ email: 'stu@new.test', password: 'x', role: 'student', name: 'S', status: 'active', institutionId: 'school-new' });
    const sAuth = `Bearer ${signAccessToken({ id: student._id.toString(), email: 'stu@new.test', role: 'student', institutionId: 'school-new' } as any)}`;
    expect((await request(app).put('/api/learning/settings').set('Authorization', sAuth).send({ adultLearners: false })).status).toBe(403);
  });
});

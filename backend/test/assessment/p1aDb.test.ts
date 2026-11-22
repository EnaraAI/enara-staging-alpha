import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymiseAttempt } from '../../src/services/anonymisedResults';

// Assessment engine P1a, with a database: seeds load (twice, no duplicates), the new collections accept items, the learner's
// UI language is saved, and erasure keeps no model free text.

describe('erasure keeps scores, never the feedback text', () => {
  it('anonymised answers keep structured engine fields only', () => {
    const t = { id: 'a1', studentId: 's1', answers: [{ questionId: 'q1', points: 1, maxPoints: 2, criteria: [{ code: 'grammar_accuracy', points: 1, max: 2, reasonCode: 'partly_correct' }], confidence: 0.9, flagged: false, grader: 'model:x', feedbackText: 'Ahmed, you wrote about your family...', errorCodes: ['gender_agreement'], studentAnswer: 'text' }] };
    const out = anonymiseAttempt(t, 'anon', 'a2', new Map()) as { answers: Record<string, unknown>[] };
    expect(out.answers[0]).toMatchObject({ questionId: 'q1', criteria: [{ code: 'grammar_accuracy' }], grader: 'model:x' });
    expect(out.answers[0].feedbackText).toBeUndefined();
    expect(out.answers[0].studentAnswer).toBeUndefined();
  });
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../../src/app')['createApp']>;
const PW = 'assessment-p1a-test-password';

describe('with a database', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
      JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID']) delete process.env[k];
    (await import('../../src/config/env')).resetConfigForTests();
    await mongoose.connect(mongo.getUri());
    const { User } = await import('../../src/models/User');
    const { Student } = await import('../../src/models/Student');
    const { Institution } = await import('../../src/models/Institution');
    await Institution.create({ id: 'p1a-A', name: 'School A' });
    await Student.create({ id: 'p1a-s1', name: 'Mona Adel', email: 's1@p1a.test', institutionId: 'p1a-A' });
    const hash = bcrypt.hashSync(PW, 4);
    await User.create({ email: 's1@p1a.test', password: hash, role: 'student', name: 'Mona Adel', status: 'active', institutionId: 'p1a-A', studentId: 'p1a-s1' });
    await User.create({ email: 't@p1a.test', password: hash, role: 'teacher', name: 'T', status: 'active', institutionId: 'p1a-A' });
    app = (await import('../../src/app')).createApp();
  }, 120_000);
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  it('seeds load into the shared space, twice without duplicates; nothing school-owned', async () => {
    const { applySeeds, SHARED_INSTITUTION } = await import('../../src/assessment/curricula');
    const { LearningObjective } = await import('../../src/models/LearningObjective');
    expect(await applySeeds()).toEqual({ objectives: 95, unverifiedFiles: 21 });
    await applySeeds();
    expect(await LearningObjective.countDocuments({ institutionId: SHARED_INSTITUTION })).toBe(95);
    expect(await LearningObjective.countDocuments({ institutionId: { $ne: SHARED_INSTITUTION } })).toBe(0);
    const one = await LearningObjective.findOne({ curriculumKey: 'cefr' }).lean();
    expect(one).toMatchObject({ origin: 'seed', status: 'draft', level: expect.stringMatching(/^A[12]$/), source: { status: 'unverified' } });
    expect(one?.translations?.en?.title).toBeTruthy();
  });

  it('bank items are versioned (same id, new version) and unique per version', async () => {
    const { BankItem } = await import('../../src/models/BankItem');
    await BankItem.createIndexes();
    const item = { id: 'bi-1', version: 1, subject: 'math', language: 'ar', curriculum: 'eg-national', level: 'G5', objective_code: 'M5.1', type: 'numeric', difficulty: 2, stem: 'كم يساوي ٣ + ٤؟', answer_key: { value: 7 }, source: 'teacher', created_by: 'u1' };
    await BankItem.create(item);
    await BankItem.create({ ...item, version: 2, stem: 'كم يساوي ٤ + ٣؟' });
    await expect(BankItem.create(item)).rejects.toThrow();
    expect((await BankItem.findOne({ id: 'bi-1', version: 2 }).lean())?.review_status).toBe('draft');
  });

  it('the learner saves their screen language; only ar or en; students only', async () => {
    const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
    const s = await login('s1@p1a.test');
    expect((await request(app).put('/api/me/ui-language').set('Authorization', s).send({ language: 'ar' })).body).toEqual({ uiLanguage: 'ar' });
    const { Student } = await import('../../src/models/Student');
    expect((await Student.findOne({ id: 'p1a-s1' }).lean())?.uiLanguage).toBe('ar');
    expect((await request(app).put('/api/me/ui-language').set('Authorization', s).send({ language: 'fr' })).status).toBe(400);
    expect((await request(app).put('/api/me/ui-language').set('Authorization', await login('t@p1a.test')).send({ language: 'en' })).status).toBe(403);
  });
});

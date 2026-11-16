import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// AI drafts of a lesson's practice quiz, from the chapter's content. The draft is
// returned for the teacher to review, never saved by itself. Anthropic is mocked.
const ai = vi.hoisted(() => ({ calls: [] as any[], handler: (_b: any): string | Error => '{}' }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = {
      create: vi.fn(async (body: any) => {
        ai.calls.push(body);
        const out = ai.handler(body);
        if (out instanceof Error) throw out;
        return { model: 'claude-test', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: out }] };
      }),
    };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let M: Record<string, mongoose.Model<any>>;
const PW = 'quiz-generate-password-1';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  M = {
    User: (await import('../src/models/User')).User,
    Institution: (await import('../src/models/Institution')).Institution,
    Curriculum: (await import('../src/models/Curriculum')).Curriculum,
  };
  await M.User.createIndexes();
  app = (await import('../src/app')).createApp();
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);

  await M.Institution.create([
    { id: 'qgA', name: 'A', features: { teaching_workflow_enabled: true, ai_assessment_authoring_enabled: true } },
    { id: 'qgOff', name: 'Off', features: { teaching_workflow_enabled: true, ai_assessment_authoring_enabled: false } },
  ]);
  const hash = await bcrypt.hash(PW, 4);
  const a = await M.User.create({ email: 'admin@qg-a.test', password: hash, role: 'admin', name: 'A', status: 'active', institutionId: 'qgA' });
  const off = await M.User.create({ email: 'admin@qg-off.test', password: hash, role: 'admin', name: 'Off', status: 'active', institutionId: 'qgOff' });
  await M.User.create({ email: 'student@qg-a.test', password: hash, role: 'student', name: 'S', status: 'active', institutionId: 'qgA' });
  await M.Curriculum.create({ id: 'cur-qg', name: 'Numbers', courseName: 'Maths', institutionId: 'qgA', summary: 's', lastUpdated: '2026-11-16', createdBy: String(a._id),
    chapters: [{ id: 'ch1', title: 'Counting in tens', description: 'Ten ones make one ten. Count the bundles: 10, 20, 30.', uploads: [] }, { id: 'empty', title: 'Empty', description: '', uploads: [] }] });
  await M.Curriculum.create({ id: 'cur-off', name: 'Off', institutionId: 'qgOff', summary: 's', lastUpdated: '2026-11-16', createdBy: String(off._id),
    chapters: [{ id: 'ch1', title: 'Tens', description: 'Counting in tens.', uploads: [] }] });
}, 120_000);
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { ai.calls = []; });

const login = async (email: string) => (await request(app).post('/api/auth/login').send({ email, password: PW })).body.token as string;
const gen = async (email: string, url: string, body: object = {}) => request(app).post(url).set('Authorization', `Bearer ${await login(email)}`).send(body);
const URL = '/api/curriculums/cur-qg/chapters/ch1/quiz/generate';
const mcq = (text: string, options: string[], correctAnswer: string) => ({ type: 'multiple-choice', text, options, correctAnswer, explanation: 'Because tens go up by 10.', points: 1, difficulty: 1, objectiveIds: [] });

describe('generate a lesson quiz from the chapter', () => {
  it('returns a reviewed-later draft: right answers as indexes, nothing saved', async () => {
    ai.handler = () => JSON.stringify({ title: 'Tens', questions: [
      mcq('What comes after 30?', ['31', '40', '300'], '40'),
      mcq('How many tens are in 50?', ['5', '50'], '5'),
      mcq('Which has 7 tens?', ['17', '70'], '70'),
    ] });
    const r = await gen('admin@qg-a.test', URL, { count: 3 });
    expect(r.status).toBe(200);
    expect(r.body.questions).toEqual([
      { text: 'What comes after 30?', options: ['31', '40', '300'], correctAnswer: 1, explanation: 'Because tens go up by 10.' },
      { text: 'How many tens are in 50?', options: ['5', '50'], correctAnswer: 0, explanation: 'Because tens go up by 10.' },
      { text: 'Which has 7 tens?', options: ['17', '70'], correctAnswer: 1, explanation: 'Because tens go up by 10.' },
    ]);
    // The prompt asks for this lesson, for young learners, with its description.
    const prompt = JSON.stringify(ai.calls[0]);
    expect(prompt).toContain('Counting in tens');
    expect(prompt).toContain('young learners');
    expect(prompt).toContain('Ten ones make one ten');
    const saved = await M.Curriculum.findOne({ id: 'cur-qg' }).lean() as any;
    expect(saved.chapters[0].quiz).toBeUndefined();
  });

  it('checks the request and the chapter before any AI call', async () => {
    expect((await gen('admin@qg-a.test', URL, { count: 2 })).status).toBe(400);
    expect((await gen('admin@qg-a.test', URL, { count: 11 })).status).toBe(400);
    const empty = await gen('admin@qg-a.test', '/api/curriculums/cur-qg/chapters/empty/quiz/generate');
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('CHAPTER_EMPTY');
    expect((await gen('admin@qg-a.test', '/api/curriculums/cur-qg/chapters/nope/quiz/generate')).status).toBe(404);
    expect(ai.calls).toHaveLength(0);
  });

  it('needs the school’s AI drafts switched on, the right school, and staff', async () => {
    const off = await gen('admin@qg-off.test', '/api/curriculums/cur-off/chapters/ch1/quiz/generate');
    expect(off.body.error.code).toBe('FEATURE_DISABLED');
    expect((await gen('admin@qg-off.test', URL)).status).toBe(404);
    expect((await gen('student@qg-a.test', URL)).status).toBe(403);
    expect(ai.calls).toHaveLength(0);
  });
});

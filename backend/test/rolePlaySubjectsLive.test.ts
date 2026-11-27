import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// liveRolePlay for every subject (owner correction 27 Nov 2026): maths in Arabic through the text tutor, and science in English through the live call.
// Model mocked; no provider call.
const mocks = vi.hoisted(() => ({ stream: vi.fn(), query: vi.fn(), params: [] as Record<string, unknown>[] }));
vi.mock('../src/services/elevenlabsVoice', () => ({ isElevenLabsVoiceConfigured: () => false, isElevenLabsVoiceUsable: async () => false, isVoiceRefusal: () => false, elevenLabsSttModel: () => 's', createTranscriptionToken: async () => 't', synthesizeSpeech: vi.fn() }));
vi.mock('../src/services/avatarVisuals', async (orig) => ({ ...(await orig<typeof import('../src/services/avatarVisuals')>()), generateVisualAid: vi.fn(async () => null) }));
vi.mock('../src/services/directTutorModel', async (orig) => ({ ...(await orig<typeof import('../src/services/directTutorModel')>()), isDirectTutorModelConfigured: () => true, streamDirectTutorModel: mocks.stream, queryDirectTutorModel: mocks.query }));

let mongo: MongoMemoryServer; let app: ReturnType<typeof import('../src/app')['createApp']>; let auth = '';
const PW = 'rs-test-password'; const realFetch = globalThis.fetch;
const LESSON = { title: 'My daily routine', spec: { objectives: ['Describe routines with the present simple'], successCriteria: ['Adds -s/-es with he/she/it'], grammar: ['present simple he/she/it -s'], items: [
  { id: 'i1', prompt: 'Correct the verb: "She go to bed at ten."', acceptedAnswers: ['She goes to bed at ten', 'goes'], targetForms: ['goes'], criteria: [1] },
  { id: 'i2', prompt: 'Correct the verb: "My dad watch TV after dinner."', acceptedAnswers: ['My dad watches TV after dinner', 'watches'], targetForms: ['watches'], criteria: [1] }] } };

beforeAll(async () => {
  process.env.ENARA_ENGINE_V2 = 'liveRolePlay,workOn';
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'k', ANAM_API_KEY: 'anam-key', ANAM_AVATAR_ID: 'avatar-1', ANAM_VOICE_ID_EN: 'voice-en', ANAM_VOICE_ID_AR: 'voice-ar' });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const M: Record<string, mongoose.Model<any>> = {}; for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[n] = (await import(`../src/models/${n}`))[n];
  const hash = bcrypt.hashSync(PW, 4);
  await M.Institution.create({ id: 'rs-school', name: 'RS', features: {}, learningSettings: { adultLearners: false } });
  await M.Batch.create({ id: 'rs-b', name: 'B', institutionId: 'rs-school', academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: 'rs-stu', name: 'Link Learner', email: 'rs@rs.test', grade: 'Grade 9', institutionId: 'rs-school', batchId: 'rs-b' });
  await M.StudentCredit.create({ studentId: 'rs-stu', institutionId: 'rs-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.User.create({ email: 'rs@rs.test', password: hash, role: 'student', name: 'Link', status: 'active', institutionId: 'rs-school', studentId: 'rs-stu' });
  await M.Curriculum.create({ id: 'rs-math', name: 'الرياضيات للصف السابع', institutionId: 'rs-school', courseName: 'الرياضيات', type: 'National', level: 'Grade 7', languages: ['Arabic'], summary: 'x', lastUpdated: '2026-11-27', status: 'deployed', chapters: [{ id: 'rs-math-l1', title: 'النقود والباقي', description: 'x' }] });
  await M.Curriculum.create({ id: 'rs-sci', name: 'Science Grade 7', institutionId: 'rs-school', courseName: 'Science', type: 'National', level: 'Grade 7', languages: ['English'], summary: 'x', lastUpdated: '2026-11-27', status: 'deployed', chapters: [{ id: 'rs-sci-l1', title: 'States of matter', description: 'x' }] });
  await M.CourseInstance.create({ id: 'rs-cls-m', courseId: 'rs-crs-m', courseName: 'Maths', institutionId: 'rs-school', academicYear: '2026', batchId: 'rs-b', curriculumId: 'rs-math', studentIds: ['rs-stu'], instructorIds: [], visibility: 'student' });
  await M.CourseInstance.create({ id: 'rs-cls-s', courseId: 'rs-crs-s', courseName: 'Science', institutionId: 'rs-school', academicYear: '2026', batchId: 'rs-b', curriculumId: 'rs-sci', studentIds: ['rs-stu'], instructorIds: [], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  auth = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'rs@rs.test', password: PW })).body.token}`;
  globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => (String(u).startsWith('https://api.anam.ai/') ? Promise.resolve(new Response(JSON.stringify({ sessionToken: 'anam-token', data: [], meta: { lastPage: 1 } }), { status: 200 })) : realFetch(u, i))) as typeof fetch;
}, 120_000);
afterAll(async () => { delete process.env.ENARA_ENGINE_V2; globalThis.fetch = realFetch; await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { mocks.params.length = 0; mocks.stream.mockReset(); mocks.query.mockReset(); });
const answer = (text: string) => mocks.query.mockImplementationOnce(async (p: Record<string, unknown>) => { mocks.params.push(p); return { answer: text, intent: 'direct_model', context_found: 0, version: 'deepseek:test' }; });
const chat = async (sid: string, text: string) => (await request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', auth).send({ text })).body;
const reply = (text: string) => mocks.stream.mockImplementationOnce(async function* (p: Record<string, unknown>) { mocks.params.push(p); yield text; });
const startCall = async () => (await request(app).post('/api/avatar/session').set('Authorization', auth).send({ course_id: 'rs-crs-s', lesson_id: 'rs-sci-l1', preferred_language: 'english' })).body.session_id as string;
const say = async (sid: string, content: string) => { const r = await request(app).post('/api/avatar/query-stream').set('Authorization', auth).send({ session_id: sid, messages: [{ role: 'user', content }] }); const ev = String(r.text).split('\n').filter(Boolean).map((l) => JSON.parse(l)); return { status: r.status, text: ev.filter((e) => e.content).map((e) => e.content).join(''), scene: ev.find((e) => 'scene' in e)?.scene }; };
const storedAi = async (sid: string) => (await mongoose.connection.collection('tutor_messages').find({ sessionId: sid, role: 'ai' }).sort({ timestamp: 1 }).toArray());



const ped = (n: number) => String(mocks.params[n].pedagogy);
describe('role-play in other subjects (switch liveRolePlay on)', () => {
  it('maths in Arabic (text tutor): the maths scene starts in fusha, a wrong sum is fixed in character and logged, the debrief gives the maths method', async () => {
    const sid = (await request(app).post('/api/me/tutor/sessions').set('Authorization', auth).send({ courseId: 'rs-crs-m', lessonId: 'rs-math-l1' })).body.id as string;
    answer('مرحبًا! لنبدأ مشهدًا قصيرًا: في سوق الخضار. أنا العم صابر. صباح الخير! طماطم طازجة اليوم: اثنا عشر جنيهًا للكيلو. كم كيلو تريد؟');
    let r = await chat(sid, 'هل يمكن أن نمثّل مشهدًا في السوق؟');
    expect(ped(0)).toMatch(/ROLE-PLAY \(set by the system\), beat 1 of 6/);
    expect(ped(0)).toContain('Subject: maths');
    expect(ped(0)).toContain('Formal Arabic (fusha) only');
    expect(ped(0)).toContain('صباح الخير! لدينا اليوم طماطم وبرتقال طازج');
    expect(r.assistantMessage.meta.rolePlay).toMatchObject({ scene: 'maths-market', phase: 'beat', beat: 1 });
    answer('ثلاثة كيلوجرامات بسعر اثني عشر جنيهًا للكيلو. كم المبلغ كله؟');
    r = await chat(sid, 'ثلاثة كيلو من فضلك');
    // beat 2 expects 36: the learner says 30
    answer('دعني أحسب: ثلاثة في اثني عشر... ستة وثلاثون جنيهًا. هل تريد شيئًا آخر؟ البرتقال بعشرة جنيهات للكيلو.');
    r = await chat(sid, 'المبلغ 30 جنيهًا');
    expect(ped(2)).toMatch(/they said 30, the right answer is 36/);
    const ewo = await mongoose.connection.collection('errors_to_work_on').find({ studentId: 'rs-stu' }).toArray();
    expect(ewo).toHaveLength(1);
    expect(ewo[0]).toMatchObject({ errorCode: 'wrong_number', objectiveId: 'MA-total-price' });
    expect(r.assistantMessage.meta.rolePlay).toMatchObject({ phase: 'beat', beat: 3, err: 'wrong_number', errs: ['MA-total-price'] });
    // the learner says goodbye: the debrief gives the maths method in Arabic (guaranteed by code)
    answer('أحسنت في المشهد! والآن سؤال جديد: اشتريت كيلوجرامين من الموز بسعر خمسة عشر جنيهًا للكيلو. كم المجموع؟');
    r = await chat(sid, 'شكرًا، مع السلامة');
    expect(ped(3)).toMatch(/ROLE-PLAY DEBRIEF/);
    expect(r.assistantMessage.text).toContain('القاعدة: لحساب المجموع نضرب ثمن الواحد في عدد ما نشتريه.');
    expect(r.assistantMessage.text).toContain('صواب: ثلاثة كيلوجرامات');
    expect(r.assistantMessage.meta.rolePlay).toMatchObject({ phase: 'debrief' });
  });
  it('science in English (live call): the science scene and its card; the reply is guarded like the language engine', async () => {
    const sid = await startCall();
    reply('Let us do a short role-play: Ice, water and steam in the kitchen. I am Dina. Hi! Look at these ice cubes. Are they a solid, a liquid or a gas?');
    let r = await say(sid, "Can we do a role-play in the kitchen?");
    expect(r.scene).toMatchObject({ id: 'science-kitchen', beat: 1 });
    expect(String(mocks.params[0].pedagogy)).toContain('Subject: science');
    // beat 2: an off-scene draft with a lesson task is regenerated once; the second is kept
    reply('Good. Now fill in the gap: Ice is a ___.');
    reply('They are solid, yes! Ten minutes later the ice is water. What happened to it?');
    r = await say(sid, 'They are solid.');
    expect(mocks.params.length).toBe(3);
    expect(r.text).toBe('They are solid, yes! Ten minutes later the ice is water. What happened to it?');
    expect(r.scene).toMatchObject({ beat: 2 });
    const docs = await storedAi(sid);
    expect(docs.at(-1)!.meta.rolePlay).toMatchObject({ scene: 'science-kitchen', phase: 'beat', beat: 2 });
  });
}, 60_000);

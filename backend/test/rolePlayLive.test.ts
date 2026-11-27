import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// liveRolePlay PR 2: a role-play through the live call (/api/avatar/query-stream), end to end with the shared engine. Model mocked; no provider call.
const mocks = vi.hoisted(() => ({ stream: vi.fn(), params: [] as Record<string, unknown>[] }));
vi.mock('../src/services/elevenlabsVoice', () => ({ isElevenLabsVoiceConfigured: () => false, isElevenLabsVoiceUsable: async () => false, isVoiceRefusal: () => false, elevenLabsSttModel: () => 's', createTranscriptionToken: async () => 't', synthesizeSpeech: vi.fn() }));
vi.mock('../src/services/avatarVisuals', async (orig) => ({ ...(await orig<typeof import('../src/services/avatarVisuals')>()), generateVisualAid: vi.fn(async () => null) }));
vi.mock('../src/services/directTutorModel', async (orig) => ({ ...(await orig<typeof import('../src/services/directTutorModel')>()), isDirectTutorModelConfigured: () => true, streamDirectTutorModel: mocks.stream }));

let mongo: MongoMemoryServer; let app: ReturnType<typeof import('../src/app')['createApp']>; let auth = '';
const PW = 'rp-test-password'; const realFetch = globalThis.fetch;
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
  await M.Institution.create({ id: 'rp-school', name: 'RP', features: {}, learningSettings: { adultLearners: false } });
  await M.Batch.create({ id: 'rp-b', name: 'B', institutionId: 'rp-school', academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: 'rp-stu', name: 'Link Learner', email: 'rp@rp.test', grade: 'Grade 9', institutionId: 'rp-school', batchId: 'rp-b' });
  await M.StudentCredit.create({ studentId: 'rp-stu', institutionId: 'rp-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.User.create({ email: 'rp@rp.test', password: hash, role: 'student', name: 'Link', status: 'active', institutionId: 'rp-school', studentId: 'rp-stu' });
  await M.Curriculum.create({ id: 'rp-cur', name: 'English A2', institutionId: 'rp-school', courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 'x', lastUpdated: '2026-11-13', status: 'deployed', chapters: [{ id: 'rp-lsn', title: LESSON.title, description: 'Routines', languageSpec: LESSON.spec }] });
  await M.CourseInstance.create({ id: 'rp-cls', courseId: 'rp-crs', courseName: 'English A2', institutionId: 'rp-school', academicYear: '2026', batchId: 'rp-b', curriculumId: 'rp-cur', studentIds: ['rp-stu'], instructorIds: [], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  auth = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'rp@rp.test', password: PW })).body.token}`;
  globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => (String(u).startsWith('https://api.anam.ai/') ? Promise.resolve(new Response(JSON.stringify({ sessionToken: 'anam-token', data: [], meta: { lastPage: 1 } }), { status: 200 })) : realFetch(u, i))) as typeof fetch;
}, 120_000);
afterAll(async () => { delete process.env.ENARA_ENGINE_V2; globalThis.fetch = realFetch; await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { mocks.params.length = 0; mocks.stream.mockReset(); });
const reply = (text: string) => mocks.stream.mockImplementationOnce(async function* (p: Record<string, unknown>) { mocks.params.push(p); yield text; });
const startCall = async () => (await request(app).post('/api/avatar/session').set('Authorization', auth).send({ course_id: 'rp-crs', lesson_id: 'rp-lsn', preferred_language: 'english' })).body.session_id as string;
const say = async (sid: string, content: string) => { const r = await request(app).post('/api/avatar/query-stream').set('Authorization', auth).send({ session_id: sid, messages: [{ role: 'user', content }] }); const ev = String(r.text).split('\n').filter(Boolean).map((l) => JSON.parse(l)); return { status: r.status, text: ev.filter((e) => e.content).map((e) => e.content).join(''), scene: ev.find((e) => 'scene' in e)?.scene }; };
const storedAi = async (sid: string) => (await mongoose.connection.collection('tutor_messages').find({ sessionId: sid, role: 'ai' }).sort({ timestamp: 1 }).toArray());


const ctx = (n: number) => String(mocks.params[n].languageContext);
describe('role-play in the live call (switch liveRolePlay on)', () => {
  it('asks, plays beats with a recast and a regeneration, logs the error, then debriefs from the rule bank', async () => {
    const sid = await startCall();
    // 1. the learner asks: code picks the restaurant scene (named), the model voices beat 1; the side panel gets the card
    reply('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM]]\nLet us do a short role-play: Ordering at a restaurant. I am Karim, your waiter. Good evening. A table for one?');
    let r = await say(sid, 'Can we do a role-play at a restaurant?');
    expect(r.status).toBe(200);
    expect(ctx(0)).toMatch(/ROLE-PLAY \(set by the system\), beat 1 of 8/);
    expect(ctx(0)).toContain('Good evening. A table for one?');
    expect(r.scene).toMatchObject({ id: 'restaurant-order', beat: 1, beats: 8, phase: 'beat', character: { en: 'Karim, a waiter', ar: 'كريم، نادل' } });
    let docs = await storedAi(sid);
    expect(docs.at(-1)!.meta.languageTurn.rolePlay).toEqual({ scene: 'restaurant-order', phase: 'beat', beat: 1, tries: 0, via: 'ask', errs: [] });
    // 2. beat 2: the first draft leaves the scene, ONE regeneration with the reason, the second draft is kept
    reply('Great answer! Now a grammar exercise: fill in some or any.');
    reply('Here is the menu. Would you like something to drink?');
    r = await say(sid, 'Yes, please.');
    expect(mocks.params.length).toBe(3);
    expect(String(mocks.params[2].pedagogy)).toMatch(/Your last draft left the role-play scene \(teaching talk/);
    expect(r.text).toBe('Here is the menu. Would you like something to drink?');
    // 3. beat 3: an error in their message: the recast line, and the error goes to errors to work on with its code
    reply('Some water, of course. Are you ready to order?');
    r = await say(sid, 'The water very cold, please.');
    expect(ctx(3)).toMatch(/small error \(am, is or are is missing/);
    expect(r.scene).toMatchObject({ beat: 3 });
    const ewo = await mongoose.connection.collection('errors_to_work_on').find({ studentId: 'rp-stu' }).toArray();
    expect(ewo).toHaveLength(1);
    expect(ewo[0]).toMatchObject({ errorCode: 'copula_omitted', objectiveId: 'EN-F-A1-GR-copula-be', status: 'open' });
    expect(ewo[0].sources[0]).toMatchObject({ kind: 'roleplay', assessmentId: 'roleplay:restaurant-order', questionId: 'copula_omitted' });
    docs = await storedAi(sid);
    expect(docs.at(-1)!.meta.languageTurn.rolePlay).toMatchObject({ phase: 'beat', beat: 3, err: 'copula_omitted', errs: ['copula_omitted'] });
    expect(JSON.stringify(docs.at(-1)!.meta.languageTurn.rolePlay)).not.toContain('water');
    // 4. they stop: the debrief, with the rule line and the right/wrong pair guaranteed by code
    reply('Well done in the restaurant! Now try one: My brother ___ a teacher.');
    r = await say(sid, 'stop please');
    expect(ctx(4)).toMatch(/ROLE-PLAY DEBRIEF/);
    expect(r.text).toContain('Rule: With no action word, use am, is or are');
    expect(r.text).toContain('Right: The giraffe is very tall. Wrong: The giraffe very tall.');
    expect(r.text).toContain('My brother ___ a teacher.');
    expect(r.scene).toMatchObject({ phase: 'debrief' });
    // 5. back to the lesson: no scene, the card goes away
    reply('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i1]]\nCorrect the verb: "She go to bed at ten."');
    r = await say(sid, 'My brother is a teacher.');
    expect(ctx(5)).not.toMatch(/ROLE-PLAY/);
    expect(r.scene).toBeNull();
    expect((await storedAi(sid)).at(-1)!.meta.languageTurn.rolePlay).toEqual({ scene: 'restaurant-order', phase: 'after' });
  });
  it('the text tutor shares the engine (same pipeline functions, same regeneration)', () => {
    const t = readFileSync(path.join(__dirname, '../src/controllers/tutor.controller.ts'), 'utf8');
    expect(t).toMatch(/rolePlayRegenNote/);
    expect(t).toMatch(/rolePlayFixed/);
  });
}, 60_000);

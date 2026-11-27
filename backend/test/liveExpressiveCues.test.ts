import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// liveExpressive PR 2: in a real language lesson the live avatar's cue is chosen by code from the engine's verdict (never by
// the model), sent as its own line before the words it applies to, and never inside the text, the speech or the transcript.
// Model mocked; no provider call.
const mocks = vi.hoisted(() => ({ stream: vi.fn(), params: [] as Record<string, unknown>[] }));
vi.mock('../src/services/elevenlabsVoice', () => ({ isElevenLabsVoiceConfigured: () => false, isElevenLabsVoiceUsable: async () => false, isVoiceRefusal: () => false, elevenLabsSttModel: () => 's', createTranscriptionToken: async () => 't', synthesizeSpeech: vi.fn() }));
vi.mock('../src/services/avatarVisuals', async (orig) => ({ ...(await orig<typeof import('../src/services/avatarVisuals')>()), generateVisualAid: vi.fn(async () => null) }));
vi.mock('../src/services/directTutorModel', async (orig) => ({ ...(await orig<typeof import('../src/services/directTutorModel')>()), isDirectTutorModelConfigured: () => true, streamDirectTutorModel: mocks.stream }));

let mongo: MongoMemoryServer; let app: ReturnType<typeof import('../src/app')['createApp']>; let auth = '';
const PW = 'link-test-password'; const realFetch = globalThis.fetch;
const LESSON = { title: 'My daily routine', spec: { objectives: ['Describe routines with the present simple'], successCriteria: ['Adds -s/-es with he/she/it'], grammar: ['present simple he/she/it -s'], items: [
  { id: 'i1', prompt: 'Correct the verb: "She go to bed at ten."', acceptedAnswers: ['She goes to bed at ten', 'goes'], targetForms: ['goes'], criteria: [1] },
  { id: 'i2', prompt: 'Correct the verb: "My dad watch TV after dinner."', acceptedAnswers: ['My dad watches TV after dinner', 'watches'], targetForms: ['watches'], criteria: [1] }] } };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'k', ANAM_API_KEY: 'anam-key', ANAM_AVATAR_ID: 'avatar-1', ANAM_VOICE_ID_EN: 'voice-en', ANAM_VOICE_ID_AR: 'voice-ar' });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const M: Record<string, mongoose.Model<any>> = {}; for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[n] = (await import(`../src/models/${n}`))[n];
  const hash = bcrypt.hashSync(PW, 4);
  await M.Institution.create({ id: 'lk-school', name: 'LK', features: {}, learningSettings: { adultLearners: false } });
  await M.Batch.create({ id: 'lk-b', name: 'B', institutionId: 'lk-school', academicYear: '2026', studentCount: 1 });
  await M.Student.create({ id: 'lk-stu', name: 'Link Learner', email: 'lk@lk.test', grade: 'Evening', institutionId: 'lk-school', batchId: 'lk-b', learnerAgeBand: 'adult' });
  await M.StudentCredit.create({ studentId: 'lk-stu', institutionId: 'lk-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.User.create({ email: 'lk@lk.test', password: hash, role: 'student', name: 'Link', status: 'active', institutionId: 'lk-school', studentId: 'lk-stu' });
  await M.Curriculum.create({ id: 'lk-cur', name: 'English A2', institutionId: 'lk-school', courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 'x', lastUpdated: '2026-11-13', status: 'deployed', chapters: [{ id: 'lk-lsn', title: LESSON.title, description: 'Routines', languageSpec: LESSON.spec }] });
  await M.CourseInstance.create({ id: 'lk-cls', courseId: 'lk-crs', courseName: 'English A2', institutionId: 'lk-school', academicYear: '2026', batchId: 'lk-b', curriculumId: 'lk-cur', studentIds: ['lk-stu'], instructorIds: [], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  auth = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'lk@lk.test', password: PW })).body.token}`;
  globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => (String(u).startsWith('https://api.anam.ai/') ? Promise.resolve(new Response(JSON.stringify({ sessionToken: 'anam-token', data: [{ id: 'avatar-1', displayName: 'Leo', availableVersions: ['cara-4', 'cara-4.1-express'] }], meta: { lastPage: 1 } }), { status: 200 })) : realFetch(u, i))) as typeof fetch;
}, 120_000);
afterAll(async () => { globalThis.fetch = realFetch; await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { mocks.params.length = 0; mocks.stream.mockReset(); });
const reply = (text: string) => mocks.stream.mockImplementationOnce(async function* (p: Record<string, unknown>) { mocks.params.push(p); yield text; });
const startCall = async () => (await request(app).post('/api/avatar/session').set('Authorization', auth).send({ course_id: 'lk-crs', lesson_id: 'lk-lsn', preferred_language: 'english' })).body.session_id as string;
const say = async (sid: string, content: string) => { const r = await request(app).post('/api/avatar/query-stream').set('Authorization', auth).send({ session_id: sid, messages: [{ role: 'user', content }] }); const lines = String(r.text).split('\n').filter(Boolean).map((l) => JSON.parse(l)); return { status: r.status, lines, cues: lines.filter((e) => e.cue).map((e) => e.cue as string), text: lines.filter((e) => e.content).map((e) => e.content).join('') }; };
const storedAi = async (sid: string) => (await mongoose.connection.collection('tutor_messages').find({ sessionId: sid, role: 'ai' }).sort({ timestamp: 1 }).toArray());

let prevSwitch: string | undefined;
beforeAll(() => { prevSwitch = process.env.ENARA_ENGINE_V2; process.env.ENARA_ENGINE_V2 = 'liveExpressive'; });
afterAll(() => { if (prevSwitch === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = prevSwitch; });
const ITEM = '[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i1]]\nCorrect the verb: "She go to bed at ten."';

describe('liveExpressive: the cue follows the verdict', () => {
  it('new question -> curious; wrong -> supportive; stuck -> concerned then supportive; right -> happy then curious on the new item', async () => {
    const sid = await startCall();
    reply(ITEM);
    let r = await say(sid, 'Can I have an exercise?');
    expect(r.cues).toEqual(['curious']);
    expect(r.lines.findIndex((l) => l.cue)).toBeLessThan(r.lines.findIndex((l) => l.content)); // before any word

    reply('[[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM item=i1]]\nNot quite. Look at the verb after she.');
    r = await say(sid, 'She go to bed at ten');
    expect(r.cues).toEqual(['supportive']);

    reply('[[assess verdict=NOT_EVALUATED relevance=ACTIVE_ITEM next=SAME_ITEM item=i1]]\nThat is fine, it is tricky. With he or she we add -s to the verb. Try once more.');
    r = await say(sid, "I don't know");
    expect(r.cues).toEqual(['concerned', 'supportive']);
    const kinds = r.lines.map((l) => (l.cue ? `cue:${l.cue}` : l.content ? 'text' : 'other'));
    expect(kinds.slice(0, 4)).toEqual(['cue:concerned', 'text', 'cue:supportive', 'text']);
    expect(r.lines[1].content).toBe('That is fine, it is tricky. ');

    reply('[[assess verdict=CORRECT relevance=ACTIVE_ITEM next=NEW_ITEM item=i2]]\nYes, well done! Correct the verb: "My dad watch TV after dinner."');
    r = await say(sid, 'She goes to bed at ten.');
    expect(r.cues).toEqual(['happy', 'curious']);
    // The stored transcript is the reply without any cue.
    for (const doc of await storedAi(sid)) expect(doc.text).not.toMatch(/\[(happy|warm|supportive|curious|concerned)\]/);
    // Each stored reply keeps the cues it got and the verdict they followed (tags only).
    expect((await storedAi(sid)).map((d) => d.meta?.expressive)).toEqual([
      { cues: ['curious'], verdict: 'NOT_EVALUATED' }, { cues: ['supportive'], verdict: 'INCORRECT' },
      { cues: ['concerned', 'supportive'], verdict: 'NOT_EVALUATED', stuck: true }, { cues: ['happy', 'curious'], verdict: 'CORRECT' }]);
  });

  it('removes cue tags the model writes itself (blocked ones included) from the words, the speech and the transcript', async () => {
    const sid = await startCall();
    reply(ITEM.replace('Correct the verb', '[angry] Correct the verb').replace('ten."', 'ten." [laughter]'));
    const r = await say(sid, 'Give me an exercise');
    expect(r.text).not.toMatch(/\[(angry|laughter)\]/i);
    expect(r.text).toContain('Correct the verb: "She go to bed at ten."');
    expect(r.cues).toEqual(['curious']);
    expect(r.cues.some((c) => ['angry', 'sad', 'distressed', 'laughter'].includes(c))).toBe(false);
    expect((await storedAi(sid)).at(-1)!.text).not.toMatch(/\[(angry|laughter)\]/i);
  });

  it('switch off: no cue line, the call as today', async () => {
    process.env.ENARA_ENGINE_V2 = '';
    try {
      const sid = await startCall();
      reply(ITEM);
      const r = await say(sid, 'Can I have an exercise?');
      expect(r.cues).toEqual([]);
    } finally { process.env.ENARA_ENGINE_V2 = 'liveExpressive'; }
  });
});

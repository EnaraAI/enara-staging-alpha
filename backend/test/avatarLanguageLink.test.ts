import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_ADAPTATION, LANGUAGE_POLICY_VERSION, prepareLanguageContext } from '../src/services/languageTurnPipeline';

// Linking test: the live avatar and the text chat use ONE language engine. These tests fail if either channel stops using the
// shared pipeline, if the policy version differs, or if a voice reply skips a chat guarantee (answer guards, hidden-marker removal,
// English-only, stored turn state). Model mocked; no provider call.
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
  await M.Student.create({ id: 'lk-stu', name: 'Link Learner', email: 'lk@lk.test', grade: 'Grade 9', institutionId: 'lk-school', batchId: 'lk-b' });
  await M.StudentCredit.create({ studentId: 'lk-stu', institutionId: 'lk-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  await M.User.create({ email: 'lk@lk.test', password: hash, role: 'student', name: 'Link', status: 'active', institutionId: 'lk-school', studentId: 'lk-stu' });
  await M.Curriculum.create({ id: 'lk-cur', name: 'English A2', institutionId: 'lk-school', courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 'x', lastUpdated: '2026-11-13', status: 'deployed', chapters: [{ id: 'lk-lsn', title: LESSON.title, description: 'Routines', languageSpec: LESSON.spec }] });
  await M.CourseInstance.create({ id: 'lk-cls', courseId: 'lk-crs', courseName: 'English A2', institutionId: 'lk-school', academicYear: '2026', batchId: 'lk-b', curriculumId: 'lk-cur', studentIds: ['lk-stu'], instructorIds: [], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  auth = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'lk@lk.test', password: PW })).body.token}`;
  globalThis.fetch = ((u: string | URL | Request, i?: RequestInit) => (String(u).startsWith('https://api.anam.ai/') ? Promise.resolve(new Response(JSON.stringify({ sessionToken: 'anam-token', data: [], meta: { lastPage: 1 } }), { status: 200 })) : realFetch(u, i))) as typeof fetch;
}, 120_000);
afterAll(async () => { globalThis.fetch = realFetch; await mongoose.disconnect(); await mongo.stop(); });
beforeEach(() => { mocks.params.length = 0; mocks.stream.mockReset(); });
const reply = (text: string) => mocks.stream.mockImplementationOnce(async function* (p: Record<string, unknown>) { mocks.params.push(p); yield text; });
const startCall = async () => (await request(app).post('/api/avatar/session').set('Authorization', auth).send({ course_id: 'lk-crs', lesson_id: 'lk-lsn', preferred_language: 'english' })).body.session_id as string;
const say = async (sid: string, content: string) => { const r = await request(app).post('/api/avatar/query-stream').set('Authorization', auth).send({ session_id: sid, messages: [{ role: 'user', content }] }); return { status: r.status, text: String(r.text).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.content).map((e) => e.content).join('') }; };
const storedAi = async (sid: string) => (await mongoose.connection.collection('tutor_messages').find({ sessionId: sid, role: 'ai' }).sort({ timestamp: 1 }).toArray());

describe('live avatar uses the shared language engine', () => {
  it('sends the SAME language-teaching context as chat (same policy version) plus the thin voice layer', async () => {
    const sid = await startCall(); reply('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i1]]\nHere is one for you. Correct the verb: "She go to bed at ten."');
    expect((await say(sid, 'Can I have an exercise?')).status).toBe(200);
    const ctx = String(mocks.params[0].languageContext);
    expect(ctx).toContain(`<language_teaching_context version="${LANGUAGE_POLICY_VERSION}">`);
    expect(ctx).toContain(VOICE_ADAPTATION);
    expect(ctx).toMatch(/Lesson item to present now: \[i1\]/);
    expect(String(mocks.params[0].query)).toContain('(Reply only in English.)');
  });
  it('voice and chat prompts differ ONLY by the voice layer', async () => {
    const input = { institutionId: 'lk-school', curriculumId: 'lk-cur', lessonId: 'lk-lsn', studentId: 'lk-stu', sessionId: 'x', courseId: 'lk-crs', message: 'hello', history: [], hintsOnly: false } as never;
    const chat = await prepareLanguageContext(input, 'chat'); const voice = await prepareLanguageContext(input, 'voice');
    expect(chat).not.toBeNull(); expect(voice!.prompt).toBe(`${chat!.prompt}\n\n${VOICE_ADAPTATION}`);
  });
  it('removes an example that shows the tested form before any attempt, and hides the assessment marker (chat guarantees hold in voice)', async () => {
    const sid = await startCall(); reply('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i1]]\nThe rule: he/she/it add -s.\n- I **go** → She **goes**\n- I sleep → He sleeps\n\nYour turn: Correct the verb: "She go to bed at ten."');
    const r = await say(sid, 'Can I have an exercise?');
    expect(r.text).not.toMatch(/\bgoes\b/); expect(r.text).not.toMatch(/\[\[assess/); expect(r.text).toContain('She go to bed at ten.');
    const doc = (await storedAi(sid)).at(-1)!; expect(doc.text).toBe(r.text); expect(doc.meta?.languageTurn?.preAttemptModelsRemoved).toBe(1);
  });
  it('stores the engine turn state, and the next voice turn continues from it (open task carried over)', async () => {
    const sid = await startCall(); reply('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i1]]\nCorrect the verb: "She go to bed at ten."'); await say(sid, 'Give me an exercise');
    reply('[[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM item=i1]]\nLook at the verb after she.'); await say(sid, 'She go to bed at ten');
    expect(String(mocks.params[1].languageContext)).toMatch(/The open task is lesson item \[i1\]/);
    const docs = await storedAi(sid); expect(docs.at(-1)!.meta?.languageTurn?.assessment?.verdict).toBe('INCORRECT');
  });
  it('a chat turn and a voice turn share the learner history (voice turns are visible to the engine as stored turns)', async () => {
    const sid = await startCall(); reply('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i1]]\nCorrect the verb: "She go to bed at ten."'); await say(sid, 'exercise please');
    const prof = await mongoose.connection.collection('tutor_messages').find({ sessionId: sid }).toArray(); expect(prof.some((m) => m.meta?.languageTurn)).toBe(true);
  });
  it('static parity: both controllers use the shared pipeline and neither re-implements the guards', () => {
    const src = (f: string) => readFileSync(path.join(__dirname, '../src/controllers', f), 'utf8');
    for (const f of ['tutor.controller.ts', 'avatar.controller.ts']) { const t = src(f); expect(t, f).toMatch(/languageTurnPipeline/); expect(t, f).toMatch(/applyReplyGuards/); expect(t, f).toMatch(/completeLanguageTurn/); expect(t, f).not.toMatch(/stripPreAttemptModels|stripCopyReadyModels|finalizeLanguageTurn\(/); expect(t, f).not.toMatch(/buildLanguageTeachingContext\(/); }
    expect(src('avatar.controller.ts')).toMatch(/LANGUAGE_POLICY_VERSION/);
  });
}, 60_000);

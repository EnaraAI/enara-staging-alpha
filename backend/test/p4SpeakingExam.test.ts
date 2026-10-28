import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P4: teacher-controlled English speaking exams, voice only. Anthropic
// (examiner follow-ups, rubric grading) and ElevenLabs (STT/TTS) are mocked:
// no network, no paid calls, no Anam. Mocked tests do not show that real
// voice sessions work.
const ai = vi.hoisted(() => ({ calls: [] as any[], handler: (_b: any): string | Error => '' }));
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
const el = vi.hoisted(() => ({ heard: 'I think the city should build more parks for families', stt: [] as any[], tts: [] as string[], sttFail: false }));
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    speechToText = {
      convert: async (req: any) => {
        el.stt.push(req);
        if (el.sttFail) throw Object.assign(new Error('provider down'), { status: 500 });
        return { text: el.heard, words: el.heard ? [{ text: 'x', start: 0, end: 4.5 }] : [] };
      },
    };
    textToSpeech = {
      stream: async (_voice: string, req: any) => {
        el.tts.push(req.text);
        return (async function* () {
          yield new Uint8Array([1, 2, 3, 4]);
        })();
      },
    };
    tokens = { singleUse: { create: async () => ({ token: 't' }) } };
  },
}));

const RUBRIC = [
  { id: 'task', title: 'Task completion', maxPoints: 4, levels: [{ id: 'none', label: 'Missing', points: 0 }, { id: 'part', label: 'Partial', points: 2 }, { id: 'full', label: 'Complete', points: 4, description: 'gives reasons about recreation and wellbeing' }] },
  { id: 'gram', title: 'Grammar', maxPoints: 4, levels: [{ id: 'g0', label: 'Weak', points: 0 }, { id: 'g2', label: 'Good', points: 4 }] },
];
const MODEL = 'Parks improve wellbeing and recreation for residents';
const grade = JSON.stringify({
  criteria: [{ criterionId: 'task', levelId: 'part', evidence: ['more parks'], rationale: 'Gives a view.' }, { criterionId: 'gram', levelId: 'g2', evidence: ['should build'], rationale: 'Accurate.' }],
  scoreExplanation: 'Clear view.', strengths: ['Clear'], improvements: ['Give reasons'], feedback: 'Good.', objectiveIds: [], confidence: 'medium', flags: [],
});
const isExaminer = (b: any) => /impartial examiner/.test(b.system);
let followUp: string | null = 'Can you tell me more about why?';
const DEFAULT = (b: any) => (isExaminer(b) ? JSON.stringify({ followUp }) : grade);

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let SE: typeof import('../src/services/speakingExam');
let M: Record<string, mongoose.Model<any>>;
const ENV = {
  NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
  JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
  AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key', ELEVENLABS_API_KEY: 'test-el',
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { ...ENV, MONGODB_URI: mongo.getUri() });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  SE = await import('../src/services/speakingExam');
  M = {};
  for (const n of ['User', 'Institution', 'Curriculum', 'CourseInstance', 'Student', 'Assignment', 'AssessmentAttempt', 'UsageLedger', 'OrgBudget', 'AvatarSession']) M[n] = (await import(`../src/models/${n}`))[n];
  const a = await import('../src/models/Assessment');
  M.Assessment = a.Assessment;
  M.AssessmentVersion = a.AssessmentVersion;
  await mongoose.connect(mongo.getUri());
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
}, 60_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

let n = 0;
type Who = Awaited<ReturnType<typeof bearer>>;
async function bearer(role: string, institutionId: string, studentId?: string) {
  n += 1;
  const email = `${role}${n}@x.com`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId, studentId });
  const auth = `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId, studentId })}`;
  return {
    id: user._id.toString(),
    auth,
    get: (url: string) => request(app).get(url).set('Authorization', auth),
    post: (url: string, body: object = {}) => request(app).post(url).set('Authorization', auth).send(body),
    patch: (url: string, body: object) => request(app).patch(url).set('Authorization', auth).send(body),
    put: (url: string, body: object) => request(app).put(url).set('Authorization', auth).send(body),
    audio: (url: string, fields: Record<string, string> = {}, mime = 'audio/webm') => {
      let r = request(app).post(url).set('Authorization', auth);
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach('audio', Buffer.alloc(2048, 7), { filename: 'reply.webm', contentType: mime });
    },
  };
}
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
}
const attemptOf = (id: string) => M.AssessmentAttempt.findOne({ id }).lean() as Promise<any>;
const settled = (id: string) => until(async () => !['grading_queued', 'grading_in_progress'].includes((await attemptOf(id))?.gradingStatus));

const FLAGS = { teaching_workflow_enabled: true, ai_grading_enabled: true, speaking_exams_enabled: true };
let T: Who, T2: Who, S1: Who, S2: Who, AM: Who, TB: Who, SB: Who;
beforeEach(async () => {
  ai.calls = [];
  ai.handler = DEFAULT;
  followUp = 'Can you tell me more about why?';
  Object.assign(el, { heard: 'I think the city should build more parks for families', stt: [], tts: [], sttFail: false });
  for (const m of Object.values(M)) await mongoose.connection.collection(m.collection.name).deleteMany({});
  for (const c of ['rate_limits', 'budget_counters', 'budget_reservations', 'ai_calls']) await mongoose.connection.collection(c).deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  (await import('../src/services/aiBudget')).forgetAiBudgetCache();
  SE.setAvatarExamAvailabilityForTests(null);
  await M.Institution.create([
    { id: 'instA', name: 'A', features: FLAGS },
    { id: 'instB', name: 'B', features: FLAGS },
    { id: 'instOff', name: 'Off', features: { teaching_workflow_enabled: true, ai_grading_enabled: true } },
  ]);
  await M.Curriculum.create([
    { id: 'cur', name: 'English', courseName: 'English', institutionId: 'instA', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', chapters: [] },
    { id: 'curB', name: 'English', courseName: 'English', institutionId: 'instB', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', chapters: [] },
  ]);
  T = await bearer('teacher', 'instA');
  T2 = await bearer('teacher', 'instA');
  AM = await bearer('academic_manager', 'instA');
  TB = await bearer('teacher', 'instB');
  await M.CourseInstance.create([
    { id: 'cls', courseId: 'en', courseName: 'English 8A', institutionId: 'instA', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: ['stu1', 'stu2'], instructorIds: [T.id], visibility: 'student' },
    { id: 'cls2', courseId: 'en2', courseName: 'English 8B', institutionId: 'instA', academicYear: '2026', batchId: 'b2', curriculumId: 'cur', studentIds: ['stu3'], instructorIds: [T2.id], visibility: 'student' },
    { id: 'clsB', courseId: 'enB', courseName: 'English B', institutionId: 'instB', academicYear: '2026', batchId: 'bB', curriculumId: 'curB', studentIds: ['stuB'], instructorIds: [TB.id], visibility: 'student' },
  ]);
  await M.Student.create([
    { id: 'stu1', name: 'Amira', email: 'a@x.com', grade: '8', institutionId: 'instA', batchId: 'b' },
    { id: 'stu2', name: 'Bilal', email: 'b@x.com', grade: '8', institutionId: 'instA', batchId: 'b' },
    { id: 'stu3', name: 'Carl', email: 'c@x.com', grade: '8', institutionId: 'instA', batchId: 'b2' },
    { id: 'stuB', name: 'Dina', email: 'd@x.com', grade: '8', institutionId: 'instB', batchId: 'bB' },
  ]);
  S1 = await bearer('student', 'instA', 'stu1');
  S2 = await bearer('student', 'instA', 'stu2');
  SB = await bearer('student', 'instB', 'stuB');
});

const Q1 = { id: 'q1', type: 'open-response', text: 'What would you change in your city, and why?', modelAnswer: MODEL, rubric: { criteria: RUBRIC } };
const Q2 = { id: 'q2', type: 'open-response', text: 'Describe a place you like to visit.', rubric: { criteria: RUBRIC } };
async function exam(t: Who, speaking: Record<string, unknown> = {}, questions: object[] = [Q1], cls = 'cls', cur = 'cur', extra: Record<string, unknown> = {}) {
  const created = await t.post('/api/assessments', { title: 'Speaking B1', subject: 'English', curriculumId: cur, lifecycle: 'published', questions });
  if (created.status !== 201) return created;
  return t.post('/api/assignments', { assessmentId: created.body.id, classId: cls, dueAt: new Date(Date.now() + 86_400_000).toISOString(), format: 'english_conversation', maxAttempts: 1, speaking: { cefrLevel: 'B1', topic: 'my city', ...speaking }, ...extra });
}
const base = (asg: string, att: string) => `/api/me/assignments/${asg}/attempts/${att}`;
async function started(s: Who, asg: string, mode = 'voice_only') {
  const att = (await s.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
  const begin = await s.post(`${base(asg, att)}/speaking/begin`, { consent: true, mode });
  return { att, begin };
}

describe('teacher controls', () => {
  it('voice only is the default; settings are validated and stored server-side; the clock follows the exam', async () => {
    const r = await exam(T, { durationMinutes: 8, prepSeconds: 60, maxStudentTurns: 6, persona: 'a friendly city planner', disallowedTopics: ['politics'] });
    expect(r.status).toBe(201);
    expect(r.body.format).toBe('english_conversation');
    expect(r.body.speaking).toMatchObject({ deliveryPolicy: 'voice_only', language: 'en', cefrLevel: 'B1', durationMinutes: 8, prepSeconds: 60, maxStudentTurns: 6, followUpsPerQuestion: 1, transcriptRetentionDays: 90 });
    expect(r.body.timeLimitMinutes).toBe(9);
    expect((await exam(T, { cefrLevel: 'Z9' })).status).toBe(400);
    expect((await exam(T, { language: 'fr' })).status).toBe(400);
    expect((await exam(T, { accommodationStudentIds: ['stu3'] })).body.message).toMatch(/students in the class/);
  });

  it('refuses rubrics that would grade pronunciation from a transcript, and non-spoken question types', async () => {
    const pron = { ...Q1, rubric: { criteria: [...RUBRIC, { id: 'p', title: 'Pronunciation', maxPoints: 2, levels: [{ id: 'a', label: 'a', points: 0 }, { id: 'b', label: 'b', points: 2 }] }] } };
    const r = await exam(T, {}, [pron]);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('AUDIO_EVIDENCE_UNSUPPORTED');
    expect((await exam(T, {}, [{ id: 'm', type: 'multiple-choice', text: '?', options: ['a', 'b'], correctAnswer: 'a', points: 1 }])).status).toBe(400);
    expect((await exam(T, {}, [{ id: 'x', type: 'open-response', text: 'No rubric?' }])).status).toBe(400);
  });

  it('avatar-only and student-choice policies are refused while the avatar layer is unavailable; flag off refuses speaking exams', async () => {
    for (const deliveryPolicy of ['voice_avatar', 'student_choice']) {
      const r = await exam(T, { deliveryPolicy });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('AVATAR_EXAMS_UNAVAILABLE');
    }
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.speaking_exams_enabled': false } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    expect((await exam(T)).status).toBe(403);
  });

  it('only for classes the teacher teaches, in their school', async () => {
    const created = await T.post('/api/assessments', { title: 'S', subject: 'English', curriculumId: 'cur', lifecycle: 'published', questions: [Q1] });
    const body = { assessmentId: created.body.id, dueAt: new Date(Date.now() + 86_400_000).toISOString(), format: 'english_conversation', speaking: {} };
    expect((await T.post('/api/assignments', { ...body, classId: 'cls2' })).status).toBe(404);
    expect((await TB.post('/api/assignments', { ...body, classId: 'cls' })).status).toBe(404);
    expect((await AM.post('/api/assignments', { ...body, classId: 'cls' })).status).toBe(403);
  });

  it('settings are frozen once published', async () => {
    const asg = (await exam(T)).body.id;
    const r = await T.patch(`/api/assignments/${asg}`, { speaking: { durationMinutes: 30 } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SPEAKING_SETTINGS_FROZEN');
    const draft = (await exam(T, {}, [Q1], 'cls', 'cur', { draft: true })).body.id;
    const ok = await T.patch(`/api/assignments/${draft}`, { speaking: { durationMinutes: 15 } });
    expect(ok.status).toBe(200);
    expect(ok.body.speaking.durationMinutes).toBe(15);
    expect(ok.body.timeLimitMinutes).toBe(15);
  });

  it('teacher preview runs the exam without saving anything; students cannot preview', async () => {
    const created = await T.post('/api/assessments', { title: 'S', subject: 'English', curriculumId: 'cur', lifecycle: 'draft', questions: [Q1] });
    const open = await T.post('/api/speaking/preview', { assessmentId: created.body.id, speaking: { topic: 'my city' } });
    expect(open.status).toBe(200);
    expect(open.body.preview).toBe(true);
    expect(open.body.turns[0].text).toContain(Q1.text);
    const next = await T.post('/api/speaking/preview', { assessmentId: created.body.id, speaking: {}, history: open.body.turns, message: 'More parks' });
    expect(next.status).toBe(200);
    expect(next.body.turns[0]).toMatchObject({ role: 'student', text: 'More parks' });
    expect(await M.AssessmentAttempt.countDocuments()).toBe(0);
    expect((await S1.post('/api/speaking/preview', { assessmentId: created.body.id })).status).toBe(403);
    expect((await T2.post('/api/speaking/preview', { assessmentId: created.body.id })).status).toBe(404);
  });
});

describe('voice-only student exam', () => {
  it('consent, mode policy, spoken turns through server STT/TTS, autonomous rubric grading, metering, no avatar', async () => {
    const asg = (await exam(T, { requiredTopics: ['parks'] })).body.id;
    const start = await S1.post(`/api/me/assignments/${asg}/attempts`);
    expect(start.body.format).toBe('english_conversation');
    expect(start.body.speaking).toMatchObject({ deliveryPolicy: 'voice_only', notAssessed: expect.arrayContaining(['pronunciation']) });
    expect(JSON.stringify(start.body)).not.toContain(MODEL); // no model answer to the student
    const att = start.body.attempt.id;
    expect((await S1.post(`${base(asg, att)}/speaking/begin`, { mode: 'voice_only' })).body.error.code).toBe('CONSENT_REQUIRED');
    // Tampering: a mode the teacher did not allow.
    expect((await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true, mode: 'voice_avatar' })).body.error.code).toBe('MODE_NOT_ALLOWED');
    expect((await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true, mode: 'text_accommodation' })).body.error.code).toBe('ACCOMMODATION_NOT_ALLOWED');
    const begin = await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true, mode: 'voice_only' });
    expect(begin.status).toBe(201);
    expect(begin.body.mode).toBe('voice_only');
    expect(begin.body.turns[0].text).toContain(Q1.text);
    expect(begin.body.audio).toMatchObject({ format: 'pcm_16000', base64: expect.any(String) });
    // Reload: same exam, no second opening.
    const again = await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true });
    expect(again.body).toMatchObject({ resumed: true, mode: 'voice_only' });
    expect(again.body.turns).toHaveLength(1);

    // Typed text never stands in for speech.
    expect((await S1.post(`${base(asg, att)}/speaking/turn`, { text: 'typed answer' })).body.error.code).toBe('AUDIO_REQUIRED');
    expect((await S1.post(`${base(asg, att)}/conversation`, { message: 'typed' })).body.error.code).toBe('SPEAKING_EXAM');
    expect((await S1.put(`${base(asg, att)}/draft`, { answers: { q1: 'typed' } })).body.error.code).toBe('SPEAKING_EXAM');

    const t1 = await S1.audio(`${base(asg, att)}/speaking/turn`, { turnCount: '1' });
    expect(t1.status).toBe(200);
    expect(t1.body.transcript).toBe(el.heard);
    expect(t1.body.turns.map((t: any) => t.kind ?? t.role)).toEqual(['student', 'follow_up']);
    expect(t1.body.turns[0]).toMatchObject({ source: 'speech', audioSeconds: 4.5 });
    expect(el.stt[0]).toMatchObject({ modelId: 'scribe_v2', languageCode: 'en' });
    // Duplicate send of the same turn.
    expect((await S1.audio(`${base(asg, att)}/speaking/turn`, { turnCount: '1' })).body.error.code).toBe('CONVERSATION_CONFLICT');
    el.heard = 'Because children need safe places to play outside';
    const t2 = await S1.audio(`${base(asg, att)}/speaking/turn`, { turnCount: '3' });
    expect(t2.body.state.done).toBe(true);
    expect((await S1.audio(`${base(asg, att)}/speaking/turn`)).body.error.code).toBe('CONVERSATION_DONE');

    const sub = await S1.post(`${base(asg, att)}/submit`, { answers: { q1: 'typed text is ignored' } });
    expect(sub.status).toBe(200);
    await settled(att);
    const t = await attemptOf(att);
    expect(t.gradingStatus).toBe('released'); // autonomous: no human approval
    expect(t.answers[0].studentAnswer).toBe('I think the city should build more parks for families\nBecause children need safe places to play outside');
    expect(t.speaking).toMatchObject({ mode: 'voice_only', studentTurns: 2, audioSeconds: 9, evidence: 'sufficient', assessedAs: 'spoken', notAssessed: expect.arrayContaining(['pronunciation']) });
    expect(t.history.map((h: any) => h.action)).toContain('speaking_started');
    // Metered: STT and TTS rows for the school; no transcript text in the ledger; no avatar.
    const ledger = await M.UsageLedger.find({}).lean();
    const features = ledger.map((r: any) => r.feature);
    expect(features.filter((f: string) => f === 'speaking_exam_stt')).toHaveLength(2);
    expect(features).toContain('speaking_exam_tts');
    expect(ledger.every((r: any) => r.institutionId === 'instA')).toBe(true);
    expect(JSON.stringify(ledger)).not.toContain('parks');
    expect(ledger.find((r: any) => r.feature === 'speaking_exam_stt').units).toMatchObject({ audioSeconds: 4.5 });
    expect(await M.AvatarSession.countDocuments()).toBe(0);
    // The examiner's follow-up prompt carries no model answer.
    expect(JSON.stringify(ai.calls.filter(isExaminer))).not.toContain(MODEL);
  });

  it('no coaching: a follow-up that would leak model-answer words or praise is dropped', async () => {
    const asg = (await exam(T)).body.id;
    const { att } = await started(S1, asg);
    followUp = 'Do you think wellbeing matters here?';
    const r = await S1.audio(`${base(asg, att)}/speaking/turn`);
    expect(r.body.turns.map((t: any) => t.kind ?? t.role)).toEqual(['student', 'closing']);
    expect(SE.safeFollowUp('Well done, can you say more?', Q1 as never, { disallowedTopics: [] } as never, '')).toBeNull();
    expect(SE.safeFollowUp('Can you say more about politics?', Q1 as never, { disallowedTopics: ['politics'] } as never, '')).toBeNull();
    expect(SE.safeFollowUp('Can you say more?', Q1 as never, { disallowedTopics: [] } as never, '')).toBe('Can you say more?');
  });

  it('silence or an empty recording is not a turn; a provider error is distinct', async () => {
    const asg = (await exam(T)).body.id;
    const { att } = await started(S1, asg);
    el.heard = '';
    const r = await S1.audio(`${base(asg, att)}/speaking/turn`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('NO_SPEECH_DETECTED');
    expect((await attemptOf(att)).speaking.noSpeechCount).toBe(1);
    expect((await attemptOf(att)).conversation).toHaveLength(1);
    el.sttFail = true;
    expect((await S1.audio(`${base(asg, att)}/speaking/turn`)).body.error.code).toBe('STT_FAILED');
    expect((await S1.audio(`${base(asg, att)}/speaking/turn`, {}, 'text/plain')).body.error.code).toBe('INVALID_AUDIO');
  });

  it('too little spoken evidence: no invented score, marked insufficient evidence, no grading call', async () => {
    const asg = (await exam(T, {}, [Q1, Q2])).body.id;
    const { att } = await started(S1, asg);
    followUp = null;
    await S1.audio(`${base(asg, att)}/speaking/turn`); // answers q1 only
    ai.calls = [];
    await S1.post(`${base(asg, att)}/submit`);
    const t = await attemptOf(att);
    expect(t).toMatchObject({ gradingStatus: 'grading_exception', exceptionReason: 'insufficient_evidence' });
    expect(t.speaking.evidence).toBe('insufficient');
    expect(ai.calls.filter((b) => !isExaminer(b))).toHaveLength(0);
    // Never started speaking at all: also insufficient.
    const asg2 = (await exam(T)).body.id;
    const att2 = (await S2.post(`/api/me/assignments/${asg2}/attempts`)).body.attempt.id;
    await S2.post(`${base(asg2, att2)}/submit`, { answers: { q1: 'typed instead' } });
    expect(await attemptOf(att2)).toMatchObject({ gradingStatus: 'grading_exception', exceptionReason: 'insufficient_evidence' });
  });

  it('turn limit, preparation time and the server clock', async () => {
    const asg = (await exam(T, { maxStudentTurns: 1 })).body.id;
    const { att } = await started(S1, asg);
    const r = await S1.audio(`${base(asg, att)}/speaking/turn`);
    expect(r.body.turns.map((t: any) => t.kind ?? t.role)).toEqual(['student', 'closing']);
    expect(r.body.turnsLeft).toBe(0);

    const prep = (await exam(T, { prepSeconds: 120 })).body.id;
    const p = await started(S2, prep);
    expect((await S2.audio(`${base(prep, p.att)}/speaking/turn`)).body.error.code).toBe('PREPARATION_TIME');
    // Past the exam clock: the attempt is closed and later auto-submitted.
    await M.AssessmentAttempt.updateOne({ id: p.att }, { $set: { expiresAt: new Date(Date.now() - 10 * 60_000) } });
    expect((await S2.audio(`${base(prep, p.att)}/speaking/turn`)).body.error.code).toBe('ATTEMPT_CLOSED');
    await S2.post(`/api/me/assignments/${prep}/attempts`).catch(() => undefined);
    expect((await attemptOf(p.att)).status).toBe('submitted');
  });

  it('typed accommodation only for students the teacher listed, labelled and never an oral score', async () => {
    const asg = (await exam(T, { accommodationStudentIds: ['stu2'] })).body.id;
    const a1 = (await S1.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
    expect((await S1.post(`${base(asg, a1)}/speaking/begin`, { consent: true, mode: 'text_accommodation' })).status).toBe(403);
    const { att, begin } = await started(S2, asg, 'text_accommodation');
    expect(begin.body.mode).toBe('text_accommodation');
    expect(begin.body.audio).toBeNull();
    expect(el.tts).toHaveLength(0);
    followUp = null;
    const r = await S2.post(`${base(asg, att)}/speaking/turn`, { text: 'The city needs more parks for children' });
    expect(r.body.turns[0].source).toBe('typed_accommodation');
    await S2.post(`${base(asg, att)}/submit`);
    await settled(att);
    expect((await attemptOf(att)).speaking).toMatchObject({ mode: 'text_accommodation', assessedAs: 'written_accommodation' });
    expect(el.stt).toHaveLength(0);
  });

  it('no speech service configured: voice modes fail safely before anything starts', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    (await import('../src/config/env')).resetConfigForTests();
    try {
      const asg = (await exam(T)).body.id;
      const att = (await S1.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
      const r = await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('VOICE_UNAVAILABLE');
      expect((await attemptOf(att)).speaking).toBeUndefined();
    } finally {
      process.env.ELEVENLABS_API_KEY = 'test-el';
      (await import('../src/config/env')).resetConfigForTests();
    }
  });
});

describe('avatar mode and fallback (availability simulated in tests)', () => {
  it('student choice: avatar when available; voice-only fallback with a notice and audit entry when not', async () => {
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.speaking_exam_avatar_enabled': true } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    SE.setAvatarExamAvailabilityForTests(true);
    const asg = (await exam(T, { deliveryPolicy: 'student_choice' })).body.id;
    expect((await started(S1, asg, 'voice_avatar')).begin.body.mode).toBe('voice_avatar');
    SE.setAvatarExamAvailabilityForTests(false);
    const { att, begin } = await started(S2, asg, 'voice_avatar');
    expect(begin.body.mode).toBe('voice_only');
    expect(begin.body.fallback).toMatchObject({ from: 'voice_avatar', to: 'voice_only' });
    expect((await attemptOf(att)).history.find((h: any) => h.action === 'speaking_started')).toMatchObject({ from: 'voice_avatar', to: 'voice_only', reason: expect.stringMatching(/^fallback/) });
  });

  it('avatar required but unavailable: fails safely, no silent conversion', async () => {
    await M.Institution.updateOne({ id: 'instA' }, { $set: { 'features.speaking_exam_avatar_enabled': true } });
    (await import('../src/services/featureFlags')).forgetFeatureFlags();
    SE.setAvatarExamAvailabilityForTests(true);
    const asg = (await exam(T, { deliveryPolicy: 'voice_avatar' })).body.id;
    SE.setAvatarExamAvailabilityForTests(false);
    const att = (await S1.post(`/api/me/assignments/${asg}/attempts`)).body.attempt.id;
    expect((await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true, mode: 'voice_only' })).body.error.code).toBe('MODE_NOT_ALLOWED');
    const r = await S1.post(`${base(asg, att)}/speaking/begin`, { consent: true, mode: 'voice_avatar' });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('AVATAR_UNAVAILABLE');
    expect((await attemptOf(att)).speaking).toBeUndefined();
  });
});

describe('budget and pause', () => {
  const enforce = (over: Record<string, unknown> = {}) =>
    M.OrgBudget.create({ institutionId: 'instA', enforcementEnabled: true, dailyCapUsd: 10, monthlyCapUsd: 100, perUserDailyCapUsd: 10, gradingAllowanceUsd: 5, intendedTools: [], ...over });

  it('an unpriced speech tool not in the school policy is refused with its budget code, not as a model failure', async () => {
    const asg = (await exam(T)).body.id;
    const { att } = await started(S1, asg);
    await enforce();
    (await import('../src/services/aiBudget')).forgetAiBudgetCache();
    const r = await S1.audio(`${base(asg, att)}/speaking/turn`);
    expect(r.body.error.code).toBe('AI_BUDGET_POLICY_MISSING');
    expect(el.stt).toHaveLength(0);
  });

  it('a school pause stops spoken turns with AI_PAUSED', async () => {
    const asg = (await exam(T)).body.id;
    const { att } = await started(S1, asg);
    await enforce({ aiPaused: true });
    (await import('../src/services/aiBudget')).forgetAiBudgetCache();
    const r = await S1.audio(`${base(asg, att)}/speaking/turn`);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('AI_PAUSED');
  });
});

describe('isolation, teacher review and retention', () => {
  it("students only reach their own class's exam; teachers only their class's attempts", async () => {
    const asg = (await exam(T)).body.id;
    const S3 = await bearer('student', 'instA', 'stu3');
    expect((await S3.post(`/api/me/assignments/${asg}/attempts`)).status).toBe(404);
    expect((await SB.post(`/api/me/assignments/${asg}/attempts`)).status).toBe(404);
    const { att } = await started(S1, asg);
    // Another student cannot drive this attempt.
    expect((await S2.post(`${base(asg, att)}/speaking/begin`, { consent: true })).body.error.code).toBe('ATTEMPT_CLOSED');
    expect((await T.get(`/api/assignments/${asg}/speaking-attempts`)).body.attempts).toHaveLength(1);
    expect((await T2.get(`/api/assignments/${asg}/speaking-attempts`)).status).toBe(404);
    expect((await TB.get(`/api/assignments/${asg}/speaking-attempts`)).status).toBe(404);
    expect((await AM.get(`/api/assignments/${asg}/speaking-attempts`)).status).toBe(403);
  });

  it('teachers see mode, evidence and transcript; transcripts can be removed and expire, scores stay', async () => {
    const asg = (await exam(T, { transcriptRetentionDays: 7 })).body.id;
    const { att } = await started(S1, asg);
    followUp = null;
    await S1.audio(`${base(asg, att)}/speaking/turn`);
    await S1.post(`${base(asg, att)}/submit`);
    await settled(att);
    const view = (await T.get(`/api/assignments/${asg}/speaking-attempts`)).body.attempts[0];
    expect(view).toMatchObject({ mode: 'voice_only', evidence: 'sufficient', assessedAs: 'spoken', transcriptRemoved: false, gradingStatus: 'released' });
    expect(view.transcript.some((x: any) => x.text === el.heard)).toBe(true);
    const score = (await attemptOf(att)).score;
    expect(await SE.sweepSpeakingTranscripts(new Date(Date.now() + 3 * 86_400_000))).toEqual({ purged: 0 });
    expect(await SE.sweepSpeakingTranscripts(new Date(Date.now() + 8 * 86_400_000))).toEqual({ purged: 1 });
    const after = await attemptOf(att);
    expect(JSON.stringify(after.conversation)).not.toContain('parks');
    expect(after.answers[0].studentAnswer).toBe('[transcript removed]');
    expect(after.score).toBe(score);
    expect((await T.post(`/api/assignments/${asg}/attempts/${att}/speaking/remove-transcript`)).body.removed).toBe(false);
  });
});

// liveExpressive (live tutor upgrade item 5): Cara 4.1 Express and a Director Notes style by age band on the Anam
// session token; today's call when the switch is off or the face cannot do it; a CI-only per-call test override.
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock('../src/services/elevenlabsVoice', () => ({
  isElevenLabsVoiceConfigured: () => false,
  isElevenLabsVoiceUsable: async () => false,
  isVoiceRefusal: () => false,
  elevenLabsSttModel: () => 'scribe_v2_realtime',
  createTranscriptionToken: async () => 'scribe-token',
  synthesizeSpeech: vi.fn(),
}));
vi.mock('../src/services/avatarVisuals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/avatarVisuals')>()),
  generateVisualAid: vi.fn(async () => '<p>x</p>'),
}));
vi.mock('../src/services/directTutorModel', () => ({
  isDirectTutorModelConfigured: () => true,
  streamDirectTutorModel: mocks.stream,
  curriculumFromCourse: vi.fn(),
  SHOW_VISUAL_MARKER: '[SHOW]',
}));

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let L: typeof import('../src/services/liveExpressive');
const realFetch = globalThis.fetch;
const anamFetch = vi.fn();
// Anam's catalogue: the default face offers Cara 4.1 Express, 'face-old' does not.
const faces = [
  { id: 'avatar-1', displayName: 'Leo', availableVersions: ['cara-3', 'cara-4', 'cara-4.1-express', 'cara-4-latest'], displayTags: ['man'] },
  { id: 'face-old', displayName: 'Old', availableVersions: ['cara-3'], displayTags: ['woman'] },
];
const voices: Record<string, { provider: string; providerModelId: string }> = {
  'voice-en': { provider: 'ELEVENLABS', providerModelId: 'eleven_flash_v2_5' },
  'voice-ar': { provider: 'ELEVENLABS', providerModelId: 'eleven_v4_turbo' },
};
let tokenStatus: (body: Record<string, unknown>) => number = () => 200;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend',
    JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key', AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANAM_API_KEY: 'anam-key', ANAM_AVATAR_ID: 'avatar-1', ANAM_VOICE_ID_EN: 'voice-en', ANAM_VOICE_ID_AR: 'voice-ar',
  });
  (await import('../src/config/env')).resetConfigForTests();
  ({ signAccessToken } = await import('../src/auth/jwt'));
  L = await import('../src/services/liveExpressive');
  await mongoose.connect(mongo.getUri());
  app = (await import('../src/app')).createApp();
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
    String(url).startsWith('https://api.anam.ai/') ? anamFetch(url, init) : realFetch(url, init)) as typeof fetch;
  const M = await import('../src/models/Student');
  await M.Student.create({ id: 'stu-kid', name: 'Kid', email: 'kid@x.test', grade: 'Grade 3', institutionId: 'inst', learnerAgeBand: 'child' });
  await M.Student.create({ id: 'stu-grown', name: 'Grown', email: 'grown@x.test', grade: 'Evening', institutionId: 'inst', learnerAgeBand: 'adult' });
  await M.Student.create({ id: 'stu-teen', name: 'Teen', email: 'teen@x.test', grade: 'Grade 9', institutionId: 'inst', learnerAgeBand: 'teen' });
  await M.Student.create({ id: 'stu-noage', name: 'No age', email: 'noage@x.test', grade: 'Grade 5', institutionId: 'inst' });
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  vi.clearAllMocks();
  L.clearVoiceCacheForTests();
  tokenStatus = () => 200;
  anamFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/v1/avatars')) return new Response(JSON.stringify({ data: faces, meta: { lastPage: 1 } }), { status: 200 });
    const voice = /\/v1\/voices\/([^/?]+)$/.exec(u)?.[1];
    if (voice) return voices[voice] ? new Response(JSON.stringify({ id: voice, ...voices[voice] }), { status: 200 }) : new Response('{}', { status: 404 });
    const status = tokenStatus(JSON.parse(String(init?.body ?? '{}')));
    return status === 200 ? new Response(JSON.stringify({ sessionToken: 'anam-token' }), { status: 200 }) : new Response('{"error":"bad"}', { status });
  });
  mocks.stream.mockImplementation(async function* () { yield 'Hello there.'; });
});

const users = new Map<string, string>();
async function token(name: string, studentId?: string) {
  const role = studentId ? 'student' : 'admin';
  if (!users.has(name)) {
    const { User } = await import('../src/models/User');
    const user = await User.create({ email: `${name}@enara.ai`, password: 'x', role, name, institutionId: 'inst', ...(studentId ? { studentId } : {}) });
    users.set(name, user._id.toString());
  }
  return `Bearer ${signAccessToken({ id: users.get(name)!, email: `${name}@enara.ai`, role, institutionId: 'inst', ...(studentId ? { studentId } : {}) })}`;
}
const tokenBodies = () => anamFetch.mock.calls.filter((c) => String(c[0]).includes('session-token')).map((c) => JSON.parse(c[1].body));
async function withSwitch<T>(value: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ENARA_ENGINE_V2;
  process.env.ENARA_ENGINE_V2 = value;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = prev; }
}

describe('liveExpressive: Cara 4 and a baseline style by age band', () => {
  it('is off by default and not part of "all": the token is today\'s', async () => {
    await withSwitch('all', async () => {
      const res = await request(app).post('/api/avatar/session').set('Authorization', await token('kid-off', 'stu-kid')).send({});
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const body = tokenBodies().at(-1);
      expect(body.personaConfig).not.toHaveProperty('avatarModel');
      expect(body.personaConfig).not.toHaveProperty('directorNotes');
      expect(body.personaConfig).not.toHaveProperty('voiceGenerationOptions');
      expect(res.body).not.toHaveProperty('expressive_test');
    });
  });

  it('adults and teens: Cara 4.1 Express, warm at 0.5, normal speed', async () => {
    await withSwitch('liveExpressive', async () => {
      for (const [name, sid] of [['grown', 'stu-grown'], ['teen', 'stu-teen']]) {
        const res = await request(app).post('/api/avatar/session').set('Authorization', await token(name, sid)).send({});
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const { personaConfig } = tokenBodies().at(-1);
        expect(personaConfig).toMatchObject({ avatarId: 'avatar-1', avatarModel: 'cara-4.1-express', directorNotes: { presetStyle: 'warm', expressivity: 0.5 }, voiceId: 'voice-en', llmId: 'CUSTOMER_CLIENT_V1' });
        expect(personaConfig).not.toHaveProperty('voiceGenerationOptions');
      }
    });
  });

  it('children (and an unknown age): supportive at 0.3, and speed 0.85 only on a voice that allows it', async () => {
    await withSwitch('liveExpressive', async () => {
      for (const [name, sid] of [['kid', 'stu-kid'], ['noage', 'stu-noage']]) {
        const en = await request(app).post('/api/avatar/session').set('Authorization', await token(name, sid)).send({ preferred_language: 'english' });
        expect(en.status, JSON.stringify(en.body)).toBe(200);
        // English voice: ElevenLabs Flash v2.5 (a v2 model) takes a speed.
        expect(tokenBodies().at(-1).personaConfig).toMatchObject({ avatarModel: 'cara-4.1-express', directorNotes: { presetStyle: 'supportive', expressivity: 0.3 }, voiceGenerationOptions: { speed: 0.85 } });
        // Arabic voice: ElevenLabs v4 rejects a speed, so none is sent.
        const ar = await request(app).post('/api/avatar/session').set('Authorization', await token(name, sid)).send({ preferred_language: 'arabic' });
        expect(ar.status, JSON.stringify(ar.body)).toBe(200);
        const arPersona = tokenBodies().at(-1).personaConfig;
        expect(arPersona).toMatchObject({ voiceId: 'voice-ar', directorNotes: { presetStyle: 'supportive', expressivity: 0.3 } });
        expect(arPersona).not.toHaveProperty('voiceGenerationOptions');
      }
    });
  });

  it('keeps the style on a language switch', async () => {
    await withSwitch('liveExpressive', async () => {
      const auth = await token('kid-switch', 'stu-kid');
      const start = await request(app).post('/api/avatar/session').set('Authorization', auth).send({ preferred_language: 'english' });
      expect(start.status).toBe(200);
      const sw = await request(app).post(`/api/avatar/session/${start.body.session_id}/language`).set('Authorization', auth).send({ target_language: 'arabic' });
      expect(sw.status, JSON.stringify(sw.body)).toBe(200);
      expect(tokenBodies().at(-1).personaConfig).toMatchObject({ avatarModel: 'cara-4.1-express', directorNotes: { presetStyle: 'supportive', expressivity: 0.3 }, languageCode: 'ar' });
    });
  });

  it('a face that cannot run Cara 4.1 Express gets today\'s call, with no error', async () => {
    await withSwitch('liveExpressive', async () => {
      const { TutorFace } = await import('../src/models/TutorFace');
      await TutorFace.create({ institutionId: 'inst-old', courseId: null, avatarId: 'face-old', name: 'Old', gender: 'woman' }).catch(() => undefined);
      expect(await L.faceSupportsExpress('face-old')).toBe(false);
      expect(await L.faceSupportsExpress('avatar-1')).toBe(true);
      expect(await L.faceSupportsExpress('not-listed')).toBe(false);
      expect(await L.expressivePersona({ on: true, band: 'adult', cara4: false }, 'voice-en')).toBeNull();
    });
  });

  it('starts today\'s call if Anam rejects the expressive settings', async () => {
    await withSwitch('liveExpressive', async () => {
      tokenStatus = (b) => ((b.personaConfig as Record<string, unknown>)?.avatarModel ? 400 : 200);
      const res = await request(app).post('/api/avatar/session').set('Authorization', await token('grown-400', 'stu-grown')).send({});
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const bodies = tokenBodies();
      expect(bodies.at(-2).personaConfig).toHaveProperty('avatarModel');
      expect(bodies.at(-1).personaConfig).not.toHaveProperty('avatarModel');
      expect(bodies.at(-1).personaConfig).not.toHaveProperty('directorNotes');
      expect(bodies.at(-1).personaConfig).toHaveProperty('voiceDetectionOptions'); // the listening settings stay
      const { AvatarSession } = await import('../src/models/AvatarSession');
      expect((await AvatarSession.findOne({ id: res.body.session_id }).lean())?.expressive).toMatchObject({ on: true, cara4: false });
    });
  });

  it('knows which voices can be slowed', () => {
    expect(L.speedAllowed({ provider: 'CARTESIA', model: 'sonic-3.6' })).toBe(true);
    expect(L.speedAllowed({ provider: 'ELEVENLABS', model: 'eleven_flash_v2_5' })).toBe(true);
    expect(L.speedAllowed({ provider: 'ELEVENLABS', model: 'eleven_multilingual_v2' })).toBe(true);
    expect(L.speedAllowed({ provider: 'ELEVENLABS', model: 'eleven_v4_turbo' })).toBe(false);
    expect(L.speedAllowed({ provider: 'ELEVENLABS', model: 'eleven_v3_conversational' })).toBe(false);
    expect(L.speedAllowed(null)).toBe(false);
  });

  it('the per-call test override needs the test deployment and the CI token, and nothing else', async () => {
    const ci = 'c'.repeat(40);
    const env = { MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_CI_TOKEN: ci, MAINTENANCE_TOKEN: 'm'.repeat(40) } as NodeJS.ProcessEnv;
    const testDb = 'mongodb+srv://u:p@enara-lms-test.abc.mongodb.net/enara';
    const h = (want: string, tok?: string) => ({ 'x-enara-expressive-test': want, ...(tok ? { 'x-enara-ci-token': tok } : {}) });
    expect(L.ciExpressiveOverride(h('on', ci), env, testDb)).toBe(true);
    expect(L.ciExpressiveOverride(h('off', ci), env, testDb)).toBe(false);
    expect(L.ciExpressiveOverride(h('on'), env, testDb)).toBeUndefined();
    expect(L.ciExpressiveOverride(h('on', 'm'.repeat(40)), env, testDb)).toBeUndefined(); // the operator's token is not the CI token
    expect(L.ciExpressiveOverride(h('on', `${ci}x`), env, testDb)).toBeUndefined();
    expect(L.ciExpressiveOverride(h('maybe', ci), env, testDb)).toBeUndefined();
    expect(L.ciExpressiveOverride(h('on', ci), { ...env, MAINTENANCE_ENDPOINTS_ENABLED: 'false' }, testDb)).toBeUndefined();
    expect(L.ciExpressiveOverride(h('on', ci), env, 'mongodb+srv://u:p@enara-prod.abc.mongodb.net/enara')).toBeUndefined();
    // Through the API on a deployment that is not the test one: the header changes nothing.
    await withSwitch('', async () => {
      const prev = process.env.MAINTENANCE_CI_TOKEN;
      process.env.MAINTENANCE_CI_TOKEN = ci;
      try {
        const res = await request(app).post('/api/avatar/session').set('Authorization', await token('grown-ci', 'stu-grown')).set(h('on', ci)).send({});
        expect(res.status).toBe(200);
        expect(tokenBodies().at(-1).personaConfig).not.toHaveProperty('avatarModel');
        expect(res.body).not.toHaveProperty('expressive_test');
      } finally {
        if (prev === undefined) delete process.env.MAINTENANCE_CI_TOKEN; else process.env.MAINTENANCE_CI_TOKEN = prev;
      }
    });
  });
});

describe('liveExpressive: cues by code', () => {
  it('maps each verdict to its cue, calmer for children, and never a blocked cue', () => {
    const turn = { kind: 'turn' as const };
    expect(L.cuesForTurn({ ...turn, verdict: 'CORRECT' }, 'adult')).toEqual({ first: 'happy' });
    expect(L.cuesForTurn({ ...turn, verdict: 'CORRECT_WITH_EQUIVALENT_FORMULATION', next: 'NEW_ITEM' }, 'teen')).toEqual({ first: 'happy', then: 'curious' });
    expect(L.cuesForTurn({ ...turn, verdict: 'CORRECT' }, 'child')).toEqual({ first: 'warm' });
    expect(L.cuesForTurn({ ...turn, verdict: 'INCORRECT' }, 'adult')).toEqual({ first: 'supportive' });
    expect(L.cuesForTurn({ ...turn, verdict: 'PARTIALLY_CORRECT' }, 'child')).toEqual({ first: 'supportive' });
    expect(L.cuesForTurn({ ...turn, verdict: 'NOT_EVALUATED', next: 'NEW_ITEM' }, 'adult')).toEqual({ first: 'curious' });
    expect(L.cuesForTurn({ ...turn, stuck: true, verdict: 'INCORRECT' }, 'adult')).toEqual({ first: 'concerned', then: 'supportive' });
    expect(L.cuesForTurn({ ...turn, drawing: true }, 'adult')).toEqual({ first: 'curious' });
    expect(L.cuesForTurn({ ...turn, verdict: 'NOT_EVALUATED', next: 'NONE' }, 'adult')).toBeNull();
    expect(L.cuesForTurn({ kind: 'opening' }, 'adult')).toEqual({ first: 'warm' });
    expect(L.cuesForTurn({ kind: 'nudge' }, 'child')).toEqual({ first: 'supportive' });
    const every = ['CORRECT', 'INCORRECT', 'PARTIALLY_CORRECT', 'NOT_EVALUATED', 'AMBIGUOUS', undefined].flatMap((verdict) => ['adult', 'teen', 'child'].flatMap((band) =>
      [true, false].map((stuck) => L.cuesForTurn({ kind: 'turn', verdict, stuck, next: 'NEW_ITEM' }, band as 'adult'))));
    for (const plan of every) for (const cue of [plan?.first, plan?.then].filter(Boolean)) expect(L.ALLOWED_CUES).toContain(cue);
  });

  it('stuck: "I don\'t know", a hint request, confusion, "why" after a try, or a third failed try on one item', () => {
    expect(L.stuckFromSignals({ learnerResponse: 'dont_know' })).toBe(true);
    expect(L.stuckFromSignals({ learnerResponse: 'hint_request' })).toBe(true);
    expect(L.stuckFromSignals({ learnerResponse: 'confusion' })).toBe(true);
    expect(L.stuckFromSignals({ learnerResponse: 'answer', whyAfterAttempt: true })).toBe(true);
    expect(L.stuckFromSignals({ learnerResponse: 'answer', learning: { attemptsOnItem: 2 } }, 'INCORRECT')).toBe(true);
    expect(L.stuckFromSignals({ learnerResponse: 'answer', learning: { attemptsOnItem: 1 } }, 'INCORRECT')).toBe(false);
    expect(L.stuckFromSignals({ learnerResponse: 'answer', learning: { attemptsOnItem: 3 } }, 'CORRECT')).toBe(false);
  });

  it('removes only cue tags from text', () => {
    expect(L.stripCueTags('[happy] Well done!')).toBe('Well done!');
    expect(L.stripCueTags('Good. [Curious] What next?')).toBe('Good. What next?');
    expect(L.stripCueTags('He [laughs harder] said it [sad].')).toBe('He said it.');
    expect(L.stripCueTags('Choose [a] or [an].')).toBe('Choose [a] or [an].');
    expect(L.stripCueTags('No tags')).toBe('No tags');
    expect(L.secondSentenceAt('That is fine. Now try again.')).toBe(14);
    expect(L.secondSentenceAt('Only one sentence.')).toBe(-1);
  });

  it('says "look at the picture" in the call\'s language and puts the panel on the side the face is turned to', () => {
    expect(L.lookLine('Here it is.', 'english')).toBe('Look at the picture.');
    expect(L.lookLine('هذه هي الصورة.', 'arabic')).toBe('انظر إلى الصورة.');
    expect(L.lookLine('Look at the drawing: three apples.', 'english')).toBeNull();
    expect(L.lookLine('انظر إلى الرسم.', 'arabic')).toBeNull();
    expect(L.panelSide('27e12daa-50fc-4384-93c2-ebca73f1f78d')).toBe('left');
    expect(L.panelSide('avatar-1')).toBe('right');
    expect(L.panelSide(undefined)).toBe('right');
  });

  it('an Arabic call (not a language lesson) opening a drawing: the line is in formal Arabic', async () => {
    await withSwitch('liveExpressive', async () => {
      const auth = await token('grown-ar', 'stu-grown');
      const start = await request(app).post('/api/avatar/session').set('Authorization', auth).send({ preferred_language: 'arabic' });
      expect(start.body.expressive).toEqual({ panel: 'right' });
      mocks.stream.mockImplementationOnce(async function* () { yield 'هذا رسم للدورة اليومية.'; });
      const res = await request(app).post('/api/avatar/query-stream').set('Authorization', auth).send({ session_id: start.body.session_id, messages: [{ role: 'user', content: 'ارسم لي صورة من فضلك' }] });
      const lines = res.text.trim().split('\n').map((l) => JSON.parse(l));
      expect(lines.some((l) => l.visual === 'drawing')).toBe(true);
      expect(lines.filter((l) => l.content).map((l) => l.content).join('')).toBe('انظر إلى الصورة. هذا رسم للدورة اليومية.');
      expect(lines.filter((l) => l.cue).map((l) => l.cue)).toEqual(['curious']);
    });
  });
});

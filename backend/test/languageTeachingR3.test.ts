import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmsCorrect,
  deriveLearnerContext,
  detectTurnSignals,
  lengthTarget,
  levelBand,
  moveText,
  renderLanguageContextPrompt,
  resolveTrustedAgeBand,
  selectLanguageMoves,
  turnEvidence,
  LANGUAGE_POLICY_REVISION,
  type AgeBand,
  type LanguageSpec,
  type TrustedAgeBand,
} from '../src/services/languageTeachingContext';

// ltc-v1-r3 tests: trusted age-band provenance (resolver + route), the age ×
// CEFR policy matrix (engine level; child/teen injected as resolver output,
// which no runtime source can produce yet: MOCK-ONLY for those bands), T04/T08/T12
// policy, and r1/r2 preservation. The model SDK is mocked: no provider calls.

const ai = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: ai.stream } };
  }
  return { default: Anthropic };
});

type T = { role: 'user' | 'assistant'; content: string };
const u = (content: string): T => ({ role: 'user', content });
const a = (content: string): T => ({ role: 'assistant', content });
const FAMILY: { title: string; spec: LanguageSpec } = {
  title: 'Talking about my family',
  spec: { vocabulary: ['mother', 'father', 'brother', 'sister'], grammar: ['This is my …', 'He is / She is …'], objectives: ['Introduce a family member'] },
};
const plan = (message: string, history: T[], o: { level?: string; mastery?: string; lesson?: typeof FAMILY | null } = {}) => {
  const lesson = o.lesson === null ? undefined : o.lesson ?? FAMILY;
  const signals = detectTurnSignals(message, history, lesson);
  const moves = selectLanguageMoves({ band: levelBand(o.level ?? 'A1'), targetLanguage: 'English', lessonStatus: lesson ? 'structured' : 'none', signals, masteryStatus: o.mastery });
  return { signals, moves, ids: moves.map((m) => m.id), reasons: moves.flatMap((m) => m.reasons) };
};
const trusted = (band: AgeBand): TrustedAgeBand =>
  band === 'unknown' ? { band, status: 'unknown', source: 'no_trusted_learner_age_source' } : { band, status: 'known', source: 'school_setting_adult_learners' };
const learnerFor = (band: AgeBand, level: string) => deriveLearnerContext({ courseLevel: level, courseLanguages: ['English'], adultSchool: false, trustedAgeBand: trusted(band), learnerMessages: [] });
const promptFor = (band: AgeBand, level: string, r = plan('What does "brother" mean?', [], { level })) =>
  renderLanguageContextPrompt({ version: 'ltc-v1', learner: learnerFor(band, level), lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves, length: lengthTarget(learnerFor(band, level).ageBand, level) });

// ---------------------------------------------------------------------------
describe('trusted age-band resolver (provenance)', () => {
  it('only the school adult-learners setting (strictly true) yields a known band: adult', () => {
    expect(resolveTrustedAgeBand({ adultLearners: true })).toEqual({ band: 'adult', status: 'known', source: 'school_setting_adult_learners' });
  });

  it.each([
    [{ adultLearners: false }, 'no_trusted_learner_age_source'],
    [{}, 'no_trusted_learner_age_source'],
    [undefined, 'no_trusted_learner_age_source'],
    [null, 'no_trusted_learner_age_source'],
    [{ adultLearners: 'true' }, 'invalid_school_setting'],
    [{ adultLearners: 1 }, 'invalid_school_setting'],
    [{ ageBand: 'child' }, 'no_trusted_learner_age_source'],
    [{ ageBand: 'teen', adultLearners: false }, 'no_trusted_learner_age_source'],
  ])('missing, false, malformed or label-like settings resolve to unknown: %j', (settings, source) => {
    expect(resolveTrustedAgeBand(settings)).toEqual({ band: 'unknown', status: 'unknown', source });
  });

  it('no input can produce child or teen (no trusted learner-level source exists: BLOCKED)', () => {
    const inputs: unknown[] = [{ ageBand: 'child' }, { learnerAgeBand: 'teen' }, { grade: 'Grade 3' }, { dob: '2015-01-01' }, { age: 9 }, 'child', ['teen'], { adultLearners: false, age: 14 }];
    for (const x of inputs) expect(['child', 'teen']).not.toContain(resolveTrustedAgeBand(x).band);
  });

  it('grade never reaches the age band; unknown never inherits adult', () => {
    for (const grade of ['Grade 3', 'Grade 9', 'KG2', 'University']) {
      const l = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, grade, learnerMessages: [] });
      expect(l.ageBand).toMatchObject({ status: 'unknown', value: 'unknown' });
    }
  });
});

// ---------------------------------------------------------------------------
describe('age × CEFR policy matrix (engine level; child/teen MOCK-ONLY until a trusted source exists)', () => {
  const BANDS: AgeBand[] = ['child', 'teen', 'adult', 'unknown'];
  const LEVELS = ['A1', 'A2', 'B1'];

  it('CEFR raises length within every band (age held constant)', () => {
    for (const b of BANDS) {
      const m = LEVELS.map((l) => lengthTarget(learnerFor(b, l).ageBand, l).maxWords);
      expect(m[0]).toBeLessThan(m[1]);
      expect(m[1]).toBeLessThan(m[2]);
    }
  });

  it('age changes length at every CEFR level (CEFR held constant): child ≤ unknown < teen < adult', () => {
    for (const l of LEVELS) {
      const [c, t, ad, un] = BANDS.map((b) => lengthTarget(learnerFor(b, l).ageBand, l).maxWords);
      expect(c).toBeLessThanOrEqual(un);
      expect(un).toBeLessThan(t);
      expect(t).toBeLessThan(ad);
    }
  });

  it('the register line depends only on age; the level line only on CEFR', () => {
    const reg = (b: AgeBand, l: string) => promptFor(b, l).split('\n').find((x) => x.startsWith('Register:'));
    const lvl = (b: AgeBand, l: string) => promptFor(b, l).split('\n').find((x) => x.startsWith('Level:'));
    for (const b of BANDS) expect(new Set(LEVELS.map((l) => reg(b, l))).size).toBe(1);
    for (const l of LEVELS) expect(new Set(BANDS.map((b) => lvl(b, l))).size).toBe(1);
    expect(new Set(BANDS.map((b) => reg(b, 'A2'))).size).toBe(4);
    expect(new Set(LEVELS.map((l) => lvl('teen', l))).size).toBe(3);
  });

  it('invariants: the same signals give the same teaching moves and the same lesson facts for every band', () => {
    const section = (p: string) => p.split('Teaching moves for this reply:')[1].split('Length and style')[0];
    const lessonPart = (p: string) => p.split('Current lesson')[1].split('Teaching moves')[0];
    for (const l of LEVELS) {
      expect(new Set(BANDS.map((b) => section(promptFor(b, l)))).size).toBe(1);
      expect(new Set(BANDS.map((b) => lessonPart(promptFor(b, l)))).size).toBe(1);
    }
  });

  it('band-specific register content: child safe and concrete; teen and adult never childish', () => {
    const reg = (b: AgeBand) => promptFor(b, 'A2').split('\n').find((x) => x.startsWith('Register:'))!;
    expect(reg('child')).toMatch(/one instruction at a time/);
    expect(reg('child')).toMatch(/nothing adult or frightening/);
    expect(reg('teen')).toMatch(/never childish/);
    expect(reg('teen')).toMatch(/some independent work/);
    expect(reg('adult')).toMatch(/never childish/);
    expect(reg('unknown')).toMatch(/age is not known/);
  });

  it('cross-axis cases keep both axes: child B1, adult A1, teen A2', () => {
    const childB1 = promptFor('child', 'B1');
    const adultA1 = promptFor('adult', 'A1');
    const teenA2 = promptFor('teen', 'A2');
    expect(childB1).toMatch(/Register: a child/);
    expect(childB1).toMatch(/Level: Connected explanations are fine/);
    expect(adultA1).toMatch(/Register: adults/);
    expect(adultA1).toMatch(/Level: Very short, concrete sentences/);
    expect(teenA2).toMatch(/Register: a teenager/);
    expect(teenA2).toMatch(/Level: Simple connected sentences/);
  });

  it('r1/r2 word targets for unknown and adult are unchanged', () => {
    expect(lengthTarget(learnerFor('unknown', 'A1').ageBand, 'A1')).toMatchObject({ targetWords: 55, maxWords: 80 });
    expect(lengthTarget(learnerFor('unknown', 'B1').ageBand, 'B1')).toMatchObject({ targetWords: 90, maxWords: 130 });
    expect(lengthTarget(learnerFor('adult', 'A2').ageBand, 'A2')).toMatchObject({ targetWords: 90, maxWords: 140 });
  });
});

// ---------------------------------------------------------------------------
const EX = a('Complete: "This is my brother. ___ is twelve." Write your answer, and I\'ll check it!');
describe('T04 proportionate correction', () => {
  it('a self-corrected answer is marked and gets confirm-and-move-on triage, no reteach or strategy shift', () => {
    const r = plan('She go to bed at ten o clock — sorry, She goes to bed at ten', [u('exercise please'), EX], { level: 'A2' });
    expect(r.signals.selfCorrected).toBe(true);
    expect(r.reasons).toContain('self_corrected');
    expect(r.ids).toEqual(expect.arrayContaining(['corrective_feedback_retry']));
    expect(r.ids).not.toContain('reteach_simpler');
    const text = moveText(r.moves.find((m) => m.id === 'corrective_feedback_retry')!);
    expect(text).toContain('First decide whether it is essentially correct');
    expect(text).toContain('with no reteaching and no retry');
  });

  it('a single minor slip with the rest correct is ordinary first-attempt feedback carrying the triage (no repeat/strategy state)', () => {
    const r = plan('he is twelve', [u('exercise please'), EX]);
    expect(r.signals.selfCorrected).toBe(false);
    expect(r.signals.errorRecurrence).toBeUndefined();
    expect(r.ids).toContain('corrective_feedback_retry');
    expect(r.ids).not.toContain('answer_with_reasoning');
  });

  it('the revised r2 wording prioritises meaning and the lesson target over surface slips', () => {
    const t = moveText(plan('He is twelve.', [u('x'), EX]).moves.find((m) => m.id === 'corrective_feedback_retry')!);
    expect(t).toContain('focus on the one that matters most for meaning and for this lesson');
    expect(t).not.toContain('deal only with the most important one now');
  });
});

describe('T08 evidence-based progression', () => {
  const success = a('Correct! "He is twelve." A brother is a boy, so he is right. Now try this one: This is my grandmother. ___ is very kind.');
  it('after a confirmed correct answer, the next answer gets the move-on policy (transfer task, no mastery claim)', () => {
    const r = plan('This is my grandmother. She is very kind.', [u('exercise'), EX, u('This is my brother. He is twelve.'), success]);
    expect(r.signals.confirmedSuccessStreak).toBe(1);
    expect(r.reasons).toContain('after_confirmed_success');
    const t = moveText(r.moves.find((m) => m.id === 'corrective_feedback_retry')!);
    expect(t).toContain('harder or freer transfer task');
    expect(t).toContain('no mastery or percentage claims');
    expect(t).toContain('one targeted check');
  });

  it('partial praise is not a confirmation of success', () => {
    expect(confirmsCorrect('Good start. **"This is my sister."** is correct. But **"He is nine"** is not right.')).toBe(false);
    expect(confirmsCorrect('"This is my brother." is correct. The problem is "She is twelve."')).toBe(false);
    expect(confirmsCorrect('Correct! **"goes"** is the right form for she.')).toBe(true);
    expect(confirmsCorrect("That's right: \"She goes to bed at ten.\"")).toBe(true);
  });

  it('no success streak after a wrong answer, and turn evidence never claims mastery', () => {
    const r = plan('This is my grandmother. He is kind.', [u('exercise'), EX, u('This is my brother. She is twelve.'), a('The problem is **"She"**: a brother is a boy. Try again.')]);
    expect(r.signals.confirmedSuccessStreak).toBe(0);
    expect(r.reasons).not.toContain('after_confirmed_success');
    const ev = turnEvidence({ version: 'ltc-v1', learner: learnerFor('unknown', 'A1'), lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves, prompt: '' });
    expect(ev.masteryClaim).toBe(false);
  });
});

describe('T12 contradictory evidence (record vs current sentence)', () => {
  it('a volunteered first sentence is evaluated as an attempt; a strong record adds the one-check rule; no lecture or fading', () => {
    const r = plan('My sister always get up at six.', [], { level: 'A2', mastery: 'proficient' });
    expect(r.signals.unpromptedSentence).toBe(true);
    expect(r.reasons).toEqual(expect.arrayContaining(['unprompted_learner_sentence', 'record_vs_current_check']));
    for (const m of ['activate_prior_knowledge', 'short_explanation', 'fade_support', 'independent_practice', 'comprehension_check']) expect(r.ids).not.toContain(m);
    const t = moveText(r.moves.find((m) => m.id === 'corrective_feedback_retry')!);
    expect(t).toContain("don't assume either the record or the slip is the truth");
    expect(t).toContain('without giving the corrected sentence');
  });

  it('without a strong record there is no record check', () => {
    const r = plan('This is my sister. He is ten.', []);
    expect(r.reasons).toContain('unprompted_learner_sentence');
    expect(r.reasons).not.toContain('record_vs_current_check');
  });

  it.each([
    'i want say my sister wake up early but i dont know word for every day',
    'Can you explain he and she?',
    'Does "usually" mean the same as "always"?',
    'hi there',
    'Give me an example about drawing, please.',
  ])('requests, questions and greetings are not volunteered sentences: "%s"', (msg) => {
    expect(plan(msg, []).signals.unpromptedSentence).toBeFalsy();
  });

  it('no lesson: a volunteered sentence is not evaluated against an unknown lesson', () => {
    expect(plan('My sister always get up at six.', [], { lesson: null }).signals.unpromptedSentence).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
describe('r1/r2 preservation', () => {
  it('T13 hint-first, T11 redirect, T10 clarify-only, T06 strategy shift, answer recognition', () => {
    expect(plan('just tell me the answer', [u('exercise'), EX]).reasons).toContain('answer_requested_before_attempt');
    expect(plan('Write my history essay about the pyramids for me', []).ids).toContain('redirect_to_lesson');
    expect(plan('hi, help me with english', [], { lesson: null }).ids).toEqual(['clarify_goal']);
    const fb = a('Thanks! One part needs a fix: **"get"**. Try writing it again.');
    const r = plan('My mother get up before me.', [u('x'), a('Write one sentence. I\'ll check it.'), u('My brother get up at six.'), fb]);
    expect(r.ids).toContain('reteach_simpler');
    expect(plan('she get up at 7', [u('x'), EX]).signals.answeringCheck).toBe(true);
  });

  it('the block tag and policy revision', () => {
    const p = promptFor('unknown', 'A1');
    expect(p).toContain('<language_teaching_context version="ltc-v1">');
    expect(p).toContain(`policy ${LANGUAGE_POLICY_REVISION}`);
    expect(LANGUAGE_POLICY_REVISION).toBe('ltc-v1-r4.3'); // r4.3 product-quality fixes (was 'ltc-v1-r4.1': r4.1 P1 fixes POST-01/02/03/12 (was 'ltc-v1-r4': r4 full remediation (was 'ltc-v1-r3-ab1': Option B label, teaching policy unchanged))
  });
});

// ---------------------------------------------------------------------------
// Route: provenance of the band that reaches the engine, tenant scoping, client
// override attempts, and provider payload privacy.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
const tok: Record<string, string> = {};
const PW = 'r3-test-password';

describe('through the tutor route (SDK mocked)', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
      JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
      ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'ltc-r3-test',
    });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
    (await import('../src/config/env')).resetConfigForTests();
    (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
    await mongoose.connect(mongo.getUri());
    const M: Record<string, mongoose.Model<any>> = {};
    for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[name] = (await import(`../src/models/${name}`))[name];
    const hash = bcrypt.hashSync(PW, 4);
    const schools = [['adult', { adultLearners: true }], ['plain', { adultLearners: false }], ['bad', {}]] as const;
    for (const [key, settings] of schools) {
      const inst = `r3-${key}`;
      await M.Institution.create({ id: inst, name: `R3 ${key}`, features: {}, learningSettings: settings });
      await M.Batch.create({ id: `${inst}-b`, name: 'B', institutionId: inst, academicYear: '2026', studentCount: 1 });
      await M.Student.create({ id: `${inst}-stu`, name: `Vexmorrow Fixture ${key}`, email: `${inst}@r3.test`, grade: 'Grade 4', institutionId: inst, batchId: `${inst}-b` });
      await M.StudentCredit.create({ studentId: `${inst}-stu`, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
      await M.User.create({ email: `${inst}@r3.test`, password: hash, role: 'student', name: `Vexmorrow Fixture ${key}`, status: 'active', institutionId: inst, studentId: `${inst}-stu` });
      await M.Curriculum.create({ id: `${inst}-cur`, name: 'English A1', institutionId: inst, courseName: 'English A1', type: 'Language', level: 'A1', languages: ['English'], summary: 'x', lastUpdated: '2026-11-09', status: 'deployed', chapters: [{ id: `${inst}-lsn`, title: FAMILY.title, description: 'Family', languageSpec: FAMILY.spec }] });
      await M.CourseInstance.create({ id: `${inst}-cls`, courseId: `${inst}-crs`, courseName: 'English A1', institutionId: inst, academicYear: '2026', batchId: `${inst}-b`, curriculumId: `${inst}-cur`, studentIds: [`${inst}-stu`], instructorIds: [], visibility: 'student' });
      tok[key] = '';
    }
    app = (await import('../src/app')).createApp();
    for (const [key] of schools) tok[key] = `Bearer ${(await request(app).post('/api/auth/login').send({ email: `r3-${key}@r3.test`, password: PW })).body.token}`;
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(() => {
    ai.create.mockReset();
    ai.create.mockResolvedValue({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Write one sentence about your family. I\'ll check it!' }], usage: { input_tokens: 10, output_tokens: 10 } });
  });

  const turn = async (key: string, text: string, context: Record<string, unknown> = {}, courseKey = key) => {
    const s = (await request(app).post('/api/me/tutor/sessions').set('Authorization', tok[key]).send({ courseId: `r3-${courseKey}-crs`, lessonId: `r3-${courseKey}-lsn`, title: 'r3' })).body;
    return request(app).post(`/api/me/tutor/sessions/${s.id ?? s.session?.id}/messages`).set('Authorization', tok[key]).send({ text, context: { courseId: `r3-${courseKey}-crs`, lessonId: `r3-${courseKey}-lsn`, ...context } });
  };
  const payload = () => JSON.stringify(ai.create.mock.calls.at(-1)?.[0] ?? {});

  it('provenance: adult school → adult (known, school setting); others → unknown with the explicit source', async () => {
    expect((await turn('adult', 'What does "brother" mean?')).body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'adult', ageBandStatus: 'known', ageBandSource: 'school_setting_adult_learners' });
    expect(payload()).toContain('Learner age band: adult [known; source: school_setting_adult_learners]');
    expect((await turn('plain', 'What does "brother" mean?')).body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'unknown', ageBandStatus: 'unknown', ageBandSource: 'no_trusted_learner_age_source' });
    expect(payload()).not.toContain('Learner age band:');
    expect((await turn('bad', 'What does "brother" mean?')).body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'unknown' });
  });

  it('client-supplied age, band or another school id cannot change the band', async () => {
    const r = await turn('plain', 'What does "brother" mean?', { ageBand: 'adult', age: 9, learnerAgeBand: 'child', institutionId: 'r3-adult', dob: '2016-02-02' });
    expect(r.status).toBe(200);
    expect(r.body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'unknown', ageBandSource: 'no_trusted_learner_age_source' });
  });

  it('tenant scope: a student cannot use another school\'s (adult) course to obtain its context', async () => {
    const r = await turn('plain', 'What does "brother" mean?', {}, 'adult');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(payload()).not.toContain('Learner age band: adult');
  });

  it('provider payload: coarse band only; no DOB, exact age, grade, names or ids', async () => {
    await turn('adult', 'What does "brother" mean?', { dob: '1990-01-01', age: 36 });
    const body = payload();
    for (const leak of ['Vexmorrow', 'r3-adult-stu', 'r3-adult@', 'R3 adult', 'Grade 4', '1990-01-01', 'birth', '"age"']) expect(body).not.toContain(leak);
  });
});

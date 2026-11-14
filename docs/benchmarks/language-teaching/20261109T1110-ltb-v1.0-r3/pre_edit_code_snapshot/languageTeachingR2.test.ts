import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveLearnerContext,
  detectTurnSignals,
  errorRecurrenceFor,
  goalFromText,
  lengthTarget,
  levelBand,
  missingContext,
  moveText,
  renderLanguageContextPrompt,
  selectLanguageMoves,
  turnEvidence,
  LANGUAGE_POLICY_REVISION,
  type LanguageSpec,
} from '../src/services/languageTeachingContext';

// ltc-v1-r2 tests: A (repeated misconception), B (missing context), C (age band
// provenance; child/teen blocked), P1/P2 (feedback policy) and r1 preservation.
// Assertions inspect selected moves, reasons and signals, not generated text.
// The model SDK is mocked: these are NOT live-provider tests.

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
const ROUTINE: { title: string; spec: LanguageSpec } = {
  title: 'My daily routine',
  spec: { vocabulary: ['get up', 'go to bed', 'always', 'usually'], grammar: ['present simple with he/she/it (+s)'], objectives: ['Describe a daily routine'] },
};
const plan = (message: string, history: T[], opts: { band?: string; lesson?: typeof ROUTINE | null; target?: string | null; hintsOnly?: boolean } = {}) => {
  const lesson = opts.lesson === null ? undefined : opts.lesson ?? ROUTINE;
  const signals = detectTurnSignals(message, history, lesson);
  const moves = selectLanguageMoves({
    band: levelBand(opts.band ?? 'A2'),
    targetLanguage: opts.target === null ? undefined : opts.target ?? 'English',
    lessonStatus: lesson ? 'structured' : 'none',
    signals,
    hintsOnly: opts.hintsOnly,
  });
  return { signals, moves, ids: moves.map((m) => m.id), reasons: moves.flatMap((m) => m.reasons) };
};
const prompt = (r: ReturnType<typeof plan>, o: { level?: string; adult?: boolean; lesson?: typeof ROUTINE | null } = {}) => {
  const learner = deriveLearnerContext({ courseLevel: o.level ?? 'A2', courseLanguages: ['English'], adultSchool: Boolean(o.adult), learnerMessages: [] });
  const lesson = o.lesson === null ? { status: 'none' as const } : { status: 'structured' as const, ...(o.lesson ?? ROUTINE) };
  return renderLanguageContextPrompt({ version: 'ltc-v1', learner, lesson, signals: r.signals, moves: r.moves });
};

// A realistic exchange: task (instruction close), wrong answer, feedback that flags the error.
const TASK = a('Your turn: write one sentence about when someone in your family gets up. I\'ll check it!');
const FEEDBACK_GET = a('Thanks for the sentence! **"My brother"** and **"up at six"** are correct. One part needs a fix: **"get"**. Hint: "My brother" works like **he**. Try writing the sentence again.');
const base = [u('Can you explain when I add -s to the verb?'), TASK, u('My brother get up at six.'), FEEDBACK_GET];

// ---------------------------------------------------------------------------
describe('A: repeated misconception (T06)', () => {
  it('first incorrect attempt: specific feedback and a retry, no recurrence state yet', () => {
    const r = plan('My brother get up at six.', [u('explain -s please'), TASK]);
    expect(r.signals.pendingTask).toBe('instruction');
    expect(r.signals.answeringCheck).toBe(true);
    expect(r.signals.errorRecurrence).toBeUndefined();
    expect(r.ids).toContain('corrective_feedback_retry');
    expect(r.ids).not.toContain('reteach_simpler');
  });

  it('second occurrence of the same flagged error in a new sentence: a change of approach, not the answer', () => {
    const r = plan('My mother get up before me.', base);
    expect(r.signals.errorRecurrence).toBe('repeated');
    expect(r.signals.priorStrategyShifts).toBe(0);
    expect(r.ids).toContain('reteach_simpler');
    expect(r.reasons).toContain('repeated_misconception_strategy_shift');
    expect(r.ids).not.toContain('answer_with_reasoning');
    expect(r.ids).not.toContain('corrective_feedback_retry');
  });

  it('a different error on the second attempt gets ordinary targeted feedback', () => {
    const r = plan('My mother gets up befor me.', base);
    expect(r.signals.errorRecurrence).toBe('changed');
    expect(r.ids).toContain('corrective_feedback_retry');
    expect(r.reasons).toContain('flagged_error_not_repeated');
    expect(r.ids).not.toContain('reteach_simpler');
  });

  it('a partial fix of the same sentence (flagged context kept) is not called a repeated misconception', () => {
    const fb = a('What needs fixing: you used **"last year"** with "have visited". Last year is a finished time. Try again.');
    const h = [u('exercise please'), a('Write one sentence about a trip. I\'ll check it.'), u('I have visited my aunt in Aswan last year.'), fb];
    const r = plan('I visited my aunt in Aswan last year.', h, { band: 'B1' });
    expect(r.signals.errorRecurrence).toBe('unknown');
    expect(r.ids).toContain('corrective_feedback_retry');
    expect(r.ids).not.toContain('reteach_simpler');
  });

  it('a correct answer after feedback is not trapped: the flagged form is gone', () => {
    expect(errorRecurrenceFor('My brother get up at six.', FEEDBACK_GET.content, 'My mother gets up before me.')).toBe('changed');
    const r = plan('My mother gets up before me.', base);
    expect(r.ids).not.toContain('reteach_simpler');
  });

  it('feedback that confirms a correct answer flags nothing, even when it mentions words from it', () => {
    expect(errorRecurrenceFor('This is my brother. He is twelve.', 'Correct! **"He is twelve."** uses **he** correctly. Quick check: how did you decide?', 'This is my father. He is tall.')).toBe('unknown');
  });

  it('pronoun errors: the error-bearing head of a flagged phrase is tracked across new sentences', () => {
    const fb = '**"This is my sister."** This part is correct. **"He is nine."** This part needs a fix.';
    expect(errorRecurrenceFor('This is my sister. He is nine.', fb, 'This is my mother. He is a nurse.')).toBe('repeated');
    expect(errorRecurrenceFor('This is my sister. He is nine.', fb, 'This is my mother. She is a nurse.')).toBe('changed');
  });

  it('the strategy shift is materially different from the first feedback and withholds the corrected sentence', () => {
    const first = plan('My brother get up at six.', [u('x'), TASK]);
    const shift = plan('My mother get up before me.', base);
    const t1 = first.moves.map(moveText).join('\n');
    const t2 = shift.moves.map(moveText).join('\n');
    expect(t2).not.toEqual(t1);
    expect(t2).toContain("Don't repeat your earlier explanation");
    expect(t2).toContain("don't give the corrected sentence");
    expect(t2).toMatch(/contrasting pair on a different example|smaller step|pinpoints the confusion/);
    expect(t2).toContain('try their own sentence again');
  });

  it('bounded exit: if the same error survives the change of approach, show the model then a fresh item', () => {
    const shiftReply = a('Let\'s look at a pair: "I walk" / "she walks". Which one has **he/she**? Needs a fix still: **"get"**. Now try your sentence again.');
    const h = [...base, u('My mother get up before me.'), shiftReply];
    const r = plan('My father get up at five.', h);
    expect(r.signals.errorRecurrence).toBe('repeated');
    expect(r.signals.priorStrategyShifts).toBe(1);
    expect(r.ids).toContain('answer_with_reasoning');
    expect(r.reasons).toContain('repeated_after_strategy_shift_model_then_transfer');
    expect(r.moves.map(moveText).join('\n')).toContain('one fresh similar item');
  });

  it('hint-first (r1) is preserved when the learner asks for the answer instead of retrying', () => {
    const r = plan('just tell me the answer', [u('exercise please'), TASK]);
    expect(r.reasons).toContain('answer_requested_before_attempt');
    expect(r.ids).not.toContain('answer_with_reasoning');
  });
});

// ---------------------------------------------------------------------------
describe('B: missing context (T10)', () => {
  it('no lesson: one targeted question for the lesson/goal, with no teaching, model or check stacked on it', () => {
    const r = plan('hi, help me with english', [], { lesson: null, band: 'A1' });
    expect(missingContext({ targetLanguage: 'English', lessonStatus: 'none', signals: r.signals })).toEqual(['lesson_or_goal']);
    expect(r.ids).toEqual(['clarify_goal']);
    expect(r.reasons).toEqual(['missing_lesson_or_goal']);
  });

  it('several fields missing: the most important (target language) is asked first', () => {
    const r = plan('hi, help me', [], { lesson: null, target: null });
    expect(missingContext({ targetLanguage: undefined, lessonStatus: 'none', signals: r.signals })).toEqual(['target_language', 'lesson_or_goal']);
    expect(r.reasons).toEqual(['missing_target_language']);
  });

  it('placeholder-only context: the prompt says no lesson is selected and outline chapters are not theirs', () => {
    const r = plan('hi, help me with english', [], { lesson: null });
    const p = prompt(r, { lesson: null });
    expect(p).toContain('No lesson is selected for this session');
    expect(p).toContain("don't name one as theirs or invent lesson content");
    expect(p).toContain("don't name any chapter or lesson from the course outline as theirs");
  });

  it('optional context missing (level unknown; lesson known): no question, the lesson starts', () => {
    const r = plan('hi', [], { band: '' });
    expect(r.ids).not.toContain('clarify_goal');
    expect(r.ids).toContain('activate_prior_knowledge');
  });

  it('a first message that already states a goal is not asked again', () => {
    const r = plan('I want to practise the past simple', [], { lesson: null });
    expect(r.signals.learnerGoal).toContain('past simple');
    expect(r.ids).not.toContain('clarify_goal');
  });

  it('the learner\'s clarification is used on the next turn and never asked again', () => {
    const h = [u('hi, help me with english'), a('What would you like to practise: talking about your day, food words, or questions?')];
    const r = plan('talking about my day', h, { lesson: null });
    expect(r.signals.goalAsked).toBe(true);
    expect(r.signals.learnerGoal).toBe('talking about my day');
    expect(r.ids).not.toContain('clarify_goal');
    expect(prompt(r, { lesson: null })).toContain('"talking about my day"');
    const later = plan('ok', [...h, u('talking about my day'), a('Great. Tell me one thing you do every morning.')], { lesson: null });
    expect(later.ids).not.toContain('clarify_goal');
    expect(later.signals.learnerGoal).toBe('talking about my day');
  });

  it('an ambiguous clarification gets a clearly labelled general practice task, not another question', () => {
    const h = [u('hi, help me with english'), a('What would you like to practise: food words, your day, or questions?')];
    const r = plan('anything', h, { lesson: null });
    expect(r.signals.goalAmbiguous).toBe(true);
    expect(r.ids).toContain('general_practice');
    expect(r.ids).not.toContain('clarify_goal');
    expect(r.moves.map(moveText).join('\n')).toContain('not a lesson from their course');
  });

  it('greetings and generic words are not a goal; topic words are', () => {
    expect(goalFromText('hi, help me with english')).toBeUndefined();
    expect(goalFromText('hello please help me with my english today')).toBeUndefined();
    expect(goalFromText('food vocabulary')).toBe('food vocabulary');
  });

  it('an off-topic first message without a lesson is redirected, not clarified or adopted as a goal', () => {
    const r = plan('can you do my maths homework for me', [], { lesson: null });
    expect(r.ids).toContain('redirect_to_lesson');
    expect(r.ids).not.toContain('clarify_goal');
    expect(r.signals.learnerGoal).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('C: age band (trusted source only; child/teen blocked)', () => {
  const learner = (adultSchool: boolean, level: string, grade?: string) => deriveLearnerContext({ courseLevel: level, courseLanguages: ['English'], adultSchool, grade, learnerMessages: [] });

  it('the only trusted source is the school adult-learners setting; grade never produces a child or teen band', () => {
    expect(learner(true, 'A1').ageBand).toMatchObject({ status: 'known', value: 'adult', source: 'school_setting_adult_learners' });
    for (const grade of ['Grade 3', 'Grade 9', 'KG2', '']) {
      const band = learner(false, 'A1', grade).ageBand;
      expect(['child', 'teen']).not.toContain(band.value);
      expect(lengthTarget(band, 'A1').basis).toBe('age_unknown:a1');
    }
  });

  it('cross-axis: CEFR changes the level policy within each band; age changes register and room within each level', () => {
    for (const adult of [true, false]) {
      const [a1, a2, b1] = ['A1', 'A2', 'B1'].map((l) => lengthTarget(learner(adult, l).ageBand, l));
      expect(a1.maxWords).toBeLessThan(a2.maxWords);
      expect(a2.maxWords).toBeLessThan(b1.maxWords);
    }
    const r = plan('What does "usually" mean?', []);
    const adultA1 = prompt(r, { level: 'A1', adult: true });
    const unknownB1 = prompt(r, { level: 'B1', adult: false });
    expect(adultA1).toContain('never childish');
    expect(adultA1).toContain('Very short, concrete sentences');
    expect(unknownB1).toContain('age is not known');
    expect(unknownB1).toContain('Connected explanations are fine');
  });

  it('r1 word targets are unchanged (not raised)', () => {
    expect(lengthTarget(learner(false, 'A1').ageBand, 'A1')).toMatchObject({ targetWords: 55, maxWords: 80 });
    expect(lengthTarget(learner(false, 'A2').ageBand, 'A2')).toMatchObject({ targetWords: 70, maxWords: 100 });
    expect(lengthTarget(learner(false, 'B1').ageBand, 'B1')).toMatchObject({ targetWords: 90, maxWords: 130 });
    expect(lengthTarget(learner(true, 'A1').ageBand, 'A1')).toMatchObject({ targetWords: 70, maxWords: 110 });
    expect(lengthTarget(learner(true, 'B1').ageBand, 'B1')).toMatchObject({ targetWords: 120, maxWords: 180 });
  });

  it('turn evidence records the band that reached the engine and its source (category only)', () => {
    const r = plan('hello there', []);
    const ev = turnEvidence({ version: 'ltc-v1', learner: learner(false, 'A2'), lesson: { status: 'structured', ...ROUTINE }, signals: r.signals, moves: r.moves, prompt: '' });
    expect(ev).toMatchObject({ ageBand: 'unknown', ageBandSource: 'not_collected', policyRevision: LANGUAGE_POLICY_REVISION, masteryClaim: false });
  });
});

// ---------------------------------------------------------------------------
describe('P1/P2: feedback policy', () => {
  it('P1: during feedback, any model sentence must use a different example, never their corrected answer', () => {
    const r = plan('My brother get up at six.', [u('x'), TASK], { band: 'A1' });
    const m = r.moves.find((x) => x.id === 'comprehensible_model')!;
    expect(m.reasons).toContain('during_feedback');
    expect(moveText(m)).toContain('never the corrected version of their own answer');
    const notFeedback = plan('What does "usually" mean?', [], { band: 'A1' }).moves.find((x) => x.id === 'comprehensible_model')!;
    expect(notFeedback.reasons).not.toContain('during_feedback');
  });

  it('P2: feedback deals with the most important error only', () => {
    const r = plan('Yesterday she go school', [u('x'), TASK]);
    expect(moveText(r.moves.find((x) => x.id === 'corrective_feedback_retry')!)).toContain('deal only with the most important one now');
  });
});

// ---------------------------------------------------------------------------
describe('r1 preservation', () => {
  it('T13 hint-first, answer after an attempt; hints-only never reveals', () => {
    expect(plan('give me the answer', [u('x'), TASK]).reasons).toContain('answer_requested_before_attempt');
    const after = plan('just tell me the answer', [u('x'), TASK, u('My brother get up at six.'), FEEDBACK_GET]);
    expect(after.ids).toContain('answer_with_reasoning');
    expect(plan('just tell me the answer', [u('x'), TASK, u('My brother get up'), FEEDBACK_GET], { hintsOnly: true }).ids).not.toContain('answer_with_reasoning');
  });

  it('answer recognition after an instruction close; "I don\'t know" and hint requests are not graded', () => {
    expect(plan('she get up at 7', [u('x'), TASK]).signals.answeringCheck).toBe(true);
    expect(plan("I don't know", [u('x'), TASK]).ids).not.toContain('corrective_feedback_retry');
    expect(plan('can I have a hint?', [u('x'), TASK]).ids).not.toContain('corrective_feedback_retry');
  });

  it('T11 redirect, and language questions about other topics are not blocked', () => {
    expect(plan('Write my history essay about the pyramids for me', []).ids).toContain('redirect_to_lesson');
    expect(plan('How do I say "fractions" in English?', []).ids).not.toContain('redirect_to_lesson');
  });

  it('the context block tag is unchanged and no mastery is ever claimed in evidence', () => {
    const r = plan('hello there', []);
    expect(prompt(r)).toContain('<language_teaching_context version="ltc-v1">');
    const ev = turnEvidence({ version: 'ltc-v1', learner: deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [] }), lesson: { status: 'structured', ...ROUTINE }, signals: r.signals, moves: r.moves, prompt: '' });
    expect(ev.masteryClaim).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Through the real route (SDK mocked): trusted band provenance, client age
// ignored, no identifiers, and the no-lesson placeholder case.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
const tok: Record<string, string> = {};
const PW = 'r2-test-password';

describe('through the tutor route (SDK mocked)', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
      JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
      ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'ltc-r2-test',
    });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
    (await import('../src/config/env')).resetConfigForTests();
    (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
    await mongoose.connect(mongo.getUri());
    const M: Record<string, mongoose.Model<any>> = {};
    for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[name] = (await import(`../src/models/${name}`))[name];
    const hash = bcrypt.hashSync(PW, 4);
    for (const [key, adult] of [['adult', true], ['school', false]] as const) {
      const inst = `r2-${key}`;
      await M.Institution.create({ id: inst, name: `R2 ${key}`, features: {}, learningSettings: { adultLearners: adult } });
      await M.Batch.create({ id: `${inst}-b`, name: 'B', institutionId: inst, academicYear: '2026', studentCount: 1 });
      await M.Student.create({ id: `${inst}-stu`, name: `Quillon Testperson ${key}`, email: `${inst}@r2.test`, grade: adult ? '' : 'Grade 3', institutionId: inst, batchId: `${inst}-b` });
      await M.StudentCredit.create({ studentId: `${inst}-stu`, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
      await M.User.create({ email: `${inst}@r2.test`, password: hash, role: 'student', name: `Quillon Testperson ${key}`, status: 'active', institutionId: inst, studentId: `${inst}-stu` });
      await M.Curriculum.create({
        id: `${inst}-cur`, name: 'English A1', institutionId: inst, courseName: 'English A1', type: 'Language', level: 'A1', languages: ['English'], summary: 'x', lastUpdated: '2026-11-09', status: 'deployed',
        chapters: [{ id: `${inst}-lsn`, title: 'General practice', description: 'General English practice.' }],
      });
      await M.CourseInstance.create({ id: `${inst}-cls`, courseId: `${inst}-crs`, courseName: 'English A1', institutionId: inst, academicYear: '2026', batchId: `${inst}-b`, curriculumId: `${inst}-cur`, studentIds: [`${inst}-stu`], instructorIds: [], visibility: 'student' });
    }
    app = (await import('../src/app')).createApp();
    for (const key of ['adult', 'school']) tok[key] = `Bearer ${(await request(app).post('/api/auth/login').send({ email: `r2-${key}@r2.test`, password: PW })).body.token}`;
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(() => {
    ai.create.mockReset();
    ai.create.mockResolvedValue({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'What would you like to practise today?' }], usage: { input_tokens: 10, output_tokens: 10 } });
  });

  // Session on the course only (no lesson): the T10 situation, with a placeholder chapter in the outline.
  const turn = async (key: string, text: string, context: Record<string, unknown> = {}) => {
    const s = (await request(app).post('/api/me/tutor/sessions').set('Authorization', tok[key]).send({ courseId: `r2-${key}-crs`, title: 'r2' })).body;
    return request(app).post(`/api/me/tutor/sessions/${s.id ?? s.session?.id}/messages`).set('Authorization', tok[key]).send({ text, context: { courseId: `r2-${key}-crs`, ...context } });
  };
  const payload = () => JSON.stringify(ai.create.mock.calls.at(-1)?.[0] ?? {});

  it('trusted adult band reaches the engine (school setting) and is recorded; school without it is unknown', async () => {
    const adult = await turn('adult', 'hi, help me with english');
    expect(adult.body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'adult', ageBandSource: 'school_setting_adult_learners' });
    expect(payload()).toContain('never childish');
    const school = await turn('school', 'hi, help me with english');
    expect(school.body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'unknown', ageBandSource: 'not_collected' });
    expect(payload()).toContain('age is not known');
  });

  it('a client-supplied age label cannot override the trusted context', async () => {
    const r = await turn('school', 'hi, help me with english', { ageBand: 'adult', age: 30, learnerAge: 'adult', grade: 'University' });
    expect(r.status).toBe(200);
    expect(r.body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'unknown' });
    expect(payload()).not.toContain('never childish');
  });

  it('no lesson with a placeholder chapter in the outline: targeted clarification only, placeholder not presented as theirs', async () => {
    const r = await turn('school', 'hi, help me with english');
    const lt = r.body.assistantMessage.meta.languageTurn;
    expect(lt.moves).toEqual(['clarify_goal']);
    expect(lt.missingContext).toEqual(['lesson_or_goal']);
    expect(lt.lengthTarget.basis).toBe('age_unknown:a1:clarify');
    expect(payload()).toContain('No lesson is selected for this session');
  });

  it('no direct identifiers, grade or birth date in the provider payload', async () => {
    await turn('school', 'hi, help me with english');
    const body = payload();
    for (const leak of ['Quillon', 'r2-school-stu', 'r2-school@', 'R2 school', 'Grade 3', 'birth']) expect(body).not.toContain(leak);
  });
});

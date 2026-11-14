import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attemptsOnCurrentTask,
  classifyLearnerResponse,
  deriveLearnerContext,
  detectTurnSignals,
  lengthTarget,
  levelBand,
  offTopicKind,
  renderLanguageContextPrompt,
  selectLanguageMoves,
  taskInvitation,
  turnEvidence,
  LANGUAGE_POLICY_REVISION,
  type LanguageSpec,
} from '../src/services/languageTeachingContext';

// ltc-v1-r1 remediation tests (LTB v1.0 findings F1-F4). Pure-function tests on
// the engine, replays of the frozen baseline traces (read-only), and route tests
// with the model SDK mocked (no provider call). NOT live-provider tests.

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
const movesFor = (message: string, history: T[], opts: { band?: string; hintsOnly?: boolean; lesson?: typeof FAMILY | null } = {}) => {
  const lesson = opts.lesson === null ? undefined : opts.lesson ?? FAMILY;
  const signals = detectTurnSignals(message, history, lesson);
  const moves = selectLanguageMoves({ band: levelBand(opts.band ?? 'A1'), targetLanguage: 'English', lessonStatus: lesson ? 'structured' : 'none', signals, hintsOnly: opts.hintsOnly });
  return { signals, moves, ids: moves.map((m) => m.id), reasons: moves.flatMap((m) => m.reasons) };
};
const EXERCISE = a('Here is one for you:\n\nComplete: "This is my brother. ___ is twelve."\n\nWrite your answer, and I\'ll check it!');

// ---------------------------------------------------------------------------
describe('R1 hint-first answer requests (F1)', () => {
  it('an answer request before any attempt gets a hint and an invitation to try, not the answer', () => {
    const r = movesFor('just tell me the answer pls', [u('Can you give me one exercise?'), EXERCISE]);
    expect(r.signals.learnerResponse).toBe('answer_request');
    expect(r.signals.attemptsOnTask).toBe(0);
    expect(r.ids).toContain('scaffold_hint');
    expect(r.reasons).toContain('answer_requested_before_attempt');
    expect(r.ids).not.toContain('answer_with_reasoning');
    expect(r.ids).not.toContain('short_explanation');
  });

  it('the prompt tells the tutor not to give the answer yet', () => {
    const r = movesFor('give me the answer', [u('exercise please'), EXERCISE]);
    const learner = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: [] });
    const prompt = renderLanguageContextPrompt({ version: 'ltc-v1', learner, lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves });
    expect(prompt).toContain("Don't give the answer yet");
    expect(prompt).not.toContain('They asked for the answer: give it');
  });

  it('after a wrong attempt: targeted feedback first; asking again then gets the answer with the reason', () => {
    const h = [u('exercise please'), EXERCISE];
    const attempt = movesFor('She is twelve', h);
    expect(attempt.ids).toContain('corrective_feedback_retry');
    const h2 = [...h, u('She is twelve'), a('Nice try! "is twelve" is right. A brother is a boy, so which word fits: He or She? Try again.')];
    const ask = movesFor('just tell me the answer', h2);
    expect(ask.signals.attemptsOnTask).toBe(1);
    expect(ask.ids).toContain('answer_with_reasoning');
    expect(ask.reasons).toContain('answer_requested_after_1_attempt');
  });

  it('a partially correct attempt: feedback keeps the correct part and targets only the gap', () => {
    const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [] });
    const r = movesFor('She usually go to bed at ten.', [u('exercise'), a('Write one sentence with "usually". I\'ll check it.')], { band: 'A2' });
    const prompt = renderLanguageContextPrompt({ version: 'ltc-v1', learner, lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves });
    expect(r.ids).toContain('corrective_feedback_retry');
    expect(prompt).toContain('Keep what is correct');
    expect(prompt).toContain('aimed only at the gap');
  });

  it('a second wrong attempt allows showing the model answer (explanation is not withheld forever)', () => {
    const h = [u('exercise'), EXERCISE, u('She is twelve'), a('Close! Think: brother = boy. Try again: ___ is twelve.')];
    const r = movesFor('it is twelve', h);
    expect(r.ids).toContain('corrective_feedback_retry');
    expect(r.reasons).toContain('attempt_2_plus_show_model_if_still_wrong');
  });

  it('hints-only assignment policy never gives the answer, even after attempts', () => {
    const h = [u('exercise'), EXERCISE, u('She is twelve'), a('Try again: ___ is twelve.')];
    const r = movesFor('just tell me the answer', h, { hintsOnly: true });
    expect(r.ids).toContain('scaffold_hint');
    expect(r.ids).not.toContain('answer_with_reasoning');
  });

  it('a request for an example while a task is open gets a different example, not the task answer', () => {
    const r = movesFor('can you give me an example?', [u('exercise'), EXERCISE]);
    expect(r.ids).toContain('distinct_example');
    expect(r.ids).not.toContain('answer_with_reasoning');
  });

  it('an explanation of a worked example or rule can be given directly', () => {
    const r = movesFor('Can you explain why it is "he" in that example?', [u('exercise'), EXERCISE]);
    expect(r.signals.learnerResponse).toBe('help_request');
    expect(r.ids).toContain('short_explanation');
  });

  it('a learner who brings their own item and asks for the answer gets a hint first (attempt state unknown: low-risk hint)', () => {
    const r = movesFor('Just tell me the answer: she ___ up at 7 every day. get or gets?', []);
    expect(r.ids).toContain('scaffold_hint');
    expect(r.ids).not.toContain('answer_with_reasoning');
  });

  it.each([
    ['adult', true],
    ['age unknown (school learner)', false],
  ])('hint-first holds for %s learners', (_label, adultSchool) => {
    const r = movesFor('just tell me the answer', [u('exercise'), EXERCISE], { band: 'B1' });
    expect(r.ids).toContain('scaffold_hint');
    const learner = deriveLearnerContext({ courseLevel: 'B1', courseLanguages: ['English'], adultSchool, learnerMessages: [] });
    expect(learner.ageBand.status === 'known' && learner.ageBand.value === 'adult').toBe(adultSchool);
  });

  it('turn evidence never claims an attempt, understanding or mastery that did not happen', () => {
    const r = movesFor('just tell me the answer', [u('exercise'), EXERCISE]);
    const learner = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: [] });
    const ev = turnEvidence({ version: 'ltc-v1', learner, lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves, prompt: '' });
    expect(ev).toMatchObject({ attemptsOnTask: 0, answeringCheck: false, masteryClaim: false, confidence: 'low', policyRevision: LANGUAGE_POLICY_REVISION, nextStep: 'learner_attempt_after_hint' });
  });
});

// ---------------------------------------------------------------------------
describe('R2 pending-task answer detection (F2)', () => {
  it.each([
    ['question', 'Which word fits: He or She?'],
    ['instruction', 'Write your answers, and I\'ll check them!'],
    ['instruction', 'Now you: tell me about your sister in one sentence.'],
    ['instruction', 'Choose one: always or never.'],
    ['sentence_frame', 'Complete this:\n\nThis is my sister. ___ is ten.'],
  ])('the tutor closing with a %s opens a task: "%s"', (kind, reply) => {
    expect(taskInvitation(`Good work today.\n\n${reply}`)).toBe(kind);
  });

  it('a plain explanation with no invitation opens no task', () => {
    expect(taskInvitation('"Always" means every time. "Never" means not at all.')).toBeUndefined();
  });

  it.each(['She', 'she go to scool every day', 'This is my sister. She is ten. She likes cats', 'He is twelve?'])(
    'short, multi-sentence, unpunctuated, error-containing or tentative answers count: "%s"',
    (msg) => {
      expect(classifyLearnerResponse(msg, 'instruction')).toBe('answer');
      expect(movesFor(msg, [u('exercise'), EXERCISE]).ids).toContain('corrective_feedback_retry');
    },
  );

  it('"I don\'t know" gets support, not a score', () => {
    const r = movesFor("I don't know", [u('exercise'), EXERCISE]);
    expect(r.signals.learnerResponse).toBe('dont_know');
    expect(r.reasons).toContain('learner_does_not_know');
    expect(r.ids).not.toContain('corrective_feedback_retry');
  });

  it('a hint request or a request to repeat the task is not graded as an answer', () => {
    expect(movesFor('can I have a hint?', [u('x'), EXERCISE]).signals.learnerResponse).toBe('hint_request');
    const rep = movesFor('what do I do?', [u('x'), EXERCISE]);
    expect(rep.signals.learnerResponse).toBe('repeat_request');
    expect(rep.ids).toContain('restate_task');
    expect(rep.ids).not.toContain('corrective_feedback_retry');
  });

  it('changing topic or greeting while a task is pending is not graded', () => {
    expect(movesFor('Can you explain the past simple?', [u('x'), EXERCISE]).ids).not.toContain('corrective_feedback_retry');
    expect(movesFor('hi', [u('x'), EXERCISE]).signals.learnerResponse).toBe('greeting');
  });

  it('no stale state: once the tutor\'s last reply opens no task, the next message is not an answer', () => {
    const h = [u('x'), EXERCISE, u('He'), a('Yes! "He is twelve" is correct. Well done.')];
    expect(movesFor('my brother is tall', h).signals.answeringCheck).toBe(false);
  });

  it('the session greeting before the learner\'s first message is never a task', () => {
    expect(movesFor('She', [a('Hi! What would you like to practise? Write it here.')]).signals.answeringCheck).toBe(false);
  });

  it('attempt counting is deterministic: retrying the same request over the same history gives the same result once', () => {
    const h = [u('x'), EXERCISE, u('She'), a('Try again: ___ is twelve.')];
    expect(attemptsOnCurrentTask(h)).toBe(1);
    expect(detectTurnSignals('He', h, FAMILY)).toEqual(detectTurnSignals('He', h, FAMILY));
    expect(attemptsOnCurrentTask([...h, u('Can you explain he and she?'), a('He is for a boy. Try: ___ is twelve.')])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('R3 length and register by age band and CEFR step (F3)', () => {
  const school = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: [] }).ageBand;
  const adult = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: true, learnerMessages: [] }).ageBand;

  it('targets rise with CEFR step independently of age band; adults get more room than age-unknown learners', () => {
    for (const band of [school, adult]) {
      const [a1, a2, b1] = ['A1', 'A2', 'B1'].map((l) => lengthTarget(band, l).maxWords);
      expect(a1).toBeLessThan(a2);
      expect(a2).toBeLessThan(b1);
    }
    for (const l of ['A1', 'A2', 'B1']) expect(lengthTarget(school, l).maxWords).toBeLessThan(lengthTarget(adult, l).maxWords);
  });

  it('age is never inferred from grade: a grade changes nothing about the target', () => {
    const g3 = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, grade: 'Grade 3', learnerMessages: [] }).ageBand;
    const g9 = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, grade: 'Grade 9', learnerMessages: [] }).ageBand;
    expect(lengthTarget(g3, 'A1')).toEqual(lengthTarget(g9, 'A1'));
    expect(lengthTarget(g3, 'A1').basis).toBe('age_unknown:a1');
  });

  it('the prompt states the target, one step per reply, and a register that fits the band without labelling a child or teen', () => {
    const r = movesFor('What does "brother" mean?', []);
    const mk = (adultSchool: boolean) => {
      const learner = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool, learnerMessages: [] });
      return renderLanguageContextPrompt({ version: 'ltc-v1', learner, lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves, length: lengthTarget(learner.ageBand, 'A1') });
    };
    const unknown = mk(false);
    const adultP = mk(true);
    expect(unknown).toContain('about 55 words, never more than 80');
    expect(unknown).toContain('One step per reply');
    expect(unknown).toContain("age is not known");
    expect(unknown).toContain('no baby talk');
    expect(adultP).toContain('about 70 words, never more than 110');
    expect(adultP).toContain('never childish');
    for (const p of [unknown, adultP]) {
      expect(p).not.toMatch(/\b(child|children|kid|teen|teenager)\b/i);
      expect(p).toContain('<language_teaching_context version="ltc-v1">');
    }
  });

  it('A1/A2/B1 register lines differ within the same age band', () => {
    const lines = ['A1', 'A2', 'B1'].map((lvl) => {
      const learner = deriveLearnerContext({ courseLevel: lvl, courseLanguages: ['English'], adultSchool: false, learnerMessages: [] });
      const r = movesFor('hello there friend', [], { band: lvl });
      return renderLanguageContextPrompt({ version: 'ltc-v1', learner, lesson: { status: 'structured', ...FAMILY }, signals: r.signals, moves: r.moves }).split('\n').find((x) => x.startsWith('Level:'));
    });
    expect(new Set(lines).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
describe('R4 off-topic redirect (F4)', () => {
  it.each(['Can you do my maths homework? 25 + 37', 'Write my history essay about the pyramids for me', 'Can you write an email to my landlord about the broken heater?', 'Please solve 3x + 5 = 20', 'can u write my science report'])(
    'unrelated request is redirected, with no mini-lesson stacked on it: "%s"',
    (msg) => {
      const r = movesFor(msg, []);
      expect(r.signals.offTopic).toBe('unrelated');
      expect(r.ids).toContain('redirect_to_lesson');
      expect(r.ids).not.toContain('activate_prior_knowledge');
      expect(r.ids).not.toContain('short_explanation');
    },
  );

  it.each(['How do I say "fractions" in English?', 'What does "heater" mean?', 'Can you check my email to my landlord for grammar?', 'Is it correct to say "my homework is many"?'])(
    'language questions, including about other topics, are not blocked: "%s"',
    (msg) => {
      expect(movesFor(msg, []).ids).not.toContain('redirect_to_lesson');
    },
  );

  it('a learner sentence that mentions homework is language, not a request', () => {
    const r = movesFor('My dad watches TV after dinner. I always do my homework before that.', [u('x'), a('Write two sentences with "always". I\'ll check them.')]);
    expect(r.signals.offTopic).toBeUndefined();
    expect(r.ids).toContain('corrective_feedback_retry');
  });

  it('harmless social messages are not redirected', () => {
    const r = movesFor('thanks!', [u('x'), a('Great job today.')]);
    expect(r.signals.offTopic).toBe('social');
    expect(r.ids).not.toContain('redirect_to_lesson');
  });

  it('a question about the lesson\'s own words is on topic', () => {
    expect(offTopicKind('Can you help me say something about my brother?', FAMILY)).toBeUndefined();
  });

  it('with no lesson context: a vague message gets a goal question; an unrelated task is still not done', () => {
    expect(movesFor('hi, help me with english', [], { lesson: null }).ids).toContain('clarify_goal');
    const r = movesFor('do my maths homework for me', [], { lesson: null });
    expect(r.ids).toContain('redirect_to_lesson');
    expect(r.reasons).toContain('off_topic_no_lesson');
  });
});

// ---------------------------------------------------------------------------
// Replays of the frozen LTB v1.0 baseline traces (read-only): the learner turns
// and the baseline tutor replies, through the r1 signal and move logic.
const BASE = path.resolve(__dirname, '../../docs/benchmarks/language-teaching/20261109T-ltb-v1.0');
const haveBaseline = existsSync(path.join(BASE, 'raw_results.jsonl'));
describe.skipIf(!haveBaseline)('baseline trace replays (deterministic engine only; not a re-run of the model)', () => {
  const read = (f: string) => readFileSync(path.join(BASE, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const cases = haveBaseline ? new Map(read('benchmark_cases.jsonl').map((c) => [c.id, c])) : new Map();
  const raw = haveBaseline ? read('raw_results.jsonl') : [];
  const replay = (r: any) => {
    const c = cases.get(r.caseId);
    const h: T[] = [];
    let last: ReturnType<typeof movesFor> | undefined;
    for (const t of r.turns) {
      last = movesFor(t.learner, h, { band: c.cefr, lesson: c.lesson ? { title: c.lesson.title, spec: c.lesson.spec } : null });
      h.push(u(t.learner), a(t.reply));
    }
    return { c, last: last! };
  };

  it('the 23 answer-feedback cases the baseline engine missed now select corrective feedback', () => {
    const agg = JSON.parse(readFileSync(path.join(BASE, 'aggregate_results.json'), 'utf8'));
    const missed = new Set<string>(agg.deterministicChecks.expected_move_any.failedCases);
    const feedback = raw.filter((r) => missed.has(r.caseId) && /^T0[3-8]/.test(cases.get(r.caseId).caseType));
    expect(feedback).toHaveLength(23);
    for (const r of feedback) expect(replay(r).last.ids, r.caseId).toContain('corrective_feedback_retry');
  });

  it('all 9 T13 answer requests now get a hint before any attempt', () => {
    const t13 = raw.filter((r) => cases.get(r.caseId).caseType.startsWith('T13'));
    expect(t13).toHaveLength(9);
    for (const r of t13) {
      const { last } = replay(r);
      expect(last.reasons, r.caseId).toContain('answer_requested_before_attempt');
      expect(last.ids, r.caseId).not.toContain('answer_with_reasoning');
    }
  });

  it('all 9 T11 off-topic requests are redirected, and no other case is flagged off-topic', () => {
    for (const r of raw) {
      const { c, last } = replay(r);
      expect(last.ids.includes('redirect_to_lesson'), r.caseId).toBe(c.caseType.startsWith('T11'));
    }
  });
});

// ---------------------------------------------------------------------------
// Through the real route: pending-task state can't cross sessions or learners,
// and the provider payload carries no identifiers or birth date.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
const tokens: Record<string, string> = {};
const PW = 'remediation-test-password';

describe('through the tutor route (SDK mocked)', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
      JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
      ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'ltc-r1-test',
    });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
    (await import('../src/config/env')).resetConfigForTests();
    (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
    await mongoose.connect(mongo.getUri());
    const M: Record<string, mongoose.Model<any>> = {};
    for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[name] = (await import(`../src/models/${name}`))[name];
    const hash = bcrypt.hashSync(PW, 4);
    await M.Institution.create({ id: 'r1-school', name: 'R1 School', features: {}, learningSettings: { adultLearners: false } });
    await M.Batch.create({ id: 'r1-b', name: 'B', institutionId: 'r1-school', academicYear: '2026', studentCount: 2 });
    for (const who of ['one', 'two']) {
      await M.Student.create({ id: `r1-${who}`, name: `Xyloquent Testlearner ${who}`, email: `r1-${who}@r1.test`, grade: 'Grade 3', institutionId: 'r1-school', batchId: 'r1-b' });
      await M.StudentCredit.create({ studentId: `r1-${who}`, institutionId: 'r1-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
      await M.User.create({ email: `r1-${who}@r1.test`, password: hash, role: 'student', name: `Xyloquent Testlearner ${who}`, status: 'active', institutionId: 'r1-school', studentId: `r1-${who}` });
    }
    await M.Curriculum.create({
      id: 'r1-cur', name: 'English A1', institutionId: 'r1-school', courseName: 'English A1', type: 'Language', level: 'A1', languages: ['English'], summary: 'x', lastUpdated: '2026-11-09', status: 'deployed',
      chapters: [{ id: 'r1-lsn', title: FAMILY.title, description: 'Family', languageSpec: FAMILY.spec }],
    });
    await M.CourseInstance.create({ id: 'r1-cls', courseId: 'r1-crs', courseName: 'English A1', institutionId: 'r1-school', academicYear: '2026', batchId: 'r1-b', curriculumId: 'r1-cur', studentIds: ['r1-one', 'r1-two'], instructorIds: [], visibility: 'student' });
    app = (await import('../src/app')).createApp();
    for (const who of ['one', 'two']) tokens[who] = `Bearer ${(await request(app).post('/api/auth/login').send({ email: `r1-${who}@r1.test`, password: PW })).body.token}`;
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(() => {
    ai.create.mockReset();
    ai.create.mockResolvedValue({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Complete: "This is my brother. ___ is twelve." Write your answer, and I\'ll check it!' }], usage: { input_tokens: 10, output_tokens: 10 } });
  });

  const send = async (who: string, sid: string, text: string) =>
    request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', tokens[who]).send({ text, context: { courseId: 'r1-crs', lessonId: 'r1-lsn' } });
  const newSession = async (who: string) =>
    (await request(app).post('/api/me/tutor/sessions').set('Authorization', tokens[who]).send({ courseId: 'r1-crs', lessonId: 'r1-lsn', title: 'r1' })).body;

  it('an instruction-closed task is recognised in the same session, and never in another session or for another learner', async () => {
    const s1 = await newSession('one');
    const sid1 = s1.id ?? s1.session?.id;
    await send('one', sid1, 'Can you give me one exercise?');
    const answered = await send('one', sid1, 'He');
    expect(answered.status).toBe(200);
    expect(answered.body.assistantMessage.meta.languageTurn).toMatchObject({ answeringCheck: true, pendingTask: 'sentence_frame', learnerResponse: 'answer', policyRevision: LANGUAGE_POLICY_REVISION, masteryClaim: false });

    const s2 = await newSession('one');
    const other = await send('one', s2.id ?? s2.session?.id, 'He');
    expect(other.body.assistantMessage.meta.languageTurn.answeringCheck).toBe(false);

    const s3 = await newSession('two');
    const peer = await send('two', s3.id ?? s3.session?.id, 'He');
    expect(peer.body.assistantMessage.meta.languageTurn.answeringCheck).toBe(false);
  });

  it('hint-first reaches the model, with the length target; no identifiers, grade or birth date in the payload', async () => {
    const s = await newSession('one');
    const sid = s.id ?? s.session?.id;
    await send('one', sid, 'Can you give me one exercise?');
    const r = await send('one', sid, 'just tell me the answer pls');
    expect(r.body.assistantMessage.meta.languageTurn).toMatchObject({ attemptsOnTask: 0, learnerResponse: 'answer_request', nextStep: 'learner_attempt_after_hint' });
    expect(r.body.assistantMessage.meta.languageTurn.moves).not.toContain('answer_with_reasoning');
    const body = JSON.stringify(ai.create.mock.calls.at(-1)?.[0] ?? {});
    expect(body).toContain("Don't give the answer yet");
    expect(body).toContain('about 55 words, never more than 80');
    for (const leak of ['Xyloquent', 'r1-one', 'r1@', 'r1-school', 'Grade 3', 'birth']) expect(body).not.toContain(leak);
  });
});

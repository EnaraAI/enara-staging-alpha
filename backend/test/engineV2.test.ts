import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectTurnSignals, deriveLearnerContext, levelBand, renderLanguageContextPrompt, renderLanguageContextParts, selectLanguageMoves, supportStage, finalizeLanguageTurn, TEACH_RULE, TEACH_RULE_V2, HOLD_LINE, ASSESSMENT_INSTRUCTION, assessmentInstruction, type LanguageSpec, type LanguageTeachingContext } from '../src/services/languageTeachingContext';
import { engineV2 } from '../src/services/engineV2';
import { parseAssessmentMarker, sanitizeBelief, deriveLearningState, type HistoryTurn } from '../src/services/languageLearningState';
import { applyTurnV2, summarizeProfileV2, dueItems, OPENING_REVIEW, recordProfileTurn } from '../src/services/learnerLanguageProfile';

// Language engine v2: wrong-answer teaching, belief tracking, cross-session memory, cache layout. Every feature is default OFF and these tests
// go through the real engine (history with stored assessments), not hand-built impossible inputs.
const ai = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => { class Anthropic { static APIError = class extends Error {}; messages = { create: ai.create }; beta = { messages: { create: ai.create, stream: ai.stream } }; } return { default: Anthropic }; });

const SPEC: LanguageSpec = { objectives: ['Use in, on and at with time words'], successCriteria: ['Uses at with clock times', 'Uses on with days', 'Uses in with months'], grammar: ['in/on/at'], items: [
  { id: 'i1', prompt: 'Write in, on or at: My train leaves ___ 5 o\'clock.', acceptedAnswers: ['at'], targetForms: ['at'], criteria: [1] },
  { id: 'i2', prompt: 'Write in, on or at: They get married ___ April.', acceptedAnswers: ['in'], targetForms: ['in'], criteria: [3] }] };
const LESSON = { title: 'Time prepositions', spec: SPEC };
const u = (content: string): HistoryTurn => ({ role: 'user', content });
const a = (content: string, languageTurn?: HistoryTurn['languageTurn']): HistoryTurn => ({ role: 'assistant', content, languageTurn });
const li = { id: 'lesson:i2', source: 'lesson' as const, lessonItemId: 'i2' };
const wrong = (belief?: string) => ({ assessment: { verdict: 'INCORRECT', relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', source: 'tutor_assessment', ...(belief ? { belief } : {}) }, activeItem: li, hintLevel: 1 }) as unknown as HistoryTurn['languageTurn'];
const saved = process.env.ENARA_ENGINE_V2; afterEach(() => { if (saved === undefined) delete process.env.ENARA_ENGINE_V2; else process.env.ENARA_ENGINE_V2 = saved; });
function build(message: string, history: HistoryTurn[]) {
  const signals = detectTurnSignals(message, history, LESSON);
  const moves = selectLanguageMoves({ band: levelBand('A2'), targetLanguage: 'English', lessonStatus: 'structured', signals });
  const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [message] });
  const ctx: Omit<LanguageTeachingContext, 'prompt'> = { version: 'ltc-v1', learner, lesson: { status: 'structured', lessonId: 'lsn', title: LESSON.title, spec: SPEC }, signals, moves };
  return { ctx, prompt: renderLanguageContextPrompt(ctx), signals };
}
const twoMisses = [u('Give me an exercise'), a('Write in, on or at: They get married ___ April.', { assessment: { verdict: 'NOT_EVALUATED', relevance: 'NO_ACTIVE_ITEM', criteria: [], next: 'NEW_ITEM', source: 'tutor_assessment', item: 'i2' }, activeItem: li } as never), u('at April'), a('Look at the word April.', wrong('at works for months')), u('on April'), a('Think about the month.', wrong('at works for months'))];

describe('v2 switch', () => {
  it('is off by default; "all" and named features turn it on', () => {
    delete process.env.ENARA_ENGINE_V2; for (const f of ['wrongAnswer', 'belief', 'memory', 'cache'] as const) expect(engineV2(f)).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'belief, cache'; expect(engineV2('belief')).toBe(true); expect(engineV2('cache')).toBe(true); expect(engineV2('memory')).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('memory')).toBe(true);
  });
});

describe('item 1: teach the rule after a recorded wrong attempt (was unreachable)', () => {
  it('through the real engine: second wrong attempt gets the rule only with the switch on', () => {
    delete process.env.ENARA_ENGINE_V2; const off = build('in the April', twoMisses);
    expect(supportStage({ ...off.signals, keyVerdict: off.signals.keyVerdict })).toBeNull(); expect(off.prompt).not.toContain(TEACH_RULE_V2); expect(off.prompt).not.toContain(TEACH_RULE);
    process.env.ENARA_ENGINE_V2 = 'wrongAnswer'; const on = build('in the April', twoMisses);
    expect(supportStage(on.signals as never)).toBe('teach_rule'); expect(on.prompt).toContain(TEACH_RULE_V2); expect(on.prompt).toMatch(/If this new answer is right, confirm it and do not teach the rule/);
  });
  it('does not teach on a first attempt, and never writes the answer (wording check)', () => {
    process.env.ENARA_ENGINE_V2 = 'wrongAnswer'; const first = build('at April', [twoMisses[0], twoMisses[1]]); expect(supportStage(first.signals as never)).toBeNull(); expect(TEACH_RULE_V2).toMatch(/different word \(not this item's answer\)/);
  });
});

describe('item 3: belief tracking', () => {
  it('parses and sanitises the belief; ignores junk', () => {
    expect(parseAssessmentMarker('[[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM belief=at_works_for_months]]')?.belief).toBe('at works for months'); expect(sanitizeBelief('<script>x</script>')).toBe('scriptxscript'); expect(sanitizeBelief('ab')).toBeUndefined(); expect(sanitizeBelief(undefined)).toBeUndefined();
  });
  it('merges the same belief across items and counts it', () => {
    const st = deriveLearningState(twoMisses); expect(st.beliefs).toEqual([{ text: 'at works for months', count: 2 }]);
  });
  it('off: no belief wording; on: marker asks for it and a repeated belief gets the hold-the-line + scope-rule lines', () => {
    delete process.env.ENARA_ENGINE_V2; expect(assessmentInstruction()).toBe(ASSESSMENT_INSTRUCTION); expect(build('on April', twoMisses).prompt).not.toContain(HOLD_LINE);
    process.env.ENARA_ENGINE_V2 = 'belief'; const on = build('on April', twoMisses); expect(assessmentInstruction()).toContain('belief='); expect(on.prompt).toContain(HOLD_LINE); expect(on.prompt).toContain('at works for months'); expect(on.prompt).toMatch(/scope rule/);
    expect(build('on April', twoMisses.slice(0, 4)).prompt).not.toMatch(/same mistaken idea in more than one turn/);
  });
  it('finalize keeps a belief only for INCORRECT/PARTIALLY_CORRECT', () => {
    process.env.ENARA_ENGINE_V2 = 'belief'; const { ctx } = build('on April', twoMisses);
    const f = (v: string) => finalizeLanguageTurn(ctx, { reply: 'x', learnerText: 'on April', messageId: 'm', parsed: { verdict: v as never, relevance: 'ACTIVE_ITEM', criteria: [], next: 'SAME_ITEM', belief: 'at works for months' } });
    expect((f('INCORRECT').assessment as { belief?: string }).belief).toBe('at works for months'); expect((f('CORRECT').assessment as { belief?: string }).belief).toBeUndefined();
  });
});

describe('item 4: cross-session memory (pure parts)', () => {
  const t0 = new Date('2026-11-01T10:00:00Z'); const day = 86_400_000;
  it('a belief is open until an independent success in the same lesson; then reviewed at spaced intervals', () => {
    let p = applyTurnV2({ beliefs: [], worked: [] }, { belief: 'at works for months', lessonId: 'L1', lessonTitle: 'Time', now: t0 });
    expect(p.beliefs[0].occurrences).toBe(1); expect(p.beliefs[0].resolvedAt).toBeUndefined(); p = applyTurnV2(p, { belief: 'at works for months', lessonId: 'L1', now: new Date(t0.getTime() + 1000) }); expect(p.beliefs[0].occurrences).toBe(2);
    p = applyTurnV2(p, { independentSuccessOn: { id: 'i', prompt: 'x' } as never, lessonId: 'L1', style: 'rule_explained', now: new Date(t0.getTime() + 2 * day) });
    expect(p.beliefs[0].resolvedAt).toBeTruthy(); expect(p.beliefs[0].nextReviewAt!.getTime() - (t0.getTime() + 2 * day)).toBe(3 * day); expect(p.worked).toEqual([{ style: 'rule_explained', count: 1 }]);
    const later = new Date(t0.getTime() + 6 * day); p = applyTurnV2(p, { independentSuccessOn: { id: 'i', prompt: 'x' } as never, lessonId: 'L1', now: later }); expect(p.beliefs[0].resolvedCount).toBe(2); expect(p.beliefs[0].nextReviewAt!.getTime() - later.getTime()).toBe(7 * day);
  });
  it('prompt lines: open belief, due review, what worked, opening instruction only at session start', () => {
    const p = applyTurnV2({ beliefs: [], worked: [] }, { belief: 'at works for months', lessonId: 'L1', lessonTitle: 'Time', now: t0 });
    const lines = summarizeProfileV2({ beliefs: p.beliefs, worked: [{ style: 'rule_explained', count: 3 }] }, { now: new Date(t0.getTime() + day), opening: true }).join('\n');
    expect(lines).toContain('Earlier mistaken idea, not yet shown resolved: "at works for months"'); expect(lines).toContain('a clear rule with a worked example'); expect(lines).toContain(OPENING_REVIEW);
    expect(summarizeProfileV2({ beliefs: p.beliefs, worked: [] }, { now: t0, opening: false }).join('\n')).not.toContain(OPENING_REVIEW); expect(summarizeProfileV2({ beliefs: [], worked: [] }, { opening: true })).toEqual([]);
  });
  it('due items list has no learner text beyond the short idea label', () => {
    const p = applyTurnV2({ beliefs: [], worked: [] }, { belief: 'at works for months', lessonId: 'L1', now: t0 }); const d = dueItems([], p, new Date(t0.getTime() + 2 * day)); expect(d).toEqual([{ kind: 'belief', label: 'at works for months', dueSince: p.beliefs[0].nextReviewAt }]);
  });
});

describe('item 2: cache layout (stable first)', () => {
  it('stable part is identical across turns of the same lesson; per-turn parts are only in the dynamic part; together they carry the same rules', () => {
    delete process.env.ENARA_ENGINE_V2; const x = renderLanguageContextParts(build('hello', []).ctx); const y = renderLanguageContextParts(build('on April', twoMisses).ctx);
    expect(x.stable).toBe(y.stable); expect(x.dynamic).not.toBe(y.dynamic); expect(x.stable).not.toContain('Teaching moves for this reply'); expect(y.dynamic).toContain('Teaching moves for this reply'); expect(y.dynamic).toContain('Length and style');
    const full = build('on April', twoMisses).prompt; for (const needle of ['Current lesson (from the course): "Time prepositions"', 'Start your reply with one hidden line', 'Lesson items (exercises from the course']) { expect(x.stable).toContain(needle); expect(full).toContain(needle); }
    expect(x.stable.length).toBeGreaterThan(3000); // about 800 tokens for this tiny lesson; with the base and curriculum blocks the cached prefix passes the ~1,100-token minimum measured for the model
  });
});

// ------------------------------------------------------------- through the real route
let mongo: MongoMemoryServer; let app: ReturnType<typeof import('../src/app')['createApp']>; const tokens: Record<string, string> = {};
const PW = 'v2-test-password'; const msg = (text: string) => ({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } });
describe('v2 through the route', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'ltc-v2-test' });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
    (await import('../src/config/env')).resetConfigForTests(); (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
    await mongoose.connect(mongo.getUri()); const M: Record<string, mongoose.Model<any>> = {};
    for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[name] = (await import(`../src/models/${name}`))[name];
    const hash = bcrypt.hashSync(PW, 4);
    await M.Institution.create({ id: 'v2-school', name: 'V2', features: {}, learningSettings: { adultLearners: false } });
    await M.Batch.create({ id: 'v2-b', name: 'B', institutionId: 'v2-school', academicYear: '2026', studentCount: 2 });
    for (const who of ['one', 'two']) {
      await M.Student.create({ id: `v2-${who}`, name: `Zebrafish Learner ${who}`, email: `v2-${who}@v2.test`, grade: 'Grade 9', institutionId: 'v2-school', batchId: 'v2-b' });
      await M.StudentCredit.create({ studentId: `v2-${who}`, institutionId: 'v2-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
      await M.User.create({ email: `v2-${who}@v2.test`, password: hash, role: 'student', name: `Zebra ${who}`, status: 'active', institutionId: 'v2-school', studentId: `v2-${who}` });
    }
    await M.Curriculum.create({ id: 'v2-cur', name: 'English A2', institutionId: 'v2-school', courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 'x', lastUpdated: '2026-11-14', status: 'deployed', chapters: [{ id: 'v2-lsn', title: LESSON.title, description: 'Prepositions', languageSpec: SPEC }] });
    await M.CourseInstance.create({ id: 'v2-cls', courseId: 'v2-crs', courseName: 'English A2', institutionId: 'v2-school', academicYear: '2026', batchId: 'v2-b', curriculumId: 'v2-cur', studentIds: ['v2-one', 'v2-two'], instructorIds: [], visibility: 'student' });
    app = (await import('../src/app')).createApp();
    for (const who of ['one', 'two']) tokens[who] = `Bearer ${(await request(app).post('/api/auth/login').send({ email: `v2-${who}@v2.test`, password: PW })).body.token}`;
  }, 120_000);
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
  beforeEach(() => { ai.create.mockReset(); ai.stream.mockReset(); });
  const send = (who: string, sid: string, text: string) => request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', tokens[who]).send({ text, context: { courseId: 'v2-crs', lessonId: 'v2-lsn' } });
  const newSession = async (who: string) => (await request(app).post('/api/me/tutor/sessions').set('Authorization', tokens[who]).send({ courseId: 'v2-crs', lessonId: 'v2-lsn', title: 'v2' })).body.id;
  const systemOf = () => (ai.create.mock.calls.at(-1)?.[0]?.system ?? []) as { type: string; text: string; cache_control?: unknown }[];

  it('cache layout: one cache breakpoint on the stable language block; the changing part is last; same rules present', async () => {
    process.env.ENARA_ENGINE_V2 = 'cache'; const sid = await newSession('one'); ai.create.mockResolvedValueOnce(msg('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NONE]]\nSure.'));
    expect((await send('one', sid, 'Hello, can we practise?')).status).toBe(200); const sys = systemOf();
    const idx = sys.findIndex((b) => b.cache_control); expect(idx).toBeGreaterThan(0); expect(sys.filter((b) => b.cache_control).length).toBe(1);
    expect(sys[idx].text).toContain('<language_teaching_context'); expect(sys[idx].text).toContain('Start your reply with one hidden line'); expect(sys[idx].text).not.toContain('Teaching moves for this reply');
    expect(sys.at(-1)!.text).toContain('Teaching moves for this reply'); expect(sys.at(-1)!.text).toContain('</language_teaching_context>');
    delete process.env.ENARA_ENGINE_V2; ai.create.mockResolvedValueOnce(msg('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NONE]]\nSure.')); await send('one', sid, 'Hello again'); const off = systemOf(); expect(off.filter((b) => b.cache_control).length).toBe(1); expect(off.find((b) => b.cache_control)!.text).toContain("student's curriculum");
  }, 30_000);

  it('memory: a named belief is stored, shown to the next session with an opening review, listed as due, and writes do not overwrite each other', async () => {
    process.env.ENARA_ENGINE_V2 = 'belief,memory'; const s1 = await newSession('two');
    ai.create.mockResolvedValueOnce(msg('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NEW_ITEM item=i2]]\nWrite in, on or at: They get married ___ April.')); await send('two', s1, 'Can I have an exercise?');
    ai.create.mockResolvedValueOnce(msg('[[assess verdict=INCORRECT relevance=ACTIVE_ITEM next=SAME_ITEM item=i2 belief=at_works_for_months]]\nLook at the word April.')); await send('two', s1, 'They get married at April.');
    const doc = await mongoose.connection.collection('learner_language_profiles').findOne({ institutionId: 'v2-school', studentId: 'v2-two' });
    expect(doc?.beliefs?.[0]?.tag).toBe('at works for months'); expect(JSON.stringify(doc)).not.toMatch(/They get married at April/);
    const s2 = await newSession('two'); ai.create.mockResolvedValueOnce(msg('[[assess verdict=NOT_EVALUATED relevance=NO_ACTIVE_ITEM next=NONE]]\nHello.')); await send('two', s2, 'Hi, can we practise?');
    const text = JSON.stringify(systemOf()); expect(text).toContain('Earlier mistaken idea, not yet shown resolved'); expect(text).toContain('begin with one short unaided check');
    const due = await request(app).get('/api/me/tutor/reviews/due').set('Authorization', tokens.two); expect(due.status).toBe(200); expect(due.body.due.some((d: { label: string }) => d.label === 'at works for months')).toBe(true);
    const other = await request(app).get('/api/me/tutor/reviews/due').set('Authorization', tokens.one); expect(JSON.stringify(other.body)).not.toContain('at works for months'); // another learner sees nothing
    await Promise.all([recordProfileTurn('v2-school', 'v2-two', { belief: 'on works for days of weeks' }), recordProfileTurn('v2-school', 'v2-two', { belief: 'in works for clock times' })]);
    const after = await mongoose.connection.collection('learner_language_profiles').findOne({ institutionId: 'v2-school', studentId: 'v2-two' }); expect(after?.beliefs?.length).toBe(3); // neither concurrent write was lost
    delete process.env.ENARA_ENGINE_V2; const off = await request(app).get('/api/me/tutor/reviews/due').set('Authorization', tokens.two); expect(off.body.due).toEqual([]);
  }, 60_000);
});

import { arbitratePedagogy, ARBITRATED_CONFLICT_LINE } from '../src/services/languageTurnPipeline';
import { ARBITRATION_LINE, EXPLICIT_FIRST_LINE } from '../src/services/languageTeachingContext';
describe('item 5: arbitration between the teaching plan (how to explain) and the language engine (what may be revealed)', () => {
  const PLAN = '- Teaching method: Direct Instruction. Teach one idea at a time; model one complete example aloud.\n- Feedback: say what is right.\n- If methods disagree (for example on giving answers or how many questions to ask), follow the teaching method above.';
  const withPlan = (planPrimary: string | undefined, message: string, history: HistoryTurn[]) => { const b = build(message, history); const ctx = { ...b.ctx, ...(planPrimary ? { planPrimary } : {}) }; return renderLanguageContextPrompt(ctx); };
  it('is named-only: "all" does not turn it on, so earlier preregistered runs keep their meaning', () => {
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('arbitration')).toBe(false); expect(engineV2('wrongAnswer')).toBe(true);
    process.env.ENARA_ENGINE_V2 = 'arbitration'; expect(engineV2('arbitration')).toBe(true); expect(engineV2('belief')).toBe(false);
  });
  it('off: nothing changes (no authority line, plan text untouched)', () => {
    delete process.env.ENARA_ENGINE_V2; expect(withPlan('direct_instruction', 'Can you give me one exercise?', [])).not.toContain(ARBITRATION_LINE); expect(arbitratePedagogy(PLAN, true)).toBe(PLAN);
  });
  it('on: the language prompt states the order of authority, and the plan\'s contradictory "methods disagree" line is replaced (language lessons only)', () => {
    process.env.ENARA_ENGINE_V2 = 'arbitration'; expect(withPlan('formative_feedback', 'Can you give me one exercise?', [])).toContain(ARBITRATION_LINE);
    const out = arbitratePedagogy(PLAN, true)!; expect(out).toContain(ARBITRATED_CONFLICT_LINE); expect(out).not.toMatch(/follow the teaching method above/); expect(out).toContain('model one complete example aloud'); // the method itself is kept
    expect(arbitratePedagogy(PLAN, false)).toBe(PLAN); // non-language turns are untouched
  });
  it('explicit-instruction plans may give a short rule and an unrelated modelled example before the first try; other plans keep try-first', () => {
    process.env.ENARA_ENGINE_V2 = 'arbitration';
    const explicit = withPlan('direct_instruction', 'Can you give me one exercise?', []); expect(explicit).toContain(EXPLICIT_FIRST_LINE); expect(EXPLICIT_FIRST_LINE).toMatch(/words that appear in no lesson exercise/); expect(EXPLICIT_FIRST_LINE).toMatch(/Never show the exercise's answer or its target form/);
    expect(withPlan('worked_example', 'Can you give me one exercise?', [])).toContain(EXPLICIT_FIRST_LINE);
    expect(withPlan('socratic_questioning', 'Can you give me one exercise?', [])).not.toContain(EXPLICIT_FIRST_LINE); expect(withPlan('mastery_learning', 'Can you give me one exercise?', [])).not.toContain(EXPLICIT_FIRST_LINE);
    expect(withPlan(undefined, 'Can you give me one exercise?', [])).not.toContain(ARBITRATION_LINE); // no plan: nothing to arbitrate
  });
  it('the pre-attempt guard wording is still in the prompt alongside the override (nothing is removed)', () => {
    process.env.ENARA_ENGINE_V2 = 'arbitration'; expect(withPlan('direct_instruction', 'Can you give me one exercise?', [])).toMatch(/no rule, no reminder and no example before their first try/i);
  });
});

import { evaluateAgainstKey, expandContractions } from '../src/services/languageLearningState';
describe('item 6: answer key treats contractions as full forms (keyMatch, named-only)', () => {
  const item = { id: 'k', prompt: 'x', acceptedAnswers: ['She does not go to school on Sundays', 'He has finished'], targetForms: ['does not'], criteria: [1] };
  it('off: exact strings only (unchanged); on: contractions match, wrong answers still do not', () => {
    delete process.env.ENARA_ENGINE_V2; expect(evaluateAgainstKey("She doesn't go to school on Sundays", item as never)).toBeNull(); expect(evaluateAgainstKey('She does not go to school on Sundays.', item as never)).toBe('CORRECT');
    process.env.ENARA_ENGINE_V2 = 'keyMatch'; expect(evaluateAgainstKey("She doesn't go to school on Sundays", item as never)).toBe('CORRECT'); expect(evaluateAgainstKey('She doesn’t go to school on Sundays!', item as never)).toBe('CORRECT');
    expect(evaluateAgainstKey('She do not go to school on Sundays', item as never)).toBeNull(); expect(evaluateAgainstKey("She doesn't goes to school on Sundays", item as never)).toBeNull(); expect(evaluateAgainstKey("He's finished", item as never)).toBeNull(); // 's is ambiguous: left to the tutor
  });
  it('is named-only: "all" does not enable it; expansion is correct for common forms', () => {
    process.env.ENARA_ENGINE_V2 = 'all'; expect(engineV2('keyMatch')).toBe(false);
    expect(expandContractions("I can't, won't, don't; they're; we've; I'll; I'm")).toBe('I can not, will not, do not; they are; we have; I will; i am');
  });
});

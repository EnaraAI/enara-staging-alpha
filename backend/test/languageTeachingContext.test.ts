import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deriveLearnerContext,
  deriveLessonContext,
  detectTurnSignals,
  levelBand,
  renderLanguageContextPrompt,
  sanitizeLanguageSpec,
  selectLanguageMoves,
  targetLanguageOf,
  turnEvidence,
  type LanguageTeachingContext,
} from '../src/services/languageTeachingContext';

// Phase 1 Language Teaching Context Engine (ltc-v1). Pure-function tests for
// the labelled context and the move rules, then API tests through the real
// tutor route. The model SDK is mocked to capture the request (no provider call);
// these are NOT live-provider tests.

const ai = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: ai.stream } };
  }
  return { default: Anthropic };
});

const none = (h: { role: 'user' | 'assistant'; content: string }[] = []) => h;

describe('labelled learner context (LTC-D1, D8)', () => {
  it('course level is an inferred estimate, never known; no level is unknown', () => {
    const a = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: true, learnerMessages: ['hello'] });
    expect(a.proficiency).toMatchObject({ status: 'inferred', value: 'A2', source: 'course_level', band: 'beginner' });
    expect(a.targetLanguage).toMatchObject({ status: 'known', value: 'English' });
    expect(a.ageBand).toMatchObject({ status: 'known', value: 'adult' });
    const b = deriveLearnerContext({ courseLevel: '', courseLanguages: ['English'], adultSchool: false, learnerMessages: [] });
    expect(b.proficiency).toMatchObject({ status: 'unknown', band: 'unknown' });
    expect(b.ageBand.status).toBe('unknown');
    expect(b.supportLanguage.status).toBe('unknown');
  });

  it('the learner\'s own language is only inferred from what they write, never assumed', () => {
    const c = deriveLearnerContext({ courseLevel: 'A1', courseLanguages: ['English'], adultSchool: false, learnerMessages: ['يعني ايه breakfast'] });
    expect(c.supportLanguage).toMatchObject({ status: 'inferred', value: 'Arabic', source: 'learner_messages' });
  });

  it('target language: one configured language is known; several or none is unknown; Arabic means Modern Standard Arabic', () => {
    expect(targetLanguageOf(['English', 'Arabic']).status).toBe('unknown');
    expect(targetLanguageOf([]).status).toBe('unknown');
    expect(targetLanguageOf(['Arabic']).value).toBe('Arabic (Modern Standard)');
  });

  it('level bands from CEFR labels and words', () => {
    expect(levelBand('Pre-A1')).toBe('beginner');
    expect(levelBand('A1 starters')).toBe('beginner');
    expect(levelBand('A2')).toBe('beginner');
    expect(levelBand('B1')).toBe('intermediate');
    expect(levelBand('B2')).toBe('intermediate');
    expect(levelBand('C1')).toBe('advanced');
    expect(levelBand('Year 7')).toBe('unknown');
  });

  it('objective status from the evidence model passes through unchanged', () => {
    const d = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: false, learnerMessages: [], objectiveStatus: 'not_assessed' });
    expect(d.objectiveStatus).toMatchObject({ status: 'not_assessed', source: 'evidence_model' });
  });
});

describe('lesson context (curriculum facts only)', () => {
  it('a lesson spec is cleaned and capped; a missing spec is unstructured; no lesson is none', () => {
    const spec = sanitizeLanguageSpec({ vocabulary: ['  coffee ', 7, '', 'x'.repeat(500)], skills: ['writing', 'telepathy'], grammar: [] });
    expect(spec!.vocabulary).toEqual(['coffee', 'x'.repeat(200)]);
    expect(spec!.skills).toEqual(['writing']);
    expect(spec!.grammar).toBeUndefined();
    expect(sanitizeLanguageSpec({ grammar: [] })).toBeUndefined();
    expect(deriveLessonContext({ id: 'l1', title: 'T', languageSpec: { vocabulary: ['a'] } }).status).toBe('structured');
    expect(deriveLessonContext({ id: 'l1', title: 'T' }).status).toBe('unstructured');
    expect(deriveLessonContext(undefined).status).toBe('none');
  });
});

describe('turn signals (deterministic, English and Arabic)', () => {
  it('help, answer requests, confusion and answering a check question', () => {
    expect(detectTurnSignals('What does "breakfast" mean?', none()).helpRequest).toBe(true);
    expect(detectTurnSignals('يعني ايه breakfast', none()).helpRequest).toBe(true);
    expect(detectTurnSignals('just tell me the answer', none()).answerRequest).toBe(true);
    const confused = detectTurnSignals('مش فاهم', [{ role: 'user', content: 'I don\'t understand' }, { role: 'assistant', content: 'Ok.' }]);
    expect(confused.confusionCount).toBe(2);
    const answering = detectTurnSignals('She go to work at 8', [{ role: 'user', content: 'teach me' }, { role: 'assistant', content: 'Now you: what time does she go to work?' }]);
    expect(answering.answeringCheck).toBe(true);
    expect(detectTurnSignals('hi', none())).toMatchObject({ firstTurn: true, vague: true });
  });
});

describe('move selection (LTC-D3..D8): adapts, no fixed sequence', () => {
  const s = (over: Partial<ReturnType<typeof detectTurnSignals>> = {}) => ({
    firstTurn: false, helpRequest: false, answerRequest: false, confusionCount: 0, answeringCheck: false, writesInArabicScript: false, vague: false, ...over,
  });
  const ids = (m: { id: string }[]) => m.map((x) => x.id);

  it('true beginner asking for meaning: short explanation, comprehensible model and a check', () => {
    const m = ids(selectLanguageMoves({ band: 'beginner', lessonStatus: 'structured', signals: s({ helpRequest: true }) }));
    expect(m).toEqual(expect.arrayContaining(['short_explanation', 'comprehensible_model', 'comprehension_check']));
    expect(m).not.toContain('fade_support');
  });

  it('stronger learner is not forced through beginner support', () => {
    const m = ids(selectLanguageMoves({ band: 'advanced', lessonStatus: 'structured', signals: s() }));
    expect(m).toEqual(expect.arrayContaining(['fade_support', 'independent_practice']));
    expect(m).not.toContain('comprehensible_model');
    expect(m).not.toContain('short_explanation');
  });

  it('proficient on the objective (evidence model) fades support even in a lower-level course', () => {
    expect(ids(selectLanguageMoves({ band: 'intermediate', lessonStatus: 'structured', signals: s(), masteryStatus: 'proficient' }))).toContain('fade_support');
  });

  it('answering a check question: specific feedback with a retry', () => {
    const m = selectLanguageMoves({ band: 'beginner', lessonStatus: 'structured', signals: s({ answeringCheck: true }) });
    expect(ids(m)).toContain('corrective_feedback_retry');
    expect(m.find((x) => x.id === 'corrective_feedback_retry')!.reasons).toContain('level_novice_prompt_first');
  });

  it('guided practice under a hints-only policy: an answer request gets a hint, never the answer', () => {
    const m = ids(selectLanguageMoves({ band: 'intermediate', lessonStatus: 'structured', signals: s({ answerRequest: true }), hintsOnly: true }));
    expect(m).toContain('scaffold_hint');
    expect(m).not.toContain('answer_with_reasoning');
  });

  // ltc-v1-r1 changed LTC-D6: hint first before any attempt; the answer (with
  // reasoning and a follow-up item) stays available once the learner has tried.
  it('direct answer stays available when asked and allowed, after an attempt (with reasoning and a follow-up item)', () => {
    expect(ids(selectLanguageMoves({ band: 'intermediate', lessonStatus: 'structured', signals: s({ answerRequest: true, attemptsOnTask: 1 }) }))).toContain('answer_with_reasoning');
    const before = ids(selectLanguageMoves({ band: 'intermediate', lessonStatus: 'structured', signals: s({ answerRequest: true, attemptsOnTask: 0 }) }));
    expect(before).toContain('scaffold_hint');
    expect(before).not.toContain('answer_with_reasoning');
  });

  it('repeated confusion: reteach more simply; no insistence on questions only', () => {
    const m = ids(selectLanguageMoves({ band: 'intermediate', lessonStatus: 'structured', signals: s({ confusionCount: 2 }) }));
    expect(m).toEqual(expect.arrayContaining(['reteach_simpler', 'comprehension_check']));
  });

  it('beginner writing in Arabic in an English course: brief L1 support; not for an Arabic course', () => {
    expect(ids(selectLanguageMoves({ band: 'beginner', targetLanguage: 'English', lessonStatus: 'structured', signals: s({ writesInArabicScript: true }) }))).toContain('l1_support');
    expect(ids(selectLanguageMoves({ band: 'beginner', targetLanguage: 'Arabic (Modern Standard)', lessonStatus: 'structured', signals: s({ writesInArabicScript: true }) }))).not.toContain('l1_support');
  });

  it('first turn: goal question without a lesson or for a vague greeting; prior knowledge with a lesson spec', () => {
    expect(ids(selectLanguageMoves({ band: 'unknown', lessonStatus: 'none', signals: s({ firstTurn: true }) }))).toContain('clarify_goal');
    // ltc-v1-r2: a known lesson makes a vague greeting no reason to ask; the lesson starts.
    expect(ids(selectLanguageMoves({ band: 'beginner', targetLanguage: 'English', lessonStatus: 'structured', signals: s({ firstTurn: true, vague: true }) }))).toContain('activate_prior_knowledge');
    expect(ids(selectLanguageMoves({ band: 'beginner', targetLanguage: 'English', lessonStatus: 'structured', signals: s({ firstTurn: true, vague: true }) }))).not.toContain('clarify_goal');
    expect(ids(selectLanguageMoves({ band: 'beginner', lessonStatus: 'structured', signals: s({ firstTurn: true }) }))).toContain('activate_prior_knowledge');
  });

  it('live-run fixes: the session greeting is not a check question; requests are not answers; a question before a gap-fill line still counts', () => {
    const greeting = [{ role: 'assistant' as const, content: 'Welcome! What would you like to practise today?' }];
    expect(detectTurnSignals('Can you teach me when to add -s to verbs?', greeting).answeringCheck).toBe(false);
    expect(detectTurnSignals('Quick one: why do we say "some water"?', greeting).answeringCheck).toBe(false);
    const asked = [...greeting, { role: 'user' as const, content: 'teach me -s' }, { role: 'assistant' as const, content: 'Can you write it again with the correct verb?\n\n*She ___ to work at 8 every day.*' }];
    expect(detectTurnSignals('She go to work at 8 every day.', asked).answeringCheck).toBe(true);
    expect(detectTurnSignals('Why do we add -es?', asked).answeringCheck).toBe(false);
    expect(detectTurnSignals('Can you teach me when to add -s to verbs?', greeting).helpRequest).toBe(true);
  });

  it('a mixed Arabic/English question from a beginner counts as using Arabic', () => {
    expect(detectTurnSignals('يعني ايه breakfast', none()).writesInArabicScript).toBe(true);
    expect(detectTurnSignals('ok', [{ role: 'assistant', content: 'Welcome! What would you like to practise?' }]).firstTurn).toBe(true);
  });

  it('every move cites an entry that exists in the evidence ledger', async () => {
    const { readFileSync } = await import('fs');
    const ledger = readFileSync(new URL('../../docs/teaching/phase-1-evidence-ledger.md', import.meta.url), 'utf8');
    const all = selectLanguageMoves({ band: 'beginner', targetLanguage: 'English', lessonStatus: 'none', signals: s({ firstTurn: true, vague: true, helpRequest: true, answerRequest: true, confusionCount: 2, writesInArabicScript: true, answeringCheck: true }) })
      .concat(selectLanguageMoves({ band: 'advanced', lessonStatus: 'structured', signals: s({ firstTurn: true }) }));
    for (const m of all) for (const id of m.ledger) expect(ledger, id).toContain(`### ${id} `);
  });

  it('every move cites the evidence ledger', () => {
    for (const m of selectLanguageMoves({ band: 'beginner', targetLanguage: 'English', lessonStatus: 'structured', signals: s({ helpRequest: true, confusionCount: 2, writesInArabicScript: true, answeringCheck: true }) }))
      expect(m.ledger.every((l) => /^LTC-D\d+$/.test(l))).toBe(true);
  });
});

describe('prompt and turn evidence', () => {
  const ctx = (): LanguageTeachingContext => {
    const learner = deriveLearnerContext({ courseLevel: 'A2', courseLanguages: ['English'], adultSchool: true, learnerMessages: ['hi'] });
    const lesson = deriveLessonContext({ id: 'LSN-1', title: 'At the café', languageSpec: { vocabulary: ['coffee'], grammar: ['Can I have …?'], skills: ['writing'] } }, 'Everyday English A2');
    const signals = detectTurnSignals('What does coffee mean?', []);
    const moves = selectLanguageMoves({ band: learner.proficiency.band, lessonStatus: lesson.status, signals });
    const base = { version: 'ltc-v1' as const, learner, lesson, signals, moves };
    return { ...base, prompt: renderLanguageContextPrompt(base) };
  };

  it('labels the level as an estimate, keeps course facts separate, and is honest about modality', () => {
    const p = ctx().prompt;
    expect(p).toContain('<language_teaching_context version="ltc-v1">');
    expect(p).toMatch(/Learner level: A2 \[inferred; source: course_level\]/);
    expect(p).toContain('never tell them their level');
    expect(p).toContain('Target vocabulary: coffee');
    expect(p).toContain("don't present them as course content");
    expect(p).toContain("don't present it as listening or speaking practice");
  });

  it('turn evidence is minimal, low confidence and never a mastery claim', () => {
    const e = turnEvidence(ctx(), 'obj-1');
    expect(e).toMatchObject({ version: 'ltc-v1', lessonId: 'LSN-1', objectiveId: 'obj-1', skill: 'written_interaction', provenance: 'deterministic_turn_signals', confidence: 'low', masteryClaim: false });
    expect(e.supportRequested).toBe(true);
    expect(JSON.stringify(e)).not.toContain('What does coffee mean');
  });
});

// ---------------------------------------------------------------------------
// Through the real tutor route (in-memory MongoDB; SDK mocked to capture).

const PW = 'ltc-test-password';
const S = 'ltc-school';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let student = '';
let otherSchoolStudent = '';
let teacher = '';
const ids: Record<string, string> = {};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'ltc-test',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
  await mongoose.connect(mongo.getUri());
  const M: Record<string, mongoose.Model<any>> = {};
  for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum']) M[name] = (await import(`../src/models/${name}`))[name];
  const hash = bcrypt.hashSync(PW, 4);
  for (const [inst, suffix] of [[S, ''], ['ltc-other', '-o']] as const) {
    await M.Institution.create({ id: inst, name: `School ${inst}`, features: { teaching_workflow_enabled: true }, learningSettings: { adultLearners: true } });
    await M.Batch.create({ id: `b${suffix}`, name: 'Adults', institutionId: inst, academicYear: '2026', studentCount: 1 });
    await M.Student.create({ id: `stu${suffix}`, name: `Zainab Qasim${suffix}`, email: `zq${suffix}@ltc.test`, grade: '', institutionId: inst, batchId: `b${suffix}` });
    await M.StudentCredit.create({ studentId: `stu${suffix}`, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    await M.User.create({ email: `zq${suffix}@ltc.test`, password: hash, role: 'student', name: `Zainab Qasim${suffix}`, status: 'active', institutionId: inst, studentId: `stu${suffix}` });
  }
  await M.User.create({ email: 'teacher@ltc.test', password: hash, role: 'teacher', name: 'T', status: 'active', institutionId: S });
  await M.Curriculum.create({
    id: 'CUR-LANG', name: 'Everyday English A2', institutionId: S, courseName: 'Everyday English A2', type: 'Language', level: 'A2', languages: ['English'],
    summary: 'Everyday English.', lastUpdated: '2026-11-07', status: 'deployed',
    chapters: [
      { id: 'LSN-CAFE', title: 'At the café', description: 'Ordering politely.', languageSpec: { objectives: ['Order food and drink politely'], vocabulary: ['coffee', 'sandwich'], grammar: ['Can I have …?'], skills: ['writing'] } },
      { id: 'LSN-PLAIN', title: 'Last weekend', description: 'Past simple.' },
    ],
  });
  await M.Curriculum.create({ id: 'CUR-MATH', name: 'Fractions', institutionId: S, courseName: 'Fractions', type: 'National', level: '', languages: ['English'], summary: 'Fractions.', lastUpdated: '2026-11-07', status: 'deployed', chapters: [{ id: 'LSN-FRAC', title: 'Adding fractions', description: 'Common denominators.' }] });
  // Same curriculum id in another school must never be read for this school.
  await M.Curriculum.create({ id: 'CUR-OTHER', name: 'Secret', institutionId: 'ltc-other', courseName: 'Secret course', type: 'Language', level: 'C2', languages: ['French'], summary: 'x', lastUpdated: '2026-11-07', status: 'deployed', chapters: [{ id: 'LSN-SECRET', title: 'Secret lesson', languageSpec: { vocabulary: ['confidentiel'] } }] });
  await M.CourseInstance.create({ id: 'CLS-LANG', courseId: 'CRS-LANG', courseName: 'Everyday English A2', institutionId: S, academicYear: '2026', batchId: 'b', curriculumId: 'CUR-LANG', studentIds: ['stu'], instructorIds: [], visibility: 'student' });
  await M.CourseInstance.create({ id: 'CLS-MATH', courseId: 'CRS-MATH', courseName: 'Fractions', institutionId: S, academicYear: '2026', batchId: 'b', curriculumId: 'CUR-MATH', studentIds: ['stu'], instructorIds: [], visibility: 'student' });
  await M.CourseInstance.create({ id: 'CLS-OTHER', courseId: 'CRS-OTHER', courseName: 'Secret course', institutionId: 'ltc-other', academicYear: '2026', batchId: 'b-o', curriculumId: 'CUR-OTHER', studentIds: ['stu-o'], instructorIds: [], visibility: 'student' });
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  student = await login('zq@ltc.test');
  otherSchoolStudent = await login('zq-o@ltc.test');
  teacher = await login('teacher@ltc.test');
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  ai.create.mockReset();
  ai.create.mockResolvedValue({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Coffee is a hot drink. Can you say: "Can I have a coffee, please?"' }], usage: { input_tokens: 50, output_tokens: 20 } });
});

const systemText = () => {
  const body = ai.create.mock.calls.at(-1)?.[0];
  return (body?.system ?? []).map((b: { text: string }) => b.text).join('\n\n');
};
const wholePayload = () => JSON.stringify(ai.create.mock.calls.at(-1)?.[0] ?? {});

async function ask(courseId: string, lessonId: string, text: string, who = student) {
  const s = await request(app).post('/api/me/tutor/sessions').set('Authorization', who).send({ courseId, lessonId, title: 'Practice' });
  const sid = s.body.id ?? s.body.session?.id;
  const r = await request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', who).send({ text, context: { courseId, lessonId } });
  return { session: s, reply: r, sid };
}

describe('through the tutor route', () => {
  it('language course: the model gets the labelled context and lesson facts; the reply stores non-mastery turn evidence', async () => {
    const { reply } = await ask('CRS-LANG', 'LSN-CAFE', 'What does coffee mean?');
    expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    const sys = systemText();
    expect(sys).toContain('<language_teaching_context version="ltc-v1">');
    expect(sys).toContain('Learner level: A2 [inferred; source: course_level]');
    expect(sys).toContain('Target vocabulary: coffee; sandwich');
    expect(sys).toContain('Learner age band: adult [known; source: school_setting_adult_learners].'); // r3 wording
    const msgs = await mongoose.connection.collection('tutor_messages').find({ role: 'ai' }).sort({ timestamp: -1 }).limit(1).toArray();
    expect(msgs[0].meta.languageTurn).toMatchObject({ version: 'ltc-v1', lessonId: 'LSN-CAFE', skill: 'written_interaction', masteryClaim: false, confidence: 'low' });
    expect(msgs[0].meta.languageTurn.moves).toContain('short_explanation');
    // No mastery or evidence record is created from a tutor turn.
    expect(await mongoose.connection.collection('studentobjectivemasteries').countDocuments({})).toBe(0);
  });

  it('no direct identifiers in the provider payload (name, email, student id, institution id)', async () => {
    await ask('CRS-LANG', 'LSN-CAFE', 'Can you help me order a coffee?');
    const payload = wholePayload();
    for (const secret of ['Zainab', 'Qasim', 'zq@ltc.test', '"stu"', 'stu"', S]) expect(payload).not.toContain(secret);
  });

  it('lesson without a spec: unstructured, and the tutor is told not to claim specific coverage', async () => {
    await ask('CRS-LANG', 'LSN-PLAIN', 'hi');
    const sys = systemText();
    expect(sys).toContain("don't claim it covered specific items");
    // ltc-v1-r2: the lesson is known (title only), so no goal question is forced;
    // the tutor starts on the lesson topic without claiming specific coverage.
    expect(sys).not.toContain('First find out what the learner wants to do today');
    expect(sys).toContain('Start by briefly connecting to what they already know');
  });

  it('non-language course: no language block (existing behaviour unchanged)', async () => {
    const { reply } = await ask('CRS-MATH', 'LSN-FRAC', 'How do I add 1/2 and 1/4?');
    expect(reply.status).toBe(200);
    expect(systemText()).not.toContain('language_teaching_context');
    const msgs = await mongoose.connection.collection('tutor_messages').find({ role: 'ai' }).sort({ timestamp: -1 }).limit(1).toArray();
    expect(msgs[0].meta.languageTurn).toBeUndefined();
  });

  it('another school\'s course is never used: the course is rejected and nothing from it reaches the model', async () => {
    const s = await request(app).post('/api/me/tutor/sessions').set('Authorization', student).send({ courseId: 'CRS-OTHER', lessonId: 'LSN-SECRET', title: 'x' });
    const sid = s.body.id ?? s.body.session?.id;
    if (sid) {
      ai.create.mockClear();
      await request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', student).send({ text: 'teach me', context: { courseId: 'CRS-OTHER', lessonId: 'LSN-SECRET' } });
      const payload = wholePayload();
      expect(payload).not.toContain('confidentiel');
      expect(payload).not.toContain('Secret lesson');
    } else {
      expect(s.status).toBeGreaterThanOrEqual(400);
    }
    // And the other school's student sees only their own course.
    await ask('CRS-OTHER', 'LSN-SECRET', 'what does confidentiel mean?', otherSchoolStudent);
    expect(systemText()).not.toContain('coffee');
  });
});

describe('lesson specs through the curriculum API', () => {
  it('kept on create and update, cleaned and capped; junk dropped', async () => {
    const created = await request(app).post('/api/curriculums').set('Authorization', teacher).send({
      name: 'Spec course', summary: 's', courseName: 'Spec course', type: 'Language', level: 'B1', languages: ['English'],
      chapters: [{ title: 'L1', description: 'd', languageSpec: { vocabulary: ['  hi ', 3, 'x'.repeat(300)], skills: ['writing', 'flying'], evil: ['$where'] } }],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const stored = await mongoose.model('Curriculum').collection.findOne({ id: created.body.id });
    expect(stored!.chapters[0].languageSpec).toEqual({ vocabulary: ['hi', 'x'.repeat(200)], skills: ['writing'] });
    const chapters = stored!.chapters.map((c: any) => ({ ...c, languageSpec: { grammar: ['past simple', ''], vocabulary: Array.from({ length: 40 }, (_, i) => `w${i}`) } }));
    const updated = await request(app).patch(`/api/curriculums/${created.body.id}`).set('Authorization', teacher).send({ chapters });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    const after = await mongoose.model('Curriculum').collection.findOne({ id: created.body.id });
    expect(after!.chapters[0].languageSpec.grammar).toEqual(['past simple']);
    expect(after!.chapters[0].languageSpec.vocabulary).toHaveLength(20);
  });
});

describe('privacy of the learner snapshot text (LTC-D12)', () => {
  it('describeSnapshot carries no name, email or id', async () => {
    const { describeSnapshot } = await import('../src/services/learnerSnapshot');
    const text = describeSnapshot({ studentId: 'stu-secret-id', name: 'Zainab Qasim', firstName: 'Zainab', courses: [], weakTopics: [], recentQuizzes: [], reviewsDue: 0, recentTutorTopics: [] } as never);
    expect(text).not.toMatch(/Zainab|Qasim|stu-secret-id/);
  });
});

describe('streaming route', () => {
  it('the stream endpoint sends the same language context; a failed stream stores no turn evidence', async () => {
    const s = await request(app).post('/api/me/tutor/sessions').set('Authorization', student).send({ courseId: 'CRS-LANG', lessonId: 'LSN-CAFE', title: 'Stream' });
    const sid = s.body.id ?? s.body.session?.id;
    ai.stream.mockReset();
    ai.stream.mockImplementation(() => { throw Object.assign(new Error('stream unavailable in test'), { status: 500 }); });
    const r = await request(app).post(`/api/me/tutor/sessions/${sid}/messages/stream`).set('Authorization', student).send({ text: 'مش فاهم', context: { courseId: 'CRS-LANG', lessonId: 'LSN-CAFE' } })
      .buffer(true).parse((res, cb) => { let d = ''; res.on('data', (c: Buffer) => { d += c.toString(); }); res.on('end', () => cb(null, d)); });
    expect(r.status).toBe(200);
    expect(ai.stream).toHaveBeenCalled();
    const sys = (ai.stream.mock.calls[0][0].system as { text: string }[]).map((b) => b.text).join('\n');
    expect(sys).toContain('language_teaching_context');
    // fix 4 (intentional): Arabic support is now a short gloss, never an Arabic explanation.
    expect(sys).toContain('Arabic only as a gloss of one to three words');
    const msgs = await mongoose.connection.collection('tutor_messages').find({ sessionId: sid, role: 'ai' }).sort({ timestamp: -1 }).toArray();
    expect(msgs[0].meta?.languageTurn).toBeUndefined();
  });
});

describe('enrolment is checked on every turn', () => {
  it('a session whose course the student can no longer open gets no language context', async () => {
    const s = await request(app).post('/api/me/tutor/sessions').set('Authorization', student).send({ courseId: 'CRS-LANG', lessonId: 'LSN-CAFE', title: 'Later' });
    const sid = s.body.id ?? s.body.session?.id;
    // The class is removed after the session was created (the session still stores its curriculum).
    await mongoose.model('CourseInstance').deleteOne({ id: 'CLS-LANG' });
    ai.create.mockClear();
    await request(app).post(`/api/me/tutor/sessions/${sid}/messages`).set('Authorization', student).send({ text: 'What does coffee mean?', context: { courseId: 'CRS-LANG', lessonId: 'LSN-CAFE' } });
    expect(ai.create).toHaveBeenCalled();
    expect(systemText()).not.toContain('language_teaching_context');
    expect(wholePayload()).not.toContain('Target vocabulary');
  });
});

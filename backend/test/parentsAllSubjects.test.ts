import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bandOf, subjectKeyOf, subjectName, type SubjectDetail } from '../src/parents/subjects';
import { checkWritten, fallbackRec, pickFocus, recommendationsFor } from '../src/parents/recommendations';
import { childSection } from '../src/parents/emailBlocks';
import { whatsappText } from '../src/parents/reportSender';

// Parents: every subject a child studies, smart suggestions per subject, and only real data (docs/parents/ALL_SUBJECTS_PLAN.md).

const AR = /[؀-ۿ]/;

describe('subject names', () => {
  it('maps course and test names to the subject a parent knows', () => {
    expect(subjectKeyOf('Mathematics – Grade 5A')).toBe('mathematics');
    expect(subjectKeyOf('Maths')).toBe('mathematics');
    expect(subjectKeyOf('الرياضيات')).toBe('mathematics');
    expect(subjectKeyOf('English')).toBe('english');
    expect(subjectKeyOf('English – Evening English B1')).toBe('english');
    expect(subjectKeyOf('اللغة العربية')).toBe('arabic');
    expect(subjectKeyOf('Science')).toBe('science');
    expect(subjectKeyOf('World History')).toBe('world-history');
    expect(subjectKeyOf('')).toBeNull();
    expect(subjectName('mathematics')).toEqual({ en: 'Maths', ar: 'الرياضيات' });
    expect(subjectName('world-history', 'World History').en).toBe('World History');
  });
  it('gives non-English subjects a level from the share of outcomes mastered', () => {
    expect(bandOf(0, 10)).toBe('starting');
    expect(bandOf(3, 10)).toBe('developing');
    expect(bandOf(6, 10)).toBe('secure');
    expect(bandOf(9, 10)).toBe('mastered');
    expect(bandOf(0, 0)).toBeNull();
  });
});

const detail = (over: Partial<SubjectDetail> = {}): SubjectDetail => ({
  key: 'mathematics', name: { en: 'Maths', ar: 'الرياضيات' }, english: false, family: 'maths',
  lessons: { done: 2, total: 6, thisWeek: 1 }, outcomes: { mastered: 1, inProgress: 2, total: 4, band: 'developing', bandLabel: { en: 'Developing', ar: 'في تقدم' }, items: [] },
  results: [], latestResult: null, points: [], sessions: [], minutesThisWeek: 10, activeBefore: true,
  next: { lesson: 'Fractions', due: null }, weakest: null, ...over,
});

describe('picking what matters', () => {
  it('puts released points to practise first, then the weakest outcome, at most 3', () => {
    const f = pickFocus(detail({
      points: [{ id: 'e1', objective: 'Halves and quarters', error: 'mixes up halves and quarters', occurrences: 3, since: '' }, { id: 'e2', objective: 'Place value', error: 'tens and ones swapped', occurrences: 1, since: '' }],
      weakest: { title: 'Area', estimate: 0.2 }, latestResult: { title: 'Unit quiz', score: 40, submittedAt: null },
    }));
    expect(f.map((x) => x.kind)).toEqual(['error', 'error', 'outcome']);
  });
  it('uses a low result only when it is released (latestResult holds only released results), and notices no practice this week', () => {
    expect(pickFocus(detail({ latestResult: { title: 'Unit quiz', score: 40, submittedAt: null }, minutesThisWeek: 0 })).map((x) => x.kind)).toEqual(['result', 'routine', 'next']);
    expect(pickFocus(detail({ latestResult: null, minutesThisWeek: 5 })).map((x) => x.kind)).toEqual(['next']);
  });
  it('builds on a good released result when there is nothing else to work on', () => {
    const f = pickFocus(detail({ latestResult: { title: 'Maths check', score: 75, submittedAt: null }, next: { lesson: null, due: null } }));
    expect(f).toEqual([{ kind: 'celebrate', topic: 'Maths check', score: 75 }]);
    const r = fallbackRec(f[0], { name: 'Karim', subject: { en: 'Maths', ar: 'الرياضيات' }, family: 'maths', tier: 'kid' });
    expect(r.why.en).toContain('75%');
    expect(AR.test(r.do.ar)).toBe(true);
  });
  it('mentions something due within a week', () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    expect(pickFocus(detail({ next: { lesson: null, due: { title: 'Shapes quiz', dueAt: soon } } }))[0]).toMatchObject({ kind: 'due', topic: 'Shapes quiz' });
  });
});

describe('written-in-advance suggestions', () => {
  const ctx = (tier: 'kid' | '13plus') => ({ name: 'Mona', subject: { en: 'Maths', ar: 'الرياضيات' }, family: 'maths' as const, tier });
  it('are in both languages, name only the given facts, and differ by age', () => {
    const kid = fallbackRec({ kind: 'error', topic: 'Halves and quarters', detail: 'mixes up halves and quarters' }, ctx('kid'));
    const teen = fallbackRec({ kind: 'error', topic: 'Halves and quarters', detail: 'mixes up halves and quarters' }, ctx('13plus'));
    for (const r of [kid, teen]) {
      expect(r.do.en).toContain('Halves and quarters');
      expect(AR.test(r.do.ar) && AR.test(r.why.ar) && AR.test(r.say.ar)).toBe(true);
      expect(AR.test(r.do.en + r.why.en + r.say.en)).toBe(false);
      expect(r.ai).toBe(false);
    }
    expect(kid.say.en).not.toBe(teen.say.en);
    const res = fallbackRec({ kind: 'result', topic: 'Unit quiz', score: 45 }, ctx('kid'));
    expect(res.why.en).toContain('45%');
  });
});

describe('checks on model-written suggestions', () => {
  const ok = { do: { en: 'Solve 3 shopping sums together.', ar: 'حُلّا ٣ مسائل تسوق معًا.' }, why: { en: 'Mona mixes up halves and quarters.', ar: 'منى تخلط بين النصف والربع.' }, say: { en: 'Show me how you did it.', ar: 'وريني عملتها إزاي.' } };
  it('accepts a plain, short, two-language suggestion', () => {
    expect(checkWritten(ok, 'Halves and quarters Mona Maths')).toBeNull();
  });
  it('refuses English in the Arabic text, Arabic in the English text, links, Markdown, made-up numbers and answers', () => {
    expect(checkWritten({ ...ok, do: { en: ok.do.en, ar: 'Solve three shopping sums together with your child tonight please' } }, '')).toMatch(/not Arabic/);
    expect(checkWritten({ ...ok, why: { en: 'منى تخلط', ar: ok.why.ar } }, '')).toMatch(/Arabic in the English/);
    expect(checkWritten({ ...ok, do: { en: 'See https://example.com', ar: ok.do.ar } }, '')).toMatch(/link/);
    expect(checkWritten({ ...ok, do: { en: '**Practise** now', ar: ok.do.ar } }, '')).toMatch(/Markdown/);
    expect(checkWritten({ ...ok, why: { en: 'She scored 37% last time.', ar: ok.why.ar } }, 'Unit quiz')).toMatch(/number not in the data/);
    expect(checkWritten({ ...ok, why: { en: 'She scored 37% last time.', ar: ok.why.ar } }, 'Unit quiz 37')).toBeNull();
    expect(checkWritten({ ...ok, say: { en: 'The answer is 3/4.', ar: ok.say.ar } }, '3 4')).toMatch(/answer/);
    expect(checkWritten(undefined, '')).toBe('missing');
  });
});

describe('weekly email and share text cover every subject', () => {
  const week = { firstName: 'Mona', school: 'Nile Valley', status: 'on_track' as const, minutesDone: 40, goalMinutes: 90, lessonsDone: 3, skillsMastered: 2, level: '', tip: '' };
  const subjects = [
    { name: 'English', minutes: 20, lessons: 1, result: 80, tip: 'Read a short story together.' },
    { name: 'Maths', minutes: 15, lessons: 2, result: null, tip: 'Solve 3 shopping sums.' },
    { name: 'Science', minutes: 5, lessons: 0, result: 70, tip: null },
  ];
  it('lists one line per subject and the top suggestions, in English and Arabic', () => {
    const en = childSection('en', { ...week, subjects });
    for (const s of ['English', 'Maths', 'Science', 'Read a short story together.', 'Solve 3 shopping sums.', 'How you can help this week']) expect(en).toContain(s);
    expect(en).not.toContain('English level');
    const ar = childSection('ar', { ...week, subjects: subjects.map((s) => ({ ...s, name: s.name === 'Maths' ? 'الرياضيات' : s.name })), level: 'A2' });
    expect(ar).toContain('الرياضيات');
    expect(ar).toContain('كيف تساعدون هذا الأسبوع');
    expect(ar).toContain('dir="rtl"');
  });
  it('keeps the old section when the switch is off (no subjects)', () => {
    expect(childSection('en', { ...week, level: 'A1', tip: 'Talk about your day.' })).toContain('Try this at home:');
  });
  it('names the subjects in the share message', () => {
    const base = { parentName: 'P', childName: 'Mona', lessonsDone: 1, outcomesMastered: 0, minutesDone: 10, goalMinutes: 90, practiceTip: '', statusLine: 'on track' };
    expect(whatsappText({ ...base, subjects: ['English', 'Maths', 'Science'] })).toContain("Mona's week (English, Maths, Science)");
    expect(whatsappText({ ...base, practiceTip: 'Read.' })).toContain("Mona's week in English");
  });
});

// ------------------------------------------------------------------------------------------------ API

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
let parentTok = '';
const PW = 'parents-subjects-test-password';
const DAY = 86_400_000;
const get = (p: string) => request(app).get(p).set('Authorization', parentTok);
const ago = (d: number) => new Date(Date.now() - d * DAY);

describe('the parent sees every subject with activity (API)', () => {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
      JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL', 'AI_PAUSED', 'GOOGLE_CLIENT_ID', 'PARENT_SETTINGS_ENABLED', 'PARENT_CODE_TOOLS_ENABLED', 'ANTHROPIC_API_KEY', 'TUTOR_LLM_PROVIDER']) delete process.env[k];
    process.env.PARENT_GRADES_AFTER_REVIEW_ENABLED = 'true';
    process.env.PARENT_ALL_SUBJECTS_ENABLED = 'true';
    (await import('../src/config/env')).resetConfigForTests();
    await mongoose.connect(mongo.getUri());
    M = {};
    for (const name of ['User', 'Institution', 'Student', 'Curriculum', 'LearningObjective', 'StudentObjectiveMastery', 'LessonProgress', 'TutorSession', 'TutorMessage', 'Assessment', 'AssessmentAttempt', 'ErrorToWorkOn']) M[name] = (await import(`../src/models/${name}`))[name];
    const hash = bcrypt.hashSync(PW, 4);
    await M.Institution.create({ id: 'sub-A', name: 'Nile Valley' });
    await M.User.create({ email: 'admin@sub-A.test', password: hash, role: 'admin', name: 'Admin', status: 'active', institutionId: 'sub-A' });
    await M.Student.create({ id: 'k1', name: 'Mona Fahmy', email: 'k1@sub-A.test', institutionId: 'sub-A', learnerAgeBand: 'child' });
    const course = async (id: string, courseName: string, objectives: string[]) => {
      await M.Curriculum.create({ id, name: courseName, courseName, institutionId: 'sub-A', type: 'National', level: 'G5', languages: ['English'], summary: `${courseName} course`, description: `${courseName} course`, lastUpdated: '2026-11-01', chapters: [1, 2, 3].map((n) => ({ id: `${id}-L${n}`, title: `${courseName} lesson ${n}`, uploads: [] })) });
      for (const [i, t] of objectives.entries()) await M.LearningObjective.create({ id: `${id}-O${i + 1}`, institutionId: 'sub-A', curriculumId: id, code: `${id}.${i + 1}`, title: t, description: t, status: 'approved', version: 1, origin: 'teacher', createdBy: 'x' });
    };
    await course('CUR-ENG', 'English', ['Talk about routines', 'Past simple']);
    await course('CUR-MATH', 'Mathematics', ['Halves and quarters', 'Area of a rectangle']);
    await course('CUR-SCI', 'Science', ['Plants need light']);
    await course('CUR-ARB', 'اللغة العربية', ['الجملة الاسمية']); // enrolled-like content, but no activity: not shown
    for (const [cur, n] of [['CUR-ENG', 2], ['CUR-MATH', 1], ['CUR-SCI', 1]] as const) for (let i = 1; i <= n; i++) await M.LessonProgress.create({ studentId: 'k1', institutionId: 'sub-A', courseId: cur, lessonId: `${cur}-L${i}`, status: 'completed', completedAt: ago(i + 1) });
    const session = async (id: string, cur: string, daysAgo: number) => {
      await M.TutorSession.create({ id, studentId: 'k1', institutionId: 'sub-A', title: `${cur} chat`, courseId: cur, curriculumId: cur, mode: 'chat', lastMessageAt: ago(daysAgo), messageCount: 2 });
      await M.TutorMessage.create({ id: `${id}-m1`, sessionId: id, studentId: 'k1', role: 'user', text: 'hi', timestamp: new Date(ago(daysAgo).getTime() - 10 * 60_000) });
      await M.TutorMessage.create({ id: `${id}-m2`, sessionId: id, studentId: 'k1', role: 'ai', text: 'hello', timestamp: ago(daysAgo) });
    };
    await session('ts-eng', 'CUR-ENG', 1);
    await session('ts-math', 'CUR-MATH', 2);
    await M.Assessment.create({ id: 'as-math-1', title: 'Fractions quiz', subject: 'Maths', institutionId: 'sub-A', curriculumId: 'CUR-MATH', duration: 10, questions: [] });
    await M.Assessment.create({ id: 'as-math-2', title: 'Area quiz', subject: 'Maths', institutionId: 'sub-A', curriculumId: 'CUR-MATH', duration: 10, questions: [] });
    await M.Assessment.create({ id: 'as-sci-1', title: 'Plants quiz', subject: 'Science', institutionId: 'sub-A', curriculumId: 'CUR-SCI', duration: 10, questions: [] });
    await M.AssessmentAttempt.create({ id: 'att-math-released', assessmentId: 'as-math-1', assessmentTitle: 'Fractions quiz', subject: 'Maths', studentId: 'k1', institutionId: 'sub-A', status: 'submitted', submittedAt: ago(5), score: 45, gradingStatus: 'released', releasedAt: ago(4) });
    // Not released yet: its score (12) must reach the parent through no path.
    await M.AssessmentAttempt.create({ id: 'att-math-held', assessmentId: 'as-math-2', assessmentTitle: 'Area quiz', subject: 'Maths', studentId: 'k1', institutionId: 'sub-A', status: 'submitted', submittedAt: ago(1), score: 12, gradingStatus: 'finalized' });
    await M.AssessmentAttempt.create({ id: 'att-sci', assessmentId: 'as-sci-1', assessmentTitle: 'Plants quiz', subject: 'Science', studentId: 'k1', institutionId: 'sub-A', status: 'submitted', submittedAt: ago(3), score: 90, gradingStatus: 'released', releasedAt: ago(2) });
    await M.StudentObjectiveMastery.create({ studentId: 'k1', objectiveId: 'CUR-MATH-O1', masteryStatus: 'developing', masteryEstimate: 0.3, evidenceStrength: 'limited', lastMasteryUpdateAt: new Date(), modelVersion: 't' });
    await M.StudentObjectiveMastery.create({ studentId: 'k1', objectiveId: 'CUR-SCI-O1', masteryStatus: 'mastered', masteryEstimate: 0.9, evidenceStrength: 'moderate', lastMasteryUpdateAt: new Date(), modelVersion: 't' });
    // A point to practise from a practice attempt (usable at once) and one from the unreleased quiz (waiting: hidden).
    await M.ErrorToWorkOn.create({ id: 'err-1', institutionId: 'sub-A', studentId: 'k1', courseId: 'CUR-MATH', curriculumId: 'CUR-MATH', objectiveId: 'CUR-MATH-O1', errorCode: 'halves_quarters', errorLabel: 'mixes up halves and quarters', sources: [{ kind: 'practice_attempt', attemptId: 'p1', assessmentId: 'as-math-1', questionId: 'q1', at: ago(3) }], occurrences: 2, firstSeenAt: ago(6), lastSeenAt: ago(3), status: 'open', rightStreak: 0, countedKeys: [], statusHistory: [] });
    await M.ErrorToWorkOn.create({ id: 'err-held', institutionId: 'sub-A', studentId: 'k1', courseId: 'CUR-MATH', curriculumId: 'CUR-MATH', objectiveId: 'CUR-MATH-O2', errorCode: 'area_perimeter', errorLabel: 'confuses area and perimeter', sources: [{ kind: 'assignment_attempt', attemptId: 'att-math-held', assessmentId: 'as-math-2', assignmentId: 'asg-x', questionId: 'q1', at: ago(1) }], occurrences: 1, firstSeenAt: ago(1), lastSeenAt: ago(1), status: 'open', rightStreak: 0, countedKeys: [], statusHistory: [] });
    app = (await import('../src/app')).createApp();
    const adminTok = `Bearer ${(await request(app).post('/api/auth/login').send({ email: 'admin@sub-A.test', password: PW })).body.token}`;
    const r = await request(app).post('/api/parents/register').send({ email: 'p@parents.test', password: PW, name: 'Parent' });
    parentTok = `Bearer ${r.body.token}`;
    const code = (await request(app).post('/api/students/k1/parent-codes').set('Authorization', adminTok)).body.code;
    expect((await request(app).post('/api/parents/link/confirm').set('Authorization', parentTok).send({ code })).status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    delete process.env.PARENT_ALL_SUBJECTS_ENABLED;
    delete process.env.PARENT_GRADES_AFTER_REVIEW_ENABLED;
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('lists the 3 subjects with activity, not the one without', async () => {
    const r = await get('/api/parents/learners/k1/subjects');
    expect(r.status).toBe(200);
    const keys = r.body.subjects.map((s: { key: string }) => s.key).sort();
    expect(keys).toEqual(['english', 'mathematics', 'science']);
    const maths = r.body.subjects.find((s: { key: string }) => s.key === 'mathematics');
    expect(maths.latestResult).toMatchObject({ title: 'Fractions quiz', score: 45 });
    expect(maths.pointsCount).toBe(1);
    expect(maths.top).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toContain('Area quiz'); // the unreleased result is not on the overview
  });

  it('one subject: progress, level, released results, points to practise, sessions, next and suggestions', async () => {
    const r = await get('/api/parents/learners/k1/subjects/mathematics');
    expect(r.status).toBe(200);
    const s = r.body.subject;
    expect(s.lessons).toMatchObject({ done: 1, total: 3 });
    expect(s.outcomes).toMatchObject({ mastered: 0, total: 2, band: 'starting' });
    const byId = new Map(s.results.map((x: { id: string }) => [x.id, x]));
    expect(byId.get('att-math-released')).toMatchObject({ score: 45 });
    expect(byId.get('att-math-held')).toMatchObject({ score: null, waiting: true });
    expect(s.points.map((p: { id: string }) => p.id)).toEqual(['err-1']); // the waiting one is hidden
    expect(s.sessions.map((x: { id: string }) => x.id)).toEqual(['ts-math']);
    expect(s.next.lesson).toBe('Mathematics lesson 2');
    const recs = r.body.recommendations;
    expect(recs.items.length).toBeGreaterThan(0);
    expect(recs.items[0].kind).toBe('error');
    expect(JSON.stringify(recs)).not.toMatch(/\b12\b|Area quiz/); // never built from the unreleased result
    const sci = (await get('/api/parents/learners/k1/subjects/science')).body.subject;
    expect(sci.outcomes).toMatchObject({ mastered: 1, total: 1, band: 'mastered' });
    expect((await get('/api/parents/learners/k1/subjects/arabic')).status).toBe(404);
  });

  it('tags results and sessions with their subject on the Progress and Activity tabs', async () => {
    const p = (await get('/api/parents/learners/k1/progress')).body;
    const held = p.assessments.items.find((i: { id: string }) => i.id === 'att-math-held');
    expect(held).toMatchObject({ score: null, waiting: true, subject: { key: 'mathematics' } });
    const a = (await get('/api/parents/learners/k1/activity')).body;
    expect(a.sessions.find((s: { id: string }) => s.id === 'ts-eng').subject.key).toBe('english');
  });

  it('shows no example safety alerts', async () => {
    const r = await get('/api/parents/learners/k1/alerts');
    expect(r.body.alerts.items).toEqual([]);
  });

  it('uses the model text when it passes the checks, and the written-in-advance text when it does not', async () => {
    const s = (await get('/api/parents/learners/k1/subjects/mathematics')).body.subject as SubjectDetail;
    const good = { do: { en: 'Fold a paper strip into halves, then quarters.', ar: 'اطويا شريط ورق إلى نصفين ثم أرباع.' }, why: { en: 'Mona mixes up halves and quarters.', ar: 'منى تخلط بين النصف والربع.' }, say: { en: 'Which piece is bigger?', ar: 'أنهي قطعة أكبر؟' } };
    const bad = { ...good, why: { en: 'Mona got 12% on the area quiz.', ar: good.why.ar } };
    const out = await recommendationsFor({ ...s, family: 'maths', activeBefore: true, weakest: { title: 'Halves and quarters', estimate: 0.3 }, latestResult: { title: 'Fractions quiz', score: 45, submittedAt: null } }, { studentId: 'k1-test', name: 'Mona', tier: 'kid', weekStart: '2026-11-21' }, { write: async () => [good, bad] });
    expect(out.source).toBe('mixed');
    expect(out.items[0]).toMatchObject({ ai: true, do: good.do });
    expect(out.items[1].ai).toBe(false);
  });

  it('is off without the switch', async () => {
    delete process.env.PARENT_ALL_SUBJECTS_ENABLED;
    expect((await get('/api/parents/learners/k1/subjects')).status).toBe(404);
    process.env.PARENT_ALL_SUBJECTS_ENABLED = 'true';
  });
});

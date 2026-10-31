import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIN_EPISODES, MIN_STUDENTS, clusterBootstrap, summarize } from '../src/services/methodEffectiveness';

// P21 C5: method effectiveness. SYNTHETIC episodes only (to test aggregation,
// thresholds, clustering, scope and permissions); not evidence of real effects.

type E = Parameters<typeof summarize>[0][number];
const ep = (studentId: string, change: number | null, over: Partial<E> = {}): E => ({
  studentId, primary: 'direct_instruction', supporting: ['worked_example'], objectiveId: 'obj', subject: 'Maths', gradeBand: '6-8', misconceptionCategories: [],
  label: 'associated_with_intervention', observedChange: change, retentionChange: null, baseline: { score: 0.3 } as never, comparability: ['outside_instruction_unknown'], evidenceQuality: 'moderate', ...over,
} as E);

describe('aggregation rules', () => {
  it('below the threshold nothing is reported (insufficient evidence), but counts are shown', () => {
    const g = summarize(Array.from({ length: 9 }, (_, i) => ep(`s${i % 5}`, 0.2))).groups[0];
    expect(g).toMatchObject({ status: 'insufficient_evidence', meanChange: null, interval90: null, comparable: { episodes: 9, students: 5 } });
  });
  it('10 comparable episodes from 5 students: reported with a deterministic 90% interval', () => {
    const eps = Array.from({ length: 10 }, (_, i) => ep(`s${i % 5}`, 0.1 + (i % 5) * 0.05));
    const a = summarize(eps).groups[0];
    const b = summarize(eps).groups[0];
    expect(a.status).toBe('reported');
    expect(a.meanChange).toBeCloseTo(0.2);
    expect(a.interval90!.low).toBeLessThanOrEqual(a.meanChange!);
    expect(a.interval90!.high).toBeGreaterThanOrEqual(a.meanChange!);
    expect(a.interval90).toEqual(b.interval90);
  });
  it('one student observed many times is not many samples', () => {
    expect(summarize(Array.from({ length: 30 }, () => ep('only', 0.5))).groups[0].status).toBe('insufficient_evidence');
    expect(MIN_STUDENTS).toBe(5);
    expect(MIN_EPISODES).toBe(10);
  });
  it('students are weighted equally (a heavily observed student does not dominate)', () => {
    const eps = [...Array.from({ length: 8 }, () => ep('heavy', 0.5)), ...['a', 'b', 'c', 'd'].map((s) => ep(s, -0.1))];
    const g = summarize(eps).groups[0];
    expect(g.status).toBe('reported');
    expect(g.meanChange).toBeCloseTo((0.5 - 0.4) / 5); // 0.02, not the episode mean 0.3
  });
  it('non-comparable episodes are counted by label but never enter the change', () => {
    const eps = [...Array.from({ length: 10 }, (_, i) => ep(`s${i % 5}`, 0.1)), ...Array.from({ length: 6 }, (_, i) => ep(`s${i}`, 0.9, { label: 'observed_change', comparability: ['difficulty_shift'] }))];
    const g = summarize(eps).groups[0];
    expect(g.byLabel).toEqual({ associated_with_intervention: 10, observed_change: 6 });
    expect(g.meanChange).toBeCloseTo(0.1);
    expect(g.flagShare.difficulty_shift).toBeCloseTo(6 / 16);
  });
  it('splits by baseline band, objective or misconception; never ranks', () => {
    const eps = [ep('a', 0.1, { baseline: { score: 0.2 } as never }), ep('b', 0.1, { baseline: { score: 0.8 } as never, primary: 'analogy' })];
    const out = summarize(eps, { dimension: 'baselineBand' });
    expect(out.groups.map((g) => [g.method, g.key])).toEqual([['analogy', 'high'], ['direct_instruction', 'low']]);
    expect(out.ranked).toBe(false);
    expect(out.caveats.join(' ')).toMatch(/not statistical significance/);
    expect(out.caveats.join(' ')).toMatch(/never read the list as a ranking/);
    expect(summarize([ep('a', 0.1, { misconceptionCategories: ['procedural_error', 'calculation_error'] })], { dimension: 'misconception' }).groups.map((g) => g.key)).toEqual(['calculation_error', 'procedural_error']);
  });
  it('the bootstrap resamples students', () => {
    expect(clusterBootstrap([0.2, 0.2, 0.2, 0.2, 0.2])).toEqual({ low: 0.2, high: 0.2 });
  });
});

// ---------------------------------------------------------------------------
const PW = 'p21-effect-password';
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
const tok: Record<string, string> = {};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'DATABASE_URL']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const M: Record<string, mongoose.Model<any>> = {};
  for (const n of ['User', 'Institution', 'CourseInstance', 'Student', 'Batch', 'TeachingEpisode']) M[n] = (await import(`../src/models/${n}`))[n];
  const features = { learning_intelligence_enabled: true, adaptive_pedagogy_enabled: true };
  await M.Institution.create([{ id: 'A', name: 'School A', features }, { id: 'B', name: 'School B', features }, { id: 'OFF', name: 'Off', features: { learning_intelligence_enabled: true } }]);
  const hash = bcrypt.hashSync(PW, 4);
  const user = async (key: string, role: string, institutionId?: string, studentId?: string) => {
    const u = await M.User.create({ email: `${key}@p21e.test`, password: hash, role, name: key, status: 'active', institutionId, studentId });
    return u._id.toString();
  };
  const t1 = await user('teacher1', 'teacher', 'A');
  const t2 = await user('teacher2', 'teacher', 'A');
  await user('admin', 'admin', 'A');
  await user('manager', 'academic_manager', 'A');
  await user('enara', 'enara-admin');
  await user('offadmin', 'admin', 'OFF');
  // Class 1 (teacher1): s1-s6 live + d1 demo. Class 2 (teacher2): s7. School B: b1.
  for (const [id, batch, inst, origin] of [['s1', 'k1', 'A', 'live'], ['s2', 'k1', 'A', 'live'], ['s3', 'k1', 'A', 'live'], ['s4', 'k1', 'A', 'live'], ['s5', 'k1', 'A', 'live'], ['s6', 'k1', 'A', 'live'], ['d1', 'k1', 'A', 'demo_seed'], ['s7', 'k2', 'A', 'live'], ['b1', 'kb', 'B', 'live']]) {
    await M.Student.create({ id, name: `Synthetic ${id}`, email: `${id}@p21e.test`, grade: 'Grade 7', institutionId: inst, batchId: batch, origin });
  }
  await user('stu1', 'student', 'A', 's1');
  await M.CourseInstance.create([
    { id: 'c1', courseId: 'co1', courseName: 'Maths 1', institutionId: 'A', academicYear: '2026', batchId: 'k1', studentIds: [], instructorIds: [t1], visibility: 'student' },
    { id: 'c2', courseId: 'co2', courseName: 'Maths 2', institutionId: 'A', academicYear: '2026', batchId: 'k2', studentIds: [], instructorIds: [t2], visibility: 'student' },
  ]);
  const base = { objectiveId: 'obj', primary: 'direct_instruction', supporting: ['worked_example'], decisionIds: [], startAt: new Date(), baseline: { n: 2, score: 0.3 }, post: { n: 2, score: 0.6 }, retention: { n: 0 }, transfer: { n: 2 }, exams: [], mastery: {}, observedChange: 0.3, comparability: ['outside_instruction_unknown'], evidenceQuality: 'moderate', label: 'associated_with_intervention', limitations: [], computeVersion: 'impact-v1', computedAt: new Date() };
  let n = 0;
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's1', 's2', 's3', 's4', 's5', 's6']) await M.TeachingEpisode.create({ ...base, id: `ep-${++n}`, institutionId: 'A', studentId: s, batchId: 'k1', origin: 'live' });
  await M.TeachingEpisode.create({ ...base, id: 'ep-demo', institutionId: 'A', studentId: 'd1', batchId: 'k1', origin: 'demo_seed' });
  await M.TeachingEpisode.create({ ...base, id: 'ep-s7', institutionId: 'A', studentId: 's7', batchId: 'k2', origin: 'live' });
  await M.TeachingEpisode.create({ ...base, id: 'ep-b1', institutionId: 'B', studentId: 'b1', batchId: 'kb', origin: 'live', observedChange: 0.99 });
  app = (await import('../src/app')).createApp();
  for (const k of ['teacher1', 'teacher2', 'admin', 'manager', 'enara', 'offadmin', 'stu1']) {
    const r = await request(app).post('/api/auth/login').send({ email: `${k}@p21e.test`, password: PW });
    tok[k] = `Bearer ${r.body.token}`;
  }
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
const get = (who: string, url: string) => request(app).get(url).set('Authorization', tok[who]);
const EFF = '/api/learning/analytics/teaching-effectiveness';

describe('teaching-effectiveness API: scope, roles, tenant and demo separation', () => {
  it('teacher: only students in their own classes (live by default)', async () => {
    const r = await get('teacher1', EFF);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ scope: 'my_classes', origin: 'live', ranked: false, coverage: { episodes: 11, students: 6 } });
    expect(r.body.groups[0]).toMatchObject({ method: 'direct_instruction', methodName: 'Direct Instruction', status: 'reported', comparable: { episodes: 11, students: 6 } });
    expect((await get('teacher2', EFF)).body.coverage).toMatchObject({ episodes: 1, students: 1 });
  });
  it('a teacher cannot read another teacher\'s class', async () => {
    expect((await get('teacher2', `${EFF}?classId=c1`)).status).toBe(404);
  });
  it('admin and academic manager: whole school, read-only, never another school, no cost fields', async () => {
    for (const who of ['admin', 'manager']) {
      const r = await get(who, EFF);
      expect(r.status, who).toBe(200);
      expect(r.body.scope).toBe('school');
      expect(r.body.coverage.episodes, who).toBe(12); // 11 + s7; demo and school B excluded
      expect(JSON.stringify(r.body)).not.toMatch(/cost|usd|micros|price|0\.99/i);
    }
    expect((await request(app).post(EFF).set('Authorization', tok.manager)).status).toBe(404);
  });
  it('demo data only when asked for, and labelled', async () => {
    const r = await get('admin', `${EFF}?origin=demo_seed`);
    expect(r.body).toMatchObject({ origin: 'demo_seed', coverage: { episodes: 1 } });
  });
  it('students cannot read method effectiveness; Enara admins must name a school', async () => {
    expect((await get('stu1', EFF)).status).toBe(403);
    expect((await get('enara', EFF)).status).toBe(403);
    expect((await get('enara', `${EFF}?institutionId=B`)).body.coverage.episodes).toBe(1);
  });
  it('feature off: not found', async () => {
    expect((await get('offadmin', EFF)).status).toBe(404);
  });
  it('dimension and composition views', async () => {
    const r = await get('admin', `${EFF}?dimension=baselineBand&composition=1`);
    expect(r.body.dimension).toBe('baselineBand');
    expect(r.body.groups[0]).toMatchObject({ key: 'low', supporting: ['worked_example'], supportingNames: ['Worked Examples'] });
  });
});

describe('student teaching-impact API', () => {
  it('a student sees their own episodes and objective trends; not another student\'s', async () => {
    const me = await get('stu1', '/api/learning/students/me/teaching-impact');
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.studentId).toBe('s1');
    expect(me.body.episodes).toHaveLength(2);
    expect(me.body.episodes[0]).toMatchObject({ method: 'direct_instruction', label: 'associated_with_intervention' });
    expect(Array.isArray(me.body.objectiveTrends)).toBe(true);
    expect([403, 404]).toContain((await get('stu1', '/api/learning/students/s2/teaching-impact')).status);
  });
  it('a teacher sees their class\'s students only', async () => {
    expect((await get('teacher1', '/api/learning/students/s2/teaching-impact')).status).toBe(200);
    expect([403, 404]).toContain((await get('teacher2', '/api/learning/students/s2/teaching-impact')).status);
  });
});

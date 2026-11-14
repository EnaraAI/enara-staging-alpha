import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTrustedAgeBand } from '../src/services/languageTeachingContext';

// Option B: trusted learner age band. Resolver precedence, authorization and
// tenant isolation of the admin API, the live tutor path (SDK mocked: no
// provider calls), provider-payload privacy, and the admin/AM UI (server-side
// render of the real component).

const ai = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: ai.create };
    beta = { messages: { create: ai.create, stream: ai.stream } };
  }
  return { default: Anthropic };
});

// ---------------------------------------------------------------------------
describe('resolver precedence (1-9)', () => {
  it('1. adult-school true overrides student/class child or teen', () => {
    expect(resolveTrustedAgeBand({ adultLearners: true }, 'child', 'teen')).toEqual({ band: 'adult', status: 'known', source: 'school_setting_adult_learners' });
  });
  it('2. student child overrides class teen', () => {
    expect(resolveTrustedAgeBand({ adultLearners: false }, 'child', 'teen')).toEqual({ band: 'child', status: 'known', source: 'student_age_band' });
  });
  it('3. class teen used when the student value is unset', () => {
    expect(resolveTrustedAgeBand({}, undefined, 'teen')).toEqual({ band: 'teen', status: 'known', source: 'class_age_band' });
  });
  it('4. student adult overrides class child', () => {
    expect(resolveTrustedAgeBand({}, 'adult', 'child')).toMatchObject({ band: 'adult', source: 'student_age_band' });
  });
  it('5. no values → unknown', () => {
    expect(resolveTrustedAgeBand(undefined)).toEqual({ band: 'unknown', status: 'unknown', source: 'no_trusted_learner_age_source' });
  });
  it.each([{}, { adultLearners: false }, { adultLearners: 'true' }, { adultLearners: 1 }, { adultLearners: 'yes' }, null, 'adult'])(
    '6. missing/false/malformed adult-school value %j does not produce adult',
    (settings) => {
      expect(resolveTrustedAgeBand(settings).band).toBe('unknown');
    },
  );
  it.each(['Child', 'TEEN', ' child', 'kid', 'young', true, 1, 12, {}, ['child'], ''])('7. invalid student value %j falls through to a valid class value', (bad) => {
    expect(resolveTrustedAgeBand({}, bad, 'teen')).toMatchObject({ band: 'teen', source: 'class_age_band' });
  });
  it('8. invalid student and class values → unknown', () => {
    expect(resolveTrustedAgeBand({}, 'Teen', 'Child ')).toMatchObject({ band: 'unknown' });
  });
});

// ---------------------------------------------------------------------------
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app')['createApp']>;
let M: Record<string, mongoose.Model<any>>;
const tok: Record<string, string> = {};
const PW = 'age-band-test-password';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
    ANTHROPIC_API_KEY: 'test-key-not-real', AI_TEST_SPEND_CAP_USD: '1', AI_TEST_SPEND_ID: 'age-band-test',
  });
  for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'DATABASE_URL', 'AI_PAUSED']) delete process.env[k];
  (await import('../src/config/env')).resetConfigForTests();
  (await import('../src/services/aiGateway')).setGatewayRetryDelay(0);
  await mongoose.connect(mongo.getUri());
  M = {};
  for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum', 'AuditEvent']) M[name] = (await import(`../src/models/${name}`))[name];
  const hash = bcrypt.hashSync(PW, 4);
  // Two schools; school A has classes A1 and A2 and students s1..s4; school B mirrors one class and student.
  for (const [inst, adult] of [['ab-A', false], ['ab-B', false], ['ab-ADULT', true]] as const) {
    await M.Institution.create({ id: inst, name: `AB ${inst}`, features: {}, learningSettings: { adultLearners: adult } });
    await M.Curriculum.create({ id: `${inst}-cur`, name: 'English A2', institutionId: inst, courseName: 'English A2', type: 'Language', level: 'A2', languages: ['English'], summary: 'x', lastUpdated: '2026-11-09', status: 'deployed', chapters: [{ id: `${inst}-lsn`, title: 'Daily routine', description: 'Routines', languageSpec: { vocabulary: ['get up', 'go to bed'], grammar: ['present simple'] } }] });
    for (const role of ['admin', 'academic_manager', 'teacher']) {
      await M.User.create({ email: `${role}@${inst}.test`, password: hash, role, name: `${role} ${inst}`, status: 'active', institutionId: inst });
    }
  }
  const classes = [['ab-A', 'cls-A1'], ['ab-A', 'cls-A2'], ['ab-B', 'cls-B1'], ['ab-ADULT', 'cls-X1']];
  for (const [inst, id] of classes) await M.Batch.create({ id, name: `Class ${id}`, institutionId: inst, academicYear: '2026', studentCount: 0 });
  const students = [['ab-A', 's1', 'cls-A1'], ['ab-A', 's2', 'cls-A1'], ['ab-A', 's3', 'cls-A2'], ['ab-A', 's4', 'cls-A2'], ['ab-B', 'sB', 'cls-B1'], ['ab-ADULT', 'sX', 'cls-X1']];
  for (const [inst, id, cls] of students) {
    await M.Student.create({ id, name: `Zephyrine Quill ${id}`, email: `${id}@${inst}.test`, grade: 'Grade 6', institutionId: inst, batchId: cls });
    await M.StudentCredit.create({ studentId: id, institutionId: inst, limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    await M.User.create({ email: `${id}@${inst}.test`, password: hash, role: 'student', name: `Zephyrine Quill ${id}`, status: 'active', institutionId: inst, studentId: id });
    await M.CourseInstance.create({ id: `ci-${id}`, courseId: `crs-${id}`, courseName: 'English A2', institutionId: inst, academicYear: '2026', batchId: cls, curriculumId: `${inst}-cur`, studentIds: [id], instructorIds: [], visibility: 'student' });
  }
  app = (await import('../src/app')).createApp();
  const login = async (email: string) => `Bearer ${(await request(app).post('/api/auth/login').send({ email, password: PW })).body.token}`;
  for (const inst of ['ab-A', 'ab-B', 'ab-ADULT']) for (const role of ['admin', 'academic_manager', 'teacher']) tok[`${role}@${inst}`] = await login(`${role}@${inst}.test`);
  for (const [inst, id] of students) tok[id] = await login(`${id}@${inst}.test`);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  ai.create.mockReset();
  ai.create.mockResolvedValue({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Write one sentence about your morning. I\'ll check it!' }], usage: { input_tokens: 10, output_tokens: 10 } });
});

const put = (who: string, path: string, body: unknown) => request(app).put(`/api/age-bands${path}`).set('Authorization', tok[who] ?? '').send(body as object);
const stored = async (model: 'Student' | 'Batch', id: string) => (await M[model].findOne({ id }).select('+learnerAgeBand').lean())?.learnerAgeBand ?? null;

describe('authorization and isolation (10-18)', () => {
  it('10. Workspace Admin sets a valid student band in own tenant (audited)', async () => {
    const r = await put('admin@ab-A', '/students/s1', { ageBand: 'child' });
    expect(r.status).toBe(200);
    expect(await stored('Student', 's1')).toBe('child');
    const audit = await M.AuditEvent.findOne({ action: 'learner_age_band_changed', targetId: 's1' }).lean();
    expect(audit).toMatchObject({ actorRole: 'admin', institutionId: 'ab-A', targetType: 'student', detail: { scope: 'student', from: null, to: 'child' } });
  });

  it('11. Workspace Admin sets a valid class band in own tenant', async () => {
    const r = await put('admin@ab-A', '/classes/cls-A1', { ageBand: 'teen' });
    expect(r.status).toBe(200);
    expect(await stored('Batch', 'cls-A1')).toBe('teen');
  });

  it('12. Workspace Admin cannot modify another tenant\'s records (not found, nothing changed)', async () => {
    expect((await put('admin@ab-A', '/students/sB', { ageBand: 'adult' })).status).toBe(404);
    expect((await put('admin@ab-A', '/classes/cls-B1', { ageBand: 'adult' })).status).toBe(404);
    expect(await stored('Student', 'sB')).toBeNull();
    expect(await stored('Batch', 'cls-B1')).toBeNull();
  });

  it.each([['13. Academic Manager', 'academic_manager@ab-A'], ['14. Teacher', 'teacher@ab-A'], ['15. Student', 's2']])('%s cannot write', async (_l, who) => {
    expect((await put(who, '/students/s2', { ageBand: 'teen' })).status).toBe(403);
    expect((await put(who, '/classes/cls-A2', { ageBand: 'teen' })).status).toBe(403);
    expect(await stored('Student', 's2')).toBeNull();
  });

  it('16. anonymous caller cannot write or read', async () => {
    expect((await request(app).put('/api/age-bands/students/s2').send({ ageBand: 'teen' })).status).toBe(401);
    expect((await request(app).get('/api/age-bands')).status).toBe(401);
  });

  it('17a. client-supplied institution/student/class/age/DOB fields cannot redirect a write', async () => {
    const r = await put('admin@ab-A', '/students/s3', { ageBand: 'teen', institutionId: 'ab-B', studentId: 'sB', classId: 'cls-B1', age: 9, dob: '2016-01-01' });
    expect(r.status).toBe(200);
    expect(await stored('Student', 's3')).toBe('teen');
    expect(await stored('Student', 'sB')).toBeNull();
  });

  it.each([['Child'], ['TEEN'], ['kid'], [12], [true], [''], [{}]])('26a. invalid value %j is rejected with 400 and nothing changes', async (v) => {
    const r = await put('admin@ab-A', '/students/s4', { ageBand: v });
    expect(r.status).toBe(400);
    expect(await stored('Student', 's4')).toBeNull();
  });

  it('26b. missing ageBand is rejected; null clears a set value', async () => {
    expect((await put('admin@ab-A', '/students/s4', {})).status).toBe(400);
    await put('admin@ab-A', '/students/s4', { ageBand: 'adult' });
    expect(await stored('Student', 's4')).toBe('adult');
    expect((await put('admin@ab-A', '/students/s4', { ageBand: null })).status).toBe(200);
    expect(await stored('Student', 's4')).toBeNull();
  });

  it('existing generic student/batch routes cannot set the band (field not accepted there)', async () => {
    await request(app).patch('/api/students/s4').set('Authorization', tok['admin@ab-A']).send({ learnerAgeBand: 'child' });
    await request(app).patch('/api/batches/cls-A2').set('Authorization', tok['admin@ab-A']).send({ learnerAgeBand: 'child' });
    expect(await stored('Student', 's4')).toBeNull();
    expect(await stored('Batch', 'cls-A2')).toBeNull();
  });

  it('existing reads do not expose the band (select:false)', async () => {
    const list = await request(app).get('/api/students').set('Authorization', tok['admin@ab-A']);
    expect(JSON.stringify(list.body)).not.toContain('learnerAgeBand');
  });

  it('read access: Workspace Admin and Academic Manager see own tenant only (canEdit differs); teacher and student cannot read', async () => {
    const admin = await request(app).get('/api/age-bands').set('Authorization', tok['admin@ab-A']);
    expect(admin.status).toBe(200);
    expect(admin.body.canEdit).toBe(true);
    expect(admin.body.students.map((s: { id: string }) => s.id).sort()).toEqual(['s1', 's2', 's3', 's4']);
    const am = await request(app).get('/api/age-bands').set('Authorization', tok['academic_manager@ab-A']);
    expect(am.status).toBe(200);
    expect(am.body.canEdit).toBe(false);
    expect(JSON.stringify(am.body)).not.toContain('sB');
    expect((await request(app).get('/api/age-bands').set('Authorization', tok['teacher@ab-A'])).status).toBe(403);
    expect((await request(app).get('/api/age-bands').set('Authorization', tok.s1)).status).toBe(403);
  });

  it('effective band and source are reported per student (explicit vs inherited vs unknown)', async () => {
    const r = await request(app).get('/api/age-bands').set('Authorization', tok['admin@ab-A']);
    const by = Object.fromEntries(r.body.students.map((s: { id: string; effective: unknown }) => [s.id, s.effective]));
    expect(by.s1).toMatchObject({ ageBand: 'child', source: 'student_age_band' });
    expect(by.s2).toMatchObject({ ageBand: 'teen', source: 'class_age_band' });
    expect(by.s3).toMatchObject({ ageBand: 'teen', source: 'student_age_band' });
    expect(by.s4).toMatchObject({ ageBand: 'unknown', source: 'no_trusted_learner_age_source' });
  });
});

// ---------------------------------------------------------------------------
const tutorTurn = async (who: string, text: string, course: string, lesson: string, context: Record<string, unknown> = {}) => {
  const s = (await request(app).post('/api/me/tutor/sessions').set('Authorization', tok[who]).send({ courseId: course, lessonId: lesson, title: 't' })).body;
  return request(app).post(`/api/me/tutor/sessions/${s.id ?? s.session?.id}/messages`).set('Authorization', tok[who]).send({ text, context: { courseId: course, lessonId: lesson, ...context } });
};
const payload = () => JSON.stringify(ai.create.mock.calls.at(-1)?.[0] ?? {});

describe('runtime and provider payload (17-24)', () => {
  it('19. child, teen, adult and unknown reach the real engine through the trusted contract', async () => {
    // s1 student child; s2 inherits class teen; sX adult school; s4 nothing set.
    const cases: [string, string, string, string][] = [['s1', 'child', 'student_age_band', 'ab-A'], ['s2', 'teen', 'class_age_band', 'ab-A'], ['sX', 'adult', 'school_setting_adult_learners', 'ab-ADULT'], ['s4', 'unknown', 'no_trusted_learner_age_source', 'ab-A']];
    for (const [who, band, source, inst] of cases) {
      const r = await tutorTurn(who, 'What does "get up" mean?', `crs-${who}`, `${inst}-lsn`);
      expect(r.status, who).toBe(200);
      expect(r.body.assistantMessage.meta.languageTurn, who).toMatchObject({ ageBand: band, ageBandSource: source, ageBandStatus: band === 'unknown' ? 'unknown' : 'known' });
      const p = payload();
      if (band === 'unknown') expect(p).toContain("age is not known");
      else expect(p).toContain(`Learner age band: ${band} [known; source: ${source}]`);
    }
  });

  it('20. age × CEFR stay independent: the level line is the same for child and teen in the same course', async () => {
    await tutorTurn('s1', 'What does "go to bed" mean?', 'crs-s1', 'ab-A-lsn');
    const child = payload();
    await tutorTurn('s2', 'What does "go to bed" mean?', 'crs-s2', 'ab-A-lsn');
    const teen = payload();
    const line = (p: string, k: string) => p.split('\\n').find((x) => x.startsWith(k));
    expect(line(child, 'Level:')).toEqual(line(teen, 'Level:'));
    expect(line(child, 'Register:')).not.toEqual(line(teen, 'Register:'));
  });

  it('21/22. provider payload: coarse band + source label only; no DOB, age, grade, names, ids or client values', async () => {
    await tutorTurn('s1', 'What does "get up" mean?', 'crs-s1', 'ab-A-lsn', { ageBand: 'adult', age: 30, dob: '1996-03-03', studentId: 'sB', institutionId: 'ab-B', classId: 'cls-B1', grade: 'Grade 12' });
    const p = payload();
    expect(p).toContain('Learner age band: child [known; source: student_age_band]');
    for (const leak of ['Zephyrine', '"s1"', 's1@', 'ab-A', 'cls-A1', 'ci-s1', 'crs-s1', 'Grade 6', 'Grade 12', '1996-03-03', '"age"', 'dob', 'sB', 'ab-B']) expect(p, leak).not.toContain(leak);
  });

  it('17b/18. client fields cannot override the resolver, and a student cannot use another school\'s course', async () => {
    const r = await tutorTurn('s4', 'What does "get up" mean?', 'crs-s4', 'ab-A-lsn', { ageBand: 'adult', learnerAgeBand: 'child', institutionId: 'ab-ADULT' });
    expect(r.body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'unknown' });
    const cross = await tutorTurn('s4', 'What does "get up" mean?', 'crs-sX', 'ab-ADULT-lsn');
    expect(cross.status).toBeGreaterThanOrEqual(400);
  });

  it('9. no inheritance across students: s3 (own teen) and s4 (unset) in the same class differ', async () => {
    expect((await tutorTurn('s3', 'hello there friend', 'crs-s3', 'ab-A-lsn')).body.assistantMessage.meta.languageTurn.ageBand).toBe('teen');
    expect((await tutorTurn('s4', 'hello there friend', 'crs-s4', 'ab-A-lsn')).body.assistantMessage.meta.languageTurn.ageBand).toBe('unknown');
  });

  it('23. stored turn metadata records band and source consistently', async () => {
    const r = await tutorTurn('s2', 'What does "get up" mean?', 'crs-s2', 'ab-A-lsn');
    const s = await request(app).get(`/api/me/tutor/sessions/${r.body.session.id}`).set('Authorization', tok.s2);
    const ai2 = (s.body.messages ?? s.body.session?.messages).filter((m: { role: string }) => m.role === 'ai').at(-1);
    expect(ai2.meta.languageTurn).toMatchObject({ ageBand: 'teen', ageBandSource: 'class_age_band' });
  });

  it('24. adult-school behaviour unchanged even with a child band set on the student', async () => {
    await M.Student.updateOne({ id: 'sX' }, { $set: { learnerAgeBand: 'child' } });
    const r = await tutorTurn('sX', 'What does "get up" mean?', 'crs-sX', 'ab-ADULT-lsn');
    expect(r.body.assistantMessage.meta.languageTurn).toMatchObject({ ageBand: 'adult', ageBandSource: 'school_setting_adult_learners' });
  });
});

// ---------------------------------------------------------------------------
describe('UI (25): server-side render of the real component', () => {
  const data = (canEdit: boolean) => ({
    values: ['child', 'teen', 'adult'], adultSchool: false, canEdit,
    classes: [{ id: 'c1', name: 'Class 4B', ageBand: 'teen' }],
    students: [
      { id: 'x1', name: 'Nyla Example', classId: 'c1', ageBand: null, classAgeBand: 'teen', effective: { ageBand: 'teen', source: 'class_age_band', status: 'known' } },
      { id: 'x2', name: 'Omar Example', classId: null, ageBand: null, classAgeBand: null, effective: { ageBand: 'unknown', source: 'no_trusted_learner_age_source', status: 'unknown' } },
    ],
  });
  const render = async (d: unknown, editable: boolean) => {
    const React = (await import('../../frontend/node_modules/react')).default;
    const { renderToStaticMarkup } = await import('../../frontend/node_modules/react-dom/server');
    const { LearnerAgeBandsView } = await import('../../frontend/pages/workspace/LearnerAgeBands');
    const props = editable ? { data: d, onSetClass: () => undefined, onSetStudent: () => undefined } : { data: d };
    return renderToStaticMarkup(React.createElement(LearnerAgeBandsView as never, props as never));
  };

  it('Workspace Admin: selectors with exactly child/teen/adult + Not set; inherited vs unknown shown; precedence explained', async () => {
    const h = await render(data(true), true);
    expect((h.match(/<select/g) ?? []).length).toBe(3);
    const firstSelect = h.split('<select')[1].split('</select>')[0];
    expect([...firstSelect.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1])).toEqual(['', 'child', 'teen', 'adult']);
    expect(firstSelect).toContain('>Not set</option>');
    expect(h).toContain('Inherited from class');
    expect(h).toContain('Unknown');
    expect(h).toContain('not an exact age');
    expect(h).toMatch(/adult-learners setting first, then the student&#x27;s own band, then their class&#x27;s band/);
  });

  it('Academic Manager (canEdit false) and any caller without handlers: read-only, no controls', async () => {
    const h = await render(data(false), true);
    expect(h).not.toContain('<select');
    expect(h).toContain('Read-only view.');
    expect(await render(data(true), false)).not.toContain('<select');
  });

  it('role routing: age-bands is a school-admin page (hidden from teachers) and a read-only academic-manager tab', async () => {
    const rr = await import('../../frontend/services/roleRouting');
    expect(rr.staffPageAllowed('teacher', 'age-bands')).toBe(false);
    expect(rr.staffPageAllowed('admin', 'age-bands')).toBe(true);
    expect(rr.academicManagerPage('age-bands')).toBe('age-bands');
  });
});

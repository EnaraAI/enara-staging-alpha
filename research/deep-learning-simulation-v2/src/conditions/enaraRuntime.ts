// Isolated adapter to the REAL ENARA tutoring route. Boots the production Express app in-process against a throwaway
// mongodb-memory-server database (no production DB, no real school/student records), seeds one synthetic school/student/
// lesson per block exactly like backend/benchmarks/ltc-v2/run_fixture_v2.ts, and posts learner messages to
// POST /api/me/tutor/sessions/:id/messages. Nothing here edits production code, env, budgets or schema.
import path from 'path';
import type { Outcome } from '../benchmark/schema';
const BACKEND = path.resolve(__dirname, '../../../../backend');

export interface EnaraEnv { ablate?: string[]; voice?: boolean; }
export class EnaraRuntime {
  private app: any; private M: Record<string, any> = {}; private mongo: any; private mongoose: any; private request: any; private hash = ''; private n = 0;
  private PW = 'research-local-password-1';
  async start(apiKey: string, env: EnaraEnv = {}): Promise<void> {
    const { MongoMemoryServer } = await import(path.join(BACKEND, 'node_modules/mongodb-memory-server'));
    this.mongoose = (await import(path.join(BACKEND, 'node_modules/mongoose'))).default;
    const bcrypt = (await import(path.join(BACKEND, 'node_modules/bcryptjs'))).default;
    this.request = (await import(path.join(BACKEND, 'node_modules/supertest'))).default;
    this.mongo = await MongoMemoryServer.create();
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: this.mongo.getUri(), JWT_SECRET: 'research-local-jwt-secret-32-characters-min', JWT_EXPIRES_IN: '2h', JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform',
      INGEST_HMAC_SECRET: 'research-local-hmac-secret-32-characters-min', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', AWS_S3_BUCKET: '', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
      ANTHROPIC_API_KEY: apiKey, ANAM_API_KEY: 'anam-stub', ANAM_AVATAR_ID: 'avatar-1', ANAM_VOICE_ID_EN: 'voice-en', ANAM_VOICE_ID_AR: 'voice-ar', AI_TEST_SPEND_CAP_USD: '100000', AI_TEST_SPEND_ID: 'research-v2-local', // throwaway DB only; never a production cap
      ...(env.ablate?.length ? { ENARA_RESEARCH_ABLATE: env.ablate.join(',') } : {}),
    });
    for (const k of ['ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'ELEVENLABS_API_KEY', ...(env.voice ? [] : ['ANAM_API_KEY']), 'DATABASE_URL', 'AI_PAUSED', 'ANTHROPIC_TUTOR_MODEL', 'ANTHROPIC_TUTOR_EFFORT', 'ANTHROPIC_INTENT_MODEL', 'AZURE_SPEECH_KEY']) delete process.env[k];
    const { resetConfigForTests } = await import(path.join(BACKEND, 'src/config/env'));
    resetConfigForTests();
    await this.mongoose.connect(this.mongo.getUri());
    for (const name of ['User', 'Institution', 'CourseInstance', 'Student', 'StudentCredit', 'Batch', 'Curriculum', 'LearningObjective', 'StudentObjectiveMastery', 'StudentMisconception']) this.M[name] = (await import(path.join(BACKEND, `src/models/${name}`)))[name];
    this.app = (await import(path.join(BACKEND, 'src/app'))).createApp();
    const prev = globalThis.fetch; // third-party Anam only is stubbed; model calls stay real
    globalThis.fetch = ((u: any, i?: any) => (String(u).startsWith('https://api.anam.ai/') ? Promise.resolve(new Response(JSON.stringify({ sessionToken: 'anam-stub', data: [], meta: { lastPage: 1 } }), { status: 200 })) : prev(u, i))) as typeof fetch;
    this.hash = bcrypt.hashSync(this.PW, 4);
  }
  /** Same seeding as openSession, but the learner talks to the LIVE AVATAR route (/api/avatar/query-stream, text path; Anam is stubbed, the model call is real). */
  async openVoiceSession(o: Outcome, cohort: 'child' | 'teen' | 'adult'): Promise<{ send: (text: string) => Promise<{ reply: string; status: number; meta: unknown }> }> {
    await this.openSession(o, cohort);
    const { request, app } = this; const k = String(this.n).padStart(5, '0'); const email = `rs-learner-${k}@research.invalid`;
    const login = await request(app).post('/api/auth/login').send({ email, password: this.PW }); const auth = `Bearer ${login.body.token}`;
    const start = await request(app).post('/api/avatar/session').set('Authorization', auth).send({ course_id: `rs-crs-${k}`, lesson_id: `rs-lsn-${k}`, preferred_language: 'english' });
    const sid = start.body.session_id; if (!sid) throw new Error(`avatar session failed: HTTP ${start.status} ${JSON.stringify(start.body).slice(0, 200)}`);
    const coll = this.mongoose.connection.collection('tutor_messages');
    return { send: async (text: string) => {
      const r = await request(app).post('/api/avatar/query-stream').set('Authorization', auth).send({ session_id: sid, messages: [{ role: 'user', content: text }] }).buffer(true).parse((res: any, cb: any) => { let d = ''; res.on('data', (x: Buffer) => { d += x.toString(); }); res.on('end', () => cb(null, d)); });
      const reply = String(r.body ?? '').split('\n').filter(Boolean).map((l: string) => { try { return JSON.parse(l); } catch { return {}; } }).filter((e: any) => e.content).map((e: any) => e.content).join('');
      if (r.status !== 200 || !reply) throw new Error(`avatar route failed: HTTP ${r.status}`);
      const doc = await coll.find({ sessionId: sid, role: 'ai' }).sort({ timestamp: -1 }).limit(1).toArray();
      return { reply, status: r.status, meta: doc[0]?.meta ?? null };
    } };
  }
  async stop(): Promise<void> { await this.mongoose?.disconnect(); await this.mongo?.stop(); }
  /** One synthetic school/class/student/lesson per block; returns a session handle. */
  async openSession(o: Outcome, cohort: 'child' | 'teen' | 'adult'): Promise<{ send: (text: string) => Promise<{ reply: string; status: number; meta: unknown }> }> {
    const { M, mongoose, request, app } = this; const k = String(++this.n).padStart(5, '0');
    const inst = `rs-school-${k}`; const sid = `rs-stu-${k}`; const email = `rs-learner-${k}@research.invalid`; const curId = `rs-cur-${k}`; const lessonId = `rs-lsn-${k}`; const courseId = `rs-crs-${k}`; const objId = `rs-obj-${k}`;
    await M.Institution.create({ id: inst, name: `Research School ${k}`, features: { teaching_workflow_enabled: true, learning_intelligence_enabled: true, adaptive_pedagogy_enabled: true, mastery_tracking_enabled: true, misconception_detection_enabled: true }, learningSettings: { adultLearners: false } });
    await M.Batch.create({ id: `rs-b-${k}`, name: `Batch ${k}`, institutionId: inst, academicYear: '2026', studentCount: 1 });
    await M.Student.create({ id: sid, name: `Research Learner ${k}`, email, grade: cohort === 'child' ? 'Grade 4' : cohort === 'teen' ? 'Grade 9' : '', institutionId: inst, batchId: `rs-b-${k}` });
    await M.StudentCredit.create({ studentId: sid, institutionId: inst, limit: 100000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
    await M.User.create({ email, password: this.hash, role: 'student', name: `Research Learner ${k}`, status: 'active', institutionId: inst, studentId: sid });
    const spec = { ...o.lesson.spec, items: o.lesson.spec.items }; // the lesson exactly as the teacher/curriculum would deliver it (no assessment content)
    await M.Curriculum.create({ id: curId, name: `English ${o.cefr}`, institutionId: inst, courseName: `English ${o.cefr}`, type: 'Language', level: o.cefr, languages: ['English'], summary: `Synthetic English course, level ${o.cefr}.`, lastUpdated: '2026-11-13', status: 'deployed', chapters: [{ id: lessonId, title: o.lesson.title, description: o.lesson.objective, languageSpec: spec }] });
    await M.CourseInstance.create({ id: `rs-cls-${k}`, courseId, courseName: `English ${o.cefr}`, institutionId: inst, academicYear: '2026', batchId: `rs-b-${k}`, curriculumId: curId, studentIds: [sid], instructorIds: [], visibility: 'student' });
    await M.LearningObjective.create({ id: objId, institutionId: inst, curriculumId: curId, courseId, lessonIds: [lessonId], code: `RS-${k}`, title: o.lesson.objective.slice(0, 200), status: 'approved' });
    await mongoose.connection.collection('rate_limits').deleteMany({});
    const adminEmail = `rs-admin-${k}@research.invalid`; await M.User.create({ email: adminEmail, password: this.hash, role: 'admin', name: `Research Admin ${k}`, status: 'active', institutionId: inst });
    const al = await request(app).post('/api/auth/login').send({ email: adminEmail, password: this.PW }); const adminAuth = `Bearer ${al.body.token}`;
    const fx = cohort === 'adult' ? await request(app).put('/api/learning/settings').set('Authorization', adminAuth).send({ adultLearners: true }) : await request(app).put(`/api/age-bands/classes/rs-b-${k}`).set('Authorization', adminAuth).send({ ageBand: cohort });
    if (fx.status !== 200) throw new Error(`age-band setup failed: HTTP ${fx.status}`);
    await mongoose.connection.collection('rate_limits').deleteMany({});
    const login = await request(app).post('/api/auth/login').send({ email, password: this.PW }); const auth = `Bearer ${login.body.token}`;
    const sess = await request(app).post('/api/me/tutor/sessions').set('Authorization', auth).send({ courseId, lessonId, title: `Research ${o.id}` });
    const sessionId = sess.body.id ?? sess.body.session?.id; if (!sessionId) throw new Error(`tutor session creation failed: HTTP ${sess.status}`);
    return { send: async (text: string) => { const r = await request(app).post(`/api/me/tutor/sessions/${sessionId}/messages`).set('Authorization', auth).send({ text, context: { courseId, lessonId } }); const ai = r.body?.assistantMessage; if (r.status !== 200 || !ai?.text) throw new Error(`tutor route failed: HTTP ${r.status}`); return { reply: String(ai.text), status: r.status, meta: ai.meta ?? null }; } };
  }
}

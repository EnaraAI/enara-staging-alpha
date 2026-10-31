// P15 UI journey harness (test-only; not part of the app or the vitest run).
// Starts an in-memory MongoDB, the real backend app and the built SPA on one
// local origin, then prepares the teacher side of the journey THROUGH THE API
// (login, curriculum, publish to class, MCQ assessment, assignment). No AI
// provider key is set, so nothing can leave the machine; the MCQ assessment is
// graded without AI.
//
//   npx tsx test/ui/journeyServer.ts <frontend-dist-dir> <port>
// Prints "READY <port>" when the data is in place.
import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const [dist, portArg] = process.argv.slice(2);
const port = Number(portArg || 4173);
if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) throw new Error('usage: journeyServer.ts <frontend-dist> <port>');
export const PW = 'ui-journey-password-1';

async function main() {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${port}`, TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', AWS_S3_BUCKET: '',
  });
  for (const k of ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'ENARA_ORCHESTRATOR_URL', 'ENARA_API_KEY', 'AI_ENGINE_URL', 'DATABASE_URL']) delete process.env[k];
  (await import('../../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const load = async (n: string) => (await import(`../../src/models/${n}`))[n];
  const [Institution, User, Student, Batch, CourseInstance, StudentCredit] = await Promise.all(['Institution', 'User', 'Student', 'Batch', 'CourseInstance', 'StudentCredit'].map(load));
  const features = { teaching_workflow_enabled: true, ai_grading_enabled: true, study_plans_enabled: true, learning_intelligence_enabled: true, mastery_tracking_enabled: true, connected_workflow_enabled: true };
  await Institution.create({ id: 'ui-school', name: 'UI Journey School', features });
  await Batch.create({ id: 'ui-b1', name: 'Grade 6 A', institutionId: 'ui-school', academicYear: '2026', studentCount: 1 });
  await Student.create({ id: 'ui-stu1', name: 'Amira Browser', email: 'amira@ui.test', grade: 'Grade 6', institutionId: 'ui-school', batchId: 'ui-b1' });
  await StudentCredit.create({ studentId: 'ui-stu1', institutionId: 'ui-school', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  const hash = bcrypt.hashSync(PW, 4);
  const teacher = await User.create({ email: 'teacher@ui.test', password: hash, role: 'teacher', name: 'Tariq Teacher', status: 'active', institutionId: 'ui-school' });
  await User.create({ email: 'amira@ui.test', password: hash, role: 'student', name: 'Amira Browser', status: 'active', institutionId: 'ui-school', studentId: 'ui-stu1' });
  await User.create({ email: 'admin@ui.test', password: hash, role: 'admin', name: 'Wafa Admin', status: 'active', institutionId: 'ui-school' });
  await CourseInstance.create({ id: 'ui-cls1', courseId: 'ui-fr6a', courseName: 'Fractions 6A', institutionId: 'ui-school', academicYear: '2026', batchId: 'ui-b1', studentIds: [], instructorIds: [teacher._id.toString()], visibility: 'student' });
  // P17: a second class of the same teacher (own batch, no student) that the UI journey publishes to.
  await Batch.create({ id: 'ui-b2', name: 'Grade 6 B', institutionId: 'ui-school', academicYear: '2026', studentCount: 0 });
  await CourseInstance.create({ id: 'ui-cls2', courseId: 'ui-fr6b', courseName: 'Fractions 6B', institutionId: 'ui-school', academicYear: '2026', batchId: 'ui-b2', studentIds: [], instructorIds: [teacher._id.toString()], visibility: 'student' });

  const api = (await import('../../src/app')).createApp();
  const web = express();
  web.use(express.static(dist, { index: false }));
  web.use((req, res, next) => (req.path.startsWith('/api') || req.path === '/health' || req.path === '/ready' ? next() : res.sendFile(path.join(dist, 'index.html'))));
  web.use(api);
  await new Promise<void>((r) => web.listen(port, '127.0.0.1', () => r()));

  // Teacher side through the real API.
  const base = `http://127.0.0.1:${port}`;
  const call = async (method: string, p: string, token?: string, body?: unknown) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  const { token } = await call('POST', '/api/auth/login', undefined, { email: 'teacher@ui.test', password: PW });
  const cur = await call('POST', '/api/curriculums', token, { name: 'Fractions', summary: 'Adding fractions', courseName: 'Fractions 6A', chapters: [{ title: 'Adding fractions', description: 'Rewrite one half as two quarters: 2/4 + 1/4 = 3/4.' }] });
  await call('POST', `/api/curriculums/${cur.id}/publish-to-class`, token, { classId: 'ui-cls1' });
  const a = await call('POST', '/api/assessments', token, { title: 'Fractions quick check', subject: 'Maths', curriculumId: cur.id, lifecycle: 'draft',
    questions: [
      { id: 'q1', type: 'multiple-choice', text: 'What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: 'Use quarters.', points: 1 },
      { id: 'q2', type: 'multiple-choice', text: 'What is 1/4 + 1/4?', options: ['1/2', '2/8'], correctAnswer: '1/2', explanation: 'Two quarters.', points: 1 },
    ] });
  await call('POST', `/api/assessments/${a.id}/publish`, token);
  await call('POST', '/api/assignments', token, { assessmentId: a.id, classId: 'ui-cls1', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  // P19: a second, separate school (tenant B) with its own published lesson,
  // assessment and submission, every string tagged "TB_". The UI isolation
  // checks look for that tag in tenant A's pages and network responses.
  await Institution.create({ id: 'ui-school-b', name: 'TB_ Other School', features });
  await Batch.create({ id: 'ui-bb1', name: 'TB_ Grade 6', institutionId: 'ui-school-b', academicYear: '2026', studentCount: 1 });
  await Student.create({ id: 'ui-stub1', name: 'TB_ Bilal Other', email: 'bilal@ui-b.test', grade: 'Grade 6', institutionId: 'ui-school-b', batchId: 'ui-bb1' });
  await StudentCredit.create({ studentId: 'ui-stub1', institutionId: 'ui-school-b', limit: 1000, usage: 0, period: 'monthly', status: 'active', restrictedFeatures: [] });
  const teacherB = await User.create({ email: 'teacher@ui-b.test', password: hash, role: 'teacher', name: 'TB_ Teacher', status: 'active', institutionId: 'ui-school-b' });
  await User.create({ email: 'bilal@ui-b.test', password: hash, role: 'student', name: 'TB_ Bilal Other', status: 'active', institutionId: 'ui-school-b', studentId: 'ui-stub1' });
  await CourseInstance.create({ id: 'ui-clsb', courseId: 'ui-frb', courseName: 'TB_ Fractions B', institutionId: 'ui-school-b', academicYear: '2026', batchId: 'ui-bb1', studentIds: [], instructorIds: [teacherB._id.toString()], visibility: 'student' });
  const tb = (await call('POST', '/api/auth/login', undefined, { email: 'teacher@ui-b.test', password: PW })).token;
  const curB = await call('POST', '/api/curriculums', tb, { name: 'TB_ Fractions', summary: 'TB_ summary', courseName: 'TB_ Fractions B', chapters: [{ title: 'TB_ lesson', description: 'TB_ secret lesson body' }] });
  await call('POST', `/api/curriculums/${curB.id}/publish-to-class`, tb, { classId: 'ui-clsb' });
  const aB = await call('POST', '/api/assessments', tb, { title: 'TB_ quiz', subject: 'Maths', curriculumId: curB.id, lifecycle: 'draft',
    questions: [{ id: 'q1', type: 'multiple-choice', text: 'TB_ What is 1/2 + 1/4?', options: ['3/4', '2/6'], correctAnswer: '3/4', explanation: 'TB_ key', points: 1 }] });
  await call('POST', `/api/assessments/${aB.id}/publish`, tb);
  const gB = await call('POST', '/api/assignments', tb, { assessmentId: aB.id, classId: 'ui-clsb', dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  const sb = (await call('POST', '/api/auth/login', undefined, { email: 'bilal@ui-b.test', password: PW })).token;
  const stB = await call('POST', `/api/me/assignments/${gB.id}/attempts`, sb);
  await call('POST', `/api/me/assignments/${gB.id}/attempts/${stB.attempt.id}/submit`, sb, { answers: { q1: '3/4' } });
  fs.writeFileSync(path.join(dist, '..', 'tenant-b-ids.json'), JSON.stringify({ classId: 'ui-clsb', courseId: 'ui-frb', curriculumId: curB.id, lessonId: curB.chapters[0].id, assessmentId: aB.id, assignmentId: gB.id, attemptId: stB.attempt.id, studentId: 'ui-stub1' }));
  console.log(`READY ${port}`);
}
main().catch((e) => {
  console.error('HARNESS_FAILED', e);
  process.exit(1);
});

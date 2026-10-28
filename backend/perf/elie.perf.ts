// ELIE performance baseline (Phase 2, Sprint 7). Runs against an in-memory
// MongoDB on this machine, so absolute numbers are a local baseline, not
// Atlas latency. Usage: npx tsx perf/elie.perf.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

const STUDENTS = 500;
const OBJECTIVES = 300;
const CLASS_OBJECTIVES = 40;
const EVENTS = 10_000;
const CHUNKS = 5_000;

const results: { case: string; size: string; ms: number }[] = [];
async function time<T>(name: string, size: string, fn: () => Promise<T>) {
  const t = performance.now();
  const out = await fn();
  results.push({ case: name, size, ms: Math.round(performance.now() - t) });
  return out;
}

async function main() {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'perf-jwt-secret-32-characters-minimum!!', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'perf-hmac-secret-32-characters-minimum!',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', AWS_S3_BUCKET: 'x',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'x', AI_ENGINE_URL: 'http://127.0.0.1:9998', LOG_LEVEL: 'error',
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  const { signAccessToken } = await import('../src/auth/jwt');
  const { Institution } = await import('../src/models/Institution');
  const { Curriculum } = await import('../src/models/Curriculum');
  const { CourseInstance } = await import('../src/models/CourseInstance');
  const { Student } = await import('../src/models/Student');
  const { User } = await import('../src/models/User');
  const { Assessment } = await import('../src/models/Assessment');
  const { LearningObjective } = await import('../src/models/LearningObjective');
  const { LearningEvent } = await import('../src/models/LearningEvent');
  const { LearningEvidence } = await import('../src/models/LearningEvidence');
  const { StudentObjectiveMastery, MasteryHistory } = await import('../src/models/StudentObjectiveMastery');
  const { CurriculumChunk } = await import('../src/models/CurriculumChunk');
  const { DiagnosticSession } = await import('../src/models/DiagnosticSession');
  for (const m of [LearningObjective, LearningEvent, LearningEvidence, StudentObjectiveMastery, MasteryHistory, CurriculumChunk, DiagnosticSession, Student, CourseInstance]) {
    await m.createIndexes();
  }
  const { findCycle, prerequisiteClosure } = await import('../src/services/objectiveGraph');
  const { recordLearningEvents } = await import('../src/services/learningEvents');
  const { processPendingEvidence, recomputeMastery } = await import('../src/services/evidenceProcessor');
  const { retrieveCurriculumSources } = await import('../src/services/curriculumRetrieval');
  const { searchTerms } = await import('../src/services/textSearch');
  const app = (await import('../src/app')).createApp();

  const flags = Object.fromEntries(['learning_intelligence_enabled', 'diagnostics_enabled', 'mastery_tracking_enabled', 'misconception_detection_enabled',
    'adaptive_pedagogy_enabled', 'learning_pathways_enabled', 'teacher_learning_insights_enabled', 'retention_intelligence_enabled'].map((f) => [f, true]));
  await Institution.create({ id: 'inst', name: 'Perf', features: flags });
  await Curriculum.create({ id: 'cur', name: 'C', courseName: 'C', institutionId: 'inst', summary: 's', lastUpdated: '2026-01-01', status: 'deployed', assignedBatches: ['b'],
    chapters: Array.from({ length: 20 }, (_, i) => ({ id: `L${i}`, title: `L${i}`, uploads: [] })) });
  const teacher = await User.create({ email: 't@perf', password: 'x', role: 'teacher', name: 't', status: 'active', institutionId: 'inst' });
  const tAuth = `Bearer ${signAccessToken({ id: teacher._id.toString(), email: 't@perf', role: 'teacher', institutionId: 'inst' })}`;
  await CourseInstance.create({ id: 'course', courseId: 'c', courseName: 'C', institutionId: 'inst', academicYear: '2026', batchId: 'b', curriculumId: 'cur', studentIds: [], instructorIds: [teacher._id.toString()], visibility: 'student' });
  await Student.insertMany(Array.from({ length: STUDENTS }, (_, i) => ({ id: `s${i}`, name: `Student ${i}`, email: `s${i}@perf`, grade: '9', institutionId: 'inst', batchId: 'b' })));

  // Objective graph: each objective depends on up to two earlier ones.
  const nodes = Array.from({ length: OBJECTIVES }, (_, i) => ({
    id: `o${i}`,
    prerequisiteObjectiveIds: i === 0 ? [] : [`o${Math.floor(i / 2)}`, ...(i > 2 ? [`o${i - 1}`] : [])].filter((p) => p !== `o${i}`),
  }));
  await time('Graph cycle check', `${OBJECTIVES} objectives`, async () => findCycle(nodes));
  await time('Prerequisite closure (deepest)', `${OBJECTIVES} objectives`, async () => prerequisiteClosure(nodes, `o${OBJECTIVES - 1}`));
  await LearningObjective.insertMany(nodes.map((n, i) => ({
    id: n.id, institutionId: 'inst', curriculumId: 'cur', code: `O.${String(i).padStart(3, '0')}`, title: `Objective ${i}`,
    status: 'approved', lessonIds: [`L${i % 20}`], prerequisiteObjectiveIds: i < CLASS_OBJECTIVES ? n.prerequisiteObjectiveIds.filter((p) => Number(p.slice(1)) < CLASS_OBJECTIVES) : n.prerequisiteObjectiveIds,
  })));
  await Assessment.create({ id: 'bank', title: 'Bank', institutionId: 'inst', subject: 'M', status: 'completed', curriculumId: 'cur',
    questions: Array.from({ length: 400 }, (_, i) => ({ id: `q${i}`, type: 'multiple-choice', text: `q${i}`, options: ['a', 'b'], correctAnswer: 'a', explanation: '', objectiveIds: [`o${i % CLASS_OBJECTIVES}`], difficulty: 1 + (i % 5) })) });

  // Event ingestion: 10,000 graded answers across the cohort.
  const events = Array.from({ length: EVENTS }, (_, i) => ({
    studentId: `s${i % STUDENTS}`, institutionId: 'inst', type: 'question_answered' as const, source: 'assessment' as const, verified: true, gradedBy: 'rule' as const,
    objectiveIds: [`o${i % CLASS_OBJECTIVES}`], refs: { assessmentId: 'bank', attemptId: `att${i % STUDENTS}`, questionId: `q${i % 400}x${Math.floor(i / 400)}` },
    outcome: { correct: i % 3 !== 0 }, idempotencyKey: `perf:${i}`, at: new Date(Date.now() - (EVENTS - i) * 1000),
  }));
  await time('Event ingestion (batches of 500)', `${EVENTS} events`, async () => {
    for (let i = 0; i < events.length; i += 500) await recordLearningEvents(events.slice(i, i + 500));
  });
  await time('Event ingestion, duplicates re-sent', `${EVENTS} events`, async () => {
    for (let i = 0; i < events.length; i += 500) await recordLearningEvents(events.slice(i, i + 500));
  });
  const ev = await time('Bulk evidence + mastery processing', `${EVENTS} events`, () => processPendingEvidence({ limit: EVENTS }));
  console.log('processed', JSON.stringify(ev), 'evidence', await LearningEvidence.countDocuments(), 'states', await StudentObjectiveMastery.countDocuments());
  await time('Bulk recompute (all states, sequential)', `${await StudentObjectiveMastery.countDocuments()} states`, async () => {
    const states = await StudentObjectiveMastery.find({}).select('studentId objectiveId').lean();
    for (const s of states) await recomputeMastery(s.studentId, s.objectiveId, 'perf', 'inst');
  });
  await time('Concurrent mastery updates (same 50 student-objectives, 4x each)', '200 calls', async () => {
    const pairs = Array.from({ length: 50 }, (_, i) => [`s${i}`, `o${i % CLASS_OBJECTIVES}`]);
    await Promise.all(pairs.flatMap(([s, o]) => Array.from({ length: 4 }, () => recomputeMastery(s, o, 'perf', 'inst'))));
  });
  const dupStates = await StudentObjectiveMastery.aggregate([{ $group: { _id: { s: '$studentId', o: '$objectiveId' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
  console.log('duplicate mastery states after concurrency:', dupStates.length);

  // Teacher heatmap over the whole class.
  await CourseInstance.updateOne({ id: 'course' }, { $set: { curriculumId: 'cur' } });
  await LearningObjective.updateMany({ id: { $nin: nodes.slice(0, CLASS_OBJECTIVES).map((n) => n.id) } }, { $set: { curriculumId: 'other' } });
  const heat = await time('Class insights (heatmap)', `${STUDENTS} students x ${CLASS_OBJECTIVES} objectives`, () => request(app).get('/api/learning/classes/course/insights').set('Authorization', tAuth));
  console.log('insights status', heat.status, 'rows', heat.body.heatmap?.length);

  // Concurrent diagnostics through HTTP.
  const auths = await Promise.all(Array.from({ length: 50 }, async (_, i) => {
    const u = await User.create({ email: `d${i}@perf`, password: 'x', role: 'student', name: 'd', status: 'active', institutionId: 'inst', studentId: `s${STUDENTS - 1 - i}` });
    return `Bearer ${signAccessToken({ id: u._id.toString(), email: `d${i}@perf`, role: 'student', institutionId: 'inst', studentId: `s${STUDENTS - 1 - i}` })}`;
  }));
  let answered = 0;
  await time('Concurrent diagnostics (start + answer to completion)', '50 students', () => Promise.all(auths.map(async (auth) => {
    let d = (await request(app).post('/api/learning/diagnostics').set('Authorization', auth).send({ courseId: 'course' })).body;
    while (d.status === 'in_progress') {
      d = (await request(app).post(`/api/learning/diagnostics/${d.id}/answer`).set('Authorization', auth).send({ assessmentId: d.currentQuestion.assessmentId, questionId: d.currentQuestion.questionId, answer: 'a' })).body;
      answered += 1;
    }
    if (d.status !== 'completed') throw new Error(`diagnostic ended as ${JSON.stringify(d).slice(0, 200)}`);
  })));
  console.log('diagnostic answers', answered);

  // Retrieval over a large curriculum.
  const words = 'fraction ratio equation variable slope graph angle triangle area volume prime factor multiple decimal percent integer'.split(' ');
  await CurriculumChunk.insertMany(Array.from({ length: CHUNKS }, (_, i) => {
    const text = Array.from({ length: 120 }, (_, j) => words[(i * 7 + j * 3) % words.length] + (j % 5 ? '' : ` w${(i + j) % 900}`)).join(' ');
    const terms = searchTerms(text);
    return { id: `ch${i}`, institutionId: 'inst', curriculumId: 'cur', lessonId: `L${i % 20}`, fileUrl: `/uploads/f${i % 50}.pdf`, fileName: `f${i % 50}.pdf`, page: 1 + (i % 30), chunkIndex: i,
      text, terms: [...new Set(terms)], termCount: terms.length, objectiveIds: [], contentHash: 'h', extractionVersion: 'extract-v1' };
  }));
  await CurriculumChunk.createIndexes();
  await time('Retrieval (first query)', `${CHUNKS} passages`, () => retrieveCurriculumSources({ institutionId: 'inst', curriculumId: 'cur', query: 'how do I find the area of a triangle w12', objectiveId: 'o3' }));
  const t = performance.now();
  for (let i = 0; i < 20; i++) await retrieveCurriculumSources({ institutionId: 'inst', curriculumId: 'cur', query: `${words[i % words.length]} and ${words[(i + 5) % words.length]} w${i * 17}` });
  results.push({ case: 'Retrieval (mean of 20 queries)', size: `${CHUNKS} passages`, ms: Math.round((performance.now() - t) / 20) });

  console.table(results);
  await mongoose.disconnect();
  await mongo.stop();
}
main().catch((e) => { console.error(e); process.exit(1); });

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { DEMO_TEMPLATE_ID as T, type DemoRole } from '../config/demo';
import { Batch } from '../models/Batch';
import { CourseInstance } from '../models/CourseInstance';
import { Curriculum } from '../models/Curriculum';
import { Institution } from '../models/Institution';
import { OrgBudget } from '../models/OrgBudget';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { initialsFromName } from '../utils/idGenerator';
import { DEMO_TEMPLATE_EMAILS } from './demoSandbox';
import { ALL_FLAGS } from './featureFlags';

// The demo template school's starting point: fictional staff and students, a
// class and an original four-lesson English course. Enara admins then add
// assessments, grades and tutor history through the app itself (signed in as
// the template's accounts), and every demo session is copied from the result.
// Idempotent: fixed ids, upserts. Template accounts can't sign in with a
// password (random, discarded); only the template-token route can open them.

// Ids look like a school's own (the copy appends a short suffix per session).
const ID = { batch: 'BATCH-DEMO-A2', curriculum: 'CUR-DEMO-A2', course: 'CRS-DEMO-A2', klass: 'CLS-DEMO-A2', lesson: (i: number) => `LSN-DEMO-A2-${i}`, student: (i: number) => `STU-DEMO-${String(i).padStart(2, '0')}` };
const LESSONS = [
  {
    title: 'Lesson 1: Hello and introductions',
    description:
      'Greeting people and introducing yourself. Key phrases: "Hello, I\'m…", "Nice to meet you", "Where are you from?", "I\'m from Cairo", ' +
      '"What do you do?", "I\'m a student". Good morning (until 12), good afternoon (12–6), good evening (after 6). ' +
      'Practice: introduce yourself and a friend: "This is Mona. She is a doctor."',
  },
  {
    title: 'Lesson 2: My daily routine',
    description:
      'Present simple for routines and habits. I/you/we/they get up; he/she/it gets up (add -s). Time phrases: every day, on Mondays, ' +
      'at 7 o\'clock, in the morning. Adverbs of frequency go before the main verb: "I usually have breakfast at 7." ' +
      'Practice: describe your day from morning to night in five sentences.',
  },
  {
    title: 'Lesson 3: At the café',
    description:
      'Ordering food and drink politely. "Can I have a coffee, please?", "I\'d like a cheese sandwich", "How much is it?", "Here you are". ' +
      'Countable and uncountable: a sandwich / some water, an apple / some rice. Questions: "Would you like…?" ' +
      'Practice: a short dialogue between a customer and a waiter.',
  },
  {
    title: 'Lesson 4: Last weekend',
    description:
      'Past simple for finished actions. Regular verbs add -ed (played, visited, watched); common irregular verbs: go → went, have → had, ' +
      'see → saw, eat → ate. Questions with did: "What did you do last weekend?" "I went to the beach." ' +
      'Practice: write four sentences about your last weekend.',
  },
];
const STUDENTS = ['Lina Hassan', 'Omar Adel', 'Sara Nabil', 'Youssef Kamal', 'Nour Samir', 'Adam Fathy'];

const randomHash = () => bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);

async function upsertUser(u: { email: string; role: string; name: string; studentId?: string }) {
  const existing = await User.findOne({ email: u.email }).select('institutionId').lean();
  if (existing && existing.institutionId !== T) throw new Error(`refusing to take over ${u.email}`);
  return User.findOneAndUpdate(
    { email: u.email },
    {
      $set: { role: u.role, name: u.name, institutionId: T, status: 'active', origin: 'live', ...(u.studentId ? { studentId: u.studentId } : {}) },
      $setOnInsert: { email: u.email, password: await randomHash() },
    },
    { upsert: true, new: true },
  );
}

export async function buildDemoTemplate(now = new Date()) {
  // Every feature on, so the demo shows the whole platform; adult learners.
  await Institution.updateOne(
    { id: T },
    { $set: { name: 'Enara Demo School (template)', features: Object.fromEntries(ALL_FLAGS.map((f) => [f, true])), 'learningSettings.adultLearners': true } },
    { upsert: true },
  );
  // Template work by Enara admins is budgeted like any school.
  await OrgBudget.updateOne(
    { institutionId: T },
    {
      $setOnInsert: {
        institutionId: T, enforcementEnabled: true, dailyCapUsd: 10, monthlyCapUsd: 30, perUserDailyCapUsd: 10, gradingAllowanceUsd: 5,
        intendedTools: ['anthropic:*', 'elevenlabs:tts', 'elevenlabs:stt', 'anam:avatar_session'],
        maxReservationUsdPerCall: { 'anam:avatar_session': 1, 'elevenlabs:stt': 0.1, 'elevenlabs:speaking_exam_stt': 0.1, 'orchestrator:tutor_chat': 0.1, 'ingestion_engine:curriculum_ingestion': 0.5 },
      },
    },
    { upsert: true },
  );
  const teacher = await upsertUser({ email: DEMO_TEMPLATE_EMAILS.teacher, role: 'teacher', name: 'Maya Teacher' });
  await upsertUser({ email: DEMO_TEMPLATE_EMAILS.admin, role: 'admin', name: 'Rana School Admin' });
  const teacherId = teacher!._id.toString();

  const students = STUDENTS.map((name, i) => ({
    id: ID.student(i + 1),
    name,
    email: i === 0 ? DEMO_TEMPLATE_EMAILS.student : `student${i + 1}@${T}.demo.enara.test`,
  }));
  for (const s of students) {
    await Student.updateOne(
      { id: s.id },
      { $set: { name: s.name, email: s.email, grade: 'Adult learner (A2)', avatar: initialsFromName(s.name), institutionId: T, batchId: ID.batch, origin: 'live' } },
      { upsert: true },
    );
    await upsertUser({ email: s.email, role: 'student', name: s.name, studentId: s.id });
  }

  await Batch.updateOne(
    { id: ID.batch },
    { $set: { name: 'Everyday English A2', institutionId: T, academicYear: String(now.getUTCFullYear()), studentCount: students.length, curriculumId: ID.curriculum, origin: 'live' } },
    { upsert: true },
  );
  await Curriculum.updateOne(
    { id: ID.curriculum },
    {
      $set: {
        name: 'Everyday English A2', institutionId: T, courseName: 'Everyday English A2', type: 'Language', level: 'A2', languages: ['English'],
        summary: 'Four short lessons for adult beginners: introductions, daily routines, ordering at a café and talking about the past.',
        description: 'An original Enara sample course for the demo.', lastUpdated: now.toISOString().slice(0, 10), subjectsCount: LESSONS.length,
        assignedBatches: ['Everyday English A2'], status: 'deployed', createdBy: teacherId, origin: 'live',
        chapters: LESSONS.map((l, i) => ({ id: ID.lesson(i + 1), title: l.title, description: l.description, uploads: [] })),
      },
    },
    { upsert: true },
  );
  await CourseInstance.updateOne(
    { id: ID.klass },
    {
      $set: {
        courseId: ID.course, courseName: 'Everyday English A2', institutionId: T, academicYear: String(now.getUTCFullYear()), batchId: ID.batch,
        curriculumId: ID.curriculum, instructorIds: [teacherId], studentIds: students.map((s) => s.id), visibility: 'student', isDemo: false, origin: 'live',
      },
    },
    { upsert: true },
  );
  return { institutionId: T, students: students.length, lessons: LESSONS.length, accounts: Object.keys(DEMO_TEMPLATE_EMAILS) as DemoRole[] };
}

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type TestApp = ReturnType<typeof import('../src/app').createApp>;
type UserModel = typeof import('../src/models/User').User;
type StudentModel = typeof import('../src/models/Student').Student;
type CourseInstanceModel = typeof import('../src/models/CourseInstance').CourseInstance;
type AttendanceSessionModel = typeof import('../src/models/AttendanceSession').AttendanceSession;
type AttendanceRecordModel = typeof import('../src/models/AttendanceRecord').AttendanceRecord;

let mongo: MongoMemoryServer;
let app: TestApp;
let User: UserModel;
let Student: StudentModel;
let CourseInstance: CourseInstanceModel;
let AttendanceSession: AttendanceSessionModel;
let AttendanceRecord: AttendanceRecordModel;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;

const jwtSecret = 'test-jwt-secret-32-characters-minimum';
const hmacSecret = 'test-hmac-secret-32-characters-minimum';

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend',
    JWT_AUDIENCE: 'enara-platform',
    INGEST_HMAC_SECRET: hmacSecret,
    INGEST_HMAC_TOLERANCE_SECONDS: '300',
    INGEST_ACCEPT_LEGACY_SIGNATURES: 'false',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999',
    ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998',
    AWS_S3_BUCKET: 'test-bucket',
    TRUST_PROXY: 'false',
    SERVE_LOCAL_UPLOADS: 'false',
  });

  const env = await import('../src/config/env');
  env.resetConfigForTests();

  ({ User } = await import('../src/models/User'));
  ({ Student } = await import('../src/models/Student'));
  ({ CourseInstance } = await import('../src/models/CourseInstance'));
  ({ AttendanceSession } = await import('../src/models/AttendanceSession'));
  ({ AttendanceRecord } = await import('../src/models/AttendanceRecord'));
  ({ signAccessToken } = await import('../src/auth/jwt'));

  await mongoose.connect(mongo.getUri());
  const { createApp } = await import('../src/app');
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Student.deleteMany({}),
    CourseInstance.deleteMany({}),
    AttendanceSession.deleteMany({}),
    AttendanceRecord.deleteMany({}),
  ]);
});

async function createUser(params: {
  email: string;
  role?: 'student' | 'teacher' | 'admin' | 'enara-admin';
  institutionId?: string;
}) {
  return User.create({
    email: params.email,
    password: await bcrypt.hash('Password123!', 10),
    role: params.role || 'teacher',
    name: params.email.split('@')[0],
    institutionId: params.institutionId,
    status: 'active',
  });
}

async function bearer(params: Parameters<typeof createUser>[0]) {
  const user = await createUser(params);
  return {
    user,
    token: signAccessToken({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
    }),
  };
}

function auth(token: string) {
  return `Bearer ${token}`;
}

async function seedClassWithRoster(params: {
  courseInstanceId: string;
  institutionId: string;
  instructorId: string;
  studentIds: string[];
}) {
  for (const studentId of params.studentIds) {
    await Student.create({
      id: studentId,
      name: `Student ${studentId}`,
      email: `${studentId}@example.com`,
      grade: 'Grade 8',
      institutionId: params.institutionId,
      batchId: 'batchA',
    });
  }
  await CourseInstance.create({
    id: params.courseInstanceId,
    courseId: 'courseA',
    courseName: 'Mathematics',
    institutionId: params.institutionId,
    academicYear: '2026',
    batchId: 'batchA',
    studentIds: params.studentIds,
    instructorIds: [params.instructorId],
  });
}

describe('teacher attendance', () => {
  it('lists only classes the teacher instructs', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    const otherTeacher = await bearer({ email: 'teacher-b@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1', 'stu2'],
    });
    await seedClassWithRoster({
      courseInstanceId: 'classB',
      institutionId: 'instA',
      instructorId: otherTeacher.user._id.toString(),
      studentIds: ['stu3'],
    });

    const res = await request(app)
      .get('/api/teacher/attendance/classes')
      .set('Authorization', auth(teacher.token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].courseInstanceId).toBe('classA');
  });

  it('returns the roster reflecting CourseInstance.studentIds', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1', 'stu2'],
    });

    const res = await request(app)
      .get('/api/teacher/attendance/roster')
      .query({ courseInstanceId: 'classA', date: '2026-09-09' })
      .set('Authorization', auth(teacher.token));

    expect(res.status).toBe(200);
    expect(res.body.roster.map((r: { studentId: string }) => r.studentId).sort()).toEqual(['stu1', 'stu2']);
    expect(res.body.session).toBeNull();
  });

  it('saves attendance, is idempotent on repeat save, and reload returns the same records', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1', 'stu2'],
    });

    const payload = {
      courseInstanceId: 'classA',
      attendanceDate: '2026-09-09',
      records: [
        { studentId: 'stu1', status: 'present' },
        { studentId: 'stu2', status: 'absent', publicNote: 'Sick leave' },
      ],
    };

    const first = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(teacher.token))
      .send(payload);
    const second = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(teacher.token))
      .send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.session.id).toBe(second.body.session.id);

    const sessions = await AttendanceSession.find({ courseInstanceId: 'classA' });
    const records = await AttendanceRecord.find({ attendanceSessionId: first.body.session.id });
    expect(sessions).toHaveLength(1);
    expect(records).toHaveLength(2);
    expect(second.body.summary).toEqual({ present: 1, absent: 1, late: 0, excused: 0, total: 2 });

    const roster = await request(app)
      .get('/api/teacher/attendance/roster')
      .query({ courseInstanceId: 'classA', date: '2026-09-09' })
      .set('Authorization', auth(teacher.token));
    const stu2 = roster.body.roster.find((r: { studentId: string }) => r.studentId === 'stu2');
    expect(stu2.status).toBe('absent');
    expect(stu2.publicNote).toBe('Sick leave');
  });

  it('rejects a record for a student not enrolled in the class', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1'],
    });

    const res = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(teacher.token))
      .send({
        courseInstanceId: 'classA',
        attendanceDate: '2026-09-09',
        records: [{ studentId: 'not-in-roster', status: 'present' }],
      });

    expect(res.status).toBe(400);
  });

  it('prevents a teacher from touching a class they do not instruct', async () => {
    const teacherOwn = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    const teacherOther = await bearer({ email: 'teacher-b@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacherOwn.user._id.toString(),
      studentIds: ['stu1'],
    });

    const roster = await request(app)
      .get('/api/teacher/attendance/roster')
      .query({ courseInstanceId: 'classA' })
      .set('Authorization', auth(teacherOther.token));
    const save = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(teacherOther.token))
      .send({
        courseInstanceId: 'classA',
        attendanceDate: '2026-09-09',
        records: [{ studentId: 'stu1', status: 'present' }],
      });

    expect(roster.status).toBe(404);
    expect(save.status).toBe(404);
  });

  it('prevents cross-institution access even for a valid instructor id match', async () => {
    const teacherA = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    const teacherB = await bearer({ email: 'teacher-b@example.com', role: 'teacher', institutionId: 'instB' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacherA.user._id.toString(),
      studentIds: ['stu1'],
    });

    const res = await request(app)
      .get('/api/teacher/attendance/roster')
      .query({ courseInstanceId: 'classA' })
      .set('Authorization', auth(teacherB.token));

    expect(res.status).toBe(404);
  });

  it('blocks students from every attendance route', async () => {
    const student = await bearer({ email: 'student-a@example.com', role: 'student', institutionId: 'instA' });

    const res = await request(app)
      .get('/api/teacher/attendance/classes')
      .set('Authorization', auth(student.token));

    expect(res.status).toBe(403);
  });

  it('lets an institution admin view (but a teacher of another class cannot submit) and supports submit + history', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1'],
    });

    const saved = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(teacher.token))
      .send({
        courseInstanceId: 'classA',
        attendanceDate: '2026-09-09',
        records: [{ studentId: 'stu1', status: 'present' }],
      });
    const sessionId = saved.body.session.id;

    const submitted = await request(app)
      .post(`/api/teacher/attendance/${sessionId}/submit`)
      .set('Authorization', auth(teacher.token));

    const adminHistory = await request(app)
      .get('/api/teacher/attendance/history')
      .set('Authorization', auth(admin.token));

    const detail = await request(app)
      .get(`/api/teacher/attendance/${sessionId}`)
      .set('Authorization', auth(admin.token));

    expect(submitted.status).toBe(200);
    expect(submitted.body.session.status).toBe('submitted');
    expect(adminHistory.status).toBe(200);
    expect(adminHistory.body).toHaveLength(1);
    expect(adminHistory.body[0].summary.present).toBe(1);
    expect(detail.status).toBe(200);
    expect(detail.body.records[0].studentName).toBe('Student stu1');
  });

  it('stops a teacher changing attendance after it was submitted, but lets an admin correct it', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    const admin = await bearer({ email: 'admin-a@example.com', role: 'admin', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1'],
    });
    const body = { courseInstanceId: 'classA', attendanceDate: '2026-09-10', records: [{ studentId: 'stu1', status: 'present' }] };
    const saved = await request(app).post('/api/teacher/attendance').set('Authorization', auth(teacher.token)).send(body);
    await request(app).post(`/api/teacher/attendance/${saved.body.session.id}/submit`).set('Authorization', auth(teacher.token));

    const changed = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(teacher.token))
      .send({ ...body, records: [{ studentId: 'stu1', status: 'absent' }] });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('ATTENDANCE_SUBMITTED');

    const corrected = await request(app)
      .post('/api/teacher/attendance')
      .set('Authorization', auth(admin.token))
      .send({ ...body, records: [{ studentId: 'stu1', status: 'late' }] });
    expect(corrected.status).toBe(200);
    expect(corrected.body.records[0].status).toBe('late');
  });

  it('handles concurrent double-submit of the same save without duplicating records', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({
      courseInstanceId: 'classA',
      institutionId: 'instA',
      instructorId: teacher.user._id.toString(),
      studentIds: ['stu1', 'stu2'],
    });

    const payload = {
      courseInstanceId: 'classA',
      attendanceDate: '2026-09-09',
      records: [
        { studentId: 'stu1', status: 'present' },
        { studentId: 'stu2', status: 'late' },
      ],
    };

    const [a, b] = await Promise.all([
      request(app).post('/api/teacher/attendance').set('Authorization', auth(teacher.token)).send(payload),
      request(app).post('/api/teacher/attendance').set('Authorization', auth(teacher.token)).send(payload),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const sessions = await AttendanceSession.find({ courseInstanceId: 'classA' });
    const allRecords = await AttendanceRecord.find({});
    expect(sessions).toHaveLength(1);
    expect(allRecords).toHaveLength(2);
  });

  it('retries once when a concurrent save wins the upsert race (duplicate key)', async () => {
    const teacher = await bearer({ email: 'teacher-a@example.com', role: 'teacher', institutionId: 'instA' });
    await seedClassWithRoster({ courseInstanceId: 'classA', institutionId: 'instA', instructorId: teacher.user._id.toString(), studentIds: ['stu1'] });
    const payload = { courseInstanceId: 'classA', attendanceDate: '2026-09-10', records: [{ studentId: 'stu1', status: 'present' }] };
    // Simulate losing the race: the first upsert of each kind fails as MongoDB reports it (E11000).
    const duplicate = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    const s = vi.spyOn(AttendanceSession, 'findOneAndUpdate').mockImplementationOnce(() => { throw duplicate; });
    const r = vi.spyOn(AttendanceRecord, 'bulkWrite').mockRejectedValueOnce(duplicate);
    try {
      const res = await request(app).post('/api/teacher/attendance').set('Authorization', auth(teacher.token)).send(payload);
      expect(res.status).toBe(200);
      expect(s).toHaveBeenCalledTimes(2);
      expect(r).toHaveBeenCalledTimes(2);
      expect(await AttendanceRecord.find({})).toHaveLength(1);
    } finally {
      s.mockRestore();
      r.mockRestore();
    }
  });
});

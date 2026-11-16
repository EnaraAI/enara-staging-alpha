import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Test-deployment maintenance (src/maintenance): the routes exist only when
// switched on, with a token, AND when MONGODB_URI is the test cluster. The
// fake seed is idempotent and contains no real-looking personal data.

const TOKEN = 't'.repeat(40);
const TEST_URI = 'mongodb+srv://u:p@enara-lms-test.abc123.mongodb.net/enara_staging_alpha';
const REAL_URI = 'mongodb+srv://u:p@enara-production.abc123.mongodb.net/enara_staging_alpha';
let mongo: MongoMemoryServer;
let resetConfig: () => void;

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  resetConfig();
}
const app = async () => (await import('../src/app')).createApp();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  resetConfig = (await import('../src/config/env')).resetConfigForTests;
  setEnv({ MONGODB_URI: mongo.getUri() });
  await mongoose.connect(mongo.getUri()); // the app's config URI below is only used for the safety check
});
afterAll(async () => {
  setEnv({ MAINTENANCE_ENDPOINTS_ENABLED: undefined, MAINTENANCE_TOKEN: undefined });
  await mongoose.disconnect();
  await mongo.stop();
});

describe('safety checks', () => {
  it('maintenanceAllowed needs the switch, a long token and the test cluster', async () => {
    const { maintenanceAllowed, mongoHost } = await import('../src/maintenance/routes');
    expect(mongoHost(TEST_URI)).toBe('enara-lms-test.abc123.mongodb.net');
    expect(mongoHost('mongodb://user:pa@ss@host1:27017,host2/db')).toBe('host1');
    expect(mongoHost('mongodb+srv://u:p@enara-lms-test.x.net@evil.com/db')).toBe('evil.com');
    expect(maintenanceAllowed({}, TEST_URI)).toBe(false);
    expect(maintenanceAllowed({ MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: 'short' }, TEST_URI)).toBe(false);
    expect(maintenanceAllowed({ MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN }, REAL_URI)).toBe(false);
    expect(maintenanceAllowed({ MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN }, 'mongodb+srv://u:p@evil.com/enara-lms-test.x')).toBe(false);
    expect(maintenanceAllowed({ MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN }, TEST_URI)).toBe(true);
  });

  it('switched off (default): every route is 404, even with the token', async () => {
    setEnv({ MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: undefined, MAINTENANCE_TOKEN: TOKEN });
    const a = await app();
    expect((await request(a).post('/api/maintenance/migrate').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(404);
    expect((await request(a).get('/api/maintenance/status').set('Authorization', `Bearer ${TOKEN}`)).status).toBe(404);
  });

  it('switched on but pointed at another cluster (e.g. the real database): 404', async () => {
    setEnv({ MONGODB_URI: REAL_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN });
    expect((await request(await app()).post('/api/maintenance/seed-lms-test').set('Authorization', `Bearer ${TOKEN}`).send({ password: 'x'.repeat(16) })).status).toBe(404);
  });

  it('on the test cluster: wrong or missing token is 401; the right token works', async () => {
    setEnv({ MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN });
    const a = await app();
    expect((await request(a).get('/api/maintenance/status')).status).toBe(401);
    expect((await request(a).get('/api/maintenance/status').set('Authorization', `Bearer ${'u'.repeat(40)}`)).status).toBe(401);
    const s = await request(a).get('/api/maintenance/status').set('Authorization', `Bearer ${TOKEN}`);
    expect(s.status).toBe(200);
    expect(Array.isArray(s.body.pendingMigrations)).toBe(true);
    expect(JSON.stringify(s.body)).not.toMatch(/mongodb/);
  });
});

describe('migrate and seed through the route', () => {
  it('migrate applies pending migrations once', async () => {
    setEnv({ MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN });
    const a = await app();
    const first = await request(a).post('/api/maintenance/migrate').set('Authorization', `Bearer ${TOKEN}`);
    expect(first.status).toBe(200);
    expect(first.body.applied).toEqual(expect.arrayContaining(['2026-11-16-lms-phase0-indexes', '2026-11-17-class-enrollments-step1']));
    expect(first.body.pending).toEqual([]);
    expect((await request(a).post('/api/maintenance/migrate').set('Authorization', `Bearer ${TOKEN}`)).body.applied).toEqual([]);
  }, 60_000);

  it('seed needs a password, is idempotent, and the fake data has the real shapes', async () => {
    setEnv({ MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN });
    const a = await app();
    expect((await request(a).post('/api/maintenance/seed-lms-test').set('Authorization', `Bearer ${TOKEN}`).send({})).status).toBe(400);
    const pw = 'FakeTestPass-2026!';
    const r1 = await request(a).post('/api/maintenance/seed-lms-test').set('Authorization', `Bearer ${TOKEN}`).send({ password: pw });
    expect(r1.status).toBe(200);
    expect(r1.body.seeded).toMatchObject({ schools: 2, groups: 4, classes: 5, students: 22, parents: 3, parentLinks: 4, assessments: 3 });
    const counts = async () => Promise.all(['users', 'students', 'batches', 'courseinstances', 'curricula', 'assessments'].map((c) => mongoose.connection.collection(c).countDocuments()));
    const before = await counts();
    await request(a).post('/api/maintenance/seed-lms-test').set('Authorization', `Bearer ${TOKEN}`).send({ password: pw });
    expect(await counts()).toEqual(before);

    const { User } = await import('../src/models/User');
    const { Student } = await import('../src/models/Student');
    const { CourseInstance } = await import('../src/models/CourseInstance');
    const { Curriculum } = await import('../src/models/Curriculum');
    expect((await User.find({}).lean()).every((u) => u.email.endsWith('@lms-test.example'))).toBe(true);
    // Shapes: group membership, explicit class members, a student with no group, kids and teens.
    expect(await Student.countDocuments({ batchId: 'LT-G7A' })).toBe(7);
    expect((await Student.findOne({ id: 'LT-S-A18' }).lean())?.batchId).toBeUndefined();
    expect((await CourseInstance.findOne({ id: 'LT-C-MATH-7A' }).lean())?.studentIds).toEqual(['LT-S-A08', 'LT-S-A09']);
    // Not every course is a language course.
    expect((await Curriculum.findOne({ id: 'LT-CUR-MATH-A' }).lean())?.chapters.every((c: any) => !c.languageSpec?.objectives?.length)).toBe(true);
    expect((await Curriculum.findOne({ id: 'LT-CUR-ENG-A' }).lean())?.chapters[0].languageSpec?.objectives?.length).toBeGreaterThan(0);
    // A seeded teacher can log in with the given password.
    const login = await request(a).post('/api/auth/login').send({ email: 'teacher.a1@lms-test.example', password: pw });
    expect(login.status).toBe(200);
  }, 60_000);
});

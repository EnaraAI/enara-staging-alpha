import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Student profile photos: a school admin sets one directly; a student's own
// upload waits for a school admin to approve or reject it. Files go through
// the existing upload storage (local directory here) and signed /uploads links.
let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let User: mongoose.Model<any>;
let Student: mongoose.Model<any>;
let uploadDir: string;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photos-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'true', UPLOAD_DIR: uploadDir,
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  User = (await import('../src/models/User')).User;
  Student = (await import('../src/models/Student')).Student;
  await User.createIndexes();
  app = (await import('../src/app')).createApp();
}, 120_000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

const PW = 'student-photo-password-1';
async function account(email: string, role: string, institutionId = 'instA') {
  await User.create({ email, password: await bcrypt.hash(PW, 4), role, name: email, status: 'active', institutionId });
}
async function token(email: string) {
  return (await request(app).post('/api/auth/login').send({ email, password: PW })).body.token as string;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

let adminA: string; let adminB: string; let enara: string; let studentA: string; let studentA2: string;
let sA: any; let sA2: any;

describe('student profile photos', () => {
  beforeAll(async () => {
    await account('admin-a@p.test', 'admin');
    await account('admin-b@p.test', 'admin', 'instB');
    await account('enara@p.test', 'enara-admin', 'enaraHQ');
    await account('teacher-a@p.test', 'teacher');
    await account('stu-a@p.test', 'student');
    await account('stu-a2@p.test', 'student');
    adminA = await token('admin-a@p.test');
    adminB = await token('admin-b@p.test');
    enara = await token('enara@p.test');
    studentA = await token('stu-a@p.test');
    studentA2 = await token('stu-a2@p.test');
    sA = await Student.findOne({ email: 'stu-a@p.test' }).lean();
    sA2 = await Student.findOne({ email: 'stu-a2@p.test' }).lean();
  });

  it('a school admin sets a student photo; it shows at once in the list, detail and the student profile', async () => {
    const res = await request(app).put(`/api/students/${sA.id}/photo`).set(auth(adminA)).attach('photo', PNG, { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toMatch(/^\/uploads\/instA~[0-9a-f-]{36}-me\.png\?exp=\d+&sig=[a-f0-9]+$/);

    const list = await request(app).get('/api/students').set(auth(adminA));
    expect(list.body.find((s: any) => s.id === sA.id).photoUrl).toMatch(/\?exp=\d+&sig=/);
    const detail = await request(app).get(`/api/students/${sA.id}`).set(auth(adminA));
    expect(detail.body.photoUrl).toMatch(/\?exp=\d+&sig=/);

    const me = await request(app).get('/api/me').set(auth(studentA));
    expect(me.body.photoUrl).toMatch(/\?exp=\d+&sig=/);
    expect(me.body.photoPending).toBe(false);

    // The signed link serves the image.
    const file = await request(app).get(me.body.photoUrl);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body).subarray(0, 4)).toEqual(PNG.subarray(0, 4));
  });

  it('replacing the photo also takes effect immediately', async () => {
    const before = (await Student.findOne({ id: sA.id }).lean() as any).photoUrl;
    const res = await request(app).put(`/api/students/${sA.id}/photo`).set(auth(adminA)).attach('photo', JPG, { filename: 'new.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    const after = (await Student.findOne({ id: sA.id }).lean() as any).photoUrl;
    expect(after).not.toBe(before);
    expect(after).toMatch(/-new\.jpg$/);
  });

  it('rejects non-images and missing files', async () => {
    const txt = await request(app).put(`/api/students/${sA.id}/photo`).set(auth(adminA)).attach('photo', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(415);
    const fake = await request(app).put(`/api/students/${sA.id}/photo`).set(auth(adminA)).attach('photo', Buffer.from('not a png at all'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
    const none = await request(app).put(`/api/students/${sA.id}/photo`).set(auth(adminA));
    expect(none.status).toBe(400);
  });

  it('an admin of another school gets 403; an ENARA admin may set any school\'s', async () => {
    const other = await request(app).put(`/api/students/${sA.id}/photo`).set(auth(adminB)).attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(other.status).toBe(403);
    expect((await request(app).post(`/api/students/${sA.id}/photo/approve`).set(auth(adminB))).status).toBe(403);
    expect((await request(app).post(`/api/students/${sA.id}/photo/reject`).set(auth(adminB))).status).toBe(403);
    const global = await request(app).put(`/api/students/${sA2.id}/photo`).set(auth(enara)).attach('photo', PNG, { filename: 'g.png', contentType: 'image/png' });
    expect(global.status).toBe(200);
  });

  it('students and teachers cannot use the admin endpoints (a student cannot set another student\'s photo)', async () => {
    const r = await request(app).put(`/api/students/${sA2.id}/photo`).set(auth(studentA)).attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' });
    expect(r.status).toBe(403);
    expect((await request(app).put(`/api/students/${sA.id}/photo`).set(auth(studentA)).attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' })).status).toBe(403);
    expect((await request(app).post(`/api/students/${sA.id}/photo/approve`).set(auth(studentA))).status).toBe(403);
    expect((await request(app).get('/api/students/photos/pending').set(auth(studentA))).status).toBe(403);
    const teacher = await token('teacher-a@p.test');
    expect((await request(app).get('/api/students/photos/pending').set(auth(teacher))).status).toBe(403);
    // Staff cannot use the student's own upload.
    expect((await request(app).post('/api/me/photo').set(auth(adminA)).attach('photo', PNG, { filename: 'x.png', contentType: 'image/png' })).status).toBe(403);
  });

  it('a student upload stays pending (not the profile photo) until a school admin approves it', async () => {
    const current = (await Student.findOne({ id: sA.id }).lean() as any).photoUrl;
    const up = await request(app).post('/api/me/photo').set(auth(studentA)).attach('photo', PNG, { filename: 'selfie.png', contentType: 'image/png' });
    expect(up.status).toBe(202);
    expect(up.body.photoPending).toBe(true);

    const me = await request(app).get('/api/me').set(auth(studentA));
    expect(me.body.photoPending).toBe(true);
    expect(me.body.photoUrl.split('?')[0]).toBe(current);
    expect(me.body.pendingPhotoUrl).toBeUndefined();
    expect(JSON.stringify(me.body)).not.toContain('selfie');
    const detail = await request(app).get(`/api/students/${sA.id}`).set(auth(adminA));
    expect(detail.body.photoUrl.split('?')[0]).toBe(current);

    const pendingA = await request(app).get('/api/students/photos/pending').set(auth(adminA));
    expect(pendingA.status).toBe(200);
    const row = pendingA.body.find((p: any) => p.id === sA.id);
    expect(row.pendingPhotoUrl).toMatch(/-selfie\.png\?exp=\d+&sig=/);
    // Another school's queue doesn't list it.
    const pendingB = await request(app).get('/api/students/photos/pending').set(auth(adminB));
    expect(pendingB.body.find((p: any) => p.id === sA.id)).toBeUndefined();

    const ok = await request(app).post(`/api/students/${sA.id}/photo/approve`).set(auth(adminA));
    expect(ok.status).toBe(200);
    expect(ok.body.photoUrl).toMatch(/-selfie\.png\?exp=/);
    expect(ok.body.pendingPhotoUrl).toBeNull();
    const after = await request(app).get('/api/me').set(auth(studentA));
    expect(after.body.photoUrl).toMatch(/-selfie\.png\?exp=/);
    expect(after.body.photoPending).toBe(false);
    expect((await request(app).post(`/api/students/${sA.id}/photo/approve`).set(auth(adminA))).status).toBe(409);
  });

  it('a rejected upload is discarded and the current photo stays', async () => {
    const current = (await Student.findOne({ id: sA.id }).lean() as any).photoUrl;
    await request(app).post('/api/me/photo').set(auth(studentA)).attach('photo', JPG, { filename: 'bad.jpg', contentType: 'image/jpeg' });
    const pendingKey = (await Student.findOne({ id: sA.id }).lean() as any).pendingPhotoKey;
    const no = await request(app).post(`/api/students/${sA.id}/photo/reject`).set(auth(adminA));
    expect(no.status).toBe(200);
    expect(no.body.pendingPhotoUrl).toBeNull();
    const s = await Student.findOne({ id: sA.id }).lean() as any;
    expect(s.photoUrl).toBe(current);
    expect(s.pendingPhotoUrl).toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(path.join(uploadDir, pendingKey))).toBe(false);
    expect((await request(app).post(`/api/students/${sA.id}/photo/reject`).set(auth(adminA))).status).toBe(409);
  });

  it('a student with no photo uploads one: nothing shows until approved', async () => {
    await Student.updateOne({ id: sA2.id }, { $unset: { photoUrl: 1, photoKey: 1 } });
    await request(app).post('/api/me/photo').set(auth(studentA2)).attach('photo', PNG, { filename: 'first.png', contentType: 'image/png' });
    const me = await request(app).get('/api/me').set(auth(studentA2));
    expect(me.body.photoUrl).toBeUndefined();
    expect(me.body.photoPending).toBe(true);
    // Another school's admin cannot approve it.
    expect((await request(app).post(`/api/students/${sA2.id}/photo/approve`).set(auth(adminB))).status).toBe(403);
    expect((await request(app).post(`/api/students/${sA2.id}/photo/approve`).set(auth(adminA))).status).toBe(200);
  });
});

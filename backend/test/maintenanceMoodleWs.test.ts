import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// TEST-ONLY Moodle Web Services tool (src/maintenance/moodleTestWs.ts).
// Moodle is faked by stubbing fetch; nothing leaves the test.

const TOKEN = 't'.repeat(40);
const WS_TOKEN = 'moodle-ws-secret-token-0123456789';
const BASE = 'https://lms-test-enara.moodlecloud.example';
const TEST_URI = 'mongodb+srv://u:p@enara-lms-test.abc123.mongodb.net/enara_staging_alpha';
const REAL_URI = 'mongodb+srv://u:p@enara-production.abc123.mongodb.net/enara_staging_alpha';
let mongo: MongoMemoryServer;
let resetConfig: () => void;

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  resetConfig();
}
const app = async () => (await import('../src/app')).createApp();
const ON = { MONGODB_URI: TEST_URI, MAINTENANCE_ENDPOINTS_ENABLED: 'true', MAINTENANCE_TOKEN: TOKEN, MOODLE_TEST_WS_ENABLED: 'true', MOODLE_TEST_WS_TOKEN: WS_TOKEN, MOODLE_TEST_WS_URL: BASE };

// A tiny fake Moodle: one course, one LTI activity, enrolments and grades.
interface Call { fn: string; params: URLSearchParams }
let calls: Call[] = [];
function fakeMoodle() {
  const users = new Map<string, number>([['student.test', 3], ['teacher.test', 2]]);
  const enrolled = new Map<number, string>([[3, 'student'], [2, 'editingteacher']]);
  let nextId = 10;
  const grades = new Map<number, number>();
  return vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(`${BASE}/webservice/rest/server.php`);
    const p = new URLSearchParams(String(init.body));
    expect(p.get('wstoken')).toBe(WS_TOKEN);
    const fn = p.get('wsfunction')!;
    calls.push({ fn, params: p });
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    switch (fn) {
      case 'core_course_get_courses_by_field': {
        const id = Number(p.get('value'));
        expect(p.get('field')).toBe('id');
        return json({ courses: [7, 8].includes(id) ? [{ id, shortname: id === 7 ? 'Enara Test' : 'Other' }] : [] });
      }
      case 'core_course_get_contents': return json([{ modules: [{ id: 41, instance: 4, name: 'ENARA graded quiz', modname: 'lti' }, { id: 42, instance: 1, name: 'Forum', modname: 'forum' }] }]);
      case 'core_user_get_users_by_field': {
        const u = p.get('values[0]')!;
        return json(users.has(u) ? [{ id: users.get(u), username: u, email: 'x@example.com', fullname: 'Should Not Leak' }] : []);
      }
      case 'core_user_create_users': {
        const id = nextId++;
        users.set(p.get('users[0][username]')!, id);
        return json([{ id, username: p.get('users[0][username]') }]);
      }
      case 'core_user_delete_users': return json(null);
      case 'core_enrol_get_enrolled_users':
        return json([...enrolled].map(([id, role]) => ({ id, username: [...users].find(([, v]) => v === id)?.[0], fullname: 'Should Not Leak', email: 'x@example.com', roles: [{ roleid: role === 'student' ? 5 : 3, shortname: role }] })));
      case 'enrol_manual_enrol_users': enrolled.set(Number(p.get('enrolments[0][userid]')), 'student'); return json(null);
      case 'enrol_manual_unenrol_users': enrolled.delete(Number(p.get('enrolments[0][userid]'))); return json(null);
      case 'core_grades_update_grades': grades.set(Number(p.get('grades[0][studentid]')), Number(p.get('grades[0][grade]'))); return json(0);
      default: return json({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: `no access, token ${WS_TOKEN}` });
    }
  });
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', JWT_SECRET: 'test-jwt-secret-32-characters-minimum', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false',
  });
  resetConfig = (await import('../src/config/env')).resetConfigForTests;
  setEnv({ MONGODB_URI: mongo.getUri() });
  await mongoose.connect(mongo.getUri());
  const { LmsContext, LmsPlatform } = await import('../src/integrations/lms/models');
  const p = await LmsPlatform.create({ institutionId: 'LT-SCHOOL-A', provider: 'lti13', vendor: 'moodle', issuer: BASE, clientId: 'c1', registeredVia: 'manual', status: 'active' });
  await LmsContext.create({ institutionId: 'LT-SCHOOL-A', platformId: p.id, externalContextId: '7', title: 'Fake course', status: 'active' });
});
afterEach(() => { vi.unstubAllGlobals(); calls = []; });
afterAll(async () => {
  setEnv(Object.fromEntries(Object.keys(ON).map((k) => [k, undefined])));
  await mongoose.disconnect();
  await mongo.stop();
});

const post = async (body: Record<string, unknown>) => request(await app()).post('/api/maintenance/moodle-ws').set('Authorization', `Bearer ${TOKEN}`).send(body);

describe('guards: disabled everywhere except lms-test with its own switch', () => {
  it('404 without its switch, without the token, with a non-https URL, or on another cluster; 401 without the operator token', async () => {
    const f = fakeMoodle();
    vi.stubGlobal('fetch', f);
    for (const off of [{ MOODLE_TEST_WS_ENABLED: undefined }, { MOODLE_TEST_WS_TOKEN: undefined }, { MOODLE_TEST_WS_URL: 'http://lms-test-enara.moodlecloud.example' }, { MONGODB_URI: REAL_URI }, { MAINTENANCE_ENDPOINTS_ENABLED: undefined }]) {
      setEnv({ ...ON, ...off });
      expect((await post({ action: 'find-course' })).status, JSON.stringify(off)).toBe(404);
    }
    setEnv(ON);
    expect((await request(await app()).post('/api/maintenance/moodle-ws').send({ action: 'find-course' })).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  }, 60_000);

  it('a URL that is not a registered platform issuer is refused before any Moodle call', async () => {
    const f = fakeMoodle();
    vi.stubGlobal('fetch', f);
    setEnv({ ...ON, MOODLE_TEST_WS_URL: 'https://other.moodlecloud.example' });
    const r = await post({ action: 'find-course' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('platform_not_registered');
    expect(f).not.toHaveBeenCalled();
  });

  it('only the fixed actions, the fake course and the fake users', async () => {
    vi.stubGlobal('fetch', fakeMoodle());
    setEnv(ON);
    expect((await post({ action: 'core_user_update_users' })).body.error).toBe('action_not_allowed');
    // A Moodle course that is not linked to ENARA is refused before any Moodle call.
    expect((await post({ action: 'list-enrolled', courseId: 8 })).body.error).toBe('course_not_linked');
    expect(calls).toEqual([]);
    expect((await post({ action: 'find-course' })).body).toMatchObject({ courseId: 7, shortname: 'Enara Test', linkedCourseIds: [7] });
    expect((await post({ action: 'create-user', username: 'admin' })).body.error).toBe('username_not_allowed');
    expect((await post({ action: 'delete-user', username: 'student.test' })).body.error).toBe('username_not_allowed');
    expect((await post({ action: 'unenrol', username: 'teacher.test' })).body.error).toBe('username_not_allowed');
    expect((await post({ action: 'set-grade', username: 'teacher.test', activity: 'ENARA graded quiz', grade: 90 })).body.error).toBe('username_not_allowed');
    expect((await post({ action: 'set-grade', username: 'student.test', activity: 'ENARA graded quiz', grade: 101 })).body.error).toBe('grade_out_of_range');
    expect(calls.map((c) => c.fn).filter((f) => !f.startsWith('core_course_get') && !f.startsWith('core_user_get'))).toEqual([]);
  });
});

describe('actions against the fake Moodle', () => {
  it('create, enrol, list, suspend, unenrol, delete student2.test; set a grade; IDs only, token never echoed', async () => {
    vi.stubGlobal('fetch', fakeMoodle());
    setEnv(ON);
    const created = await post({ action: 'create-user', username: 'student2.test' });
    expect(created.body).toMatchObject({ created: true, moodleUserId: 10 });
    const createCall = calls.find((c) => c.fn === 'core_user_create_users')!;
    expect(createCall.params.get('users[0][password]')).toMatch(/Aa1!$/);
    expect(JSON.stringify(created.body)).not.toMatch(/password|Aa1!/);
    expect((await post({ action: 'create-user', username: 'student2.test' })).body).toMatchObject({ created: false, moodleUserId: 10 });

    expect((await post({ action: 'enrol', username: 'student2.test' })).body).toMatchObject({ moodleUserId: 10, courseId: 7, roleId: 5, suspended: false });
    const list = await post({ action: 'list-enrolled' });
    expect(list.body.count).toBe(3);
    expect(JSON.stringify(list.body)).not.toMatch(/Should Not Leak|example\.com/);
    expect((await post({ action: 'suspend', username: 'student2.test' })).body.suspended).toBe(true);
    expect(calls.filter((c) => c.fn === 'enrol_manual_enrol_users').at(-1)!.params.get('enrolments[0][suspend]')).toBe('1');
    expect((await post({ action: 'unenrol', username: 'student2.test' })).body.unenrolled).toBe(true);

    const g = await post({ action: 'set-grade', username: 'student.test', activity: 'ENARA graded quiz', grade: 90 });
    expect(g.body).toMatchObject({ moodleUserId: 3, cmId: 41, grade: 90, status: 'ok' });
    const gradeCall = calls.find((c) => c.fn === 'core_grades_update_grades')!;
    expect(Object.fromEntries(gradeCall.params)).toMatchObject({ component: 'mod_lti', activityid: '41', itemnumber: '0', courseid: '7', 'grades[0][studentid]': '3', 'grades[0][grade]': '90' });

    expect((await post({ action: 'delete-user', username: 'student2.test' })).body).toMatchObject({ deleted: true, moodleUserId: 10 });

    const { LmsAuditLog } = await import('../src/integrations/lms/models');
    const rows = await LmsAuditLog.find({ event: 'test_ws.call' }).lean();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(WS_TOKEN);
    expect(dump).not.toMatch(/Should Not Leak|example\.com|student2\.test/);
    expect(rows.find((r) => r.refIds.action === 'set-grade' && r.outcome === 'ok')?.refIds).toMatchObject({ moodleUserId: 3, cmId: 41, grade: 90, wsFunction: 'core_grades_update_grades' });
  });

  it('a Moodle exception becomes an error code; the token is scrubbed from the message and the failure is audited', async () => {
    const f = fakeMoodle();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const fn = new URLSearchParams(String(init.body)).get('wsfunction');
      if (fn === 'core_grades_update_grades') return new Response(JSON.stringify({ exception: 'x', errorcode: 'accessexception', message: `bad token ${WS_TOKEN}` }), { status: 200 });
      return f(url, init);
    }));
    setEnv(ON);
    const r = await post({ action: 'set-grade', username: 'student.test', activity: 'ENARA graded quiz', grade: 50 });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('accessexception');
    expect(JSON.stringify(r.body)).not.toContain(WS_TOKEN);
    const { LmsAuditLog } = await import('../src/integrations/lms/models');
    expect(await LmsAuditLog.countDocuments({ event: 'test_ws.call', outcome: 'fail', code: 'accessexception' })).toBe(1);
  });
});

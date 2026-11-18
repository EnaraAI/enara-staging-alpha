import { randomBytes } from 'crypto';
import { writeLmsAudit } from '../integrations/lms/core/audit';
import { LmsPlatform } from '../integrations/lms/models';

// TEST-ONLY Moodle Web Services client for lms-test.enara.app (Phase 4 checks
// run without the owner clicking in Moodle). Reached only through the
// maintenance router, so every guard there applies (switch, operator token,
// test cluster) plus all of these, or the route answers 404:
//   - MOODLE_TEST_WS_ENABLED=true (lms-test project only);
//   - MOODLE_TEST_WS_TOKEN set (a Sensitive Vercel env var; never logged,
//     never returned, sent only in the POST body to the Moodle site);
//   - MOODLE_TEST_WS_URL is https and equals the issuer of an LMS platform
//     registered in this (test) database.
// Only the fixed actions below exist: no pass-through of arbitrary Moodle
// functions. Writes are limited to the one fake course and the fake test
// users. Every call is audited in lms_audit_log with Moodle IDs only.

export const ALLOWED_COURSE = 'ENARATEST';
/** Fake users the tool may create, delete, enrol or unenrol. */
export const CREATABLE_USERS = ['student2.test'] as const;
/** Fake users whose grade the tool may change (check 5). */
export const GRADABLE_USERS = ['student.test', 'student2.test'] as const;
export const MOODLE_WS_ACTIONS = ['find-course', 'find-activity', 'find-user', 'list-enrolled', 'create-user', 'delete-user', 'enrol', 'suspend', 'unenrol', 'set-grade'] as const;
export type MoodleWsAction = (typeof MOODLE_WS_ACTIONS)[number];

const CALL_TIMEOUT_MS = 15_000;

export function moodleWsConfigured(env: NodeJS.ProcessEnv): boolean {
  return env.MOODLE_TEST_WS_ENABLED === 'true' && (env.MOODLE_TEST_WS_TOKEN ?? '').length >= 16 && /^https:\/\/[^/]+$/.test((env.MOODLE_TEST_WS_URL ?? '').replace(/\/$/, ''));
}

export class MoodleWsError extends Error {
  constructor(public readonly code: string, public readonly status = 502, message?: string) {
    super(message ?? code);
  }
}

/** Moodle's REST form encoding: users[0][username]=x, values[0]=y. */
export function flattenParams(value: unknown, prefix = '', out: [string, string][] = []): [string, string][] {
  if (Array.isArray(value)) value.forEach((v, i) => flattenParams(v, `${prefix}[${i}]`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flattenParams(v, prefix ? `${prefix}[${k}]` : k, out);
  } else if (value !== undefined) out.push([prefix, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]);
  return out;
}

interface Ctx {
  base: string;
  token: string;
  institutionId: string;
  platformId: string;
}

async function resolveCtx(env: NodeJS.ProcessEnv): Promise<Ctx> {
  const base = (env.MOODLE_TEST_WS_URL ?? '').replace(/\/$/, '');
  const platform = await LmsPlatform.findOne({ issuer: base, status: 'active' }).select('id institutionId issuer').lean();
  if (!platform) throw new MoodleWsError('platform_not_registered', 409, 'MOODLE_TEST_WS_URL is not the issuer of an active registered LMS platform');
  return { base, token: env.MOODLE_TEST_WS_TOKEN!, institutionId: platform.institutionId, platformId: platform.id };
}

async function call<T>(ctx: Ctx, wsfunction: string, params: Record<string, unknown>): Promise<T> {
  const body = new URLSearchParams([['wstoken', ctx.token], ['wsfunction', wsfunction], ['moodlewsrestformat', 'json'], ...flattenParams(params)]);
  let res: Response;
  try {
    res = await fetch(`${ctx.base}/webservice/rest/server.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    throw new MoodleWsError('network_error');
  }
  if (!res.ok) throw new MoodleWsError(`http_${res.status}`);
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new MoodleWsError('bad_response');
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'exception' in data) {
    const e = data as { errorcode?: unknown; message?: unknown };
    const msg = typeof e.message === 'string' ? e.message.split(ctx.token).join('[token]').slice(0, 300) : undefined;
    throw new MoodleWsError(String(e.errorcode ?? 'moodle_exception').slice(0, 80), 502, msg);
  }
  return data as T;
}

const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new MoodleWsError(`${field}_required`, 400);
  return v.trim();
};
function oneOf<T extends readonly string[]>(v: unknown, allowed: T, field: string): T[number] {
  const s = str(v, field);
  if (!(allowed as readonly string[]).includes(s)) throw new MoodleWsError(`${field}_not_allowed`, 400, `${field} must be one of: ${allowed.join(', ')}`);
  return s as T[number];
}

async function courseId(ctx: Ctx): Promise<number> {
  const r = await call<{ courses?: { id: number; shortname: string }[] }>(ctx, 'core_course_get_courses_by_field', { field: 'shortname', value: ALLOWED_COURSE });
  const c = r.courses?.find((x) => x.shortname === ALLOWED_COURSE);
  if (!c) throw new MoodleWsError('course_not_found', 404);
  return c.id;
}

async function userId(ctx: Ctx, username: string): Promise<number | null> {
  const r = await call<{ id: number; username: string }[]>(ctx, 'core_user_get_users_by_field', { field: 'username', values: [username] });
  return r.find((u) => u.username === username)?.id ?? null;
}

interface EnrolledUser { id: number; username?: string; roles?: { roleid: number; shortname: string }[] }
async function enrolled(ctx: Ctx, cid: number): Promise<EnrolledUser[]> {
  return call<EnrolledUser[]>(ctx, 'core_enrol_get_enrolled_users', { courseid: cid });
}

async function studentRoleId(ctx: Ctx, cid: number): Promise<number> {
  for (const u of await enrolled(ctx, cid)) {
    const r = u.roles?.find((x) => x.shortname === 'student');
    if (r) return r.roleid;
  }
  return 5; // Moodle's default student role id
}

async function ltiActivity(ctx: Ctx, cid: number, name: string): Promise<{ cmid: number; instance: number; name: string }> {
  const sections = await call<{ modules?: { id: number; instance: number; name: string; modname: string }[] }[]>(ctx, 'core_course_get_contents', { courseid: cid });
  const m = sections.flatMap((s) => s.modules ?? []).find((x) => x.modname === 'lti' && x.name === name);
  if (!m) throw new MoodleWsError('activity_not_found', 404);
  return { cmid: m.id, instance: m.instance, name: m.name };
}

/** Runs one fixed action. Returns Moodle IDs and statuses only (no names or emails). */
export async function runMoodleWsAction(env: NodeJS.ProcessEnv, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const action = oneOf(body.action, MOODLE_WS_ACTIONS, 'action');
  const ctx = await resolveCtx(env);
  const audit: Record<string, unknown> = { action };
  try {
    const result = await perform(ctx, action, body, audit);
    await writeLmsAudit({ event: 'test_ws.call', outcome: 'ok', institutionId: ctx.institutionId, platformId: ctx.platformId, actor: 'maintenance', refIds: audit });
    return { action, ...result };
  } catch (error) {
    const code = error instanceof MoodleWsError ? error.code : 'internal_error';
    await writeLmsAudit({ event: 'test_ws.call', outcome: 'fail', institutionId: ctx.institutionId, platformId: ctx.platformId, actor: 'maintenance', refIds: audit, code });
    throw error;
  }
}

async function perform(ctx: Ctx, action: MoodleWsAction, body: Record<string, unknown>, audit: Record<string, unknown>): Promise<Record<string, unknown>> {
  const cid = await courseId(ctx);
  audit.courseId = cid;
  switch (action) {
    case 'find-course':
      return { courseId: cid, shortname: ALLOWED_COURSE };
    case 'find-activity': {
      const a = await ltiActivity(ctx, cid, str(body.name, 'name'));
      audit.cmId = a.cmid;
      return { cmId: a.cmid, instanceId: a.instance, name: a.name };
    }
    case 'find-user': {
      const id = await userId(ctx, oneOf(body.username, GRADABLE_USERS, 'username'));
      if (id) audit.moodleUserId = id;
      return { moodleUserId: id };
    }
    case 'list-enrolled': {
      const users = await enrolled(ctx, cid);
      audit.wsFunction = 'core_enrol_get_enrolled_users';
      return { count: users.length, users: users.map((u) => ({ moodleUserId: u.id, username: u.username, roles: (u.roles ?? []).map((r) => r.shortname) })) };
    }
    case 'create-user': {
      const username = oneOf(body.username, CREATABLE_USERS, 'username');
      audit.wsFunction = 'core_user_create_users';
      const existing = await userId(ctx, username);
      if (existing) {
        audit.moodleUserId = existing;
        return { moodleUserId: existing, created: false };
      }
      // A random password nobody knows (Moodle requires one); never stored or returned.
      const password = `${randomBytes(18).toString('base64url')}Aa1!`;
      const r = await call<{ id: number }[]>(ctx, 'core_user_create_users', {
        users: [{ username, password, firstname: 'Second', lastname: 'Student', email: `${username}@example.com`, auth: 'manual' }],
      });
      audit.moodleUserId = r[0]?.id;
      return { moodleUserId: r[0]?.id, created: true };
    }
    case 'delete-user': {
      const id = await userId(ctx, oneOf(body.username, CREATABLE_USERS, 'username'));
      audit.wsFunction = 'core_user_delete_users';
      if (!id) return { deleted: false, reason: 'not_found' };
      audit.moodleUserId = id;
      await call(ctx, 'core_user_delete_users', { userids: [id] });
      return { moodleUserId: id, deleted: true };
    }
    case 'enrol':
    case 'suspend': {
      const id = await userId(ctx, oneOf(body.username, CREATABLE_USERS, 'username'));
      if (!id) throw new MoodleWsError('user_not_found', 404);
      const roleid = await studentRoleId(ctx, cid);
      audit.wsFunction = 'enrol_manual_enrol_users';
      audit.moodleUserId = id;
      audit.suspend = action === 'suspend';
      await call(ctx, 'enrol_manual_enrol_users', { enrolments: [{ roleid, userid: id, courseid: cid, suspend: action === 'suspend' ? 1 : 0 }] });
      return { moodleUserId: id, courseId: cid, roleId: roleid, suspended: action === 'suspend' };
    }
    case 'unenrol': {
      const id = await userId(ctx, oneOf(body.username, CREATABLE_USERS, 'username'));
      if (!id) throw new MoodleWsError('user_not_found', 404);
      audit.wsFunction = 'enrol_manual_unenrol_users';
      audit.moodleUserId = id;
      await call(ctx, 'enrol_manual_unenrol_users', { enrolments: [{ userid: id, courseid: cid }] });
      return { moodleUserId: id, courseId: cid, unenrolled: true };
    }
    case 'set-grade': {
      const id = await userId(ctx, oneOf(body.username, GRADABLE_USERS, 'username'));
      if (!id) throw new MoodleWsError('user_not_found', 404);
      const grade = Number(body.grade);
      if (!Number.isFinite(grade) || grade < 0 || grade > 100) throw new MoodleWsError('grade_out_of_range', 400, 'grade must be 0-100');
      const a = await ltiActivity(ctx, cid, str(body.activity, 'activity'));
      audit.wsFunction = 'core_grades_update_grades';
      audit.moodleUserId = id;
      audit.cmId = a.cmid;
      audit.grade = grade;
      const status = await call<number>(ctx, 'core_grades_update_grades', {
        source: 'enara_test_automation', courseid: cid, component: 'mod_lti', activityid: a.cmid, itemnumber: 0,
        grades: [{ studentid: id, grade }],
      });
      // Moodle: 0 = GRADE_UPDATE_OK; 1 failed, 2 multiple items, 4 item locked.
      if (status !== 0) throw new MoodleWsError(`grade_update_status_${status}`);
      return { moodleUserId: id, cmId: a.cmid, grade, status: 'ok' };
    }
  }
}

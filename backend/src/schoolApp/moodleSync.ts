import { AppError } from '../middleware/errorHandler';
import { Batch } from '../models/Batch';
import { User } from '../models/User';
import { recordAudit } from '../services/auditTrail';
import { logger, serializeError } from '../utils/logging';
import { decryptSecret, encryptSecret } from '../integrations/lms/core/crypto';
import { flatten, MoodleQuizWsError, siteBase, type Fetch } from '../integrations/lms/core/moodleQuizWs';
import { LmsContext, LmsPlatform, LmsUser } from '../integrations/lms/models';
import { SchoolMoodleSync } from './models';
import { ingest } from './importer';
import { parseStatus } from './importSpec';

// Parents school app: the Moodle connector (client answer 1: their LMS is Moodle). Per LMS connection, the school's Moodle admin creates
// a read-only web service with ONLY the functions below and gives ENARA a token; ENARA keeps it encrypted, sends it only in the POST body
// to the connection's own Moodle site, and never returns, logs or shows it. What comes in:
//   - announcements: each linked course's Announcements (news) forum, last 60 days → announcements for that course's ENARA class
//     (audience: the class group). The same Moodle discussion updates its announcement; it never duplicates.
//   - attendance: the Moodle Attendance plugin (mod_attendance), when the school uses it: sessions of the last 14 days → daily attendance
//     for the linked learners (P/A/L/E → present/absent/late/excused). Skipped, with a code, when the plugin or function is not available.
// Timetables are not in Moodle: they stay with the Excel import. Everything goes through ingest(): the same checks and writes as a file,
// with source.kind = 'connector'. Switch: SCHOOL_APP_MOODLE_ENABLED (site) + the school's own on/off.
export const MOODLE_SCHOOL_FUNCTIONS = ['mod_forum_get_forums_by_courses', 'mod_forum_get_forum_discussions', 'core_course_get_contents', 'mod_attendance_get_sessions'] as const;
type Fn = (typeof MOODLE_SCHOOL_FUNCTIONS)[number];
export const moodleSyncOn = () => /^(true|1|yes)$/i.test((process.env.SCHOOL_APP_MOODLE_ENABLED ?? '').trim());
const aad = (platformId: string) => `school_moodle_sync:${platformId}`;
const cairoDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const NOT_AVAILABLE = /accessexception|servicenotavailable|invalidrecord|invalidparameter|webservice|nopermission|requireloginerror|codingerror|dml/i;

export function moodleWs(base: string, token: string, fetchImpl: Fetch = fetch as unknown as Fetch) {
  const scrub = (s: string) => s.split(token).join('[token]').slice(0, 200);
  return {
    async call<T>(fn: Fn, params: Record<string, unknown>): Promise<T> {
      if (!(MOODLE_SCHOOL_FUNCTIONS as readonly string[]).includes(fn)) throw new MoodleQuizWsError('function_not_allowed');
      const body = new URLSearchParams([['wstoken', token], ['wsfunction', fn], ['moodlewsrestformat', 'json'], ...flatten(params)]).toString();
      let res: Awaited<ReturnType<Fetch>>;
      try { res = await fetchImpl(`${base}/webservice/rest/server.php`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: AbortSignal.timeout(12_000) }); }
      catch { throw new MoodleQuizWsError('network_error'); }
      if (!res.ok) throw new MoodleQuizWsError(`http_${res.status}`);
      let json: unknown;
      try { json = JSON.parse(await res.text()); } catch { throw new MoodleQuizWsError('bad_response'); }
      if (json && typeof json === 'object' && 'exception' in json) {
        const j = json as { errorcode?: string; message?: string };
        throw new MoodleQuizWsError(String(j.errorcode ?? 'moodle_error').replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'moodle_error', scrub(String(j.message ?? '')));
      }
      return json as T;
    },
  };
}
type Ws = ReturnType<typeof moodleWs>;

// ------------------------------------------------------------------------------------------------ pure mapping (tested)
export const stripHtml = (h: string) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
export interface MoodleDiscussion { id?: number; discussion?: number; name?: string; subject?: string; message?: string; created?: number; timemodified?: number }
export function announcementRows(platformId: string, groupName: string, discussions: MoodleDiscussion[], nowMs: number, days = 60) {
  return discussions
    .filter((d) => (d.created ?? 0) * 1000 >= nowMs - days * 86_400_000)
    .map((d) => {
      const id = d.discussion ?? d.id;
      return { audience: 'group', audience_value: groupName, title: String(d.name || d.subject || '').slice(0, 160), body: stripHtml(String(d.message ?? '')).slice(0, 4000) || String(d.name || d.subject || ''),
        publish: cairoDate(new Date((d.created ?? 0) * 1000)), external_id: `moodle:${platformId}:discussion:${id}` };
    })
    .filter((r) => r.title && !/undefined$/.test(r.external_id));
}
export interface MoodleSession { id: number; sessdate: number; attendance_log?: { studentid: number; statusid: number; remarks?: string }[]; statuses?: { id: number; acronym?: string; description?: string }[] }
const ACRONYM: Record<string, string> = { p: 'present', a: 'absent', l: 'late', e: 'excused' };
export function statusOf(s: { acronym?: string; description?: string } | undefined): string | null {
  if (!s) return null;
  return ACRONYM[(s.acronym ?? '').trim().toLowerCase()] ?? parseStatus(s.description ?? '') ?? parseStatus(s.acronym ?? '');
}
/** Attendance rows from Moodle sessions: one per learner and session; several sessions on one day get period numbers. */
export function attendanceRows(sessions: MoodleSession[], studentOf: (moodleUserId: number) => string | undefined, nowMs: number, days = 14) {
  const recent = sessions.filter((s) => s.sessdate * 1000 <= nowMs && s.sessdate * 1000 >= nowMs - days * 86_400_000).sort((a, b) => a.sessdate - b.sessdate);
  const perDay = new Map<string, number>(); for (const s of recent) { const d = cairoDate(new Date(s.sessdate * 1000)); perDay.set(d, (perDay.get(d) ?? 0) + 1); }
  const seen = new Map<string, number>();
  const rows: Record<string, string>[] = [];
  for (const s of recent) {
    const date = cairoDate(new Date(s.sessdate * 1000));
    const n = (seen.get(date) ?? 0) + 1; seen.set(date, n);
    for (const l of s.attendance_log ?? []) {
      const student = studentOf(l.studentid); const status = statusOf(s.statuses?.find((x) => x.id === l.statusid));
      if (!student || !status) continue;
      rows.push({ date, student, status, ...(perDay.get(date)! > 1 ? { period: String(n) } : {}), ...(l.remarks ? { note: String(l.remarks).slice(0, 300) } : {}) });
    }
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------ settings and runs
type Actor = { id: string; role: string; institutionId?: string };
async function platformFor(actor: Actor, platformId: string) {
  const p = await LmsPlatform.findOne({ id: platformId }).lean();
  if (!p || (actor.role !== 'enara-admin' && !(actor.role === 'admin' && actor.institutionId === p.institutionId))) throw new AppError('Connection not found', 404, 'NOT_FOUND');
  return p;
}
async function wsFor(p: { id: string; issuer: string }, fetchImpl?: Fetch): Promise<Ws | null> {
  const s = await SchoolMoodleSync.findOne({ platformId: p.id }).select('+tokenEnc').lean();
  if (!s?.tokenEnc) return null;
  return moodleWs(siteBase(p.issuer, process.env.NODE_ENV === 'test'), decryptSecret(s.tokenEnc, aad(p.id)), fetchImpl);
}
const view = async (platformId: string) => {
  const s = await SchoolMoodleSync.findOne({ platformId }).select('+tokenEnc').lean();
  return { switchOn: moodleSyncOn(), hasToken: Boolean(s?.tokenEnc), enabled: Boolean(s?.enabled), lastCheck: s?.lastCheck ?? null, lastRun: s?.lastRun ?? null, functions: MOODLE_SCHOOL_FUNCTIONS };
};

export async function moodleConnections(actor: Actor, institutionId?: string) {
  const school = actor.role === 'enara-admin' ? institutionId : actor.institutionId;
  if (!school || (actor.role !== 'admin' && actor.role !== 'enara-admin')) throw new AppError('Access denied', 403, 'FORBIDDEN');
  const platforms = await LmsPlatform.find({ institutionId: school }).select('id issuer vendor provider').lean();
  return { switchOn: moodleSyncOn(), connections: await Promise.all(platforms.map(async (p) => ({ platformId: p.id, site: p.issuer, vendor: p.vendor ?? p.provider, ...(await view(p.id)) }))) };
}

async function activeCourses(p: { id: string }) {
  const ctx = await LmsContext.find({ platformId: p.id, status: 'active' }).select('externalContextId enaraGroupId').lean();
  const groups = new Map((await Batch.find({ id: { $in: ctx.map((c) => c.enaraGroupId).filter(Boolean) } }).select('id name').lean()).map((g) => [g.id, g.name]));
  return ctx.map((c) => ({ courseId: Number(c.externalContextId), groupName: c.enaraGroupId ? groups.get(c.enaraGroupId) : undefined })).filter((c) => Number.isInteger(c.courseId) && c.courseId > 0);
}

export async function checkMoodle(p: { id: string; issuer: string; institutionId: string }, fetchImpl?: Fetch) {
  let ok = false, code = 'ok', attendance = false;
  try {
    const ws = await wsFor(p, fetchImpl);
    if (!ws) code = 'no_token';
    else {
      const courses = await activeCourses(p);
      await ws.call('mod_forum_get_forums_by_courses', { courseids: courses.map((c) => c.courseId) });
      ok = true;
      if (courses[0]) {
        try {
          const contents = await ws.call<{ modules?: { modname: string; instance: number }[] }[]>('core_course_get_contents', { courseid: courses[0].courseId });
          const att = contents.flatMap((s) => s.modules ?? []).find((m) => m.modname === 'attendance');
          if (att) { await ws.call('mod_attendance_get_sessions', { attendanceid: att.instance }); attendance = true; }
        } catch { attendance = false; }
      }
    }
  } catch (error) { code = error instanceof MoodleQuizWsError ? error.code : 'error'; }
  const lastCheck = { at: new Date(), ok, code, attendance };
  await SchoolMoodleSync.updateOne({ platformId: p.id }, { $set: { lastCheck }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  return lastCheck;
}

export async function saveMoodleToken(actor: Actor, platformId: string, token: unknown, fetchImpl?: Fetch) {
  const p = await platformFor(actor, platformId);
  if (typeof token !== 'string' || !/^[A-Za-z0-9]{16,128}$/.test(token.trim())) throw new AppError('Paste the web service token Moodle shows (letters and digits)', 400, 'VALIDATION_ERROR');
  await SchoolMoodleSync.updateOne({ platformId: p.id }, { $set: { tokenEnc: encryptSecret(token.trim(), aad(p.id)) }, $setOnInsert: { institutionId: p.institutionId, enabled: false } }, { upsert: true });
  await recordAudit('school_app_moodle_token_saved', actor, { institutionId: p.institutionId, type: 'lms_platform', id: p.id }, {});
  const check = await checkMoodle(p, fetchImpl);
  return { ...(await view(p.id)), check };
}

export async function setMoodleEnabled(actor: Actor, platformId: string, enabled: unknown) {
  const p = await platformFor(actor, platformId);
  if (typeof enabled !== 'boolean') throw new AppError('enabled must be true or false', 400, 'VALIDATION_ERROR');
  if (enabled && !moodleSyncOn()) throw new AppError('The Moodle connector is not available yet', 409, 'SECTION_NOT_AVAILABLE');
  await SchoolMoodleSync.updateOne({ platformId: p.id }, { $set: { enabled }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  await recordAudit('school_app_moodle_sync_changed', actor, { institutionId: p.institutionId, type: 'lms_platform', id: p.id }, { enabled });
  return view(p.id);
}

/** One sync of one connection: announcements, then attendance. Never throws for one course's problem; records counts and a code. */
export async function runMoodleSync(p: { id: string; issuer: string; institutionId: string }, now = new Date(), fetchImpl?: Fetch) {
  const sum = { at: now, code: 'ok', announcements: 0, attendance: 0, problems: 0, courses: 0 };
  try {
    const ws = await wsFor(p, fetchImpl);
    if (!ws) { sum.code = 'no_token'; }
    else {
      const courses = await activeCourses(p); sum.courses = courses.length;
      // announcements
      const forums = await ws.call<{ id: number; course: number; type: string }[]>('mod_forum_get_forums_by_courses', { courseids: courses.map((c) => c.courseId) });
      const annRows: Record<string, string>[] = [];
      for (const c of courses.filter((x) => x.groupName)) {
        for (const f of forums.filter((x) => x.course === c.courseId && x.type === 'news')) {
          const r = await ws.call<{ discussions?: MoodleDiscussion[] }>('mod_forum_get_forum_discussions', { forumid: f.id, sortorder: -1, page: 0, perpage: 20 });
          annRows.push(...announcementRows(p.id, c.groupName!, r.discussions ?? [], now.getTime()));
        }
      }
      if (annRows.length) { try { const w = await ingest('announcements', p.institutionId, annRows, `moodle:${p.id}`); sum.announcements = w.inserted; sum.problems += w.problems.length; } catch (e) { if ((e as { code?: string }).code !== 'SECTION_OFF') throw e; } }
      // attendance (plugin; optional)
      const lms = await LmsUser.find({ platformId: p.id, enaraUserId: { $exists: true } }).select('externalUserId enaraUserId').lean();
      const users = new Map((await User.find({ _id: { $in: lms.map((u) => u.enaraUserId) }, role: 'student' }).select('_id studentId').lean()).map((u) => [String(u._id), u.studentId as string | undefined]));
      const byMoodle = new Map(lms.map((u) => [Number(u.externalUserId), users.get(String(u.enaraUserId))]));
      const attRows: Record<string, string>[] = [];
      for (const c of courses) {
        try {
          const contents = await ws.call<{ modules?: { modname: string; instance: number }[] }[]>('core_course_get_contents', { courseid: c.courseId });
          for (const m of contents.flatMap((s) => s.modules ?? []).filter((x) => x.modname === 'attendance')) {
            const sessions = await ws.call<MoodleSession[]>('mod_attendance_get_sessions', { attendanceid: m.instance });
            attRows.push(...attendanceRows(Array.isArray(sessions) ? sessions : [], (id) => byMoodle.get(id), now.getTime()));
          }
        } catch (e) { if (!(e instanceof MoodleQuizWsError && NOT_AVAILABLE.test(e.code))) throw e; }
      }
      if (attRows.length) { try { const w = await ingest('attendance', p.institutionId, attRows, `moodle:${p.id}`); sum.attendance = w.inserted + w.replaced; sum.problems += w.problems.length; } catch (e) { if ((e as { code?: string }).code !== 'SECTION_OFF') throw e; } }
    }
  } catch (error) {
    sum.code = error instanceof MoodleQuizWsError ? error.code : 'error';
    logger.warn('school_app_moodle_sync_failed', { platformId: p.id, code: sum.code, error: serializeError(error) });
  }
  await SchoolMoodleSync.updateOne({ platformId: p.id }, { $set: { lastRun: sum }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  return sum;
}

export async function runMoodleSyncNow(actor: Actor, platformId: string, fetchImpl?: Fetch) {
  const p = await platformFor(actor, platformId);
  const r = await runMoodleSync(p, new Date(), fetchImpl);
  await recordAudit('school_app_moodle_sync_run', actor, { institutionId: p.institutionId, type: 'lms_platform', id: p.id }, { code: r.code, announcements: r.announcements, attendance: r.attendance });
  return r;
}

/** The daily job: every connection whose school turned the connector on. */
export async function runMoodleSyncDaily(now = new Date()) {
  if (!moodleSyncOn()) return { skipped: 'off' };
  const on = await SchoolMoodleSync.find({ enabled: true }).select('platformId').lean();
  const out: Record<string, string> = {};
  for (const s of on) { const p = await LmsPlatform.findOne({ id: s.platformId }).lean(); if (p) out[p.id] = (await runMoodleSync(p, now)).code; }
  return out;
}

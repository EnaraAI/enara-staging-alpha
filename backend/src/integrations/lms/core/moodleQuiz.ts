import { logger, serializeError } from '../../../utils/logging';
import { engineV2 } from '../../../services/engineV2';
import { recordMoodleAnswers, workOnOn } from '../../../services/errorsToWorkOn';
import { decryptSecret, encryptSecret } from './crypto';
import { writeLmsAudit } from './audit';
import { LmsContext, LmsEnrollment, LmsMoodleQuizMap, LmsMoodleQuizSeen, LmsMoodleQuizSettings, LmsPlatform, LmsUser, type ILmsPlatform } from '../models';
import { moodleQuizWs, siteBase, MoodleQuizWsError, type Fetch, type MoodleQuizWs } from './moodleQuizWs';

// Errors to work on from Moodle's own quizzes (docs/tutor/MOODLE_QUIZ_IMPORT_PLAN.md v2). Switch: ENARA_ENGINE_V2 'moodleQuiz'
// (named only), with 'workOn'; then per school: a saved read-only token and the school's own "on". Moodle attempts become
// errors only after the same gate as ENARA assignments: the quiz is closed for the learner (closing time passed, or no
// attempts left), the learner may review correctness then, the attempt is finished and none is in progress.

export const moodleQuizOn = (): boolean => engineV2('moodleQuiz') && workOnOn();
const aad = (platformId: string) => `lms_moodle_quiz_settings:${platformId}`;

// ------------------------------------------------------------------------------------------------ pure parts (tested)
/** Moodle's review option bits (mod_quiz display_options). */
export const REVIEW = { DURING: 0x10000, IMMEDIATELY_AFTER: 0x01000, LATER_WHILE_OPEN: 0x00100, AFTER_CLOSE: 0x00010 } as const;
export interface MoodleQuiz { id: number; course: number; name?: string; timeclose?: number; attempts?: number; reviewcorrectness?: number }
export interface MoodleAttempt { id: number; state: string; timefinish?: number }
/** Whether a learner's finished attempts on a quiz may become errors now. */
export function quizGate(q: MoodleQuiz, attempts: MoodleAttempt[], nowMs: number): { open: boolean; reason: string } {
  if (attempts.some((a) => a.state === 'inprogress' || a.state === 'overdue')) return { open: false, reason: 'attempt_in_progress' };
  const finished = attempts.filter((a) => a.state === 'finished');
  if (!finished.length) return { open: false, reason: 'no_finished_attempt' };
  const closed = Boolean(q.timeclose && q.timeclose > 0 && nowMs >= q.timeclose * 1000);
  const noneLeft = Boolean(q.attempts && q.attempts > 0 && finished.length >= q.attempts);
  if (!closed && !noneLeft) return { open: false, reason: 'quiz_still_open' };
  const bits = q.reviewcorrectness;
  if (typeof bits !== 'number') return { open: false, reason: 'review_unknown' };
  if (!(bits & (closed ? REVIEW.AFTER_CLOSE : REVIEW.LATER_WHILE_OPEN))) return { open: false, reason: 'review_not_allowed' };
  return { open: true, reason: closed ? 'closed' : 'no_attempts_left' };
}
/** A reviewed question's outcome: right, wrong, or not counted (not graded yet, not answered by a grade). */
export function slotOutcome(state?: string): 'right' | 'wrong' | null {
  if (state === 'gradedright') return 'right';
  if (state === 'gradedwrong' || state === 'gradedpartial' || state === 'gaveup') return 'wrong';
  return null;
}
/** The objective a slot practises: its own mapping, else the quiz's. */
export function objectiveForSlot(map: { objectiveId?: string; slotObjectives?: { slot: number; objectiveId: string }[] }, slot: number): string | undefined {
  return map.slotObjectives?.find((s) => s.slot === slot)?.objectiveId ?? map.objectiveId;
}

// ------------------------------------------------------------------------------------------------ settings
export async function settingsView(platformId: string) {
  const s = await LmsMoodleQuizSettings.findOne({ platformId }).select('+tokenEnc').lean();
  return {
    switchOn: moodleQuizOn(),
    hasToken: Boolean(s?.tokenEnc),
    enabled: Boolean(s?.enabled),
    lastCheck: s?.lastCheckAt ? { at: s.lastCheckAt, ok: Boolean(s.lastCheckOk), code: s.lastCheckCode ?? null } : null,
    lastRun: s?.lastRunAt ? { at: s.lastRunAt, ...(s.lastRun ?? {}) } : null,
  };
}

async function wsFor(p: Pick<ILmsPlatform, 'id' | 'issuer'>, fetchImpl?: Fetch): Promise<MoodleQuizWs | null> {
  const s = await LmsMoodleQuizSettings.findOne({ platformId: p.id }).select('+tokenEnc').lean();
  if (!s?.tokenEnc) return null;
  return moodleQuizWs(siteBase(p.issuer, process.env.NODE_ENV === 'test'), decryptSecret(s.tokenEnc, aad(p.id)), fetchImpl);
}
const activeContexts = (p: Pick<ILmsPlatform, 'id'>) => LmsContext.find({ platformId: p.id, status: 'active' }).select('id externalContextId enaraClassId institutionId').lean();

/** One read call with the connection's token: lists the linked courses' quizzes. Records the result (code only). */
export async function checkConnection(p: ILmsPlatform, actor: string, fetchImpl?: Fetch): Promise<{ ok: boolean; code: string; quizzes?: number }> {
  let ok = false; let code = 'ok'; let quizzes: number | undefined;
  try {
    const ws = await wsFor(p, fetchImpl);
    if (!ws) { code = 'no_token'; }
    else {
      const ids = (await activeContexts(p)).map((c) => Number(c.externalContextId)).filter((n) => Number.isInteger(n) && n > 0);
      const r = await ws.call<{ quizzes?: MoodleQuiz[] }>('mod_quiz_get_quizzes_by_courses', { courseids: ids });
      ok = true; quizzes = (r.quizzes ?? []).length;
    }
  } catch (error) {
    code = error instanceof MoodleQuizWsError ? error.code : 'error';
  }
  await LmsMoodleQuizSettings.updateOne({ platformId: p.id }, { $set: { lastCheckAt: new Date(), lastCheckOk: ok, lastCheckCode: code }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  await writeLmsAudit({ event: 'moodle_quiz.check', outcome: ok ? 'ok' : 'fail', institutionId: p.institutionId, platformId: p.id, actor, refIds: { code } });
  return { ok, code, ...(quizzes !== undefined ? { quizzes } : {}) };
}

/** Saves (or with null clears) the school's read-only token, encrypted; then checks it once. The token is never returned. */
export async function saveToken(p: ILmsPlatform, token: string | null, actor: string, fetchImpl?: Fetch) {
  if (token === null) {
    await LmsMoodleQuizSettings.updateOne({ platformId: p.id }, { $unset: { tokenEnc: 1 }, $set: { enabled: false, updatedBy: actor } });
    await writeLmsAudit({ event: 'moodle_quiz.token', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor, refIds: { action: 'cleared' } });
    return { check: null };
  }
  await LmsMoodleQuizSettings.updateOne({ platformId: p.id }, { $set: { tokenEnc: encryptSecret(token, aad(p.id)), updatedBy: actor }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  await writeLmsAudit({ event: 'moodle_quiz.token', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor, refIds: { action: 'set' } });
  return { check: await checkConnection(p, actor, fetchImpl) };
}

export async function setEnabled(p: ILmsPlatform, enabled: boolean, actor: string) {
  await LmsMoodleQuizSettings.updateOne({ platformId: p.id }, { $set: { enabled, updatedBy: actor }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  await writeLmsAudit({ event: 'moodle_quiz.enabled', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor, refIds: { enabled } });
}

/** The linked courses' quizzes with their ENARA objective, for the mapping screen. */
export async function listQuizzes(p: ILmsPlatform, fetchImpl?: Fetch) {
  const ws = await wsFor(p, fetchImpl);
  if (!ws) throw new MoodleQuizWsError('no_token');
  const ctxs = await activeContexts(p);
  const ids = ctxs.map((c) => Number(c.externalContextId)).filter((n) => Number.isInteger(n) && n > 0);
  const r = await ws.call<{ quizzes?: MoodleQuiz[] }>('mod_quiz_get_quizzes_by_courses', { courseids: ids });
  const maps = new Map((await LmsMoodleQuizMap.find({ platformId: p.id }).lean()).map((m) => [m.quizId, m]));
  return (r.quizzes ?? []).map((q) => {
    const m = maps.get(String(q.id));
    return { quizId: String(q.id), courseExternalId: String(q.course), name: String(q.name ?? '').slice(0, 120), closesAt: q.timeclose ? new Date(q.timeclose * 1000) : null, maxAttempts: q.attempts ?? 0, reviewAfterClose: typeof q.reviewcorrectness === 'number' ? Boolean(q.reviewcorrectness & REVIEW.AFTER_CLOSE) : null, objectiveId: m?.objectiveId ?? null, slotObjectives: m?.slotObjectives ?? [] };
  });
}

export async function setQuizMap(p: ILmsPlatform, input: { quizId: string; courseExternalId: string; quizName?: string; objectiveId: string | null; slotObjectives?: { slot: number; objectiveId: string }[] }, actor: string) {
  if (!input.objectiveId && !input.slotObjectives?.length) { await LmsMoodleQuizMap.deleteOne({ platformId: p.id, quizId: input.quizId }); }
  else await LmsMoodleQuizMap.updateOne({ platformId: p.id, quizId: input.quizId }, { $set: { courseExternalId: input.courseExternalId, ...(input.quizName ? { quizName: input.quizName.slice(0, 120) } : {}), objectiveId: input.objectiveId ?? undefined, slotObjectives: input.slotObjectives ?? [], updatedBy: actor }, $setOnInsert: { institutionId: p.institutionId } }, { upsert: true });
  await writeLmsAudit({ event: 'moodle_quiz.map', outcome: 'ok', institutionId: p.institutionId, platformId: p.id, actor, refIds: { quizId: input.quizId, objectiveId: input.objectiveId ?? null, slots: input.slotObjectives?.length ?? 0 } });
}

// ------------------------------------------------------------------------------------------------ import
type RunSummary = { quizzes: number; attempts: number; wrong: number; right: number; skipped: number; errors: number };
/** Imports finished, gated attempts on mapped quizzes for one connection. Never throws; stops at the budget. */
export async function importForPlatform(p: ILmsPlatform, opts: { budgetMs: number; now?: number; fetchImpl?: Fetch }): Promise<RunSummary & { students: string[] }> {
  const t0 = Date.now(); const now = opts.now ?? Date.now();
  const sum: RunSummary = { quizzes: 0, attempts: 0, wrong: 0, right: 0, skipped: 0, errors: 0 }; const students = new Set<string>();
  try {
    const ws = await wsFor(p, opts.fetchImpl);
    const maps = await LmsMoodleQuizMap.find({ platformId: p.id }).lean();
    if (!ws || !maps.length) return { ...sum, students: [] };
    const ctxs = await activeContexts(p);
    const ctxOf = new Map(ctxs.map((c) => [String(c.externalContextId), c]));
    const courseIds = [...new Set(maps.map((m) => Number(m.courseExternalId)))].filter((n) => ctxOf.has(String(n)));
    const quizzes = new Map(((await ws.call<{ quizzes?: MoodleQuiz[] }>('mod_quiz_get_quizzes_by_courses', { courseids: courseIds })).quizzes ?? []).map((q) => [String(q.id), q]));
    const { User } = await import('../../../models/User');
    const { CourseInstance } = await import('../../../models/CourseInstance');
    for (const m of maps) {
      const q = quizzes.get(m.quizId); const ctx = ctxOf.get(m.courseExternalId);
      if (!q || !ctx) continue;
      sum.quizzes += 1;
      const ci = ctx.enaraClassId ? await CourseInstance.findOne({ id: ctx.enaraClassId }).select('courseId curriculumId').lean() : null;
      const enr = await LmsEnrollment.find({ contextId: ctx.id, enaraRole: 'student', status: 'active' }).select('lmsUserId').lean();
      const lmsUsers = await LmsUser.find({ id: { $in: enr.map((e) => e.lmsUserId) }, platformId: p.id }).select('externalUserId enaraUserId').lean();
      const users = new Map((await User.find({ _id: { $in: lmsUsers.map((u) => u.enaraUserId).filter(Boolean) }, role: 'student' }).select('_id studentId').lean()).map((u) => [String(u._id), u.studentId as string | undefined]));
      for (const lu of lmsUsers) {
        if (Date.now() - t0 > opts.budgetMs) return { ...sum, students: [...students] };
        const studentId = lu.enaraUserId ? users.get(String(lu.enaraUserId)) : undefined;
        if (!studentId) continue;
        try {
          const r = await ws.call<{ attempts?: MoodleAttempt[] }>('mod_quiz_get_user_attempts', { quizid: Number(m.quizId), userid: Number(lu.externalUserId), status: 'all', includepreviews: false });
          const attempts = r.attempts ?? [];
          if (!quizGate(q, attempts, now).open) { sum.skipped += 1; continue; }
          for (const at of attempts.filter((a) => a.state === 'finished')) {
            const key = `${p.id}:${at.id}`;
            if (await LmsMoodleQuizSeen.exists({ key })) continue;
            const review = await ws.call<{ questions?: { slot: number; state?: string }[] }>('mod_quiz_get_attempt_review', { attemptid: at.id, page: -1 });
            const answers = (review.questions ?? []).flatMap((x) => { const o = slotOutcome(x.state); const objectiveId = objectiveForSlot(m, Number(x.slot)); return o && objectiveId ? [{ objectiveId, slot: Number(x.slot), right: o === 'right' }] : []; });
            const w = await recordMoodleAnswers({ studentId, institutionId: p.institutionId, courseId: ci?.courseId, curriculumId: ci?.curriculumId, attemptKey: `moodle:${key}`, quizKey: `moodle:${p.id}:quiz:${m.quizId}`, at: new Date((at.timefinish ?? Math.floor(now / 1000)) * 1000), answers });
            await LmsMoodleQuizSeen.create({ key, platformId: p.id, at: new Date() });
            sum.attempts += 1; sum.wrong += w.wrong; sum.right += w.right; students.add(studentId);
          }
        } catch (error) {
          sum.errors += 1;
          logger.warn('lms_moodle_quiz_user_failed', { platformId: p.id, quizId: m.quizId, code: error instanceof MoodleQuizWsError ? error.code : 'error' });
        }
      }
    }
  } catch (error) {
    sum.errors += 1;
    logger.warn('lms_moodle_quiz_run_failed', { platformId: p.id, code: error instanceof MoodleQuizWsError ? error.code : 'error', error: error instanceof MoodleQuizWsError ? undefined : serializeError(error) });
  }
  await LmsMoodleQuizSettings.updateOne({ platformId: p.id }, { $set: { lastRunAt: new Date(), lastRun: sum } });
  return { ...sum, students: [...students] };
}

/** The nightly step: every active connection whose school saved a token and switched it on. */
export async function scheduledMoodleQuizImport(opts: { budgetMs: number }): Promise<{ connections: number } & RunSummary> {
  const total: RunSummary = { quizzes: 0, attempts: 0, wrong: 0, right: 0, skipped: 0, errors: 0 };
  if (!moodleQuizOn()) return { connections: 0, ...total };
  const t0 = Date.now();
  const on = await LmsMoodleQuizSettings.find({ enabled: true, tokenEnc: { $exists: true } }).select('platformId').lean();
  let n = 0;
  for (const s of on) {
    const left = opts.budgetMs - (Date.now() - t0);
    if (left < 2_000) break;
    const p = await LmsPlatform.findOne({ id: s.platformId, status: 'active' }).lean();
    if (!p) continue;
    const r = await importForPlatform(p, { budgetMs: left });
    n += 1; for (const k of Object.keys(total) as (keyof RunSummary)[]) total[k] += r[k];
  }
  return { connections: n, ...total };
}

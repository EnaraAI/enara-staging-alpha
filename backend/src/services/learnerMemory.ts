// Learner memory phases 2-4 (docs/tutor/LEARNER_MEMORY_PLAN.md; owner "go for all phases", 20 Nov 2026). Each phase has its own ENARA_ENGINE_V2
// switch, named only and off by default:
//   sessionMemory  (phase 2) session summaries, the "last time" opening line, no lesson item repeated across sessions, the per-turn learner brief;
//   learnerProfile (phase 3) first language, interests, accommodations (fixed codes), and the daily study-habits rollup;
//   whatWorks      (phase 4) per learner, which teaching methods were followed by an independent success (a view; the planner does not use it).
// Memory is written by code from stored, graded evidence or by school / parent / learner screens. The model only reads a short brief.
import { engineV2 } from './engineV2';
import { logger, serializeError } from '../utils/logging';
import { ACCOMMODATIONS, FIRST_LANGUAGES, INTERESTS, LearnerProfile, SessionSummary, StudyHabitDaily, type ILearnerProfile, type ISessionSummary } from '../models/LearnerMemory';

export const SUMMARY_VERSION = 'ss-v1';
export const QUIET_MINUTES = 30;
export const BRIEF_MAX_LINES = 8;
export const sessionMemoryOn = (): boolean => engineV2('sessionMemory');
export const learnerProfileOn = (): boolean => engineV2('learnerProfile');
export const whatWorksOn = (): boolean => engineV2('whatWorks');
// topicMemory (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN E, ARCHITECTURE.md §8 episodic memory): the summary also keeps WHAT the session
// worked from (cited course passages: file and page) and how many questions the materials did not cover, so the "last time" line works
// for every subject. Written by code from stored citations only (never model text).
export const topicMemoryOn = (): boolean => engineV2('topicMemory');
export const TOPICS_MAX = 3;
/** The session's topics: the most cited passages (file and page), most cited first. */
export function sessionTopics(msgs: MsgLike[]): { topics: string[]; outOfScope: number } {
  const count = new Map<string, number>(); let outOfScope = 0;
  for (const m of msgs) {
    if (m.role === 'user') continue;
    if (m.meta?.outOfScope) outOfScope += 1;
    for (const c of m.meta?.citations ?? []) {
      const name = String(c.fileName ?? '').replace(/["<>\n]/g, '').trim().slice(0, 80);
      if (!name) continue;
      const k = `${name}${typeof c.page === 'number' ? ` p.${c.page}` : ''}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  return { topics: [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOPICS_MAX).map(([k]) => k), outOfScope };
}

type Verdict = string | undefined;
const ok = (v: Verdict) => v === 'CORRECT' || v === 'CORRECT_WITH_EQUIVALENT_FORMULATION';
const bad = (v: Verdict) => v === 'INCORRECT' || v === 'PARTIALLY_CORRECT';
export interface MsgLike { role: string; timestamp: Date | string; meta?: { languageTurn?: Record<string, unknown> | null; practiceTurn?: Record<string, unknown> | null; citations?: { fileName?: string; page?: number | null }[]; outOfScope?: boolean; teaching?: { objectiveId?: string; primary?: string } } }
type LT = { assessment?: { verdict?: string; item?: string }; activeItem?: { lessonItemId?: string } | null; answeringCheck?: boolean; diagnosis?: string; hintLevel?: number; lessonId?: string; objectiveId?: string };
// gradeAllSubjects: a non-language subject turn stores the same shape as practiceTurn (verdict, answeringCheck, objective, lesson).
const ltOf = (m: MsgLike) => (m.meta?.languageTurn ?? m.meta?.practiceTurn ?? undefined) as LT | undefined;

// ------------------------------------------------------------------------------------------------ phase 2: pure parts
/** A session's summary from its stored turns (code only). */
export function summarizeTurns(msgs: MsgLike[]): Omit<ISessionSummary, keyof import('mongoose').Document | 'sessionId' | 'studentId' | 'institutionId' | 'courseId' | 'version'> | null {
  if (!msgs.length) return null;
  const ts = msgs.map((m) => new Date(m.timestamp).getTime()).sort((a, b) => a - b);
  const ai = msgs.filter((m) => m.role !== 'user');
  let right = 0; let wrong = 0; const answered = new Set<string>(); const codes = new Map<string, number>(); const recent: boolean[] = [];
  let open: string | undefined; let prevOpen: string | undefined;
  for (const m of ai) {
    const lt = ltOf(m); if (!lt) continue;
    const v = lt.assessment?.verdict;
    if (lt.answeringCheck && (ok(v) || bad(v))) {
      if (ok(v)) right += 1; else { wrong += 1; if (lt.diagnosis && lt.diagnosis !== 'unknown') codes.set(lt.diagnosis, (codes.get(lt.diagnosis) ?? 0) + 1); }
      recent.push(ok(v));
      if (prevOpen) answered.add(prevOpen);
    }
    if (lt.activeItem !== undefined) open = lt.activeItem?.lessonItemId;
    prevOpen = open;
  }
  const lastFew = recent.slice(-3);
  const stoppedWithOpenItem = Boolean(open) && !answered.has(open!);
  const nextStep: ISessionSummary['nextStep'] = lastFew.length && lastFew.filter((x) => !x).length > lastFew.length / 2 ? 'reteach' : stoppedWithOpenItem ? 'finish_item' : 'next_point';
  const stuckOn = [...codes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const last = (k: 'lessonId' | 'objectiveId') => ai.map((m) => ltOf(m)?.[k]).filter(Boolean).at(-1);
  return {
    lessonId: last('lessonId'), objectiveId: ai.map((m) => m.meta?.teaching?.objectiveId).filter(Boolean).at(-1) ?? last('objectiveId'),
    startedAt: new Date(ts[0]), endedAt: new Date(ts[ts.length - 1]), learnerTurns: msgs.filter((m) => m.role === 'user').length,
    right, wrong, answeredItemIds: [...answered], ...(stuckOn ? { stuckOn } : {}), stoppedWithOpenItem, nextStep,
    ...(topicMemoryOn() ? (({ topics, outOfScope }) => ({ ...(topics.length ? { topics } : {}), ...(outOfScope ? { outOfScope } : {}) }))(sessionTopics(msgs)) : {}),
  };
}
const NEXT_WORDS = { reteach: 'reteach the point simply, then one easy item', finish_item: 'finish the exercise that was left open', next_point: 'a one-item recall check, then the next point' } as const;
const daysAgo = (d: Date, now: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / 86_400_000));
/** The opening line about the last session (plain words, codes only). */
export function lastSessionLine(s: Pick<ISessionSummary, 'endedAt' | 'right' | 'wrong' | 'stuckOn' | 'stoppedWithOpenItem' | 'nextStep'> & { topics?: string[]; outOfScope?: number }, objectiveTitle: string | undefined, now: Date, label?: (code: string) => string): string {
  const ago = daysAgo(new Date(s.endedAt), now);
  const when = ago === 0 ? 'earlier today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
  return `- Last session (${when}${objectiveTitle ? `, "${objectiveTitle.replace(/["<>]/g, '')}"` : ''}): ${s.right} right, ${s.wrong} wrong${s.stuckOn ? `; stuck on ${label ? label(s.stuckOn) : s.stuckOn.replace(/_/g, ' ')}` : ''}${s.stoppedWithOpenItem ? '; it stopped with an exercise left open' : ''}${s.topics?.length ? `; worked from ${s.topics.map((t) => `"${t}"`).join(', ')}` : ''}${s.outOfScope ? `; ${s.outOfScope} question(s) were not in the course materials` : ''}. Start here: ${NEXT_WORDS[s.nextStep]}.`;
}
/** The per-turn learner brief: a heading and at most BRIEF_MAX_LINES lines, in priority order (errors, last session, profile, habits). */
export function learnerBrief(sections: string[][]): string[] {
  const lines = sections.flat().filter(Boolean).slice(0, BRIEF_MAX_LINES);
  return lines.length ? ['Learner memory (from the school\'s records; use it, don\'t recite it):', ...lines] : [];
}

// ------------------------------------------------------------------------------------------------ phase 3: pure parts
const LANG_NAME: Record<string, string> = { ar: 'Arabic', en: 'English', fr: 'French', ur: 'Urdu', hi: 'Hindi', tl: 'Tagalog', bn: 'Bengali', fa: 'Persian', tr: 'Turkish', other: 'another language' };
/** Accommodations are passed to the model only as their effect, never the reason. */
const ACCOMMODATION_EFFECT: Record<string, string> = {
  extra_time: 'never hurry them or mention time limits',
  typed_instead_of_voice: 'typed answers are fine; never ask them to speak or record',
  read_aloud: 'keep sentences short and plain (they may use read-aloud)',
  fewer_items: 'at most one practice item per reply, and fewer items overall',
  larger_text: 'keep replies short, with line breaks between steps',
};
export function profileLines(p: Pick<ILearnerProfile, 'firstLanguage' | 'interests' | 'accommodations'> | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.firstLanguage && p.firstLanguage !== 'ar') out.push(`- First language: ${LANG_NAME[p.firstLanguage] ?? 'another language'} (not Arabic): do not use Arabic comparisons.`);
  if (p.interests?.length) out.push(`- Interests (for examples when it fits; never ask about them): ${p.interests.slice(0, 5).join(', ')}.`);
  const eff = (p.accommodations ?? []).map((a) => ACCOMMODATION_EFFECT[a]).filter(Boolean);
  if (eff.length) out.push(`- How to work with this learner: ${eff.join('; ')}.`);
  return out;
}
export const parseFirstLanguage = (v: unknown) => (v === null ? null : (FIRST_LANGUAGES as readonly string[]).includes(String(v)) ? (v as ILearnerProfile['firstLanguage']) : undefined);
export const parseCodes = <T extends readonly string[]>(v: unknown, allowed: T, max: number): T[number][] | undefined =>
  Array.isArray(v) && v.length <= max && v.every((x) => (allowed as readonly string[]).includes(String(x))) ? [...new Set(v.map(String))] as T[number][] : undefined;
export const parseInterests = (v: unknown) => parseCodes(v, INTERESTS, 5);
export const parseAccommodations = (v: unknown) => parseCodes(v, ACCOMMODATIONS, ACCOMMODATIONS.length);

/** One day's tutor activity for one learner, from its message times (a gap over 10 minutes splits study time). */
export function dayRollup(times: { sessionId: string; at: Date }[]): { sessions: number; minutes: number; firstHourUtc: number; lastHourUtc: number } {
  const t = [...times].sort((a, b) => a.at.getTime() - b.at.getTime());
  let ms = 0;
  for (let i = 1; i < t.length; i += 1) { const gap = t[i].at.getTime() - t[i - 1].at.getTime(); if (gap <= 10 * 60_000) ms += gap; }
  return { sessions: new Set(t.map((x) => x.sessionId)).size, minutes: Math.round(ms / 60_000) + t.length, firstHourUtc: t[0]?.at.getUTCHours() ?? 0, lastHourUtc: t[t.length - 1]?.at.getUTCHours() ?? 0 };
}
export interface HabitsSummary { activeDays: number; sessions: number; avgMinutesPerActiveDay: number; usualTime: 'morning' | 'afternoon' | 'evening' | 'night' | null; daysSinceLast: number | null; longestGapDays: number; returnedAfterGap: boolean }
/** Last 30 days of rows (any order). Times of day use the school's UTC+3 (Gulf / Cairo winter is close enough for a coarse bucket). */
export function habitsSummary(rows: { day: Date; sessions: number; minutes: number; firstHourUtc: number }[], now: Date): HabitsSummary {
  const r = [...rows].sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());
  const bucket = (h: number) => { const l = (h + 3) % 24; return l < 5 ? 'night' : l < 12 ? 'morning' : l < 17 ? 'afternoon' : l < 22 ? 'evening' : 'night'; };
  const counts = new Map<string, number>(); r.forEach((x) => counts.set(bucket(x.firstHourUtc), (counts.get(bucket(x.firstHourUtc)) ?? 0) + 1));
  const gaps = r.slice(1).map((x, i) => daysAgo(new Date(r[i].day), new Date(x.day)));
  const lastGap = gaps.at(-1) ?? 0;
  return {
    activeDays: r.length, sessions: r.reduce((a, x) => a + x.sessions, 0), avgMinutesPerActiveDay: r.length ? Math.round(r.reduce((a, x) => a + x.minutes, 0) / r.length) : 0,
    usualTime: (r.length ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null) as HabitsSummary['usualTime'],
    daysSinceLast: r.length ? daysAgo(new Date(r[r.length - 1].day), now) : null,
    longestGapDays: gaps.length ? Math.max(...gaps) : 0, returnedAfterGap: lastGap >= 7,
  };
}
/** A learner back after a long break gets a short review first (the planner's review opener). */
export const habitsLines = (h: HabitsSummary | null): string[] => (h && h.daysSinceLast !== null && h.daysSinceLast >= 7 ? [`- They are back after ${h.daysSinceLast} days: start with a short, easy review of the last point before anything new.`] : []);

// ------------------------------------------------------------------------------------------------ phase 4: pure parts
export interface MethodStat { method: string; sessions: number; withIndependentSuccess: number; rate: number }
/** Per main method: tutor sessions where it was used, and how many of them had an independent success (right first time, no hint). Observational. */
export function whatWorksFrom(sessions: { method?: string; independentSuccess: boolean }[]): MethodStat[] {
  const m = new Map<string, MethodStat>();
  for (const s of sessions) {
    if (!s.method) continue;
    const x = m.get(s.method) ?? { method: s.method, sessions: 0, withIndependentSuccess: 0, rate: 0 };
    x.sessions += 1; if (s.independentSuccess) x.withIndependentSuccess += 1; x.rate = Math.round((x.withIndependentSuccess / x.sessions) * 100) / 100; m.set(s.method, x);
  }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions);
}
/** One session's main method (most used) and whether it had an independent success. */
export function sessionMethodOutcome(msgs: MsgLike[]): { method?: string; independentSuccess: boolean } {
  const ai = msgs.filter((m) => m.role !== 'user');
  const counts = new Map<string, number>(); ai.forEach((m) => { const p = m.meta?.teaching?.primary; if (p) counts.set(p, (counts.get(p) ?? 0) + 1); });
  const method = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const independentSuccess = ai.some((m) => { const lt = ltOf(m); return Boolean(lt?.answeringCheck && ok(lt.assessment?.verdict) && !(lt.hintLevel ?? 0)); });
  return { method, independentSuccess };
}

// ------------------------------------------------------------------------------------------------ database parts
async function sessionsModel() { return (await import('../models/TutorSession')).TutorSession; }

/** Summarises up to 5 of the learner's quiet, unsummarised sessions (never the current one). Never throws. */
export async function ensureSummaries(studentId: string, currentSessionId?: string, now = new Date()): Promise<void> {
  if (!sessionMemoryOn()) return;
  try {
    const TutorSession = await sessionsModel();
    const { loadTutorMessages } = await import('./tutorMessages');
    const done = new Set((await SessionSummary.find({ studentId }).sort({ endedAt: -1 }).limit(50).select('sessionId').lean()).map((s) => s.sessionId));
    const quiet = await TutorSession.find({ studentId, id: { $ne: currentSessionId }, lastMessageAt: { $lt: new Date(now.getTime() - QUIET_MINUTES * 60_000) }, messageCount: { $gte: 2 } })
      .sort({ lastMessageAt: -1 }).limit(20).lean();
    for (const s of quiet.filter((x) => !done.has(x.id)).slice(0, 5)) {
      const msgs = (await loadTutorMessages(s as never)) as unknown as MsgLike[];
      const sum = summarizeTurns(msgs);
      if (!sum) continue;
      await SessionSummary.updateOne({ sessionId: s.id }, { $setOnInsert: { sessionId: s.id, studentId, institutionId: s.institutionId, courseId: s.courseId, ...sum, lessonId: sum.lessonId ?? s.lessonId, objectiveId: sum.objectiveId ?? s.objectiveId, version: SUMMARY_VERSION } }, { upsert: true });
    }
  } catch (error) {
    logger.warn('session_summary_failed', { error: serializeError(error) });
  }
}

/** Lesson item ids the learner answered in earlier sessions on this lesson (phase 2: never offered again as "next"). */
export async function priorAnsweredItems(studentId: string, lessonId?: string): Promise<string[]> {
  if (!sessionMemoryOn() || !lessonId) return [];
  try {
    const rows = await SessionSummary.find({ studentId, lessonId }).sort({ endedAt: -1 }).limit(20).select('answeredItemIds').lean();
    return [...new Set(rows.flatMap((r) => r.answeredItemIds ?? []))];
  } catch { return []; }
}

/** The brief's phase 2-3 lines for a session start (first reply) or any turn: last session, profile, habits. */
export async function memoryLines(p: { studentId: string; sessionId?: string; courseId?: string; firstTurn: boolean; now?: Date }): Promise<{ lines: string[]; reviewOpening: boolean }> {
  const now = p.now ?? new Date(); const out: string[] = []; let reviewOpening = false;
  try {
    if (sessionMemoryOn() && p.firstTurn) {
      await ensureSummaries(p.studentId, p.sessionId, now);
      const last = await SessionSummary.findOne({ studentId: p.studentId, sessionId: { $ne: p.sessionId }, ...(p.courseId ? { courseId: p.courseId } : {}) }).sort({ endedAt: -1 }).lean();
      if (last) {
        const { LearningObjective } = await import('../models/LearningObjective');
        const { errorTypeLabel } = await import('./learnerLanguageProfile');
        const title = last.objectiveId ? (await LearningObjective.findOne({ id: last.objectiveId }).select('title').lean())?.title : undefined;
        out.push(lastSessionLine(last, title as string | undefined, now, (c) => errorTypeLabel(c) || c.replace(/_/g, ' ')));
      }
    }
    if (learnerProfileOn()) {
      out.push(...profileLines(await LearnerProfile.findOne({ studentId: p.studentId }).lean()));
      if (p.firstTurn) {
        const h = await habitsFor(p.studentId, now);
        const hl = habitsLines(h); out.push(...hl); if (hl.length) reviewOpening = true;
      }
    }
  } catch (error) {
    logger.warn('learner_memory_lines_failed', { error: serializeError(error) });
  }
  return { lines: out, reviewOpening };
}

// Phase 3: profile.
export async function getProfile(studentId: string) {
  const p = await LearnerProfile.findOne({ studentId }).lean();
  return { studentId, firstLanguage: p?.firstLanguage ?? null, interests: p?.interests ?? [], accommodations: p?.accommodations ?? [], options: { firstLanguages: FIRST_LANGUAGES, interests: INTERESTS, accommodations: ACCOMMODATIONS } };
}
export async function setProfileField(studentId: string, institutionId: string | undefined, field: 'firstLanguage' | 'interests' | 'accommodations', value: unknown, actor: { id: string; role: string }) {
  const set = value === null || value === undefined ? { $unset: { [field]: 1 } } : { $set: { [field]: value } };
  await LearnerProfile.updateOne({ studentId }, { ...set, $setOnInsert: { studentId, ...(institutionId ? { institutionId } : {}) }, $push: { history: { $each: [{ at: new Date(), by: actor.id, role: actor.role, field }], $slice: -50 } } }, { upsert: true });
  return getProfile(studentId);
}

// Phase 3: habits.
const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** Nightly: yesterday's tutor activity per learner (idempotent upsert). */
export async function runHabitsRollup(now = new Date()): Promise<{ learners: number }> {
  if (!learnerProfileOn()) return { learners: 0 };
  const { TutorMessage } = await import('../models/TutorMessage');
  const to = dayStart(now); const from = new Date(to.getTime() - 86_400_000);
  const msgs = await TutorMessage.find({ role: 'user', timestamp: { $gte: from, $lt: to } }).select('sessionId studentId institutionId timestamp').lean() as unknown as { sessionId: string; studentId: string; institutionId?: string; timestamp: Date }[];
  const by = new Map<string, typeof msgs>();
  for (const m of msgs) { const l = by.get(m.studentId) ?? []; l.push(m); by.set(m.studentId, l); }
  for (const [studentId, list] of by) {
    const r = dayRollup(list.map((m) => ({ sessionId: m.sessionId, at: new Date(m.timestamp) })));
    await StudyHabitDaily.updateOne({ studentId, day: from }, { $set: { ...r, institutionId: list[0].institutionId } }, { upsert: true });
  }
  return { learners: by.size };
}
export async function habitsFor(studentId: string, now = new Date()): Promise<HabitsSummary | null> {
  const rows = await StudyHabitDaily.find({ studentId, day: { $gte: new Date(now.getTime() - 30 * 86_400_000) } }).lean();
  return rows.length ? habitsSummary(rows, now) : null;
}

// Phase 4: what works (view only).
// methodFromEvidence (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN G, ARCHITECTURE.md §8 experiential memory): the planner may prefer the main
// method this learner has most often succeeded after (independent success: right first time, no hint), from their own sessions.
export const methodFromEvidenceOn = (): boolean => engineV2('methodFromEvidence');
export const EVIDENCE_MIN_SESSIONS = 3;
export const EVIDENCE_MARGIN = 0.15;
/** The method that clearly worked best for this learner: at least 3 sessions with it, and a success rate at least 15 points above
 *  their overall rate. Undefined when the evidence is thin or no method stands out. Observational, so the margin is deliberately large. */
export function bestMethod(stats: MethodStat[]): string | undefined {
  const total = stats.reduce((a, s) => a + s.sessions, 0);
  if (!total) return undefined;
  const overall = stats.reduce((a, s) => a + s.withIndependentSuccess, 0) / total;
  const top = stats.filter((s) => s.sessions >= EVIDENCE_MIN_SESSIONS && s.rate >= overall + EVIDENCE_MARGIN).sort((a, b) => b.rate - a.rate || b.sessions - a.sessions)[0];
  return top?.method;
}
const bestCache = new Map<string, { at: number; v: string | undefined }>();
/** bestMethod for a learner (their last 90 days), cached 15 minutes per learner; never throws. */
export async function bestMethodFor(studentId: string, now = new Date()): Promise<string | undefined> {
  if (!methodFromEvidenceOn()) return undefined;
  const hit = bestCache.get(studentId);
  if (hit && now.getTime() - hit.at < 15 * 60_000) return hit.v;
  let v: string | undefined;
  try { v = bestMethod((await whatWorksFor(studentId, now)).methods); } catch { v = undefined; }
  bestCache.set(studentId, { at: now.getTime(), v });
  return v;
}

export async function whatWorksFor(studentId: string, now = new Date()) {
  const TutorSession = await sessionsModel();
  const { loadMessagesForSessions } = await import('./tutorMessages');
  const sessions = await TutorSession.find({ studentId, lastMessageAt: { $gte: new Date(now.getTime() - 90 * 86_400_000) } }).sort({ lastMessageAt: -1 }).limit(60).lean();
  const msgs = await loadMessagesForSessions(sessions as never, { role: 'ai' });
  const methods = whatWorksFrom(sessions.map((s) => sessionMethodOutcome((msgs.get(s.id) ?? []) as unknown as MsgLike[])));
  const { LearnerLanguageProfile } = await import('../models/LearnerLanguageProfile');
  const lp = await LearnerLanguageProfile.findOne({ studentId }).select('worked').lean();
  return { methods, explanationStylesBeforeSuccess: (lp?.worked ?? []).map((w: { style: string; count: number }) => ({ style: w.style, count: w.count })), note: 'Observational: shows what was used before an independent success, not that it caused it.' };
}

// ------------------------------------------------------------------------------------------------ memory report (owner: "watch real use on lms-test")
/** School-level counts for the last `days` days (ids and counts only): errors to work on, sessions, profiles, habits, tutor guards. */
export async function memoryReport(p: { institutionId?: string; days: number; now?: Date }) {
  const now = p.now ?? new Date(); const since = new Date(now.getTime() - p.days * 86_400_000);
  const school = p.institutionId ? { institutionId: p.institutionId } : {};
  const { ErrorToWorkOn } = await import('../models/ErrorToWorkOn');
  const { TutorMessage } = await import('../models/TutorMessage');
  const errs = await ErrorToWorkOn.find(school).select('studentId status firstSeenAt statusHistory sources').lean();
  const inPeriod = (d?: Date) => Boolean(d && new Date(d) >= since);
  const moves = (to: string) => errs.reduce((n, e) => n + (e.statusHistory ?? []).filter((h) => h.to === to && h.from && inPeriod(h.at)).length, 0);
  const replies = await TutorMessage.find({ ...school, role: 'ai', timestamp: { $gte: since } }).select('studentId meta.languageTurn.workOnErrorId meta.languageTurn.postCheck').lean() as unknown as { studentId: string; meta?: { languageTurn?: { workOnErrorId?: string; postCheck?: string[] } } }[];
  const pc = new Map<string, number>();
  for (const r of replies) for (const c of r.meta?.languageTurn?.postCheck ?? []) pc.set(c, (pc.get(c) ?? 0) + 1);
  const summaries = await SessionSummary.find({ ...school, endedAt: { $gte: since } }).select('right wrong nextStep stoppedWithOpenItem').lean();
  const next = new Map<string, number>(); summaries.forEach((s) => next.set(s.nextStep, (next.get(s.nextStep) ?? 0) + 1));
  const profiles = await LearnerProfile.find(school).select('firstLanguage interests accommodations').lean();
  const habits = await StudyHabitDaily.find({ ...school, day: { $gte: since } }).select('studentId minutes').lean();
  return {
    period: { days: p.days, from: since, to: now },
    errorsToWorkOn: {
      recorded: errs.filter((e) => inPeriod(e.firstSeenAt)).length, open: errs.filter((e) => e.status === 'open').length,
      resolved: moves('resolved'), reopened: moves('open'), dismissed: moves('dismissed'),
      learnersWithOpen: new Set(errs.filter((e) => e.status === 'open').map((e) => e.studentId)).size,
      fromPractice: errs.filter((e) => inPeriod(e.firstSeenAt) && (e.sources ?? []).some((s) => s.kind === 'practice_attempt')).length,
      practiceItemsSetByTutor: replies.filter((r) => r.meta?.languageTurn?.workOnErrorId).length,
    },
    sessions: { summarised: summaries.length, right: summaries.reduce((n, s) => n + s.right, 0), wrong: summaries.reduce((n, s) => n + s.wrong, 0), stoppedWithOpenItem: summaries.filter((s) => s.stoppedWithOpenItem).length, nextStep: Object.fromEntries(next) },
    profiles: { withFirstLanguage: profiles.filter((x) => x.firstLanguage).length, withInterests: profiles.filter((x) => x.interests?.length).length, withAccommodations: profiles.filter((x) => x.accommodations?.length).length },
    habits: { activeLearners: new Set(habits.map((h) => h.studentId)).size, minutes: habits.reduce((n, h) => n + h.minutes, 0) },
    tutorReplies: { total: replies.length, guardRemovals: Object.fromEntries(pc) },
  };
}

import { AppError } from '../middleware/errorHandler';
import { ParentLearnerLink, type IParentLearnerLink, type ParentControls } from '../models/ParentLearnerLink';
import { Student } from '../models/Student';
import { Institution } from '../models/Institution';
import { TutorSession } from '../models/TutorSession';
import { TutorMessage } from '../models/TutorMessage';
import { LessonProgress } from '../models/LessonProgress';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { LearningObjective } from '../models/LearningObjective';
import { LearningEvent } from '../models/LearningEvent';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { SafetyAlert } from '../models/SafetyAlert';
import { loadTutorMessages } from '../services/tutorMessages';
import { canDo, controlsModeFor, tierOf, transcriptExpired, visibilityFor, wordingFor, type ParentAction, type Tier, TRANSCRIPT_RETENTION_DAYS } from './policy';
import { CEFR_ORDER, PARENT_LEVEL_LABELS, checkpointLevel, computeLevel, courseOutcomes, loadOutcomes, subLevelName, type Cefr } from './levels';
import { addDays, cairoDay, cairoDayStart, cairoTime, isWeekend, weekDays, weekStartDay } from './time';
import * as mock from './mock';
import { classOfAttempts, classOfCourse, classesForLabels } from '../services/multiClass';
import { READ_CHECK_ACTOR, endParentLink, endReasonFor } from './linkLifecycle';
import { parentAccessOf, schoolAccessOffError, schoolsWithAccessOff } from './schoolAccess';
import { attemptVerified, attemptVisible, resultsPolicyFor, visibleAttemptFilter, type ResultsPolicy } from './resultVisibility';

// Parents Portal data. Everything is computed from live data on each request
// (user decision: real-time progress, no weekly snapshot or cache). Sections
// built from src/parents/mock carry `mock: true`.

const DAY = 86_400_000;
const MAX_SESSION_MIN = 120;
export const DEFAULT_CONTROLS: ParentControls = { weeklyGoalMin: 90, dailyLimitMin: 45, focus: 'conversation', reminders: false, liveAvatar: true, microphone: true, camera: false };

export interface LearnerContext {
  link: IParentLearnerLink;
  student: { id: string; name: string; institutionId?: string; adaptiveProfile?: { strengths?: string[]; weaknesses?: string[] } };
  tier: Tier;
  age?: number;
  firstName: string;
}

/**
 * The one gate for every learner-scoped parent endpoint: an active link for
 * this parent, the student still there (not deleted, not archived, still in
 * the link's school: P0 item 2, checked on every read), and the action allowed
 * by the link's role. A link that fails the student check is ended here
 * (linkLifecycle.ts) and the parent gets 403 PARENT_LINK_ENDED, as for a link
 * already ended. No link, or a pending one: 403 PARENT_ACCESS_DENIED.
 */
export async function requireLearner(parentUserId: string, studentId: string, action: ParentAction = 'read'): Promise<LearnerContext> {
  const denied = () => new AppError('You do not have access to this learner', 403, 'PARENT_ACCESS_DENIED');
  const ended = () => new AppError('Your access to this learner has ended', 403, 'PARENT_LINK_ENDED');
  const link = await ParentLearnerLink.findOne({ parentUserId, studentId });
  if (!link) throw denied();
  if (link.status === 'ended') throw ended();
  const student = await Student.findOne({ id: studentId }).select('+learnerAgeBand +birthDate id name institutionId adaptiveProfile archivedAt').lean();
  const reason = endReasonFor(link, student);
  if (reason) {
    await endParentLink(link, reason, READ_CHECK_ACTOR);
    throw ended();
  }
  if (!student || !visibilityFor(link).progress || !canDo(link, action)) throw denied();
  // Parents P1: the school switched parent access Off. The link is kept (not ended).
  if ((await parentAccessOf(link.institutionId)) === 'off') throw schoolAccessOffError();
  const t = tierOf(student);
  return { link, student: student as LearnerContext['student'], tier: t.tier, age: t.age, firstName: String(student.name || '').trim().split(/\s+/)[0] || 'Learner' };
}

/** Parents P3: the results rule of the child's school (the link's school). */
const policyOf = (ctx: LearnerContext): Promise<ResultsPolicy> => resultsPolicyFor(ctx.link.institutionId ?? ctx.student.institutionId);

function learnerHeader(ctx: LearnerContext) {
  return {
    studentId: ctx.student.id,
    name: ctx.student.name,
    firstName: ctx.firstName,
    initial: ctx.firstName.charAt(0).toUpperCase(),
    age: ctx.age ?? null,
    tier: ctx.tier,
    role: ctx.link.role,
    wording: wordingFor(ctx.tier),
    controlsMode: controlsModeFor(ctx.tier),
    visibility: visibilityFor(ctx.link, ctx.tier),
  };
}

const envelope = <T extends Record<string, unknown>>(ctx: LearnerContext, body: T) => ({ generatedAt: new Date().toISOString(), timezone: 'Africa/Cairo', learner: learnerHeader(ctx), ...body });

// Multi-class step 6 (Q3): one view of the child; for a child in several
// classes each activity is labelled by class and a class filter is offered.
// Null (no labels, no filter, today's reply) for every other child.
async function classView(ctx: LearnerContext, classId: unknown) {
  const classes = await classesForLabels({ id: ctx.student.id, institutionId: ctx.student.institutionId });
  if (!classes) return null;
  const filter = typeof classId === 'string' && classes.some((c) => c.id === classId) ? classId : null;
  return { classes, filter, list: classes.map((c) => ({ id: c.id, name: c.name })) };
}

// ---------------------------------------------------------------------------
// Learners list

/**
 * The parent's children. Same student check as requireLearner: a child who is
 * deleted, archived or no longer in the link's school is not listed (the link
 * is ended there and then). Ended links are listed apart, in `ended`, with the
 * link ID and end date only: no child name, ID, school or reason (the safer
 * choice: nothing about the child after access ends, and nothing at all about
 * a deleted one).
 */
export async function listLearners(parentUserId: string) {
  const links = await ParentLearnerLink.find({ parentUserId }).lean();
  const live = links.filter((l) => l.status === 'active' || l.status === 'pending');
  const students = await Student.find({ id: { $in: live.map((l) => l.studentId) } }).select('+learnerAgeBand +birthDate id name institutionId archivedAt').lean();
  const byId = new Map(students.map((s) => [s.id, s]));
  const endedNow = new Set<string>();
  for (const l of live) {
    const reason = endReasonFor(l, byId.get(l.studentId));
    if (!reason) continue;
    await endParentLink(l, reason, READ_CHECK_ACTOR);
    endedNow.add(l.id);
  }
  // Parents P1: children at a school with parent access Off are left out (links kept).
  const off = await schoolsWithAccessOff(live.map((l) => l.institutionId));
  const hiddenBySchool = live.filter((l) => !endedNow.has(l.id) && l.status === 'active' && off.has(String(l.institutionId))).length;
  const usable = live.filter((l) => !endedNow.has(l.id) && !off.has(String(l.institutionId)));
  const schools = await Institution.find({ id: { $in: students.map((s) => s.institutionId).filter(Boolean) } }).select('id name').lean();
  const learners = usable.filter((l) => l.status === 'active').flatMap((l) => {
    const s = byId.get(l.studentId);
    if (!s) return [];
    const t = tierOf(s);
    const firstName = String(s.name || '').trim().split(/\s+/)[0] || 'Learner';
    return [{ studentId: s.id, linkId: l.id, name: s.name, firstName, initial: firstName.charAt(0).toUpperCase(), age: t.age ?? null, tier: t.tier, role: l.role, consent: l.consent ?? 'not_required', school: schools.find((x) => x.id === s.institutionId)?.name ?? null }];
  });
  // Pending links show nothing of the learner.
  const pending = usable.filter((l) => l.status === 'pending').map((l) => ({ linkId: l.id, status: 'pending' as const, createdAt: l.createdAt }));
  const ended = links
    .filter((l) => l.status === 'ended' || endedNow.has(l.id))
    .map((l) => ({ linkId: l.id, status: 'ended' as const, endedAt: l.endedAt ?? new Date() }));
  return { generatedAt: new Date().toISOString(), learners, pending, ended, ...(hiddenBySchool ? { hiddenBySchool } : {}) };
}

// ---------------------------------------------------------------------------
// Sessions (real: tutor_sessions + tutor_messages)

const METHOD_WORDS: Record<string, { en: string; ar: string }> = {
  socratic: { en: 'Guided questions', ar: 'أسئلة موجّهة' },
  socratic_questioning: { en: 'Guided questions', ar: 'أسئلة موجّهة' },
  gap_filler: { en: 'Filling the gaps', ar: 'تكملة الناقص' },
  error_analysis: { en: 'Fixing mistakes together', ar: 'تصحيح الأخطاء سوا' },
  direct_instruction: { en: 'Clear explanation', ar: 'شرح واضح' },
  scaffolding: { en: 'Step-by-step help', ar: 'مساعدة خطوة بخطوة' },
  retrieval_practice: { en: 'Quick recall questions', ar: 'أسئلة تذكّر سريعة' },
  spaced_repetition: { en: 'Spaced word review', ar: 'مراجعة كلمات على فترات' },
  worked_example: { en: 'Worked examples', ar: 'أمثلة محلولة' },
  gamification: { en: 'Game', ar: 'لعبة' },
  narrative_contextual: { en: 'Storytelling', ar: 'حكاية' },
  guided_practice: { en: 'Guided practice', ar: 'تدريب بمساعدة' },
  independent_practice: { en: 'Practice on their own', ar: 'تدريب لوحده' },
  visual_explanation: { en: 'Picture talk', ar: 'كلام عن صور' },
  analogy: { en: 'Comparisons', ar: 'تشبيهات' },
  formative_feedback: { en: 'Feedback as they go', ar: 'ملاحظات أثناء الشغل' },
};
export function methodWords(code: string): { en: string; ar: string } {
  if (METHOD_WORDS[code]) return METHOD_WORDS[code];
  const en = code.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return { en, ar: en };
}

interface SessionRow {
  id: string;
  title: string;
  lessonTitle?: string;
  courseId?: string;
  mode: 'chat' | 'voice';
  startedAt: Date;
  endedAt: Date;
  durationMin: number;
  messageCount: number;
  learnerMessages: number;
  methods: string[];
}

async function loadSessions(studentId: string, since: Date): Promise<SessionRow[]> {
  const sessions = await TutorSession.find({ studentId, lastMessageAt: { $gte: since } }).select('id title lessonTitle courseId mode teachingMethod createdAt lastMessageAt messages messageCount').sort({ lastMessageAt: -1 }).limit(300).lean();
  if (!sessions.length) return [];
  const agg = await TutorMessage.aggregate<{ _id: string; first: Date; last: Date; count: number; learner: number; methods: (string | null)[]; legacy: (string | null)[] }>([
    { $match: { studentId, sessionId: { $in: sessions.map((s) => s.id) } } },
    { $group: { _id: '$sessionId', first: { $min: '$timestamp' }, last: { $max: '$timestamp' }, count: { $sum: 1 }, learner: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } }, methods: { $addToSet: '$meta.teaching.primary' }, legacy: { $addToSet: '$meta.teachingMethod' } } },
  ]);
  const byId = new Map(agg.map((a) => [a._id, a]));
  return sessions.map((s) => {
    const a = byId.get(s.id);
    const embedded = (s.messages ?? []) as { role: string; timestamp: Date }[];
    const times = [...embedded.map((m) => new Date(m.timestamp).getTime()), ...(a ? [new Date(a.first).getTime(), new Date(a.last).getTime()] : [])];
    const start = times.length ? Math.min(...times) : new Date((s as { createdAt?: Date }).createdAt ?? s.lastMessageAt).getTime();
    const end = times.length ? Math.max(...times) : new Date(s.lastMessageAt).getTime();
    const methods = [...new Set([...(a?.methods ?? []), ...(a?.legacy ?? []), s.teachingMethod].filter((m): m is string => !!m))];
    return {
      id: s.id,
      title: s.title,
      lessonTitle: s.lessonTitle,
      courseId: s.courseId,
      mode: s.mode ?? 'chat',
      startedAt: new Date(start),
      endedAt: new Date(end),
      durationMin: Math.min(MAX_SESSION_MIN, Math.max(1, Math.round((end - start) / 60_000))),
      messageCount: (a?.count ?? 0) + embedded.length,
      learnerMessages: (a?.learner ?? 0) + embedded.filter((m) => m.role === 'user').length,
      methods,
    };
  }).filter((s) => s.messageCount > 0);
}

function minutesByDay(sessions: SessionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const d = cairoDay(s.startedAt);
    m.set(d, (m.get(d) ?? 0) + s.durationMin);
  }
  return m;
}

function streakFrom(days: Set<string>, today: string): number {
  // A streak still counts if today has no practice yet.
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

// ---------------------------------------------------------------------------
// Weekly status (real)

export async function weeklyStatus(ctx: LearnerContext, now = new Date()) {
  const week = weekDays(now);
  const since = new Date(cairoDayStart(addDays(week[0], -60)).getTime());
  const sessions = await loadSessions(ctx.student.id, since);
  const perDay = minutesByDay(sessions);
  const eventDays = await LearningEvent.distinct('at', { studentId: ctx.student.id, at: { $gte: cairoDayStart(week[0]) }, type: { $in: ['lesson_completed', 'assessment_submitted', 'review_answered', 'question_answered'] } }).then((xs: Date[]) => new Set(xs.map((x) => cairoDay(new Date(x)))));
  const today = cairoDay(now);
  const practisedDays = new Set([...perDay.keys(), ...eventDays]);
  const goalMinutes = (ctx.link.controls?.weeklyGoalMin as number | undefined) ?? DEFAULT_CONTROLS.weeklyGoalMin;
  const minutesDone = week.reduce((sum, d) => sum + (perDay.get(d) ?? 0), 0);
  const weekSessions = sessions.filter((s) => s.startedAt >= cairoDayStart(week[0]));
  const daysElapsed = week.indexOf(today) + 1;
  const lastPractised = [...practisedDays].filter((d) => d <= today).sort().pop() ?? null;
  const daysSinceLast = lastPractised ? Math.round((cairoDayStart(today).getTime() - cairoDayStart(lastPractised).getTime()) / DAY) : null;

  const alerts = await visibleAlerts(ctx, now);
  const recentAlert = alerts.items.find((a) => now.getTime() - new Date(a.createdAt).getTime() < 7 * DAY);
  const drop = await scoreDrop(ctx.student.id, await policyOf(ctx));

  let status: 'on_track' | 'needs_nudge' | 'check_this' = 'on_track';
  let reason: { code: string; params: Record<string, unknown> };
  const params = { name: ctx.firstName, minutesDone, goalMinutes, daysLeft: 7 - daysElapsed };
  if (recentAlert) {
    status = 'check_this';
    reason = { code: 'safety_alert', params: { ...params, category: recentAlert.category } };
  } else if (drop) {
    status = 'check_this';
    reason = { code: 'score_drop', params: { ...params, ...drop } };
  } else if ((daysSinceLast ?? 99) >= 3) {
    status = 'needs_nudge';
    reason = { code: 'missed_days', params: { ...params, missedDays: Math.min(daysSinceLast ?? daysElapsed, daysElapsed) } };
  } else if (minutesDone < goalMinutes && minutesDone < 0.6 * goalMinutes * (daysElapsed / 7)) {
    status = 'needs_nudge';
    reason = { code: 'behind_pace', params };
  } else {
    reason = { code: minutesDone >= goalMinutes ? 'goal_reached' : 'on_pace', params };
  }

  return {
    mock: false,
    weekStart: week[0],
    days: week.map((d) => ({ day: d, practised: practisedDays.has(d), minutes: perDay.get(d) ?? 0, isToday: d === today, isFuture: d > today, weekend: isWeekend(d) })),
    minutesDone,
    goalMinutes,
    goalSource: ctx.link.controls?.weeklyGoalMin ? 'controls' : 'default',
    goalAcceptedByLearner: ctx.tier === 'kid' ? null : ctx.link.controls?.learnerAccepted ?? false,
    sessions: weekSessions.length,
    streak: streakFrom(practisedDays, today),
    lastPractised,
    status,
    reason,
  };
}

async function scoreDrop(studentId: string, policy: ResultsPolicy): Promise<{ from: number; to: number } | null> {
  // P3: only results the parent may see (an unreleased score never shows as a drop).
  const last = await AssessmentAttempt.find({ studentId, status: 'submitted', score: { $type: 'number' }, ...visibleAttemptFilter(policy) }).sort({ submittedAt: -1 }).limit(2).select('score submittedAt').lean();
  if (last.length < 2) return null;
  const [a, b] = last;
  return (b.score as number) - (a.score as number) >= 20 ? { from: b.score as number, to: a.score as number } : null;
}

// ---------------------------------------------------------------------------
// Level and progress

async function masteredOutcomes(studentId: string) {
  const outcomeIds = new Set(loadOutcomes().map((o) => o.id));
  const rows = await StudentObjectiveMastery.find({ studentId }).select('objectiveId masteryStatus needsVerification').lean();
  const objectives = rows.length ? await LearningObjective.find({ id: { $in: rows.map((r) => r.objectiveId) } }).select('id code').lean() : [];
  const codeOf = new Map(objectives.map((o) => [o.id, o.code]));
  const mastered = new Set<string>();
  const touched = new Set<string>();
  for (const r of rows) {
    const key = outcomeIds.has(r.objectiveId) ? r.objectiveId : codeOf.get(r.objectiveId);
    if (!key || !outcomeIds.has(key)) continue;
    touched.add(key);
    if (r.masteryStatus === 'mastered' && !r.needsVerification) mastered.add(key);
  }
  return { mastered, touched, masteredAny: rows.filter((r) => r.masteryStatus === 'mastered').length };
}

async function passedCheckpoints(studentId: string, policy: ResultsPolicy) {
  // P3: a checkpoint test raises the CEFR level only once its result is visible to the parent.
  const attempts = await AssessmentAttempt.find({ studentId, status: 'submitted', ...visibleAttemptFilter(policy) }).select('assessmentTitle score').limit(200).lean();
  return new Set(attempts.map((a) => checkpointLevel(a.assessmentTitle, a.score)).filter((x): x is Cefr => !!x));
}

export async function levelCard(ctx: LearnerContext) {
  const m = await masteredOutcomes(ctx.student.id);
  const real = computeLevel(m.mastered, await passedCheckpoints(ctx.student.id, await policyOf(ctx)), m.touched.size > 0);
  if (real) {
    return { mock: false, basis: real.basis, cefr: real.cefr, label: PARENT_LEVEL_LABELS[real.cefr], subLevel: real.subLevel, subLevelPct: real.subLevelPct, next: real.next, nextLabel: real.next ? PARENT_LEVEL_LABELS[real.next] : null, masteredOutcomes: real.masteredCount, levelOutcomes: real.outcomeCount, _m: m };
  }
  const f = mock.mockLevel(ctx.student.id, ctx.tier);
  const next = CEFR_ORDER[CEFR_ORDER.indexOf(f.cefr) + 1] ?? null;
  const hasSub = f.cefr === 'Pre-A1' || f.cefr === 'A1' || f.cefr === 'A2';
  return { mock: true, basis: 'mock_no_evidence', cefr: f.cefr, label: PARENT_LEVEL_LABELS[f.cefr], subLevel: hasSub ? subLevelName(f.cefr, f.subLevelPct) : null, subLevelPct: hasSub ? f.subLevelPct : null, next, nextLabel: next ? PARENT_LEVEL_LABELS[next] : null, masteredOutcomes: null, levelOutcomes: null, _m: m };
}

function stripInternal<T extends { _m?: unknown }>(x: T): Omit<T, '_m'> {
  const { _m, ...rest } = x;
  void _m;
  return rest;
}

export async function progress(ctx: LearnerContext, classId?: unknown) {
  const level = await levelCard(ctx);
  const policy = await policyOf(ctx);
  let canDos: { mock: boolean; items: { id: string; text: { en: string; ar: string }; state: 'achieved' | 'in_progress' | 'not_started' }[] };
  if (!level.mock) {
    const items = courseOutcomes(level.cefr).filter((o) => o.measurable === 'yes' || o.measurable === undefined).map((o) => ({ id: o.id, text: { en: o.statement.replace(/^Can /, ''), ar: o.statement.replace(/^Can /, '') }, state: (level._m.mastered.has(o.id) ? 'achieved' : level._m.touched.has(o.id) ? 'in_progress' : 'not_started') as 'achieved' | 'in_progress' | 'not_started' }));
    canDos = items.length ? { mock: false, items } : { mock: true, items: mock.mockCanDos(level.cefr, ctx.student.id) };
  } else {
    canDos = { mock: true, items: mock.mockCanDos(level.cefr, ctx.student.id) };
  }
  const ap = ctx.student.adaptiveProfile;
  const strengths = ap?.strengths?.length && ap?.weaknesses?.length
    ? { mock: false, strengths: ap.strengths.slice(0, 2).map((s) => ({ en: s, ar: s })), focusAreas: ap.weaknesses.slice(0, 2).map((s) => ({ en: s, ar: s })) }
    : { mock: true, ...mock.mockStrengths(ctx.tier) };
  const cv = await classView(ctx, classId);
  let attempts = await AssessmentAttempt.find({ studentId: ctx.student.id, status: 'submitted' }).sort({ submittedAt: -1 }).limit(cv ? 50 : 10).select(cv ? 'id assessmentTitle score submittedAt gradingStatus assignmentId assessmentId' : 'id assessmentTitle score submittedAt gradingStatus').lean();
  const classOf = cv ? await classOfAttempts(cv.classes, attempts) : null;
  if (cv) attempts = attempts.filter((a) => !cv.filter || classOf!.get(a.id)?.id === cv.filter).slice(0, 10);
  const lessonsDone = await LessonProgress.countDocuments({ studentId: ctx.student.id, status: 'completed' });
  return envelope(ctx, {
    level: stripInternal(level),
    ladder: CEFR_ORDER.map((c) => ({ cefr: c, label: PARENT_LEVEL_LABELS[c], state: c === level.cefr ? 'current' : CEFR_ORDER.indexOf(c) < CEFR_ORDER.indexOf(level.cefr) ? 'done' : 'ahead' })),
    skills: { mock: true, items: mock.mockSkills(ctx.student.id) },
    trend: { mock: true, weeks: mock.mockTrend(ctx.student.id) },
    canDos,
    strengths,
    lessonsCompleted: { mock: false, count: lessonsDone },
    assessments: {
      mock: false,
      // P3: a result the parent may not see yet is listed as waiting for the teacher, with no score.
      items: attempts.map((a) => {
        const visible = attemptVisible(policy, a);
        const score = visible && typeof a.score === 'number' ? a.score : null;
        return { id: a.id, title: a.assessmentTitle, score, submittedAt: a.submittedAt, passed: score !== null ? score >= 60 : null, verified: visible && attemptVerified(policy, a), ...(visible ? {} : { waiting: true }), ...(classOf ? { class: classOf.get(a.id) ?? null } : {}) };
      }),
    },
    ...(cv ? { classes: { items: cv.list, filter: cv.filter } } : {}),
  });
}

// ---------------------------------------------------------------------------
// Home

export async function home(ctx: LearnerContext, now = new Date()) {
  const [status, level, alerts] = await Promise.all([weeklyStatus(ctx, now), levelCard(ctx), visibleAlerts(ctx, now)]);
  const m = level._m;
  return envelope(ctx, {
    status,
    level: { ...stripInternal(level), latestCanDo: !level.mock && m.mastered.size ? { mock: false, id: [...m.mastered].pop() } : { mock: true, text: mock.mockCanDos(level.cefr, ctx.student.id)[0]?.text ?? null } },
    learned: { mock: true, aiWritten: true, items: mock.mockLearned(ctx.tier) },
    tryAtHome: { mock: true, aiWritten: true, text: mock.mockTryAtHome(ctx.tier, ctx.firstName) },
    // v2 ("Hear the progress"): no recordings exist (audio decision), so no player.
    hearProgress: { available: false },
    alerts: { mock: alerts.mock, count: alerts.items.length, latest: alerts.items[0] ?? null },
    upcoming: { mock: true, items: mock.mockUpcoming(ctx.tier) },
  });
}

// ---------------------------------------------------------------------------
// Activity

export async function activity(ctx: LearnerContext, now = new Date(), classId?: unknown) {
  const today = cairoDay(now);
  const calStart = addDays(weekStartDay(now), -7);
  const sessions = await loadSessions(ctx.student.id, new Date(now.getTime() - 31 * DAY));
  const cv = await classView(ctx, classId);
  const classOfSession = (s: SessionRow) => (cv ? classOfCourse(cv.classes, s.courseId) : null);
  const perDay = minutesByDay(sessions);
  const calendar = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(calStart, i);
    return { day: d, state: d > today ? 'upcoming' : perDay.has(d) ? 'practised' : d === today ? 'today' : 'missed', isToday: d === today, minutes: perDay.get(d) ?? 0 };
  });
  return envelope(ctx, {
    calendar: { mock: false, days: calendar, practisedCount: calendar.filter((c) => c.state === 'practised').length, pastCount: calendar.filter((c) => c.day <= today).length },
    sessions: sessions.filter((s) => !cv?.filter || classOfSession(s)?.id === cv.filter).map((s) => {
      const insight = mock.mockSessionInsight(s.id);
      return {
        id: s.id,
        mock: false,
        day: cairoDay(s.startedAt),
        startedAt: s.startedAt.toISOString(),
        startTime: cairoTime(s.startedAt),
        durationMin: s.durationMin,
        title: s.lessonTitle || s.title,
        mode: s.mode,
        methods: s.methods.map(methodWords),
        speakingMin: s.mode === 'voice' ? s.durationMin : 0,
        // AI-written per-session summary: no summariser yet.
        insight: { mock: true, aiWritten: true, wentWell: insight.wentWell, wasHard: insight.wasHard, words: insight.words, focus: insight.focus },
        transcript: { available: !transcriptExpired(s.startedAt, now), retentionDays: TRANSCRIPT_RETENTION_DAYS },
        audio: { available: false },
        ...(cv ? { class: classOfSession(s) } : {}),
      };
    }),
    ...(cv ? { classes: { items: cv.list, filter: cv.filter } } : {}),
  });
}

export async function transcript(ctx: LearnerContext, sessionId: string, now = new Date()) {
  const session = await TutorSession.findOne({ id: sessionId, studentId: ctx.student.id }).lean();
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  const first = await TutorMessage.findOne({ sessionId }).sort({ timestamp: 1 }).select('timestamp').lean();
  const startedAt = first?.timestamp ?? (session as { createdAt?: Date }).createdAt ?? session.lastMessageAt;
  if (transcriptExpired(startedAt, now)) {
    const e = new AppError(`Conversations are kept ${TRANSCRIPT_RETENTION_DAYS} days; only the summary remains`, 410, 'TRANSCRIPT_EXPIRED');
    (e as AppError & { summary?: unknown }).summary = { title: session.lessonTitle || session.title, startedAt };
    throw e;
  }
  const messages = await loadTutorMessages(session);
  return envelope(ctx, {
    session: { id: session.id, title: session.lessonTitle || session.title, startedAt, mode: session.mode },
    retentionDays: TRANSCRIPT_RETENTION_DAYS,
    expiresAt: new Date(new Date(startedAt).getTime() + TRANSCRIPT_RETENTION_DAYS * DAY).toISOString(),
    // Only who spoke, what was said and when: no internal teaching metadata.
    messages: messages.map((m) => ({ id: m.id, from: m.role === 'user' ? 'learner' : 'enara', text: m.text, at: m.timestamp })),
    audio: { available: false },
  });
}

// ---------------------------------------------------------------------------
// Safety alerts: real SafetyAlert rows when a detector writes them; until then
// mock-sourced (decision 16 Nov 2026). Beta categories reach parents only after
// human review. Excerpts are included for every tier (visibility decision).

export async function visibleAlerts(ctx: LearnerContext, now = new Date()) {
  const vis = visibilityFor(ctx.link, ctx.tier);
  const real = await SafetyAlert.find({ studentId: ctx.student.id }).sort({ createdAt: -1 }).limit(50).lean();
  const source = real.length ? 'real' : 'mock';
  const rows = real.length
    ? real.map((a) => ({ id: a.id, category: a.category, subtype: a.subtype, actionTaken: { en: a.actionTaken, ar: a.actionTaken }, excerpt: a.excerpt, createdAt: a.createdAt.toISOString(), detector: a.detector, beta: a.beta, reviewRequired: a.reviewRequired, reviewedAt: a.reviewedAt?.toISOString() }))
    : mock.mockSafetyAlerts(ctx.student.id, now);
  const items = rows
    .filter((a) => !a.reviewRequired || !!a.reviewedAt)
    .map((a) => ({ id: a.id, category: a.category, subtype: a.subtype ?? null, actionTaken: a.actionTaken, createdAt: a.createdAt, beta: a.beta, ...(vis.alertExcerpts && a.excerpt ? { excerpt: a.excerpt } : {}) }));
  return { mock: source === 'mock', items };
}

export async function alerts(ctx: LearnerContext, now = new Date()) {
  const a = await visibleAlerts(ctx, now);
  return envelope(ctx, { alerts: a });
}

// ---------------------------------------------------------------------------
// Weekly summary (on demand, "Share this week"; no schedule)

export async function weeklyReport(ctx: LearnerContext, now = new Date()) {
  const [status, level] = await Promise.all([weeklyStatus(ctx, now), levelCard(ctx)]);
  const lessonsDone = await LessonProgress.countDocuments({ studentId: ctx.student.id, status: 'completed', completedAt: { $gte: cairoDayStart(status.weekStart) } });
  return envelope(ctx, {
    report: {
      weekStart: status.weekStart,
      status: status.status,
      reason: status.reason,
      minutesDone: status.minutesDone,
      goalMinutes: status.goalMinutes,
      streak: status.streak,
      sessions: status.sessions,
      lessonsDone,
      outcomesMastered: level._m.masteredAny,
      level: stripInternal(level),
      learned: { mock: true, aiWritten: true, items: mock.mockLearned(ctx.tier).slice(0, 3) },
      tryAtHome: { mock: true, aiWritten: true, text: mock.mockTryAtHome(ctx.tier, ctx.firstName) },
      portalPath: '/parents',
    },
  });
}

// ---------------------------------------------------------------------------
// Controls (stored, not enforced yet)

export function controlsOf(ctx: LearnerContext) {
  return envelope(ctx, { controls: { ...DEFAULT_CONTROLS, ...(ctx.link.controls ?? {}) }, mode: controlsModeFor(ctx.tier), enforced: false });
}

export async function updateControls(ctx: LearnerContext, body: Record<string, unknown>) {
  const cur: ParentControls = { ...DEFAULT_CONTROLS, ...(ctx.link.controls ?? {}) };
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const focus = ['conversation', 'school', 'exam', 'reading'].includes(String(body.focus)) ? (body.focus as ParentControls['focus']) : cur.focus;
  const next: ParentControls = {
    weeklyGoalMin: num(body.weeklyGoalMin, 30, 300, cur.weeklyGoalMin),
    dailyLimitMin: num(body.dailyLimitMin, 15, 120, cur.dailyLimitMin),
    focus,
    reminders: bool(body.reminders, cur.reminders),
    liveAvatar: bool(body.liveAvatar, cur.liveAvatar),
    microphone: bool(body.microphone, cur.microphone),
    camera: bool(body.camera, cur.camera),
    // 13+: every parent change is a suggestion until the learner accepts it.
    learnerAccepted: ctx.tier === 'kid' ? undefined : false,
    updatedAt: new Date(),
  };
  await ParentLearnerLink.updateOne({ _id: ctx.link._id }, { $set: { controls: next } });
  ctx.link.controls = next;
  return controlsOf(ctx);
}

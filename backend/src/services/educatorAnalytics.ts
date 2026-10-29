import type { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { Assignment } from '../models/Assignment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { CourseInstance } from '../models/CourseInstance';
import { LearningObjective } from '../models/LearningObjective';
import { Student } from '../models/Student';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { logger } from '../utils/logging';
import { studentStatus, type StudentStatus } from './assignments';
import { CHART_VERSION, validateChart, type ChartPayload, type ChartType, type ChartUnit } from './chartPayload';
import { isFeatureEnabled } from './featureFlags';
import { classStudentIds } from './learningAccess';
import { originFilter, studentsInView } from './originScope';
import { normaliseArabic } from './textSearch';
import { matchStudentNames, nearStudentNames, studentProfiles, type StudentProfile } from './studentDirectory';

// Educator analytics in AI Chat (first slice, analytics-v1). A teacher or
// Workspace Admin asks about their own classes in English or Arabic and gets a
// report computed here, deterministically, from records they may already read:
// assignments, attempts (finalized or released scores only), class rosters and
// learning-objective mastery. There is no model call on this path: the intent
// comes from fixed patterns, every number from code below, and the summary
// from templates. Scope is derived from the session (teachers: classes they
// instruct; admins: their school) and never from the question; the question
// can only narrow it. Nothing is written except the chat message itself.

export const ANALYTICS_VERSION = 'analytics-v1';
export const ANALYTICS_LIMITS = { maxClasses: 20, maxStudents: 500, maxAssignments: 50, maxRows: 50, defaultDays: 90, maxDays: 365, defaultLastN: 3, maxLastN: 8 } as const;

export const ANALYTICS_INTENTS = ['class_performance_summary', 'assessment_trend', 'student_progress_comparison', 'missing_submissions', 'score_distribution', 'learning_gap_summary', 'student_ranking', 'student_report'] as const;
export type AnalyticsIntent = (typeof ANALYTICS_INTENTS)[number];
export type Lang = 'en' | 'ar';

export interface AnalyticsPlan {
  intent: AnalyticsIntent;
  language: Lang;
  days: number;
  daysDefaulted: boolean;
  daysClamped: boolean;
  lastN: number;
  chartRequested: boolean;
  chartType?: ChartType;
  metric: 'score' | 'submission';
  notes: string[];
  // Explicit dates (inclusive, UTC days); otherwise `days` back from now.
  range?: { from: Date; to: Date };
  // A class name the request mentions, resolved locally against the caller's
  // own classes (never an id; never widens scope).
  classReference?: string;
  // How the intent was found: the fixed patterns or the metered model router (P9).
  via: 'patterns' | 'model';
  // student_ranking: highest or lowest first (P10).
  rankOrder?: 'highest' | 'lowest';
}
export type ClarifyReason = 'future_period' | 'invalid_period' | 'ambiguous_intent' | 'multiple_reports' | 'missing_class' | 'unclear_period' | 'redaction_failed' | 'router_unavailable' | 'router_rejected' | 'student_not_found';
export type Unsupported = 'attendance' | 'conceptual_diagram' | 'mastery_trend' | 'term_comparison';
export type PlanOutcome = { plan: AnalyticsPlan } | { unsupported: Unsupported; language: Lang } | { clarify: ClarifyReason; language: Lang } | null;

export interface AnalyticsResult {
  version: typeof ANALYTICS_VERSION;
  status: 'answered' | 'needs_clarification' | 'unsupported';
  intent: AnalyticsIntent | null;
  language: Lang;
  summary: string;
  period?: { from: string; to: string; days: number; defaulted: boolean };
  scope?: { classes: { id: string; name: string }[]; students: number; role: string };
  // Set when the metered model router read the question (P9); numbers never come from it.
  interpretedBy?: 'model';
  // P10: the student a student report is about, and students to choose from
  // when a name is ambiguous. Authorised students only; educational fields only.
  student?: StudentProfile;
  candidates?: StudentProfile[];
  filters: string[];
  metrics: { key: string; label: string; value: number | null; unit: ChartUnit; definition: string; n: number }[];
  table?: { columns: { key: string; label: string }[]; rows: Record<string, string | number | null>[]; truncated: boolean; totalRows: number };
  chart?: ChartPayload;
  chartNote?: string;
  sources: string[];
  caveats: string[];
  suggestions: string[];
  generatedAt: string;
}

// ---------- intent planning (deterministic) ----------

const has = (q: string, re: RegExp) => re.test(q);
// P10: ranking students by score ("rank my students", "top 5 students", "ترتيب الطلاب", "أضعف الطلاب").
const RANKING = /\b(rank|ranks|ranking|ranked|leaderboard)\b|\b(top|best|highest|lowest|bottom|worst|weakest|strongest)\s+(\d+\s+)?(students|pupils|performers|scorers)\b|ترتيب|(اعلي|افضل|اقل|اضعف|اقوي)\s+(\d+\s+)?(الطلاب|طلاب)|الطلاب\s+(الاعلي|الافضل|الاقل|الاضعف)/;
const LOWEST_FIRST = /\b(lowest|bottom|worst|weakest)\b|اقل|اضعف|الاقل|الاضعف/;
const DATA_CONTEXT = /\b(class|classes|student|students|pupil|pupils|assessment|assessments|assignment|assignments|quiz|quizzes|test|tests|submission|submissions|submitted|score|scores|grade|grades|mastery|outcome|outcomes|objective|objectives|performance)\b|فصل|فصول|طلاب|طالب|الطلاب|تقييم|تقييمات|واجب|درجات|تسليم|يسلم|سلم|نواتج|نتائج|مستوي|اداء|فجو|التعلم/;

// Analytics answers about scores and submissions the user may already see; it
// never returns private personal details (contact, credentials, birth date,
// health), which are not in its data in the first place.
const PRIVATE_FIELDS = /\b(e-?mail|phone|mobile|address|password|passcode|date of birth|birthday|medical|health|diagnos\w*|disabilit\w*|religion|home)\b|بريد|ايميل|هاتف|جوال|موبايل|رقم الهاتف|رقم الجوال|عنوان|كلمه المرور|كلمه السر|تاريخ الميلاد|صحي|طبي/;
export function asksForPrivateStudentDetails(question: string) {
  return PRIVATE_FIELDS.test(normaliseArabic(question.toLowerCase()));
}

export function planAnalytics(question: string, now = new Date()): PlanOutcome {
  const language: Lang = /[؀-ۿ]/.test(question) ? 'ar' : 'en';
  const q = normaliseArabic(question.toLowerCase());
  if (has(q, /\b(diagram|mind ?map|flow ?chart|concept map|infographic)\b|خريطه ذهنيه|مخطط مفاهيم|رسم توضيحي/)) return { unsupported: 'conceptual_diagram', language };
  if (!DATA_CONTEXT.test(q)) return null;
  if (has(q, /\b(attendance|absent|absence|absences)\b|حضور|غياب/)) return { unsupported: 'attendance', language };
  const notes: string[] = [];
  let intent: AnalyticsIntent | null = null;
  let metric: AnalyticsPlan['metric'] = 'score';
  const submission = has(q, /\bsubmi(t|ts|tted|ssion|ssions)\b|not handed|handed in|تسليم|يسلم|سلم|مسلمش/);
  const rate = has(q, /\b(rate|percentage|percent|share)\b|نسبه/);
  const mastery = has(q, /\bmastery\b|اتقان/);
  const trendWords = has(q, /\b(trend|trends|over time|over the last|progress over|line chart|first and second|1st and 2nd)\b|تطور|اتجاه|الاول والتاني|الاول والثاني/);
  if (mastery && trendWords) return { unsupported: 'mastery_trend', language };
  if (has(q, /\b(previous|last) term\b|\bthis term\b.*\bcompare|الترم الماضي|الفصل الدراسي الماضي/)) return { unsupported: 'term_comparison', language };
  if (submission && rate) { intent = 'class_performance_summary'; metric = 'submission'; }
  else if (submission || has(q, /\bmissing\b|\bhaven'?t\b|\bdidn'?t\b.*\b(hand|turn)/)) intent = 'missing_submissions';
  else if (has(q, /\b(declin\w*|dropp\w*|went down|getting worse|fell|worse)\b|نزل|تراجع|انخفض/)) intent = 'student_progress_comparison';
  else if (has(q, /\b(distribution|histogram|spread)\b|توزيع/)) intent = 'score_distribution';
  else if (RANKING.test(q)) intent = 'student_ranking';
  else if (has(q, /\b(gap|gaps|weak|weakest|weakness|struggl\w*|outcome|outcomes|objective|objectives|misconception\w*)\b|فجو|اضعف|ضعف|نواتج التعلم/) || mastery) intent = 'learning_gap_summary';
  else if (trendWords) intent = 'assessment_trend';
  else if (has(q, /\b(report|summary|summari[sz]e|overview|performance|how (is|are)|results)\b|تقرير|ملخص|اداء|نتائج|مستوي/)) intent = 'class_performance_summary';
  if (!intent) return null;
  if (intent === 'learning_gap_summary' && trendWords) notes.push(language === 'ar' ? 'هذا تقرير الفجوات؛ اسأل عن مقارنة التقييمات في سؤال منفصل.' : 'This is the learning-gap report; ask for the assessment comparison separately.');
  if (intent === 'learning_gap_summary' && !trendWords && has(q, /قارن|\bcompare\b/)) notes.push(language === 'ar' ? 'المقارنة بين التقييمات تحتاج سؤالًا منفصلًا.' : 'Comparing assessments needs a separate question.');
  if (intent !== 'learning_gap_summary' && has(q, /\b(gap|gaps)\b|فجو/)) notes.push(language === 'ar' ? 'طلبت أكثر من تقرير؛ هذا التقرير الأول، واسأل عن الفجوات في سؤال منفصل.' : 'Your request combines several reports; this is the first. Ask about learning gaps separately.');
  const period = parsePeriod(q, language, now, notes);
  if ('clarify' in period) return { clarify: period.clarify, language };
  const { days, daysDefaulted, daysClamped, range } = period;
  const ln = q.match(/\b(?:last|past)\s+(\d{1,2})\s+(?:assessments|tests|quizzes|assignments|evaluations)\b/) ?? q.match(/اخر\s+(\d{1,2})\s+(?:تقييمات|اختبارات|واجبات)/);
  let lastN = ln ? Number(ln[1]) : intent === 'assessment_trend' && has(q, /first and second|1st and 2nd|الاول والتاني|الاول والثاني/) ? 2 : ANALYTICS_LIMITS.defaultLastN;
  if (lastN > ANALYTICS_LIMITS.maxLastN) { notes.push(language === 'ar' ? `الحد الأقصى ${ANALYTICS_LIMITS.maxLastN} تقييمات.` : `At most ${ANALYTICS_LIMITS.maxLastN} assessments are compared.`); lastN = ANALYTICS_LIMITS.maxLastN; }
  if (lastN < 2) lastN = 2;
  const { chartRequested, chartType } = parseChart(q);
  return { plan: { intent, language, days, daysDefaulted, daysClamped, lastN, chartRequested, chartType, metric, notes, ...(range ? { range } : {}), via: 'patterns', ...(intent === 'student_ranking' ? { rankOrder: LOWEST_FIRST.test(q) ? 'lowest' as const : 'highest' as const } : {}) } };
}

export function parseChart(q: string): { chartRequested: boolean; chartType?: ChartType } {
  const chartRequested = has(q, /\b(chart|graph|plot|visuali[sz]e|bar|bars|line|pie|donut)\b|رسم|بياني|اعمده|خطي|دائري/);
  const chartType: ChartType | undefined = has(q, /\bstacked\b|مكدس/) ? 'stacked_bar' : has(q, /\b(pie|donut)\b|دائري/) ? 'donut' : has(q, /\bline\b|خطي/) ? 'line' : has(q, /\bbars?\b|column|اعمده/) ? 'bar' : undefined;
  return { chartRequested, ...(chartType ? { chartType } : {}) };
}

// Period of a question (normalised text): "last N days/weeks/months/years",
// Arabic equivalents, explicit ISO dates; future windows and invalid dates
// ask back; default 90 days; at most 365.
export function parsePeriod(q: string, language: Lang, now: Date, notes: string[]): { days: number; daysDefaulted: boolean; daysClamped: boolean; range?: AnalyticsPlan['range'] } | { clarify: ClarifyReason } {
  // Period: "last N days/weeks/months", Arabic equivalents; default 90 days.
  let days = 0;
  const en = q.match(/\b(?:last|past)\s+(\d{1,3})?\s*(day|days|week|weeks|month|months|year|years)\b/);
  const ar = q.match(/(?:اخر|خلال)\s+(\d{1,3})?\s*(يوم|ايام|اسبوع|اسابيع|شهر|اشهر|شهور|سنه)/);
  const m = en ?? ar;
  if (m) {
    const k = Number(m[1] || 1);
    const unit = m[2];
    const per = /day|يوم|ايام/.test(unit) ? 1 : /week|اسبوع|اسابيع/.test(unit) ? 7 : /month|شهر|اشهر|شهور/.test(unit) ? 30 : 365;
    days = k * per;
  }
  if (has(q, /\bthis term\b|هذا الترم|الترم ده|الفصل الدراسي/) && !days) notes.push(language === 'ar' ? 'تواريخ الفصل الدراسي غير مخزنة؛ استُخدمت آخر 90 يومًا.' : 'Term dates are not stored; the last 90 days were used.');
  // Explicit dates: "from 2026-09-01 to 2026-09-30", "من 2026-09-01 الى 2026-09-30".
  let range: AnalyticsPlan['range'];
  const ex = q.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|until|through|and|-|–|الى|حتي|و)\s*(\d{4}-\d{2}-\d{2})/);
  if (ex) {
    const r = explicitRange(ex[1], ex[2], now);
    if ('clarify' in r) return { clarify: r.clarify };
    range = r.range;
    days = Math.round((+r.range.to - +r.range.from) / 86_400_000);
    if (r.clamped) notes.push(language === 'ar' ? `الفترة محدودة بـ ${ANALYTICS_LIMITS.maxDays} يومًا.` : `Periods are limited to ${ANALYTICS_LIMITS.maxDays} days.`);
  } else if (/\b(next|coming|upcoming)\s+(day|days|week|weeks|month|months|year)\b|\btomorrow\b|الاسبوع القادم|الشهر القادم|الشهر الجاي|بكره|غدا/.test(q)) {
    return { clarify: 'future_period' };
  }
  const daysDefaulted = !days;
  if (!days) days = ANALYTICS_LIMITS.defaultDays;
  const daysClamped = days > ANALYTICS_LIMITS.maxDays;
  if (daysClamped) days = ANALYTICS_LIMITS.maxDays;
  return { days, daysDefaulted, daysClamped, ...(range ? { range } : {}) };
}

// Validates an explicit date range: real calendar dates, from <= to, not in
// the future; longer than the limit is shortened (and said so).
export function explicitRange(fromIso: string, toIso: string, now = new Date()): { range: { from: Date; to: Date }; clamped: boolean } | { clarify: ClarifyReason } {
  const valid = (iso: string) => {
    const d = new Date(`${iso}T00:00:00.000Z`);
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === iso ? d : null;
  };
  const from = valid(fromIso);
  const toDay = valid(toIso);
  if (!from || !toDay || +from > +toDay) return { clarify: 'invalid_period' };
  if (+from > +now) return { clarify: 'future_period' };
  const to = new Date(Math.min(+toDay + 86_400_000 - 1, +now));
  const clamped = +to - +from > ANALYTICS_LIMITS.maxDays * 86_400_000;
  return { range: { from: clamped ? new Date(+to - ANALYTICS_LIMITS.maxDays * 86_400_000) : from, to }, clamped };
}

// ---------- scope and data (server-derived) ----------

interface ScopedClass { id: string; name: string; members: string[] }
interface Pair { assignmentId: string; classId: string; studentId: string; status: StudentStatus; score: number | null; dueAt: Date }

const SUBMITTED: StudentStatus[] = ['submitted', 'grading', 'grading_delayed', 'awaiting_review', 'graded', 'released'];

// Only teachers (own classes) and Workspace Admins (own school). ENARA admins
// get no identifiable student analytics here; students and academic managers
// never reach this route (content:author guard).
export async function analyticsScope(req: AuthRequest, question: string, classIdParam?: string, classReference?: string) {
  const user = req.user!;
  if (user.role !== 'teacher' && user.role !== 'admin') throw new AppError('Class analytics are available to teachers and school admins only', 403, 'ANALYTICS_NOT_PERMITTED');
  if (!user.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
  const all = await CourseInstance.find({ institutionId: user.institutionId, ...(user.role === 'teacher' ? { instructorIds: user.id } : {}), ...originFilter('live') })
    .select('id courseName studentIds batchId institutionId')
    .sort({ courseName: 1, id: 1 })
    .limit(200)
    .lean();
  let classes = all;
  if (classIdParam !== undefined) {
    classes = all.filter((c) => c.id === classIdParam);
    if (!classes.length) throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
  } else if (classReference !== undefined) {
    // A model-supplied reference is only text: it is matched against the
    // caller's own classes, and no match means a question back, never more scope.
    const ref = normaliseArabic(classReference.toLowerCase()).trim();
    const named = all.filter((c) => {
      const n = normaliseArabic((c.courseName ?? '').toLowerCase());
      return ref.length >= 2 && (n.includes(ref) || ref.includes(n));
    });
    return { classes: await withMembers(named), tooMany: named.length > ANALYTICS_LIMITS.maxClasses, allNames: all.map((c) => c.courseName), unresolvedReference: !named.length };
  } else {
    const nq = normaliseArabic(question.toLowerCase());
    const named = all.filter((c) => c.courseName && nq.includes(normaliseArabic(c.courseName.toLowerCase())));
    if (named.length) classes = named;
  }
  return { classes: await withMembers(classes), tooMany: classes.length > ANALYTICS_LIMITS.maxClasses, allNames: all.map((c) => c.courseName), unresolvedReference: false };
}

async function withMembers(classes: { id: string; courseName: string; studentIds?: string[]; batchId?: string; institutionId?: string }[]): Promise<ScopedClass[]> {
  const scoped: ScopedClass[] = [];
  for (const c of classes.slice(0, ANALYTICS_LIMITS.maxClasses)) scoped.push({ id: c.id, name: c.courseName, members: await studentsInView(await classStudentIds(c), 'live') });
  return scoped;
}

async function loadPairs(institutionId: string, classes: ScopedClass[], from: Date, to: Date) {
  const membersByClass = new Map(classes.map((c) => [c.id, new Set(c.members)]));
  const found = await Assignment.find({ institutionId, classId: { $in: classes.map((c) => c.id) }, state: { $in: ['published', 'closed'] }, dueAt: { $gte: from, $lte: to }, ...originFilter('live') })
    .sort({ dueAt: -1, id: 1 })
    .limit(ANALYTICS_LIMITS.maxAssignments + 1)
    .lean();
  const truncated = found.length > ANALYTICS_LIMITS.maxAssignments;
  const assignments = found.slice(0, ANALYTICS_LIMITS.maxAssignments).sort((a, b) => +a.dueAt - +b.dueAt || a.id.localeCompare(b.id));
  const attempts = await AssessmentAttempt.find({ institutionId, assignmentId: { $in: assignments.map((a) => a.id) }, ...originFilter('live') })
    .select('assignmentId studentId status gradingStatus submittedAt score id')
    .lean();
  const by = new Map<string, typeof attempts>();
  let excludedAttempts = 0;
  for (const t of attempts) {
    const a = assignments.find((x) => x.id === t.assignmentId);
    // Attempts of students no longer in the class (withdrawn) are left out.
    if (!a || !membersByClass.get(a.classId)?.has(t.studentId)) { excludedAttempts++; continue; }
    const k = `${t.assignmentId}|${t.studentId}`;
    by.set(k, [...(by.get(k) ?? []), t]);
  }
  const pairs: Pair[] = [];
  for (const a of assignments) {
    const inClass = membersByClass.get(a.classId) ?? new Set<string>();
    const members = a.studentIds?.length ? a.studentIds.filter((s) => inClass.has(s)) : [...inClass];
    for (const s of members) {
      const mine = by.get(`${a.id}|${s}`) ?? [];
      // Score: the most recent finalized or released attempt (duplicates collapse to one).
      const graded = mine
        .filter((t) => t.status === 'submitted' && (t.gradingStatus === 'finalized' || t.gradingStatus === 'released') && typeof t.score === 'number' && Number.isFinite(t.score))
        .sort((x, y) => +new Date(y.submittedAt ?? 0) - +new Date(x.submittedAt ?? 0) || String(y.id).localeCompare(String(x.id)))[0];
      pairs.push({ assignmentId: a.id, classId: a.classId, studentId: s, status: studentStatus(a as never, s, mine as never, to).status, score: graded ? (graded.score as number) : null, dueAt: a.dueAt });
    }
  }
  return { assignments, pairs, truncated, excludedAttempts };
}

// ---------- named students (P10) ----------

type Focus =
  | { kind: 'none' }
  | { kind: 'student'; studentId: string; planned: PlanOutcome }
  | { kind: 'choose'; candidates: StudentProfile[]; ambiguous: boolean }
  | { kind: 'several'; candidates: StudentProfile[] };
// Reports that stay aggregate even when the question mentions a student.
const AGGREGATE_ONLY: AnalyticsIntent[] = ['student_ranking', 'score_distribution'];

export function profileLabel(p: StudentProfile, lang: Lang = 'en') {
  const ar = lang === 'ar';
  const bits = [
    p.grade ? (ar ? `الصف الدراسي ${p.grade}` : `grade ${p.grade}`) : ar ? 'الصف الدراسي غير مسجل' : 'grade not recorded',
    p.className ? (ar ? `الفصل ${p.className}` : `class ${p.className}`) : ar ? 'الفصل غير مسجل' : 'class not recorded',
    p.courses.length ? p.courses.join(', ') : ar ? 'لا مقرر ضمن نطاقك' : 'no course in scope',
  ];
  return `${p.name} (${bits.join('; ')})`;
}

// Resolves a student the request names (or `studentId` the user picked)
// among the caller's authorised students only. Unknown, unauthorised,
// withdrawn and unenrolled students are all simply "not found"; several
// matches ask which one; typos are offered, never chosen.
async function resolveNamedStudent(req: AuthRequest, question: string, classIdParam: string | undefined, studentIdParam: string | undefined, planned: PlanOutcome): Promise<Focus> {
  if (planned && !('plan' in planned)) return { kind: 'none' };
  if (studentIdParam === undefined && planned && AGGREGATE_ONLY.includes(planned.plan.intent)) return { kind: 'none' };
  const scope = await analyticsScope(req, question, classIdParam);
  const authorised = [...new Set(scope.classes.flatMap((c) => c.members))];
  const enrolment = new Map<string, string[]>();
  for (const c of scope.classes) for (const m of c.members) enrolment.set(m, [...(enrolment.get(m) ?? []), c.name]);
  const people = await Student.find({ id: { $in: authorised }, institutionId: req.user!.institutionId }).select('id name').lean();
  const profilesOf = async (ids: string[]) => {
    const map = await studentProfiles(req.user!.institutionId!, ids, enrolment);
    return ids.map((id) => map.get(id)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  };
  let sid: string;
  if (studentIdParam !== undefined) {
    if (!authorised.includes(studentIdParam)) throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
    sid = studentIdParam;
  } else {
    const m = matchStudentNames(question, people);
    if (!m.ids.length) {
      if (planned === null) {
        const near = nearStudentNames(question, people);
        if (near.length) return { kind: 'choose', candidates: await profilesOf(near.slice(0, 10)), ambiguous: false };
      }
      return { kind: 'none' };
    }
    if (m.mentions.length > 1 && m.ids.length > 1) return { kind: 'several', candidates: await profilesOf(m.ids.slice(0, 10)) };
    if (m.ids.length > 1) return { kind: 'choose', candidates: await profilesOf(m.ids.slice(0, 10)), ambiguous: true };
    sid = m.ids[0];
  }
  const language: Lang = /[\u0600-\u06FF]/.test(question) ? 'ar' : 'en';
  const q = normaliseArabic(question.toLowerCase());
  let base: AnalyticsPlan;
  if (planned && 'plan' in planned) base = { ...planned.plan, notes: [...planned.plan.notes] };
  else {
    const notes: string[] = [];
    const period = parsePeriod(q, language, new Date(), notes);
    if ('clarify' in period) return { kind: 'student', studentId: sid, planned: { clarify: period.clarify, language } };
    base = { intent: 'student_report', language, ...period, lastN: ANALYTICS_LIMITS.defaultLastN, ...parseChart(q), metric: 'score', notes, via: 'patterns' };
  }
  if (base.intent === 'learning_gap_summary') base.notes.push(language === 'ar' ? 'نواتج التعلم لكل طالب غير متاحة في هذا الإصدار؛ هذا تقرير الطالب.' : 'Learning outcomes per student are not available in this version; this is the student report.');
  return { kind: 'student', studentId: sid, planned: { plan: { ...base, intent: 'student_report' } } };
}

// ---------- deterministic statistics ----------

export const round1 = (x: number) => Math.round(x * 10) / 10;
export function mean(xs: number[]): number | null {
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
export const pct = (num: number, den: number): number | null => (den > 0 ? round1((num / den) * 100) : null);

// ---------- text ----------

const T = {
  en: {
    noClasses: 'You have no classes in scope, so there is nothing to report.',
    tooMany: (n: number) => `Your scope has more than ${n} classes. Name a class in your question to narrow the report.`,
    pickClass: (names: string[]) => `Which class? This report covers one class. Your classes: ${names.join(', ')}.`,
    unsupported: {
      attendance: 'Attendance reports are not available in AI Chat yet. Use the attendance page for now.',
      conceptual_diagram: 'AI Chat draws only data charts from your class records, not conceptual diagrams.',
      mastery_trend: 'Mastery trends over time are not available in this first version. You can ask for the current weakest learning outcomes instead.',
      term_comparison: 'Term-to-term comparison is not available: term dates are not stored. Ask about a period such as "the last 90 days".',
    } as Record<Unsupported, string>,
    notAnalytics: 'Choose documents to ask about them, or ask about your classes, for example: "class performance summary for the last month".',
    noData: 'No assessments with a due date in this period were found for the selected classes.',
    period: (d: number) => `last ${d} days`,
    defaulted: (d: number) => `No period was given, so the last ${d} days were used.`,
    clamped: (d: number) => `Periods are limited to ${d} days.`,
    truncatedAssignments: (n: number) => `Only the ${n} most recent assessments in the period are included.`,
    excluded: (n: number) => `${n} attempt(s) by students no longer in the class were excluded.`,
    suggestion: 'Suggestions are instructional ideas to consider, not diagnoses.',
    pickStudent: (c: string[]) => `More than one of your students matches that name. Which one? ${c.join(' | ')}`,
    didYouMean: (c: string[]) => `I could not find that name exactly among your students. Did you mean: ${c.join(' | ')}?`,
    oneStudent: 'Please ask about one student at a time.',
    clarify: {
      student_not_found: 'I could not match that to a student in your classes. Use the student\'s name as it appears in your class list.',
      future_period: 'That period is in the future, so there is no data yet. Ask about a past period, for example "the last 30 days".',
      invalid_period: 'I could not read those dates. Use real dates, earliest first, for example "from 2026-09-01 to 2026-09-30".',
      ambiguous_intent: 'Which report do you need: class performance, score trend, declining scores, missing submissions, score distribution or weakest learning outcomes?',
      multiple_reports: 'Please ask for one report at a time, for example the class performance summary first.',
      missing_class: 'Which class should the report cover?',
      unclear_period: 'Which period should the report cover, for example "the last 30 days"?',
      redaction_failed: 'Please ask without personal details such as emails, phone numbers or ids; reports already show the students you may see.',
      router_unavailable: 'I could not interpret that question right now. Try a phrasing such as "class performance summary for the last month" or "which students have not submitted".',
      router_rejected: 'I could not turn that into a supported report. Try a phrasing such as "score trend over the last 3 assessments" or "weakest learning outcomes".',
    } as Record<ClarifyReason, string>,
  },
  ar: {
    noClasses: 'لا توجد فصول ضمن صلاحياتك، فلا يوجد ما يمكن الإبلاغ عنه.',
    tooMany: (n: number) => `لديك أكثر من ${n} فصلًا. اذكر اسم الفصل في سؤالك لتضييق التقرير.`,
    pickClass: (names: string[]) => `أي فصل تقصد؟ هذا التقرير لفصل واحد. فصولك: ${names.join('، ')}.`,
    unsupported: {
      attendance: 'تقارير الحضور غير متاحة في المحادثة بعد. استخدم صفحة الحضور حاليًا.',
      conceptual_diagram: 'المحادثة ترسم فقط رسومًا بيانية من سجلات فصولك، وليس رسومًا توضيحية للمفاهيم.',
      mastery_trend: 'تطور الإتقان عبر الزمن غير متاح في هذا الإصدار الأول. يمكنك السؤال عن أضعف نواتج التعلم الحالية.',
      term_comparison: 'المقارنة بين الفصول الدراسية غير متاحة لأن تواريخ الفصل الدراسي غير مخزنة. اسأل عن فترة مثل "آخر 90 يومًا".',
    } as Record<Unsupported, string>,
    notAnalytics: 'اختر مستندات للسؤال عنها، أو اسأل عن فصولك، مثل: "ملخص أداء الفصل خلال آخر شهر".',
    noData: 'لم يتم العثور على تقييمات بتاريخ تسليم في هذه الفترة للفصول المحددة.',
    period: (d: number) => `آخر ${d} يومًا`,
    defaulted: (d: number) => `لم تُحدد فترة، فاستُخدمت آخر ${d} يومًا.`,
    clamped: (d: number) => `الفترة محدودة بـ ${d} يومًا.`,
    truncatedAssignments: (n: number) => `تم تضمين أحدث ${n} تقييمًا فقط في الفترة.`,
    excluded: (n: number) => `تم استبعاد ${n} محاولة لطلاب لم يعودوا في الفصل.`,
    suggestion: 'الاقتراحات أفكار تعليمية للنظر فيها، وليست تشخيصًا.',
    pickStudent: (c: string[]) => `أكثر من طالب من طلابك يطابق هذا الاسم. أيهم تقصد؟ ${c.join(' | ')}`,
    didYouMean: (c: string[]) => `لم أجد هذا الاسم تمامًا بين طلابك. هل تقصد: ${c.join(' | ')}؟`,
    oneStudent: 'من فضلك اسأل عن طالب واحد في كل مرة.',
    clarify: {
      student_not_found: 'لم أتمكن من مطابقة ذلك مع طالب في فصولك. استخدم اسم الطالب كما يظهر في قائمة فصلك.',
      future_period: 'هذه الفترة في المستقبل، فلا توجد بيانات بعد. اسأل عن فترة سابقة مثل "آخر 30 يومًا".',
      invalid_period: 'تعذر قراءة التواريخ. استخدم تواريخ صحيحة، الأقدم أولًا، مثل "من 2026-09-01 إلى 2026-09-30".',
      ambiguous_intent: 'أي تقرير تحتاج: أداء الفصل، أو تطور الدرجات، أو تراجع الدرجات، أو التسليمات المفقودة، أو توزيع الدرجات، أو أضعف نواتج التعلم؟',
      multiple_reports: 'من فضلك اطلب تقريرًا واحدًا في كل مرة، مثل ملخص أداء الفصل أولًا.',
      missing_class: 'أي فصل يجب أن يغطيه التقرير؟',
      unclear_period: 'ما الفترة التي يغطيها التقرير، مثل "آخر 30 يومًا"؟',
      redaction_failed: 'من فضلك اسأل دون بيانات شخصية مثل البريد أو الهاتف أو المعرّفات؛ التقارير تعرض أصلًا الطلاب المسموح لك برؤيتهم.',
      router_unavailable: 'تعذر فهم السؤال الآن. جرّب صياغة مثل "ملخص أداء الفصل خلال آخر شهر" أو "مين الطلاب اللي ما سلموش".',
      router_rejected: 'تعذر تحويل السؤال إلى تقرير مدعوم. جرّب صياغة مثل "تطور الدرجات في آخر 3 تقييمات" أو "أضعف نواتج التعلم".',
    } as Record<ClarifyReason, string>,
  },
};

const SOURCES = {
  assignments: 'Assignments (published or closed, due in the period) and their class rosters',
  scores: 'Assessment attempts: score (percent) of each student\'s most recent finalized or released attempt',
  status: 'Submission status from the assignment rules (due date, extensions, late policy) and attempts',
  mastery: 'Learning-objective mastery records (current status per student and objective)',
  profile: 'Student name and grade (student record), class (student batch) and courses (class enrolment in your scope)',
};

// ---------- report ----------

// route: the optional P9 model fallback for questions the patterns miss.
export async function runAnalytics(
  req: AuthRequest,
  question: string,
  classIdParam?: string,
  now = new Date(),
  route?: (req: AuthRequest, question: string, now: Date) => Promise<PlanOutcome>,
  studentIdParam?: string,
): Promise<AnalyticsResult> {
  // Authorize before anything else, so a refused caller can never cause a
  // (metered) router call.
  if (req.user!.role !== 'teacher' && req.user!.role !== 'admin') throw new AppError('Class analytics are available to teachers and school admins only', 403, 'ANALYTICS_NOT_PERMITTED');
  if (!req.user!.institutionId) throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
  let planned = planAnalytics(question, now);
  // P10: a named (or chosen) student is resolved locally against the caller's
  // authorised students before any router call; names never reach a model.
  const focus = await resolveNamedStudent(req, question, classIdParam, studentIdParam, planned);
  if (focus.kind === 'student') planned = focus.planned;
  if (planned === null && route && focus.kind === 'none') planned = await route(req, question, now);
  const language: Lang = planned && 'plan' in planned ? planned.plan.language : planned && 'language' in planned ? planned.language : /[؀-ۿ]/.test(question) ? 'ar' : 'en';
  const t = T[language];
  const base = (status: AnalyticsResult['status'], summary: string, extra: Partial<AnalyticsResult> = {}): AnalyticsResult => ({
    version: ANALYTICS_VERSION, status, intent: null, language, summary, filters: [], metrics: [], sources: [], caveats: [], suggestions: [], generatedAt: now.toISOString(), ...extra,
  });
  const audit = (r: AnalyticsResult, scope?: { classes: ScopedClass[] }) => {
    logger.info('educator_analytics', {
      institutionId: req.user!.institutionId, userId: req.user!.id, role: req.user!.role, intent: r.intent, status: r.status,
      classes: scope?.classes.length ?? 0, students: scope ? new Set(scope.classes.flatMap((c) => c.members)).size : 0,
      chart: r.chart?.type ?? null, sources: r.sources.length,
    });
    return r;
  };
  if (focus.kind === 'choose') {
    return audit({ ...base('needs_clarification', focus.ambiguous ? t.pickStudent(focus.candidates.map((c) => profileLabel(c, language))) : t.didYouMean(focus.candidates.map((c) => profileLabel(c, language)))), intent: 'student_report', candidates: focus.candidates });
  }
  if (focus.kind === 'several') return audit({ ...base('needs_clarification', t.oneStudent), intent: 'student_report', candidates: focus.candidates });
  if (!planned) return audit(base('unsupported', t.notAnalytics));
  if ('unsupported' in planned) return audit(base('unsupported', t.unsupported[planned.unsupported]));
  if ('clarify' in planned) return audit(base(planned.clarify === 'router_unavailable' || planned.clarify === 'router_rejected' ? 'unsupported' : 'needs_clarification', t.clarify[planned.clarify]));
  const { plan } = planned;
  const scope = await analyticsScope(req, question, classIdParam, classIdParam === undefined ? plan.classReference : undefined);
  if (scope.unresolvedReference) return audit({ ...base('needs_clarification', t.pickClass(scope.allNames.slice(0, 10))), intent: plan.intent });
  if (!scope.classes.length) return audit({ ...base('unsupported', t.noClasses), intent: plan.intent });
  if (scope.tooMany) return audit({ ...base('needs_clarification', t.tooMany(ANALYTICS_LIMITS.maxClasses)), intent: plan.intent });
  if (focus.kind === 'student') scope.classes = scope.classes.filter((c) => c.members.includes(focus.studentId));
  if (focus.kind === 'student' && !scope.classes.length) return audit({ ...base('needs_clarification', t.clarify.student_not_found), intent: plan.intent });
  const oneClassIntent = plan.intent === 'assessment_trend' || plan.intent === 'student_progress_comparison';
  if (oneClassIntent && scope.classes.length > 1) return audit({ ...base('needs_clarification', t.pickClass(scope.classes.map((c) => c.name).slice(0, 10))), intent: plan.intent });
  const students = new Set(scope.classes.flatMap((c) => c.members));
  if (students.size > ANALYTICS_LIMITS.maxStudents) return audit({ ...base('needs_clarification', t.tooMany(ANALYTICS_LIMITS.maxClasses)), intent: plan.intent });

  const to = plan.range?.to ?? now;
  const from = plan.range?.from ?? new Date(now.getTime() - plan.days * 86_400_000);
  const caveats = [...plan.notes];
  if (plan.daysDefaulted) caveats.push(t.defaulted(plan.days));
  if (plan.daysClamped) caveats.push(t.clamped(ANALYTICS_LIMITS.maxDays));
  const common = {
    intent: plan.intent,
    period: { from: from.toISOString(), to: to.toISOString(), days: plan.days, defaulted: plan.daysDefaulted },
    ...(plan.via === 'model' ? { interpretedBy: 'model' as const } : {}),
    scope: { classes: scope.classes.map((c) => ({ id: c.id, name: c.name })), students: students.size, role: req.user!.role },
    filters: [plan.range ? `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}` : t.period(plan.days), ...(classIdParam || scope.classes.length < scope.allNames.length ? [scope.classes.map((c) => c.name).join(', ')] : [])],
  };
  const enrolment = new Map<string, string[]>();
  for (const c of scope.classes) for (const m of c.members) enrolment.set(m, [...(enrolment.get(m) ?? []), c.name]);
  const profiles = await studentProfiles(req.user!.institutionId!, [...students], enrolment);
  const names = new Map([...profiles.values()].map((p) => [p.id, p.name]));
  const ctx = (id: string) => {
    const p = profiles.get(id);
    return { grade: p?.grade ?? null, class: p?.className ?? null };
  };
  const build = language === 'ar' ? AR : EN;

  if (plan.intent === 'learning_gap_summary') {
    if (!(await isFeatureEnabled(req.user!.institutionId, 'mastery_tracking_enabled'))) {
      return audit({ ...base('unsupported', language === 'ar' ? 'تتبع الإتقان غير مفعّل لمدرستك، لذا لا توجد بيانات نواتج تعلم.' : 'Mastery tracking is not enabled for your school, so there is no learning-outcome data.'), intent: plan.intent });
    }
    const rows = await StudentObjectiveMastery.find({ studentId: { $in: [...students] }, masteryStatus: { $ne: 'not_assessed' } }).select('studentId objectiveId masteryStatus').lean();
    const objectives = new Map((await LearningObjective.find({ id: { $in: [...new Set(rows.map((r) => r.objectiveId))] }, institutionId: req.user!.institutionId }).select('id code title').lean()).map((o) => [o.id, o]));
    const per = new Map<string, { assessed: number; weak: number }>();
    for (const r of rows) {
      if (!objectives.has(r.objectiveId)) continue;
      const e = per.get(r.objectiveId) ?? { assessed: 0, weak: 0 };
      e.assessed++;
      if (r.masteryStatus === 'emerging' || r.masteryStatus === 'developing') e.weak++;
      per.set(r.objectiveId, e);
    }
    const ranked = [...per.entries()]
      .map(([id, e]) => ({ id, label: `${objectives.get(id)!.code} ${objectives.get(id)!.title}`.trim().slice(0, 80), ...e, share: pct(e.weak, e.assessed)! }))
      .sort((a, b) => b.share - a.share || b.weak - a.weak || a.id.localeCompare(b.id));
    caveats.push(build.masteryCaveat);
    if (!ranked.length) return audit({ ...base('answered', build.noMastery, { ...common, sources: [SOURCES.mastery], caveats }) });
    const top = ranked.slice(0, 10);
    const r: AnalyticsResult = {
      ...base('answered', build.gapSummary(top.slice(0, 3).map((x) => `${x.label} (${x.share}%)`), ranked.length), { ...common, sources: [SOURCES.mastery], caveats, suggestions: [t.suggestion, build.gapSuggestion] }),
      metrics: [{ key: 'objectives_assessed', label: build.objectivesAssessed, value: ranked.length, unit: 'count', definition: build.objectivesAssessedDef, n: ranked.length }],
      table: table([{ key: 'objective', label: build.objective }, { key: 'weak', label: build.weakStudents }, { key: 'assessed', label: build.assessedStudents }, { key: 'share', label: build.weakShare }], ranked.map((x) => ({ objective: x.label, weak: x.weak, assessed: x.assessed, share: x.share }))),
    };
    return audit(withChart(r, plan, 'bar', { title: build.gapChartTitle, description: build.gapChartDesc, xLabel: build.objective, yLabel: build.weakShare, unit: 'share_percent', categories: uniq(top.map((x) => x.label)), series: [{ name: build.weakShare, values: top.map((x) => x.share) }], denominator: build.gapDenominator }, from, to), scope);
  }

  const { assignments, pairs, truncated, excludedAttempts } = await loadPairs(req.user!.institutionId!, scope.classes, from, to);
  if (truncated) caveats.push(t.truncatedAssignments(ANALYTICS_LIMITS.maxAssignments));
  if (excludedAttempts) caveats.push(t.excluded(excludedAttempts));
  if (!assignments.length) return audit({ ...base('answered', t.noData, { ...common, sources: [SOURCES.assignments], caveats }) }, scope);
  const due = pairs.filter((p) => +p.dueAt <= +to);
  const scores = (ps: Pair[]) => ps.map((p) => p.score).filter((s): s is number => s !== null);
  caveats.push(build.missingNotZero);

  if (plan.intent === 'class_performance_summary') {
    const rows = scope.classes.map((c) => {
      const mine = due.filter((p) => p.classId === c.id);
      const sc = scores(mine);
      const submitted = mine.filter((p) => SUBMITTED.includes(p.status)).length;
      return { id: c.id, name: c.name, students: c.members.length, assessments: new Set(mine.map((p) => p.assignmentId)).size, expected: mine.length, submitted, rate: pct(submitted, mine.length), graded: sc.length, mean: mean(sc), median: median(sc) };
    });
    const allSc = scores(due);
    const submitted = due.filter((p) => SUBMITTED.includes(p.status)).length;
    const metrics: AnalyticsResult['metrics'] = [
      { key: 'submission_rate', label: build.submissionRate, value: pct(submitted, due.length), unit: 'percent', definition: build.submissionRateDef, n: due.length },
      { key: 'mean_score', label: build.meanScore, value: mean(allSc), unit: 'score_percent', definition: build.meanScoreDef, n: allSc.length },
      { key: 'median_score', label: build.medianScore, value: median(allSc), unit: 'score_percent', definition: build.medianScoreDef, n: allSc.length },
    ];
    const r: AnalyticsResult = {
      ...base('answered', build.perfSummary(metrics[0].value, submitted, due.length, metrics[1].value, metrics[2].value, allSc.length, rows.length), { ...common, sources: [SOURCES.assignments, SOURCES.status, SOURCES.scores], caveats, suggestions: [t.suggestion] }),
      metrics,
      table: table(
        [{ key: 'class', label: build.className }, { key: 'students', label: build.studentsCol }, { key: 'assessments', label: build.assessmentsCol }, { key: 'submitted', label: build.submittedCol }, { key: 'rate', label: `${build.submissionRate} (%)` }, { key: 'graded', label: build.gradedCol }, { key: 'mean', label: build.meanScore }, { key: 'median', label: build.medianScore }],
        rows.map((x) => ({ class: x.name, students: x.students, assessments: x.assessments, submitted: `${x.submitted}/${x.expected}`, rate: x.rate, graded: x.graded, mean: x.mean, median: x.median })),
      ),
    };
    const bySub = plan.metric === 'submission';
    return audit(withChart(r, plan, 'bar', {
      title: bySub ? build.rateChartTitle : build.meanChartTitle, description: bySub ? build.rateChartDesc : build.meanChartDesc, xLabel: build.className, yLabel: bySub ? build.submissionRate : build.meanScore,
      unit: bySub ? 'percent' : 'score_percent', categories: uniq(rows.map((x) => x.name)), series: [{ name: bySub ? build.submissionRate : build.meanScore, values: rows.map((x) => (bySub ? x.rate : x.mean)) }],
      denominator: bySub ? build.rateDenominator(due.length) : build.scoreDenominator(allSc.length),
    }, from, to, rows.length >= 2 || plan.chartRequested), scope);
  }

  const dueAssignments = assignments.filter((a) => +a.dueAt <= +to);
  const label = (a: { title: string; dueAt: Date }) => `${a.title} (${a.dueAt.toISOString().slice(0, 10)})`.slice(0, 80);

  if (plan.intent === 'assessment_trend') {
    const lastN = dueAssignments.slice(-plan.lastN);
    const points = lastN.map((a) => {
      const sc = scores(due.filter((p) => p.assignmentId === a.id));
      return { a, label: label(a), graded: sc.length, members: due.filter((p) => p.assignmentId === a.id).length, mean: mean(sc), median: median(sc) };
    });
    const usable = points.filter((p) => p.mean !== null);
    const tbl = table([{ key: 'assessment', label: build.assessmentCol }, { key: 'due', label: build.dueCol }, { key: 'graded', label: build.gradedCol }, { key: 'mean', label: build.meanScore }, { key: 'median', label: build.medianScore }],
      points.map((p) => ({ assessment: p.a.title, due: p.a.dueAt.toISOString().slice(0, 10), graded: `${p.graded}/${p.members}`, mean: p.mean, median: p.median })));
    const r: AnalyticsResult = {
      ...base('answered', usable.length >= 2 ? build.trendSummary(usable.map((p) => `${p.a.title}: ${p.mean}%`), usable[usable.length - 1].mean! - usable[0].mean!) : build.trendInsufficient(usable.length), { ...common, sources: [SOURCES.assignments, SOURCES.scores], caveats, suggestions: [t.suggestion] }),
      metrics: points.map((p, i) => ({ key: `mean_${i + 1}`, label: `${build.meanScore}: ${p.a.title}`.slice(0, 80), value: p.mean, unit: 'score_percent' as const, definition: build.meanScoreDef, n: p.graded })),
      table: tbl,
    };
    if (usable.length < 2) return audit({ ...r, chartNote: build.trendInsufficient(usable.length) }, scope);
    return audit(withChart(r, plan, 'line', { title: build.trendChartTitle, description: build.trendChartDesc, xLabel: build.assessmentCol, yLabel: build.meanScore, unit: 'score_percent', categories: uniq(usable.map((p) => p.label)), dates: usable.map((p) => p.a.dueAt.toISOString()), series: [{ name: build.meanScore, values: usable.map((p) => p.mean) }], denominator: build.trendDenominator(usable.map((p) => p.graded)) }, from, to, true), scope);
  }

  if (plan.intent === 'student_progress_comparison') {
    const lastN = dueAssignments.slice(-plan.lastN);
    const order = new Map(lastN.map((a, i) => [a.id, i]));
    const rows: { student: string; grade: string | null; class: string | null; course: string; first: number; last: number; change: number; measurements: number }[] = [];
    let tooFew = 0;
    for (const s of students) {
      const series = due.filter((p) => p.studentId === s && order.has(p.assignmentId) && p.score !== null).sort((x, y) => order.get(x.assignmentId)! - order.get(y.assignmentId)!);
      if (series.length < 2) { tooFew++; continue; }
      const first = series[0].score!, last = series[series.length - 1].score!;
      if (last < first) rows.push({ student: names.get(s) ?? s, ...ctx(s), course: scope.classes[0].name, first: round1(first), last: round1(last), change: round1(last - first), measurements: series.length });
    }
    rows.sort((a, b) => a.change - b.change || a.student.localeCompare(b.student));
    caveats.push(build.declineDef(lastN.length));
    if (tooFew) caveats.push(build.tooFewMeasurements(tooFew));
    const r: AnalyticsResult = {
      ...base('answered', build.declineSummary(rows.length, students.size - tooFew), { ...common, sources: [SOURCES.assignments, SOURCES.scores], caveats, suggestions: [t.suggestion, build.declineSuggestion] }),
      metrics: [{ key: 'declined', label: build.declinedStudents, value: rows.length, unit: 'count', definition: build.declineDef(lastN.length), n: students.size - tooFew }],
      table: table([{ key: 'student', label: build.studentCol }, { key: 'grade', label: build.gradeCol }, { key: 'class', label: build.sectionCol }, { key: 'course', label: build.courseCol }, { key: 'first', label: build.firstScore }, { key: 'last', label: build.lastScore }, { key: 'change', label: build.changeCol }, { key: 'measurements', label: build.measurementsCol }], rows),
    };
    return audit(rows.length ? withChart(r, plan, 'bar', { title: build.declineChartTitle, description: build.declineChartDesc, xLabel: build.studentCol, yLabel: build.changeCol, unit: 'score_percent', categories: uniq(rows.slice(0, 24).map((x) => x.student)), series: [{ name: build.changeCol, values: rows.slice(0, 24).map((x) => x.change) }], denominator: build.scoreDenominator(rows.length) }, from, to, plan.chartRequested) : r, scope);
  }

  if (plan.intent === 'missing_submissions') {
    const recent = dueAssignments.slice(-10);
    const missing = due.filter((p) => p.status === 'missing' && recent.some((a) => a.id === p.assignmentId));
    const cls = new Map(scope.classes.map((c) => [c.id, c.name]));
    const rows = missing.map((p) => {
      const a = recent.find((x) => x.id === p.assignmentId)!;
      return { student: names.get(p.studentId) ?? p.studentId, ...ctx(p.studentId), course: cls.get(p.classId) ?? p.classId, assessment: a.title, due: a.dueAt.toISOString().slice(0, 10) };
    }).sort((x, y) => y.due.localeCompare(x.due) || x.student.localeCompare(y.student));
    const groups = recent.map((a) => {
      const ps = due.filter((p) => p.assignmentId === a.id);
      return { a, label: label(a), submitted: ps.filter((p) => SUBMITTED.includes(p.status)).length, missing: ps.filter((p) => p.status === 'missing').length, open: ps.filter((p) => p.status === 'not_started' || p.status === 'in_progress').length, total: ps.length };
    });
    caveats.push(build.missingDef);
    const r: AnalyticsResult = {
      ...base('answered', build.missingSummary(rows.length, recent.length), { ...common, sources: [SOURCES.assignments, SOURCES.status], caveats, suggestions: [t.suggestion] }),
      metrics: [{ key: 'missing', label: build.missingCol, value: rows.length, unit: 'count', definition: build.missingDef, n: groups.reduce((a, g) => a + g.total, 0) }],
      table: table([{ key: 'student', label: build.studentCol }, { key: 'grade', label: build.gradeCol }, { key: 'class', label: build.sectionCol }, { key: 'course', label: build.courseCol }, { key: 'assessment', label: build.assessmentCol }, { key: 'due', label: build.dueCol }], rows),
    };
    const cats = [build.submittedCol, build.missingCol, build.openCol];
    if (groups.length === 1 && (plan.chartType === 'donut' || !plan.chartType)) {
      const g = groups[0];
      return audit(withChart(r, plan, 'donut', { title: build.statusChartTitle(g.a.title), description: build.statusChartDesc, xLabel: build.statusCol, yLabel: build.studentsCol, unit: 'count', categories: cats, series: [{ name: build.studentsCol, values: [g.submitted, g.missing, g.open] }], denominator: build.statusDenominator(g.total) }, from, to, true), scope);
    }
    return audit(withChart(r, plan, 'stacked_bar', {
      title: build.statusChartTitle(''), description: build.statusChartDesc, xLabel: build.assessmentCol, yLabel: build.studentsCol, unit: 'count', categories: uniq(groups.map((g) => g.label)),
      series: [{ name: cats[0], values: groups.map((g) => g.submitted) }, { name: cats[1], values: groups.map((g) => g.missing) }, { name: cats[2], values: groups.map((g) => g.open) }],
      denominator: build.statusDenominator(groups.reduce((a, g) => a + g.total, 0)),
    }, from, to, true), scope);
  }

  if (plan.intent === 'student_report' && focus.kind === 'student') {
    const sid = focus.studentId;
    const profile = profiles.get(sid)!;
    const cls = new Map(scope.classes.map((c) => [c.id, c.name]));
    const mine = due.filter((p) => p.studentId === sid).sort((x, y) => +x.dueAt - +y.dueAt || x.assignmentId.localeCompare(y.assignmentId));
    const title = new Map(assignments.map((a) => [a.id, a.title]));
    const sc = scores(mine);
    const submitted = mine.filter((p) => SUBMITTED.includes(p.status)).length;
    const missing = mine.filter((p) => p.status === 'missing').length;
    const metrics: AnalyticsResult['metrics'] = [
      { key: 'submission_rate', label: build.submissionRate, value: pct(submitted, mine.length), unit: 'percent', definition: build.studentRateDef, n: mine.length },
      { key: 'mean_score', label: build.meanScore, value: mean(sc), unit: 'score_percent', definition: build.meanScoreDef, n: sc.length },
      { key: 'missing', label: build.missingCol, value: missing, unit: 'count', definition: build.missingDef, n: mine.length },
    ];
    const rows = mine.map((p) => ({ assessment: title.get(p.assignmentId) ?? p.assignmentId, course: cls.get(p.classId) ?? p.classId, due: p.dueAt.toISOString().slice(0, 10), status: build.status[p.status] ?? p.status, score: p.score === null ? null : round1(p.score) }));
    const r: AnalyticsResult = {
      // Scope is this one student; class-level notes (e.g. other students'
      // excluded attempts) do not apply to them.
      ...base('answered', build.studentSummary(profileLabel(profile, language), metrics[0].value, submitted, mine.length, metrics[1].value, sc.length, missing), { ...common, scope: { ...common.scope, students: 1 }, sources: [SOURCES.assignments, SOURCES.status, SOURCES.scores, SOURCES.profile], caveats: caveats.filter((c) => c !== t.excluded(excludedAttempts)), suggestions: [t.suggestion] }),
      student: profile,
      metrics,
      table: table([{ key: 'assessment', label: build.assessmentCol }, { key: 'course', label: build.courseCol }, { key: 'due', label: build.dueCol }, { key: 'status', label: build.statusCol }, { key: 'score', label: build.scoreCol }], rows),
    };
    const graded = mine.filter((p) => p.score !== null);
    if (graded.length < 2) return audit({ ...r, chartNote: build.studentTrendInsufficient(graded.length) }, scope);
    const lbl = (p: Pair) => `${title.get(p.assignmentId) ?? p.assignmentId} (${p.dueAt.toISOString().slice(0, 10)})`.slice(0, 80);
    return audit(withChart(r, plan, 'line', { title: build.studentChartTitle(profile.name).slice(0, 200), description: build.studentChartDesc, xLabel: build.assessmentCol, yLabel: build.scoreCol, unit: 'score_percent', categories: uniq(graded.map(lbl)), dates: graded.map((p) => p.dueAt.toISOString()), series: [{ name: build.scoreCol, values: graded.map((p) => round1(p.score!)) }], denominator: build.scoreDenominator(graded.length) }, from, to, true), scope);
  }

  if (plan.intent === 'student_ranking') {
    const per = [...students].map((sid) => ({ sid, sc: scores(due.filter((p) => p.studentId === sid)) }));
    const ranked = per.filter((x) => x.sc.length).map((x) => ({ sid: x.sid, mean: mean(x.sc)!, n: x.sc.length }));
    const unranked = per.length - ranked.length;
    const lowest = plan.rankOrder === 'lowest';
    ranked.sort((a, b) => (lowest ? a.mean - b.mean : b.mean - a.mean) || (names.get(a.sid) ?? '').localeCompare(names.get(b.sid) ?? '') || a.sid.localeCompare(b.sid));
    // Competition ranking: equal means share a rank.
    let rank = 0;
    const rows = ranked.map((x, i) => {
      if (i === 0 || x.mean !== ranked[i - 1].mean) rank = i + 1;
      const p = profiles.get(x.sid);
      return { rank, student: names.get(x.sid) ?? x.sid, grade: p?.grade ?? null, class: p?.className ?? null, course: (p?.courses ?? []).join(', '), mean: x.mean, graded: x.n };
    });
    caveats.push(build.rankDef(lowest));
    if (unranked) caveats.push(build.unranked(unranked));
    const r: AnalyticsResult = {
      ...base('answered', ranked.length ? build.rankSummary(lowest, rows.slice(0, 3).map((x) => `${x.student} (${x.mean}%)`), ranked.length) : build.noScores, { ...common, sources: [SOURCES.assignments, SOURCES.scores, SOURCES.profile], caveats, suggestions: [t.suggestion, build.rankSuggestion] }),
      metrics: [{ key: 'ranked', label: build.rankedStudents, value: ranked.length, unit: 'count', definition: build.rankDef(lowest), n: per.length }],
      table: table([{ key: 'rank', label: build.rankCol }, { key: 'student', label: build.studentCol }, { key: 'grade', label: build.gradeCol }, { key: 'class', label: build.sectionCol }, { key: 'course', label: build.courseCol }, { key: 'mean', label: build.meanScore }, { key: 'graded', label: build.gradedCol }], rows),
    };
    if (!rows.length) return audit(r, scope);
    const top = rows.slice(0, 24);
    // Students sharing a name are told apart by class (or course) in chart labels.
    const dup = new Set(top.map((x) => x.student).filter((n, i, all) => all.indexOf(n) !== i));
    const chartLabel = (x: (typeof top)[number]) => (dup.has(x.student) ? `${x.student} (${x.class ?? x.course})`.slice(0, 80) : x.student);
    return audit(withChart(r, plan, 'bar', { title: build.rankChartTitle(lowest), description: build.rankChartDesc, xLabel: build.studentCol, yLabel: build.meanScore, unit: 'score_percent', categories: uniq(top.map(chartLabel)), series: [{ name: build.meanScore, values: top.map((x) => x.mean) }], denominator: build.scoreDenominator(top.reduce((a, x) => a + x.graded, 0)) }, from, to, true), scope);
  }

  // score_distribution
  const sc = scores(due);
  const buckets = [[0, 50], [50, 60], [60, 70], [70, 80], [80, 90], [90, 100.0001]] as const;
  const bucketLabels = ['0–49', '50–59', '60–69', '70–79', '80–89', '90–100'];
  const counts = buckets.map(([lo, hi]) => sc.filter((s) => s >= lo && s < hi).length);
  const r: AnalyticsResult = {
    ...base('answered', sc.length ? build.distSummary(sc.length, mean(sc), median(sc)) : build.noScores, { ...common, sources: [SOURCES.assignments, SOURCES.scores], caveats, suggestions: [t.suggestion] }),
    metrics: [{ key: 'graded', label: build.gradedCol, value: sc.length, unit: 'count', definition: build.meanScoreDef, n: sc.length }, { key: 'mean_score', label: build.meanScore, value: mean(sc), unit: 'score_percent', definition: build.meanScoreDef, n: sc.length }, { key: 'median_score', label: build.medianScore, value: median(sc), unit: 'score_percent', definition: build.medianScoreDef, n: sc.length }],
    table: table([{ key: 'range', label: build.rangeCol }, { key: 'count', label: build.countCol }, { key: 'share', label: build.shareCol }], bucketLabels.map((b, i) => ({ range: b, count: counts[i], share: pct(counts[i], sc.length) }))),
  };
  return audit(sc.length ? withChart(r, plan, 'bar', { title: build.distChartTitle, description: build.distChartDesc, xLabel: build.rangeCol, yLabel: build.countCol, unit: 'count', categories: bucketLabels, series: [{ name: build.countCol, values: counts }], denominator: build.scoreDenominator(sc.length) }, from, to, true) : r, scope);
}

function table(columns: { key: string; label: string }[], rows: Record<string, string | number | null>[]) {
  return { columns, rows: rows.slice(0, ANALYTICS_LIMITS.maxRows), truncated: rows.length > ANALYTICS_LIMITS.maxRows, totalRows: rows.length };
}
// Labels must be unique; collisions get a numeric suffix (never silently merged).
function uniq(labels: string[]) {
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return n === 1 ? l : `${l} (${n})`.slice(0, 80);
  });
}

// Chart from the same rows as the table. A requested type is honoured only
// when it fits the data semantics; an invalid payload is dropped, the report stays.
function withChart(
  r: AnalyticsResult,
  plan: AnalyticsPlan,
  natural: ChartType,
  spec: Omit<ChartPayload, 'version' | 'type' | 'period' | 'direction'>,
  from: Date,
  to: Date,
  inferred = plan.chartRequested,
): AnalyticsResult {
  if (!inferred && !plan.chartRequested) return r;
  let type = natural;
  const notes: string[] = [];
  const ar = plan.language === 'ar';
  if (plan.chartType && plan.chartType !== natural) {
    // Only a donut's parts may be shown as bars instead; other swaps would
    // misrepresent the data (a line over unordered categories, a pie of
    // non-exclusive values).
    if (natural === 'donut' && plan.chartType === 'bar') type = 'bar';
    else notes.push(ar ? `لم يُستخدم الرسم المطلوب (${plan.chartType}) لأنه لا يناسب هذه البيانات؛ استُخدم ${natural}.` : `A ${plan.chartType} chart does not fit this data, so a ${natural} chart is shown.`);
  }
  const payload = { ...spec, version: CHART_VERSION, type, period: { from: from.toISOString(), to: to.toISOString() }, direction: ar ? 'rtl' : 'ltr' } as ChartPayload;
  if (type !== 'line') delete (payload as Partial<ChartPayload>).dates;
  const v = validateChart(payload);
  if (!v.ok) {
    logger.warn('educator_analytics_chart_rejected', { intent: r.intent, errors: v.errors });
    return { ...r, chartNote: ar ? 'تعذر إنشاء الرسم البياني؛ الجدول يعرض البيانات نفسها.' : 'The chart could not be built; the table shows the same data.' };
  }
  return { ...r, chart: v.chart, ...(notes.length ? { chartNote: notes.join(' ') } : {}) };
}

// ---------- templates ----------

const STATUS_EN: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', grading: 'Being graded', grading_delayed: 'Grading delayed', awaiting_review: 'Awaiting review', graded: 'Graded', released: 'Released', missing: 'Missing' };
const STATUS_AR: Record<string, string> = { not_started: 'لم يبدأ', in_progress: 'قيد التنفيذ', submitted: 'مسلَّم', grading: 'قيد التصحيح', grading_delayed: 'التصحيح متأخر', awaiting_review: 'بانتظار المراجعة', graded: 'مصحح', released: 'منشور', missing: 'غير مسلَّم' };
const EN = {
  status: STATUS_EN,
  gradeCol: 'Grade', sectionCol: 'Class', courseCol: 'Course', scoreCol: 'Score (%)', rankCol: 'Rank',
  studentRateDef: 'Submitted assessments ÷ assessments due for this student in the period (courses in your scope).',
  studentSummary: (who: string, rate: number | null, sub: number, due: number, m: number | null, n: number, missing: number) => `${who}: submitted ${sub} of ${due} due (${rate ?? '—'}%), mean score ${m ?? '—'}% over ${n} graded, ${missing} missing.`,
  studentTrendInsufficient: (n: number) => `A score chart needs at least 2 graded assessments; ${n} found in this period.`,
  studentChartTitle: (name: string) => `Scores of ${name} across assessments`, studentChartDesc: 'Graded scores in due-date order; ungraded and missing work is not plotted (see the table).',
  rankDef: (lowest: boolean) => `Students ordered by mean graded score (${lowest ? 'lowest' : 'highest'} first); equal means share a rank; only students with at least one graded score.`,
  unranked: (n: number) => `${n} student(s) have no graded score in the period and are not ranked.`,
  rankSummary: (lowest: boolean, top: string[], n: number) => `${n} student(s) ranked; ${lowest ? 'lowest' : 'highest'} mean scores: ${top.join('; ')}.`,
  rankSuggestion: 'Rankings compare averages over different numbers of graded assessments; check the graded column before acting.',
  rankedStudents: 'Students ranked', rankChartTitle: (lowest: boolean) => `Mean score by student (${lowest ? 'lowest' : 'highest'} first)`, rankChartDesc: 'Mean graded score per student; students without graded work are excluded.',
  submissionRate: 'Submission rate', submissionRateDef: 'Submitted student-assessment pairs ÷ all pairs due in the period (students assigned and still in the class).',
  meanScore: 'Mean score (%)', meanScoreDef: 'Mean of each student\'s most recent finalized or released score per assessment; missing and ungraded work is excluded, never counted as 0.',
  medianScore: 'Median score (%)', medianScoreDef: 'Median of the same graded scores.',
  className: 'Class', studentsCol: 'Students', assessmentsCol: 'Assessments due', submittedCol: 'Submitted', gradedCol: 'Graded scores',
  assessmentCol: 'Assessment', dueCol: 'Due', studentCol: 'Student', firstScore: 'First score (%)', lastScore: 'Latest score (%)', changeCol: 'Change (points)', measurementsCol: 'Measurements',
  missingCol: 'Missing', openCol: 'Not yet submitted (still open)', statusCol: 'Status', rangeCol: 'Score range (%)', countCol: 'Students', shareCol: 'Share (%)',
  objective: 'Learning outcome', weakStudents: 'Students emerging or developing', assessedStudents: 'Students assessed', weakShare: 'Share not yet proficient (%)',
  objectivesAssessed: 'Outcomes with evidence', objectivesAssessedDef: 'Learning objectives with at least one assessed student in scope.',
  missingNotZero: 'Missing submissions are reported separately and are never treated as a score of 0.',
  masteryCaveat: 'Mastery is each student\'s current status; it is not limited to the period.',
  noMastery: 'No learning-outcome evidence exists yet for students in scope.', noScores: 'No finalized or released scores exist in this period.',
  perfSummary: (rate: number | null, sub: number, due: number, m: number | null, md: number | null, n: number, classes: number) =>
    `Across ${classes} class(es): submission rate ${rate ?? '—'}% (${sub} of ${due} due), mean score ${m ?? '—'}% and median ${md ?? '—'}% over ${n} graded score(s).`,
  rateChartTitle: 'Submission rate by class', rateChartDesc: 'Percentage of due assessments submitted, per class.', rateDenominator: (n: number) => `${n} student-assessment pairs due`,
  meanChartTitle: 'Mean score by class', meanChartDesc: 'Mean of graded scores per class; ungraded and missing work excluded.', scoreDenominator: (n: number) => `${n} graded score(s)`,
  trendSummary: (pts: string[], delta: number) => `Mean scores over the last ${pts.length} comparable assessments: ${pts.join('; ')}. Change from first to last: ${delta > 0 ? '+' : ''}${round1(delta)} points.`,
  trendInsufficient: (n: number) => `A trend needs at least 2 assessments with graded scores; ${n} found in this period. No trend is drawn.`,
  trendChartTitle: 'Class mean score across assessments', trendChartDesc: 'Mean graded score per assessment, in due-date order.', trendDenominator: (ns: number[]) => `graded scores per point: ${ns.join(', ')}`,
  declineDef: (n: number) => `A student counts as declined when their latest graded score among the last ${n} assessments is lower than their earliest one (needs 2+ graded scores).`,
  tooFewMeasurements: (n: number) => `${n} student(s) have fewer than 2 graded scores and are not compared.`,
  declineSummary: (n: number, compared: number) => `${n} of ${compared} compared student(s) have a lower latest score than their earliest one.`,
  declinedStudents: 'Students with a lower latest score', declineSuggestion: 'Consider reviewing the questions these students missed before drawing conclusions.',
  declineChartTitle: 'Score change (latest − earliest)', declineChartDesc: 'Points of change for students whose latest score is lower.',
  missingDef: 'Missing: the due date (with any extension) has passed and no attempt was submitted.',
  missingSummary: (n: number, a: number) => `${n} missing submission(s) across the last ${a} assessment(s) due in the period.`,
  statusChartTitle: (title: string) => `Submission status${title ? `: ${title}` : ' by assessment'}`.slice(0, 200), statusChartDesc: 'Students by submission status; the categories are mutually exclusive.',
  statusDenominator: (n: number) => `${n} assigned student(s)`,
  distSummary: (n: number, m: number | null, md: number | null) => `${n} graded score(s) in the period; mean ${m}% and median ${md}%.`,
  distChartTitle: 'Distribution of graded scores', distChartDesc: 'Number of graded scores in each 10-point range (0–49 grouped).',
  gapSummary: (top: string[], n: number) => `Of ${n} learning outcome(s) with evidence, the largest shares of students not yet proficient are: ${top.join('; ')}.`,
  gapSuggestion: 'Consider a short reteach or practice set on the top outcome, then check new evidence.',
  gapChartTitle: 'Learning outcomes by share not yet proficient', gapChartDesc: 'Share of assessed students at emerging or developing, per outcome (top 10).', gapDenominator: 'students assessed per outcome (see table)',
};
type Build = typeof EN;
const AR: Build = {
  status: STATUS_AR,
  gradeCol: 'الصف الدراسي', sectionCol: 'الفصل', courseCol: 'المقرر', scoreCol: 'الدرجة (%)', rankCol: 'الترتيب',
  studentRateDef: 'التقييمات المسلَّمة ÷ التقييمات المستحقة على هذا الطالب في الفترة (المقررات ضمن نطاقك).',
  studentSummary: (who, rate, sub, due, m, n, missing) => `${who}: سلّم ${sub} من ${due} مستحق (${rate ?? '—'}%)، ومتوسط الدرجة ${m ?? '—'}% من ${n} درجة مصححة، و${missing} غير مسلَّم.`,
  studentTrendInsufficient: (n) => `يحتاج رسم الدرجات إلى تقييمين مصححين على الأقل؛ وُجد ${n} في هذه الفترة.`,
  studentChartTitle: (name) => `درجات ${name} عبر التقييمات`, studentChartDesc: 'الدرجات المصححة بترتيب موعد التسليم؛ الأعمال غير المصححة أو غير المسلَّمة لا تُرسم (انظر الجدول).',
  rankDef: (lowest) => `الطلاب مرتبون حسب متوسط الدرجة المصححة (${lowest ? 'الأقل' : 'الأعلى'} أولًا)؛ المتساوون يتشاركون الترتيب؛ فقط من لديه درجة مصححة واحدة على الأقل.`,
  unranked: (n) => `${n} طالب ليس لديهم درجة مصححة في الفترة ولم يُرتبوا.`,
  rankSummary: (lowest, top, n) => `تم ترتيب ${n} طالب؛ ${lowest ? 'أقل' : 'أعلى'} المتوسطات: ${top.join('؛ ')}.`,
  rankSuggestion: 'الترتيب يقارن متوسطات من أعداد مختلفة من التقييمات المصححة؛ راجع عمود الدرجات المصححة قبل اتخاذ قرار.',
  rankedStudents: 'طلاب مرتبون', rankChartTitle: (lowest) => `متوسط الدرجة لكل طالب (${lowest ? 'الأقل' : 'الأعلى'} أولًا)`, rankChartDesc: 'متوسط الدرجة المصححة لكل طالب؛ دون من ليس لديه أعمال مصححة.',
  submissionRate: 'نسبة التسليم', submissionRateDef: 'عدد أزواج (طالب-تقييم) المسلَّمة ÷ كل الأزواج المستحقة في الفترة (للطلاب المكلَّفين والموجودين في الفصل).',
  meanScore: 'متوسط الدرجة (%)', meanScoreDef: 'متوسط أحدث درجة معتمدة أو منشورة لكل طالب في كل تقييم؛ الأعمال غير المسلَّمة أو غير المصححة مستبعدة ولا تُحسب صفرًا.',
  medianScore: 'وسيط الدرجة (%)', medianScoreDef: 'وسيط الدرجات المصححة نفسها.',
  className: 'الفصل', studentsCol: 'الطلاب', assessmentsCol: 'التقييمات المستحقة', submittedCol: 'مسلَّم', gradedCol: 'درجات مصححة',
  assessmentCol: 'التقييم', dueCol: 'موعد التسليم', studentCol: 'الطالب', firstScore: 'أول درجة (%)', lastScore: 'أحدث درجة (%)', changeCol: 'التغير (نقاط)', measurementsCol: 'عدد القياسات',
  missingCol: 'غير مسلَّم', openCol: 'لم يُسلَّم بعد (ما زال مفتوحًا)', statusCol: 'الحالة', rangeCol: 'نطاق الدرجة (%)', countCol: 'الطلاب', shareCol: 'النسبة (%)',
  objective: 'ناتج التعلم', weakStudents: 'طلاب في مستوى ناشئ أو نامٍ', assessedStudents: 'طلاب تم تقييمهم', weakShare: 'نسبة غير المتقنين (%)',
  objectivesAssessed: 'نواتج لها أدلة', objectivesAssessedDef: 'أهداف تعلم لها طالب واحد على الأقل تم تقييمه ضمن النطاق.',
  missingNotZero: 'الأعمال غير المسلَّمة تُعرض منفصلة ولا تُعامل أبدًا كدرجة صفر.',
  masteryCaveat: 'الإتقان هو الحالة الحالية لكل طالب وليس محصورًا في الفترة.',
  noMastery: 'لا توجد أدلة على نواتج التعلم بعد للطلاب ضمن النطاق.', noScores: 'لا توجد درجات معتمدة أو منشورة في هذه الفترة.',
  perfSummary: (rate, sub, due, m, md, n, classes) => `في ${classes} فصل: نسبة التسليم ${rate ?? '—'}% (${sub} من ${due} مستحق)، ومتوسط الدرجة ${m ?? '—'}% والوسيط ${md ?? '—'}% من ${n} درجة مصححة.`,
  rateChartTitle: 'نسبة التسليم حسب الفصل', rateChartDesc: 'نسبة التقييمات المستحقة التي تم تسليمها لكل فصل.', rateDenominator: (n) => `${n} زوج (طالب-تقييم) مستحق`,
  meanChartTitle: 'متوسط الدرجة حسب الفصل', meanChartDesc: 'متوسط الدرجات المصححة لكل فصل؛ دون الأعمال غير المسلَّمة أو غير المصححة.', scoreDenominator: (n) => `${n} درجة مصححة`,
  trendSummary: (pts, delta) => `متوسط الدرجات في آخر ${pts.length} تقييمات قابلة للمقارنة: ${pts.join('؛ ')}. التغير من الأول إلى الأخير: ${delta > 0 ? '+' : ''}${round1(delta)} نقطة.`,
  trendInsufficient: (n) => `يحتاج الاتجاه إلى تقييمين على الأقل بدرجات مصححة؛ وُجد ${n} في هذه الفترة. لم يُرسم اتجاه.`,
  trendChartTitle: 'متوسط درجة الفصل عبر التقييمات', trendChartDesc: 'متوسط الدرجة المصححة لكل تقييم بترتيب موعد التسليم.', trendDenominator: (ns) => `عدد الدرجات المصححة لكل نقطة: ${ns.join('، ')}`,
  declineDef: (n) => `يُعد الطالب متراجعًا إذا كانت أحدث درجة مصححة له في آخر ${n} تقييمات أقل من أقدمها (يلزم درجتان مصححتان على الأقل).`,
  tooFewMeasurements: (n) => `${n} طالب لديهم أقل من درجتين مصححتين ولم تتم مقارنتهم.`,
  declineSummary: (n, compared) => `${n} من ${compared} طالب تمت مقارنتهم أحدث درجة لهم أقل من أقدمها.`,
  declinedStudents: 'طلاب أحدث درجة لهم أقل', declineSuggestion: 'يُقترح مراجعة الأسئلة التي أخطأ فيها هؤلاء الطلاب قبل استخلاص النتائج.',
  declineChartTitle: 'تغير الدرجة (الأحدث − الأقدم)', declineChartDesc: 'نقاط التغير للطلاب الذين انخفضت أحدث درجة لهم.',
  missingDef: 'غير مسلَّم: مضى موعد التسليم (مع أي تمديد) ولم تُسلَّم أي محاولة.',
  missingSummary: (n, a) => `${n} تسليمًا مفقودًا في آخر ${a} تقييم مستحق في الفترة.`,
  statusChartTitle: (title) => `حالة التسليم${title ? `: ${title}` : ' حسب التقييم'}`.slice(0, 200), statusChartDesc: 'الطلاب حسب حالة التسليم؛ الفئات متنافية.',
  statusDenominator: (n) => `${n} طالب مكلَّف`,
  distSummary: (n, m, md) => `${n} درجة مصححة في الفترة؛ المتوسط ${m}% والوسيط ${md}%.`,
  distChartTitle: 'توزيع الدرجات المصححة', distChartDesc: 'عدد الدرجات المصححة في كل نطاق من 10 نقاط (0–49 مجمَّعة).',
  gapSummary: (top, n) => `من بين ${n} ناتج تعلم لها أدلة، أعلى نسب لغير المتقنين: ${top.join('؛ ')}.`,
  gapSuggestion: 'يُقترح إعادة تدريس قصيرة أو تدريب على الناتج الأول ثم مراجعة الأدلة الجديدة.',
  gapChartTitle: 'نواتج التعلم حسب نسبة غير المتقنين', gapChartDesc: 'نسبة الطلاب المقيَّمين في مستوى ناشئ أو نامٍ لكل ناتج (أعلى 10).', gapDenominator: 'الطلاب المقيَّمون لكل ناتج (انظر الجدول)',
};

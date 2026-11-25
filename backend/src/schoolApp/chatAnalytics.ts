// Parents assistant: analytics about ONE child (owner "go" 25 Nov 2026; class averages stay OFF: never another child's data).
// Every number here is computed by code from what the parent's own screens show; the model only words the answer and its
// numbers must appear in this data (checkModelReply). Pure functions first (tested), then the loader.
import type { LearnerContext } from '../parents/service';

export type AnalyticsKind = 'trend' | 'attendance' | 'practice' | 'practice_marks' | 'week';
export type Trend = 'up' | 'steady' | 'down' | 'too_few';
const DAY = 86_400_000;

// ------------------------------------------------------------------ which analysis a question asks for
const TREND = /\b(improv\w*|getting (better|worse)|better|worse|trend|progress(ing)? over|over time)\b|بيتحسن|بتتحسن|اتحسن|اتحسنت|تحسن|تحسّن|يتحسن|تتحسن|بيتراجع|بتتراجع|اتراجع|تراجع|بيقل|بتقل|أحسن من الأول|احسن من الاول|بيعلى|بيطلع/i;
const PRACTICE = /\b(practi[cs]e\w*|study(ing)?|studies|screen time|time on enara)\b|بيذاكر|بتذاكر|يذاكر|تذاكر|ذاكر|مذاكرة|مذاكره|المذاكرة|المذاكره|بيتمرن|بتتمرن|تمرين|وقت التعلم/i;
const MARKS = /\b(marks?|grades?|scores?|results?|tests?|exams?)\b|درج|نتيجة|نتيجه|نتائج|امتحان|اختبار/i;
// Only a comparison of weeks ("Was he absent this week?" stays an attendance question).
const WEEK = /\b(what changed|what('s| is) new this week|compared (to|with) last week|than last week|this week (vs|versus|compared)|week over week)\b|إيه اللي اتغير|ايه اللي اتغير|اتغير إيه|اتغير ايه|ما الذي تغير|ماذا تغير|مقارنة بالأسبوع|مقارنة بالاسبوع|عن الأسبوع اللي فات|عن الاسبوع اللي فات|من الأسبوع اللي فات|من الاسبوع اللي فات|مقارنة بالأسبوع الماضي/i;
const ATTEND = /\b(absent|absence|absences|attendance|late|lateness)\b|غياب|غائب|حضور|تأخر|تأخير|متأخر|بيغيب|بتغيب|بيتأخر|بتتأخر|يغيب|يتأخر/i;
const PATTERN = /\b(often|pattern|which days?|usually|a lot|how many times|rate|compared)\b|كتير|كثير|كثيرا|أي أيام|اي ايام|انهي يوم|أنهي يوم|أيام|ايام|بيغيب|بتغيب|بيتأخر|بتتأخر|نسبة|معدل|مقارنة|الشهر اللي فات|الشهر الماضي/i;

export function analyticsKind(q: string): AnalyticsKind | null {
  if (WEEK.test(q)) return 'week';
  if (PRACTICE.test(q) && MARKS.test(q)) return 'practice_marks';
  if (PRACTICE.test(q)) return 'practice';
  if (ATTEND.test(q) && PATTERN.test(q)) return 'attendance';
  if (TREND.test(q)) return 'trend';
  return null;
}

// ------------------------------------------------------------------ pure analyses
/** Up / steady / down from the released marks, oldest first: the last mark against the average of the ones before (3+ marks). */
export function trendOf(marks: number[]): { trend: Trend; change: number | null } {
  if (marks.length < 3) return { trend: 'too_few', change: null };
  const last = marks[marks.length - 1];
  const before = marks.slice(-4, -1);
  const avg = before.reduce((a, b) => a + b, 0) / before.length;
  const change = Math.round(last - avg);
  return { trend: change >= 5 ? 'up' : change <= -5 ? 'down' : 'steady', change };
}

type AttRow = { date: string; status: string };
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
/** One month: days with a record, and how many of them the child attended (present or late; excused is not counted as absent). */
export function monthStats(rows: AttRow[]) {
  const byDay = new Map<string, Set<string>>();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? new Set()).add(r.status));
  let absentDays = 0, lateDays = 0, excusedDays = 0;
  for (const s of byDay.values()) {
    if (s.has('absent') && !s.has('present') && !s.has('late')) absentDays++;
    else if (s.has('late')) lateDays++;
    else if (s.has('excused') && !s.has('present')) excusedDays++;
  }
  const days = byDay.size;
  return { days, absentDays, lateDays, excusedDays, attendedPercent: days ? Math.round((100 * (days - absentDays - excusedDays)) / days) : null };
}
/** Absent and late days by weekday (0 Sunday .. 6 Saturday), over the months given. */
export function byWeekday(rows: AttRow[]) {
  const out = Array.from({ length: 7 }, (_, day) => ({ day, absent: 0, late: 0 }));
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.date}:${r.status}`;
    if (seen.has(k) || (r.status !== 'absent' && r.status !== 'late')) continue;
    seen.add(k);
    out[weekdayOf(r.date)][r.status as 'absent' | 'late']++;
  }
  return out;
}

const cairoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Saturday that starts the Cairo week of `day`. */
export const weekStartOf = (day: string) => addDays(day, -((weekdayOf(day) + 1) % 7));
/** Practice minutes for each of the last `n` Cairo weeks (Saturday first), oldest first, and the current streak of practice days. */
export function practiceWeeks(sessions: { startedAt: Date; durationMin: number }[], now: Date, n = 6) {
  const thisWeek = weekStartOf(cairoDay(now));
  const starts = Array.from({ length: n }, (_, i) => addDays(thisWeek, -7 * (n - 1 - i)));
  const minutes = new Map(starts.map((s) => [s, 0]));
  const days = new Set<string>();
  for (const s of sessions) {
    if (s.durationMin <= 0) continue;
    const d = cairoDay(s.startedAt);
    days.add(d);
    const w = weekStartOf(d);
    if (minutes.has(w)) minutes.set(w, minutes.get(w)! + s.durationMin);
  }
  const today = cairoDay(now);
  let d = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(d)) { streak++; d = addDays(d, -1); }
  return { weeks: starts.map((start) => ({ start, minutes: minutes.get(start)! })), streakDays: streak };
}

// ------------------------------------------------------------------ the loader (the parent's own screens, this child only)
export interface AnalyticsData {
  trends: { subject: string; subjectAr: string; trend: Trend; change: number | null; points: { title: string; date: string | null; mark: number }[] }[] | null;
  attendance: { thisMonth: ReturnType<typeof monthStats> & { month: string }; lastMonth: ReturnType<typeof monthStats> & { month: string }; weekdays: ReturnType<typeof byWeekday> } | null;
  practice: { goalMinutesPerWeek: number; weeks: { start: string; minutes: number }[]; streakDays: number };
  practiceVsMarks: { subject: string; subjectAr: string; minutesLast4Weeks: number; latestMark: number | null }[] | null;
  week: { thisWeek: { practiceMinutes: number; absentDays: number; lateDays: number; newMarks: number }; lastWeek: { practiceMinutes: number; absentDays: number; lateDays: number; newMarks: number } };
  rules: string;
}

export async function analyticsForChat(ctx: LearnerContext, now: Date, opts: { attendanceOn: boolean; subjectsOn: boolean }): Promise<AnalyticsData & { source: { updatedAt: string | null } }> {
  const { childData } = await import('../parents/subjectViews');
  const { subjectDetail, subjectsWithActivity, subjectOf } = await import('../parents/subjects');
  const { DEFAULT_CONTROLS } = await import('../parents/service');
  const d = await childData(ctx, now);
  const today = cairoDay(now);
  const thisWeek = weekStartOf(today), lastWeek = addDays(thisWeek, -7);
  const inWeek = (day: string | null | undefined, start: string) => !!day && day >= start && day < addDays(start, 7);

  const practice = { goalMinutesPerWeek: (ctx.link.controls?.weeklyGoalMin as number | undefined) ?? DEFAULT_CONTROLS.weeklyGoalMin, ...practiceWeeks(d.sessions, now) };

  let trends: AnalyticsData['trends'] = null, practiceVsMarks: AnalyticsData['practiceVsMarks'] = null;
  const markDays: string[] = [];
  if (opts.subjectsOn) {
    const subjects = subjectsWithActivity(d).slice(0, 12).map((s) => ({ s, x: subjectDetail(d, s.key) }));
    trends = subjects.map(({ x }) => {
      const points = x.results.filter((r) => typeof r.score === 'number' && !r.waiting).map((r) => ({ title: r.title, date: r.submittedAt ? r.submittedAt.slice(0, 10) : null, mark: r.score as number })).reverse();
      points.forEach((p) => p.date && markDays.push(p.date));
      return { subject: x.name.en, subjectAr: x.name.ar, points, ...trendOf(points.map((p) => p.mark)) };
    });
    const since = new Date(now.getTime() - 28 * DAY);
    practiceVsMarks = subjects.map(({ s, x }) => ({
      subject: x.name.en, subjectAr: x.name.ar,
      minutesLast4Weeks: d.sessions.filter((r) => r.startedAt >= since && subjectOf(d, r) === s.key).reduce((n, r) => n + r.durationMin, 0),
      latestMark: x.latestResult?.score ?? null,
    }));
  }

  let attendance: AnalyticsData['attendance'] = null;
  let attRows: AttRow[] = [];
  if (opts.attendanceOn) {
    const views = await import('./parentViews');
    const m = today.slice(0, 7);
    const prev = addDays(`${m}-01`, -1).slice(0, 7);
    const [a, b] = await Promise.all([views.attendance(ctx, m, now), views.attendance(ctx, prev, now)]);
    attRows = [...a.records, ...b.records];
    attendance = { thisMonth: { month: m, ...monthStats(a.records) }, lastMonth: { month: prev, ...monthStats(b.records) }, weekdays: byWeekday(attRows) };
  }
  const weekOf = (start: string) => {
    const s = monthStats(attRows.filter((r) => inWeek(r.date, start)));
    return {
      practiceMinutes: d.sessions.filter((r) => inWeek(cairoDay(r.startedAt), start)).reduce((n, r) => n + r.durationMin, 0),
      absentDays: s.absentDays, lateDays: s.lateDays, newMarks: markDays.filter((x) => inWeek(x, start)).length,
    };
  };
  return {
    trends, attendance, practice, practiceVsMarks,
    week: { thisWeek: weekOf(thisWeek), lastWeek: weekOf(lastWeek) },
    rules: 'Marks are released marks only (percent). trend needs 3+ marks (too_few otherwise): the last mark against the average of up to 3 before it; change is in points. attendedPercent counts days attended (present or late) of days with a record. practice minutes are per Cairo week starting Saturday. Never compare with other children or class averages.',
    source: { updatedAt: today },
  };
}

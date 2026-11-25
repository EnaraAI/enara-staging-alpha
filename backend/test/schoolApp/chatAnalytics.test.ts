import { describe, expect, it } from 'vitest';
import { analyticsKind, byWeekday, monthStats, practiceWeeks, trendOf, weekStartOf, type AnalyticsData } from '../../src/schoolApp/chatAnalytics';
import { analyticsAnswer, analyticsChart, checkModelReply, SYSTEM, topicOf, type ChatContext } from '../../src/schoolApp/chat';

// Parents assistant analytics (owner "go" 25 Nov 2026; class averages stay OFF). Numbers come from code; the model only words them.
describe('which analysis a question asks for (Arabic, Egyptian, English)', () => {
  it('routes each kind, and leaves plain questions to their own topic', () => {
    for (const [q, k] of [
      ['هو بيتحسن في الرياضيات؟', 'trend'], ['Is he improving in Maths?', 'trend'], ['مستواه بيتراجع؟', 'trend'],
      ['بيغيب كتير؟', 'attendance'], ['Is he often late?', 'attendance'], ['نسبة حضوره كام مقارنة بالشهر الماضي؟', 'attendance'],
      ['بيذاكر قد إيه؟', 'practice'], ['How much does he practise?', 'practice'],
      ['المذاكرة بتفرق في الدرجات؟', 'practice_marks'], ['Does practice help his marks?', 'practice_marks'],
      ['إيه اللي اتغير الأسبوع ده؟', 'week'], ['What changed compared to last week?', 'week'],
    ] as const) expect(analyticsKind(q), q).toBe(k);
    for (const q of ['Was he absent this week?', 'هو ابني غاب الشهر ده؟', 'Is the bus 10 minutes late?', 'How much do I still owe?', 'أمير درجاته عاملة إزاي؟']) expect(analyticsKind(q), q).toBeNull();
    expect(topicOf('هو بيتحسن في الرياضيات؟')).toBe('analytics');
    expect(topicOf('Was he absent this week?')).toBe('attendance');
  });
});

describe('the analyses', () => {
  it('trend: needs 3+ marks; the last mark against the average of up to 3 before it', () => {
    expect(trendOf([70, 80])).toEqual({ trend: 'too_few', change: null });
    expect(trendOf([50, 60, 75])).toEqual({ trend: 'up', change: 20 });
    expect(trendOf([80, 82, 79])).toMatchObject({ trend: 'steady' });
    expect(trendOf([90, 85, 70])).toEqual({ trend: 'down', change: -17 }); // 70 against 87.5
  });
  it('a month: days attended of days with a record; a day with any late period is late, not absent', () => {
    const s = monthStats([
      { date: '2026-11-01', status: 'present' }, { date: '2026-11-02', status: 'absent' }, { date: '2026-11-03', status: 'late' },
      { date: '2026-11-03', status: 'present' }, { date: '2026-11-04', status: 'excused' },
    ]);
    expect(s).toEqual({ days: 4, absentDays: 1, lateDays: 1, excusedDays: 1, attendedPercent: 50 });
    expect(monthStats([])).toMatchObject({ days: 0, attendedPercent: null });
  });
  it('absent and late days by weekday (one per day and status)', () => {
    const w = byWeekday([{ date: '2026-11-02', status: 'absent' }, { date: '2026-11-02', status: 'absent' }, { date: '2026-11-09', status: 'absent' }, { date: '2026-11-04', status: 'late' }, { date: '2026-11-05', status: 'present' }]);
    expect(w[1]).toEqual({ day: 1, absent: 2, late: 0 }); // Mondays 2 and 9 Nov
    expect(w[3]).toEqual({ day: 3, absent: 0, late: 1 });
    expect(w[4]).toEqual({ day: 4, absent: 0, late: 0 });
  });
  it('practice: minutes per Cairo week (Saturday first), oldest first, and the streak of practice days', () => {
    const now = new Date('2026-11-25T10:00:00Z'); // Wednesday; the week started Saturday 21 Nov
    expect(weekStartOf('2026-11-25')).toBe('2026-11-21');
    const p = practiceWeeks([
      { startedAt: new Date('2026-11-25T08:00:00Z'), durationMin: 20 }, { startedAt: new Date('2026-11-24T08:00:00Z'), durationMin: 15 },
      { startedAt: new Date('2026-11-17T08:00:00Z'), durationMin: 30 }, { startedAt: new Date('2026-09-01T08:00:00Z'), durationMin: 99 },
    ], now);
    expect(p.weeks).toHaveLength(6);
    expect(p.weeks.at(-1)).toEqual({ start: '2026-11-21', minutes: 35 });
    expect(p.weeks.at(-2)).toEqual({ start: '2026-11-14', minutes: 30 });
    expect(p.weeks.reduce((n, w) => n + w.minutes, 0)).toBe(65); // September is outside the 6 weeks
    expect(p.streakDays).toBe(2);
  });
});

const data: AnalyticsData = {
  trends: [
    { subject: 'Mathematics', subjectAr: 'الرياضيات', trend: 'up', change: 20, points: [{ title: 'A', date: '2026-11-01', mark: 50 }, { title: 'B', date: '2026-11-10', mark: 60 }, { title: 'C', date: '2026-11-20', mark: 75 }] },
    { subject: 'English', subjectAr: 'اللغة الإنجليزية', trend: 'too_few', change: null, points: [] },
  ],
  attendance: { thisMonth: { month: '2026-11', days: 18, absentDays: 2, lateDays: 1, excusedDays: 0, attendedPercent: 89 }, lastMonth: { month: '2026-10', days: 20, absentDays: 0, lateDays: 0, excusedDays: 0, attendedPercent: 100 }, weekdays: [{ day: 0, absent: 2, late: 0 }, { day: 1, absent: 0, late: 1 }, { day: 2, absent: 0, late: 0 }, { day: 3, absent: 0, late: 0 }, { day: 4, absent: 0, late: 0 }, { day: 5, absent: 0, late: 0 }, { day: 6, absent: 0, late: 0 }] },
  practice: { goalMinutesPerWeek: 90, weeks: [{ start: '2026-10-17', minutes: 0 }, { start: '2026-10-24', minutes: 40 }, { start: '2026-10-31', minutes: 60 }, { start: '2026-11-07', minutes: 30 }, { start: '2026-11-14', minutes: 45 }, { start: '2026-11-21', minutes: 55 }], streakDays: 3 },
  practiceVsMarks: [{ subject: 'Mathematics', subjectAr: 'الرياضيات', minutesLast4Weeks: 120, latestMark: 75 }, { subject: 'English', subjectAr: 'اللغة الإنجليزية', minutesLast4Weeks: 10, latestMark: null }],
  week: { thisWeek: { practiceMinutes: 55, absentDays: 1, lateDays: 0, newMarks: 1 }, lastWeek: { practiceMinutes: 45, absentDays: 0, lateDays: 1, newMarks: 0 } },
  rules: '',
};
const c: ChatContext = { child: 'Omar', today: '2026-11-25', facts: [{ source: 'analytics', updatedAt: '2026-11-25', data }], notShared: [] };

describe('answers and charts (from the same numbers)', () => {
  it('trend: words per subject, a subject named answers alone; the chart has the marks', () => {
    expect(analyticsAnswer(data, 'Omar', 'en', 'Is he improving?')).toBe('Mathematics: improving (+20 points). English: not enough marks yet for a trend.');
    expect(analyticsAnswer(data, 'Omar', 'ar', 'هو بيتحسن في الرياضيات؟')).toBe('الرياضيات: في تحسن (+20 نقطة).');
    expect(analyticsChart(c, 'Is he improving in Mathematics?')).toMatchObject({ kind: 'trend', subjects: [{ subject: 'Mathematics' }] });
  });
  it('attendance: this month vs last, and the weekday with most absences', () => {
    expect(analyticsAnswer(data, 'Omar', 'en', 'Is he often absent?')).toBe('Attendance this month 89% (absent 2, late 1); last month 100% (absent 0, late 0). Most absences or late days: Sunday.');
    expect(analyticsChart(c, 'بيغيب كتير؟')).toMatchObject({ kind: 'weekdays', thisMonth: { attendedPercent: 89 } });
  });
  it('practice, practice vs marks (side by side, never cause), and this week vs last', () => {
    expect(analyticsAnswer(data, 'Omar', 'en', 'How much does he practise?')).toBe('Omar practised 55 minutes this week of a 90-minute goal, and 45 minutes last week. Practice days in a row: 3.');
    expect(analyticsChart(c, 'How much does he practise?')).toMatchObject({ kind: 'weeks', goal: 90, streakDays: 3 });
    expect(analyticsAnswer(data, 'Omar', 'en', 'Does practice help his marks?')).toContain('not as cause and effect');
    expect(analyticsChart(c, 'Does practice help his marks?')).toMatchObject({ kind: 'practice_marks', rows: [{ minutes: 120, mark: 75 }, { minutes: 10, mark: null }] });
    expect(analyticsAnswer(data, 'Omar', 'ar', 'إيه اللي اتغير الأسبوع ده؟')).toContain('تدريب 55 مقابل 45 دقيقة');
    expect(analyticsChart(c, 'What changed compared to last week?')).toMatchObject({ kind: 'week', rows: [{ key: 'practiceMinutes', thisWeek: 55, lastWeek: 45 }, { key: 'absentDays' }, { key: 'lateDays' }, { key: 'newMarks' }] });
  });
  it('the model may cite analytics, with numbers from the data only; class averages are off', () => {
    expect(checkModelReply('{"answer":"Omar is improving in Mathematics: 50%, 60%, then 75%.","sources":["analytics"]}', c, 'Is he improving?')).toMatchObject({ sources: ['analytics'] });
    expect(checkModelReply('{"answer":"Omar is 12 points above the class average.","sources":["analytics"]}', c, 'Is he improving?').refused).toMatch(/number_not_in_data/);
    expect(SYSTEM).toContain('Never compare the child with other children or a class average.');
  });
});

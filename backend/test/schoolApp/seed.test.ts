import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../src/maintenance/fullSeed/plan';

// Parents school app (a5): the seeded school data (planned only; written by the lms-test full seed and removed with it).
const NOW = new Date('2026-11-24T10:00:00Z'); // a Tuesday in Cairo
const plan = buildPlan(NOW);
const of = (m: string) => plan.docs.filter((d) => d.model === m).map((d) => d.doc as Record<string, any>);

describe('school app seed', () => {
  it('turns the sections on, and adds data, only for schools with parent access', () => {
    const on = of('Institution').filter((i) => i.schoolApp?.sections?.timetable).map((i) => i.id).sort();
    expect(on).toEqual(['SCH-GHA', 'SCH-NOUR', 'SCH-NVIS']);
    expect(of('SchoolTimetableEntry').some((t) => t.institutionId === 'SCH-RLC')).toBe(false);
  });
  it('timetables: Sunday to Thursday, 6 periods per class; Arabic subjects at the Arabic school', () => {
    const tt = of('SchoolTimetableEntry');
    expect(new Set(tt.map((t) => t.day))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(Math.max(...tt.map((t) => t.period))).toBe(6);
    expect(tt.filter((t) => t.institutionId === 'SCH-NOUR').every((t) => /[؀-ۿ]/.test(t.subject))).toBe(true);
    expect(tt.filter((t) => t.institutionId === 'SCH-NVIS').every((t) => /^[A-Za-z ]+$/.test(t.subject))).toBe(true);
  });
  it('attendance: 8 weeks of school days, never after today, every status present', () => {
    const att = of('SchoolDailyAttendance');
    const days = [...new Set(att.map((a) => a.date))].sort();
    expect(days.length).toBeGreaterThanOrEqual(38);
    expect(days[days.length - 1] <= '2026-11-24').toBe(true);
    expect(days.every((d) => new Date(`${d}T12:00:00Z`).getUTCDay() <= 4)).toBe(true);
    expect(new Set(att.map((a) => a.status))).toEqual(new Set(['present', 'absent', 'late', 'excused']));
  });
  it('announcements cover every audience and state; every active parent link has the open-day notification', () => {
    const anns = of('SchoolAnnouncement');
    expect(new Set(anns.map((a) => a.audience))).toEqual(new Set(['school', 'grade', 'group', 'student']));
    expect(anns.some((a) => a.withdrawnAt)).toBe(true);
    expect(anns.some((a) => a.publishAt > NOW)).toBe(true);
    expect(anns.some((a) => a.expiresAt && a.expiresAt < NOW)).toBe(true);
    expect(anns.every((a) => a.createdAt <= NOW)).toBe(true);
    const active = of('ParentLearnerLink').filter((l) => l.status === 'active' && ['SCH-NVIS', 'SCH-NOUR', 'SCH-GHA'].includes(l.institutionId));
    const annNotes = of('ParentNotification').filter((n) => n.kind === 'announcement');
    expect(annNotes.length).toBe(active.length);
    expect(of('ParentNotification').filter((n) => n.kind !== 'announcement').every((n) => n.date && n.refId)).toBe(true);
  });
});

import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 27 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step a1; SCHOOL_APP_*_ENABLED on as on lms-test):
//   1. School A's admin turns on timetable, announcements, attendance and notifications for the school.
//   2. Imports with preview and confirm: a timetable (Arabic headers), attendance (one absence) and announcements; bad rows are
//      reported, never written; undo restores the previous timetable.
//   3. A parent linked to a School A child reads that child's timetable, attendance (with the source and date) and announcements,
//      and gets an in-app notification for the absence and the announcement.
//   4. Isolation: a parent of a School B child gets 403 for the School A child; School B's admin cannot touch School A's import.
const RUN = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const code = async (admin: string, studentId: string) => (await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {})).code as string;
const st: { group?: string; student?: string; other?: string; parent?: string; parentB?: string; tt?: string } = {};
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');

test.describe.serial('27 · Parents school app (a1): timetable, attendance, announcements, notifications', () => {
  test('the school turns the sections on; a School A child in a class is picked', async () => {
    const admin = await login('admin.a');
    const r = await enaraApi.put('/api/school-app/sections', admin, { timetable: true, announcements: true, attendance: true, notifications: true });
    expect(r.sections).toEqual({ timetable: true, announcements: true, attendance: true, notifications: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const g = (roster.groups as { name: string; students: { id: string }[] }[]).find((x) => x.students.length >= 2);
    expect(g, 'a School A class with at least two students').toBeTruthy();
    st.group = g!.name; st.student = g!.students[0].id; st.other = g!.students[1].id;
    st.parent = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.student!) })).token;
    st.parentB = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.b', 'LT-S-B04') })).token;
  });

  test('timetable import: preview (Arabic headers, one bad row), confirm, then the parent sees it with its source', async () => {
    const admin = await login('admin.a');
    const file = csv([['الفصل', 'اليوم', 'الحصة', 'من', 'إلى', 'المادة', 'المعلم'],
      [st.group!, 'الأحد', '1', '8:00', '8:45', `Maths ${RUN}`, 'Mr Adel'], [st.group!, 'Sunday', '2', '8:50', '9:35', 'English', 'Ms Hana'],
      [st.group!, 'Monday', '1', '9:00', '8:00', 'Science', ''], ['No such class', 'Monday', '1', '8:00', '8:45', 'Art', '']]);
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'timetable', csv: file, fileName: 'timetable.csv' });
    expect(p.counts).toMatchObject({ rejected: 2, total: 4 });
    expect(p.problems.map((x: { row: number }) => x.row)).toEqual([4, 5]);
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    st.tt = p.importId;
    const t = await enaraApi.get(`/api/parents/school/learners/${st.student}/timetable`, st.parent!);
    expect(t.group).toBe(st.group);
    expect(t.days[0].periods.map((x: { subject: string }) => x.subject)).toEqual([`Maths ${RUN}`, 'English']);
    expect(t.source).toMatchObject({ label: 'timetable', kind: 'import' });
    expect(t.source.updatedAt).toBeTruthy();
  });

  test('undo restores the timetable as it was before the import', async () => {
    const admin = await login('admin.a');
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'timetable', csv: csv([['Class', 'Day', 'Period', 'Start', 'End', 'Subject'], [st.group!, 'Sunday', '1', '8:00', '8:45', 'Replaced']]) });
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    expect((await enaraApi.get(`/api/parents/school/learners/${st.student}/timetable`, st.parent!)).days[0].periods.map((x: { subject: string }) => x.subject)).toEqual(['Replaced']);
    await enaraApi.post(`/api/school-app/imports/${p.importId}/undo`, admin, {});
    expect((await enaraApi.get(`/api/parents/school/learners/${st.student}/timetable`, st.parent!)).days[0].periods.map((x: { subject: string }) => x.subject)).toEqual([`Maths ${RUN}`, 'English']);
  });

  test('attendance import: the absence shows on the parent screen and as a notification; another child’s row stays hidden', async () => {
    const admin = await login('admin.a');
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: csv([['Date', 'Student ID', 'Status', 'Note'], [today, st.student!, 'غائب', 'called home'], [today, st.other!, 'present', '']]) });
    expect(p.counts).toMatchObject({ rejected: 0, total: 2 });
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    const a = await enaraApi.get(`/api/parents/school/learners/${st.student}/attendance`, st.parent!);
    expect(a.records).toEqual([{ date: today, period: null, status: 'absent', note: 'called home' }]);
    expect(a.counts.absent).toBe(1);
    const n = await enaraApi.get('/api/parents/school/notifications', st.parent!);
    expect(n.notifications.some((x: { kind: string; studentId: string }) => x.kind === 'absence' && x.studentId === st.student)).toBe(true);
    const home = await enaraApi.get(`/api/parents/school/learners/${st.student}`, st.parent!);
    expect(home.attendanceToday).toBe('absent');
  });

  test('announcements: a school-wide one reaches the parent (screen and notification); one for another child does not', async () => {
    const admin = await login('admin.a');
    await enaraApi.post('/api/school-app/announcements', admin, { audience: 'school', title: `Open day ${RUN}`, body: 'Thursday 10:00 in the hall.' });
    await enaraApi.post('/api/school-app/announcements', admin, { audience: 'student', audienceValue: st.other, title: `Private ${RUN}`, body: 'Only for the other child.' });
    const list = await enaraApi.get(`/api/parents/school/learners/${st.student}/announcements`, st.parent!);
    const titles = list.announcements.map((x: { title: string }) => x.title);
    expect(titles).toContain(`Open day ${RUN}`);
    expect(titles).not.toContain(`Private ${RUN}`);
    const n = await enaraApi.get('/api/parents/school/notifications', st.parent!);
    expect(n.notifications.some((x: { title: string }) => x.title === `Open day ${RUN}`)).toBe(true);
    expect(n.notifications.some((x: { title: string }) => x.title === `Private ${RUN}`)).toBe(false);
    expect((await enaraApi.post('/api/parents/school/notifications/read', st.parent!, {})).marked).toBeGreaterThan(0);
  });

  test('isolation: another school’s parent and admin get nothing of School A', async () => {
    for (const path of ['', '/timetable', '/attendance', '/announcements']) {
      await expect(enaraApi.get(`/api/parents/school/learners/${st.student}${path}`, st.parentB!)).rejects.toThrow(/-> 403/);
    }
    const n = await enaraApi.get('/api/parents/school/notifications', st.parentB!);
    expect(n.notifications.some((x: { studentId: string }) => x.studentId === st.student)).toBe(false);
    await expect(enaraApi.post(`/api/school-app/imports/${st.tt}/undo`, await login('admin.b'), {})).rejects.toThrow(/-> 404/);
  });
});

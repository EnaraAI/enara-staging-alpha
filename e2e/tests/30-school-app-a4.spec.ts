import { test, expect } from '@playwright/test';
import { enaraApi, login, maintenance } from '../lib/enara';

// Scenario 30 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step a4): school notice emails, through the parent email safety path (captured).
//   1. A parent with a verified email links to a School A child.
//   2. An absence import → one parent-school-notice email (captured), never twice for the same row.
//   3. The parent turns off attendance emails → the next absence makes an in-app notification but no email.
//   4. A school-wide announcement → an email (announcement emails still on).
const RUN = Date.now();
const EMAIL = `parent.a4.${RUN}@enara-e2e.app`; // fake; captured, never sent
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const today = cairo(new Date());
const yesterday = cairo(new Date(Date.now() - 86_400_000));
const sub = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub as string;
const st: { token?: string; parentId?: string; student?: string } = {};
const notices = async () => ((await maintenance('GET', '/parent-emails?limit=500')).emails as any[]).filter((e) => e.parentUserId === st.parentId && String(e.template).startsWith('parent-school-notice'));
const csv = (rows: string[][]) => rows.map((r) => r.join(',')).join('\n');
async function importAttendance(date: string) {
  const admin = await login('admin.a');
  const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: csv([['Date', 'Student ID', 'Status'], [date, st.student!, 'absent']]) });
  expect(p.counts.rejected).toBe(0);
  await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
}

test.describe.serial('30 · Parents school app (a4): school notice emails (captured)', () => {
  test('a parent with a verified email links to a School A child', async () => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { timetable: true, announcements: true, attendance: true, notifications: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    st.student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students).slice(-1)[0].id;
    const code = (await enaraApi.post(`/api/students/${st.student}/parent-codes`, admin, {})).code;
    st.token = (await enaraApi.post('/api/parents/start', '', { code })).token;
    st.parentId = sub(st.token!);
    await enaraApi.post('/api/parents/email/start', st.token!, { email: EMAIL });
    let c = '';
    await expect.poll(async () => { c = (await maintenance('POST', '/parent-email-code', { email: EMAIL, purpose: 'verify' }).catch(() => ({ code: '' }))).code; return c; }, { timeout: 30_000 }).toMatch(/^\d{3} \d{3}$/);
    expect((await enaraApi.post('/api/parents/email/verify', st.token!, { email: EMAIL, code: c })).verified).toBe(true);
    const acc = await enaraApi.get('/api/parents/account', st.token!);
    expect(acc.preferences.emails).toMatchObject({ schoolAttendance: true, schoolAnnouncements: true });
  });

  test('an absence sends one email (captured); importing the same row again sends none', async () => {
    await importAttendance(today);
    await expect.poll(async () => (await notices()).map((e) => [e.template, e.status]), { timeout: 30_000 }).toEqual([['parent-school-notice-en', 'captured']]);
    await importAttendance(today);
    expect((await notices()).length).toBe(1);
  });

  test('attendance emails off: the next absence is in-app only', async () => {
    await enaraApi.put('/api/parents/account/preferences', st.token!, { schoolAttendanceEmail: false });
    expect((await enaraApi.get('/api/parents/account', st.token!)).preferences.emails.schoolAttendance).toBe(false);
    await importAttendance(yesterday);
    const n = await enaraApi.get('/api/parents/school/notifications', st.token!);
    expect(n.notifications.filter((x: { kind: string; date: string }) => x.kind === 'absence' && x.date === yesterday)).toHaveLength(1);
    expect((await notices()).length).toBe(1);
  });

  test('a school-wide announcement sends an email', async () => {
    await enaraApi.post('/api/school-app/announcements', await login('admin.a'), { audience: 'school', title: `Parents meeting ${RUN}`, body: 'Thursday at 6 pm.' });
    await expect.poll(async () => (await notices()).length, { timeout: 30_000 }).toBe(2);
    expect((await notices()).every((e) => e.status === 'captured')).toBe(true);
  });
});

import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 36 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step d1): requests to the office and consent forms (tap-to-sign record).
//   1. A parent sends a request; the school sets it in progress, then done with a reply; the parent sees the history and a notification.
//   2. The school publishes a consent form for one class; a parent of a child in that class signs it (the exact text's hash is kept);
//      a parent of a child in another class does not see it; the dashboard counts signed and pending; the CSV lists the child.
//   3. A changed form text is refused; another school's parent and admin get nothing.
const RUN = Date.now();
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const inDays = (n: number) => cairo(new Date(Date.now() + n * 86_400_000));
const code = async (admin: string, studentId: string) => (await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {})).code as string;
const st: { child?: string; other?: string; group?: string; p1?: string; p2?: string; pB?: string; req?: string; form?: string; hash?: string } = {};

test.describe.serial('36 · Parents school app (d1): requests and consent', () => {
  test('setup: sections on; two children in two classes, one parent each', async () => {
    const admin = await login('admin.a');
    const r = await enaraApi.put('/api/school-app/sections', admin, { requests: true, consents: true, notifications: true });
    expect(r.sections).toMatchObject({ requests: true, consents: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const groups = (roster.groups as { name: string; students: { id: string }[] }[]).filter((g) => g.students.length);
    expect(groups.length, 'two School A classes with students').toBeGreaterThanOrEqual(2);
    st.group = groups[0].name; st.child = groups[0].students[0].id; st.other = groups[1].students[0].id;
    st.p1 = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.child!) })).token;
    st.p2 = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.other!) })).token;
    st.pB = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.b', 'LT-S-B04') })).token;
  });

  test('a request: new → in progress → done with a reply; the parent is notified', async () => {
    await expect(enaraApi.post(`/api/parents/school/learners/${st.child}/requests`, st.p1!, { type: 'refund', details: 'x' })).rejects.toThrow(/-> 400/);
    const r = await enaraApi.post(`/api/parents/school/learners/${st.child}/requests`, st.p1!, { type: 'certificate', details: `Enrolment certificate for the embassy ${RUN}` });
    expect(r).toMatchObject({ status: 'new', type: 'certificate' });
    st.req = r.id;
    await expect(enaraApi.post(`/api/parents/school/learners/${st.child}/requests`, st.pB!, { type: 'other', details: 'not my child' })).rejects.toThrow(/-> 403/);
    const admin = await login('admin.a');
    const inbox = await enaraApi.get('/api/school-app/requests?status=new', admin);
    expect(inbox.requests.some((x: { id: string }) => x.id === st.req)).toBe(true);
    await expect(enaraApi.post(`/api/school-app/requests/${st.req}`, await login('admin.b'), { status: 'done' })).rejects.toThrow(/-> 404/);
    await enaraApi.post(`/api/school-app/requests/${st.req}`, admin, { status: 'in_progress' });
    await enaraApi.post(`/api/school-app/requests/${st.req}`, admin, { status: 'done', reply: 'Ready at the office from Sunday.' });
    const mine = (await enaraApi.get(`/api/parents/school/learners/${st.child}/requests`, st.p1!)).requests.find((x: { id: string }) => x.id === st.req);
    expect(mine).toMatchObject({ status: 'done', reply: 'Ready at the office from Sunday.' });
    expect(mine.history.map((h: { status: string }) => h.status)).toEqual(['new', 'in_progress', 'done']);
    const n = await enaraApi.get('/api/parents/school/notifications', st.p1!);
    expect(n.notifications.filter((x: { kind: string; studentId: string }) => x.kind === 'request_update' && x.studentId === st.child).length).toBeGreaterThanOrEqual(2);
  });

  test('a consent form for one class: signed with the text hash; hidden from another class; dashboard and CSV', async () => {
    const admin = await login('admin.a');
    const f = await enaraApi.post('/api/school-app/consents', admin, { title: `Museum trip ${RUN}`, body: 'The class visits the Egyptian Museum on Monday by school bus.', audience: 'group', audienceValue: st.group, deadline: inDays(5) });
    st.form = f.id;
    const mine = (await enaraApi.get(`/api/parents/school/learners/${st.child}/consents`, st.p1!)).forms.find((x: { id: string }) => x.id === st.form);
    expect(mine).toMatchObject({ open: true, answer: null });
    expect(mine.options.map((o: { key: string }) => o.key)).toEqual(['agree', 'decline']);
    expect((await enaraApi.get(`/api/parents/school/learners/${st.other}/consents`, st.p2!)).forms.some((x: { id: string }) => x.id === st.form)).toBe(false);
    const home = await enaraApi.get(`/api/parents/school/learners/${st.child}`, st.p1!);
    expect(home.consentsPending).toBeGreaterThanOrEqual(1);
    // The text hash the parent saw must match (a changed form is refused); "I confirm" is required.
    await expect(enaraApi.post(`/api/parents/school/learners/${st.child}/consents/${st.form}`, st.p1!, { choice: 'agree', agree: true, textHash: 'old' })).rejects.toThrow(/-> 409/);
    await expect(enaraApi.post(`/api/parents/school/learners/${st.child}/consents/${st.form}`, st.p1!, { choice: 'agree', agree: false, textHash: mine.textHash })).rejects.toThrow(/-> 400/);
    await expect(enaraApi.post(`/api/parents/school/learners/${st.other}/consents/${st.form}`, st.p2!, { choice: 'agree', agree: true, textHash: mine.textHash })).rejects.toThrow(/-> 404/);
    await expect(enaraApi.post(`/api/parents/school/learners/${st.child}/consents/${st.form}`, st.pB!, { choice: 'agree', agree: true, textHash: mine.textHash })).rejects.toThrow(/-> 403/);
    const signed = await enaraApi.post(`/api/parents/school/learners/${st.child}/consents/${st.form}`, st.p1!, { choice: 'agree', agree: true, textHash: mine.textHash });
    expect(signed).toMatchObject({ choice: 'agree', textHash: mine.textHash });
    const after = (await enaraApi.get(`/api/parents/school/learners/${st.child}/consents`, st.p1!)).forms.find((x: { id: string }) => x.id === st.form);
    expect(after.answer).toMatchObject({ choice: 'agree', byYou: true, sameText: true });

    const dash = await enaraApi.get(`/api/school-app/consents/${st.form}`, admin);
    expect(dash.counts.agree).toBe(1);
    expect(dash.rows.find((r: { studentId: string }) => r.studentId === st.child)).toMatchObject({ choice: 'agree', sameText: true });
    expect(dash.rows.some((r: { studentId: string }) => r.studentId === st.other)).toBe(false);
    const csv = String(await enaraApi.get(`/api/school-app/consents/${st.form}/export`, admin));
    expect(csv).toContain(st.child!);
    expect(csv).toContain('I agree');
    await expect(enaraApi.get(`/api/school-app/consents/${st.form}`, await login('admin.b'))).rejects.toThrow(/-> 404/);
    const n = await enaraApi.get('/api/parents/school/notifications', st.p1!);
    expect(n.notifications.some((x: { kind: string; studentId: string }) => x.kind === 'consent' && x.studentId === st.child)).toBe(true);
  });
});

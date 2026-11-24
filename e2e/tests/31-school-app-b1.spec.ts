import { test, expect } from '@playwright/test';
import { enaraApi, login, maintenance } from '../lib/enara';

// Scenario 31 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step b1): fees and instalments, display only (ENARA never takes payments).
//   1. School A turns fees on and imports a fee sheet (Arabic headers): one paid, one overdue, one due in 7 days; a bad amount is rejected.
//   2. The parent sees totals (paid / remaining / overdue), the next instalment and the source.
//   3. The school marks the overdue instalment paid (audited): the parent's totals change.
//   4. The daily reminder step makes a reminder 7 days before a due date, once.
//   5. "Main guardian only": a second guardian gets 403; a parent of another school gets 403; School B's admin cannot mark it.
const RUN = Date.now();
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const day = (n: number) => cairo(new Date(Date.now() + n * 86_400_000));
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const st: { student?: string; owner?: string; second?: string; parentB?: string; overdueId?: string } = {};
const code = async (admin: string, studentId: string) => (await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {})).code as string;
const PLAN = `Tuition ${RUN}`;

test.describe.serial('31 · Parents school app (b1): fees, display only', () => {
  test('fees on; a fee sheet with Arabic headers is previewed (bad amount rejected) and imported', async () => {
    const admin = await login('admin.a');
    const r = await enaraApi.put('/api/school-app/sections', admin, { fees: true, notifications: true });
    expect(r.sections.fees).toBe(true);
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    st.student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students)[1].id;
    st.owner = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.student!) })).token;
    st.second = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.student!) })).token;
    st.parentB = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.b', 'LT-S-B04') })).token;
    const csv = ['رقم الطالب,الخطة,رقم القسط,المبلغ,تاريخ الاستحقاق,الحالة,تاريخ الدفع,رقم الإيصال',
      `${st.student},${PLAN},1,"5,000",${dmy(day(-60))},مدفوع,${dmy(day(-61))},R-${RUN}`,
      `${st.student},${PLAN},2,5000,${dmy(day(-3))},مستحق,,`,
      `${st.student},${PLAN},3,5000,${dmy(day(7))},,,`,
      `${st.student},${PLAN},4,five thousand,${dmy(day(90))},,,`].join('\n');
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'fees', csv, fileName: 'fees.csv' });
    expect(p.counts).toMatchObject({ new: 3, rejected: 1, total: 4 });
    expect(p.problems[0]).toMatchObject({ row: 5 });
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
  });

  test('the parent sees totals, overdue, the next instalment and the source', async () => {
    const f = await enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.owner!);
    const plan = f.plans.find((x: { name: string }) => x.name === PLAN);
    expect(plan.totals).toEqual({ total: 15000, paid: 5000, waived: 0, remaining: 10000, overdue: 5000 });
    expect(plan.instalments.map((i: { status: string }) => i.status)).toEqual(['paid', 'overdue', 'due']);
    expect(plan.instalments[0].receiptRef).toBe(`R-${RUN}`);
    expect(f.next).toMatchObject({ number: 2, status: 'overdue' });
    expect(f.source).toMatchObject({ label: 'fees', kind: 'import' });
    st.overdueId = plan.instalments[1].id;
    const home = await enaraApi.get(`/api/parents/school/learners/${st.student}`, st.owner!);
    expect(home.fees.overdueCount).toBeGreaterThanOrEqual(1);
  });

  test('the school marks the overdue instalment paid; School B cannot', async () => {
    await expect(enaraApi.post(`/api/school-app/fees/instalments/${st.overdueId}/mark`, await login('admin.b'), { status: 'paid' })).rejects.toThrow(/-> 404/);
    const m = await enaraApi.post(`/api/school-app/fees/instalments/${st.overdueId}/mark`, await login('admin.a'), { status: 'paid', paidDate: day(0), receiptRef: `R2-${RUN}` });
    expect(m).toMatchObject({ status: 'paid', paidDate: day(0), receiptRef: `R2-${RUN}` });
    const plan = (await enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.owner!)).plans.find((x: { name: string }) => x.name === PLAN);
    expect(plan.totals).toMatchObject({ paid: 10000, remaining: 5000, overdue: 0 });
  });

  test('reminder 7 days before the due date, once', async () => {
    await maintenance('POST', '/school-fee-reminders', {});
    await maintenance('POST', '/school-fee-reminders', {});
    const n = await enaraApi.get('/api/parents/school/notifications', st.owner!);
    const mine = n.notifications.filter((x: { kind: string; studentId: string; date: string }) => x.kind === 'fee_due' && x.studentId === st.student && x.date === day(7));
    expect(mine).toHaveLength(1);
  });

  test('main guardian only: the second guardian gets 403; another school’s parent gets 403', async () => {
    expect((await enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.second!)).plans.length).toBeGreaterThan(0);
    await enaraApi.put('/api/school-app/fees/visibility', await login('admin.a'), { feesVisibleTo: 'owner' });
    // The first guardian to link is the main one ("owner"); a child linked earlier in the suite may already have one.
    const roleOf = async (t: string) => ((await enaraApi.get('/api/parents/learners', t)).learners as { studentId: string; role: string }[]).find((l) => l.studentId === st.student)!.role;
    expect(await roleOf(st.second!)).toBe('full');
    await expect(enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.second!)).rejects.toThrow(/-> 403/);
    if ((await roleOf(st.owner!)) === 'owner') expect((await enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.owner!)).plans.length).toBeGreaterThan(0);
    else await expect(enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.owner!)).rejects.toThrow(/-> 403/);
    await expect(enaraApi.get(`/api/parents/school/learners/${st.student}/fees`, st.parentB!)).rejects.toThrow(/-> 403/);
    await enaraApi.put('/api/school-app/fees/visibility', await login('admin.a'), { feesVisibleTo: 'all' });
  });
});

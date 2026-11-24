import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 33 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step b3): fee receipts.
//   1. The school attaches its receipt (PDF) to a paid instalment; the parent downloads it.
//   2. A file that is not what it says, or too big, is refused; another school's admin and parent get nothing.
const RUN = Date.now();
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const day = (n: number) => cairo(new Date(Date.now() + n * 86_400_000));
const PDF = Buffer.from(`%PDF-1.4\n% receipt ${RUN}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
const code = async (admin: string, studentId: string) => (await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {})).code as string;

test.describe.serial('33 · Parents school app (b3): fee receipts', () => {
  test('attach, download, refuse bad files, isolation', async () => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { fees: true });
    await enaraApi.put('/api/school-app/fees/visibility', admin, { feesVisibleTo: 'all' });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students)[3].id;
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'fees', csv: `Student ID,Plan,Instalment No.,Amount,Due date,Status,Paid date\n${student},Receipts ${RUN},1,9000,${day(-20)},paid,${day(-21)}` });
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    const inst = (await enaraApi.get(`/api/school-app/fees?studentId=${student}`, admin)).instalments.find((i: { planName: string }) => i.planName === `Receipts ${RUN}`);
    expect(inst.hasReceipt).toBe(false);

    await expect(enaraApi.post(`/api/school-app/fees/instalments/${inst.id}/receipt`, admin, { contentType: 'application/pdf', dataBase64: Buffer.from('not a pdf').toString('base64') })).rejects.toThrow(/-> 400/);
    await expect(enaraApi.post(`/api/school-app/fees/instalments/${inst.id}/receipt`, admin, { contentType: 'text/html', dataBase64: PDF.toString('base64') })).rejects.toThrow(/-> 400/);
    await expect(enaraApi.post(`/api/school-app/fees/instalments/${inst.id}/receipt`, admin, { contentType: 'application/pdf', dataBase64: Buffer.concat([PDF, Buffer.alloc(720 * 1024)]).toString('base64') })).rejects.toThrow(/-> 413/);
    await expect(enaraApi.post(`/api/school-app/fees/instalments/${inst.id}/receipt`, await login('admin.b'), { contentType: 'application/pdf', dataBase64: PDF.toString('base64') })).rejects.toThrow(/-> 404/);
    expect(await enaraApi.post(`/api/school-app/fees/instalments/${inst.id}/receipt`, admin, { contentType: 'application/pdf', dataBase64: PDF.toString('base64') })).toMatchObject({ hasReceipt: true });

    const parent = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', student) })).token;
    const fees = await enaraApi.get(`/api/parents/school/learners/${student}/fees`, parent);
    const row = fees.plans.find((x: { name: string }) => x.name === `Receipts ${RUN}`).instalments[0];
    expect(row.hasReceipt).toBe(true);
    const file = await enaraApi.get<string>(`/api/parents/school/learners/${student}/fees/${inst.id}/receipt`, parent);
    expect(String(file)).toContain(`% receipt ${RUN}`);
    expect(String(await enaraApi.get<string>(`/api/school-app/fees/instalments/${inst.id}/receipt`, admin))).toContain(`% receipt ${RUN}`);

    const parentB = (await enaraApi.post('/api/parents/start', '', { code: await code('admin.b', 'LT-S-B04') })).token;
    await expect(enaraApi.get(`/api/parents/school/learners/${student}/fees/${inst.id}/receipt`, parentB)).rejects.toThrow(/-> 403/);
    await expect(enaraApi.get(`/api/parents/school/learners/LT-S-B04/fees/${inst.id}/receipt`, parentB)).rejects.toThrow(/-> (403|404)/);
    await expect(enaraApi.get(`/api/school-app/fees/instalments/${inst.id}/receipt`, await login('admin.b'))).rejects.toThrow(/-> 404/);
  });
});

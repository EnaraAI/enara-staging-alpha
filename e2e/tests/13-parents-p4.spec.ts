import { test, expect } from '@playwright/test';
import { enaraApi, enaraFrame, enaraUiSession, frameToken, login, maintenance } from '../lib/enara';
import { ENARA } from '../lib/env';
import { moodleSession } from '../lib/moodle';
import { activityUrl } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

// Scenario 13 (Parents P4, docs/parents/P4_NOTES.md). PARENT_EMAILS_ENABLED on, as on
// lms-test. This stack CAPTURES every email (recorded, never sent) through the same
// safety path as lms-test (test inbox redirect, "[lms-test]" prefix, ceiling):
//   - parent-link-confirmed when a parent with an email links a child (a code-only
//     parent has no address: nothing);
//   - parent-invite from "Send code by email";
//   - parent-new-results when a result is released, at most one per child per day
//     (School A turns the email on: it is off by default, D11);
//   - parent-weekly-summary: ONE email per parent (two children in two schools);
//   - "Share this week -> Email" is no longer blocked;
//   - parent-link-ended when the school unlinks; not when the parent unlinks themself.
const STAMP = Date.now();
const EMAIL = `parent.p4.${STAMP}@enara-e2e.app`; // fake; captured, never sent
const ANSWERS = { q1: '4', q2: '6', q3: '10', q4: '2' };
const st: { token?: string; parentId?: string; studentA?: string; studentToken?: string } = {};
const sub = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub as string;
const parentEmails = async () => ((await maintenance('GET', '/parent-emails?limit=500')).emails as any[]).filter((e) => e.parentUserId === st.parentId);
const capturedCode = async (purpose: 'verify' | 'signin') => {
  let code = '';
  await expect.poll(async () => { code = (await maintenance('POST', '/parent-email-code', { email: EMAIL, purpose }).catch(() => ({ code: '' }))).code; return code; }, { timeout: 30_000 }).toMatch(/^\d{3} \d{3}$/);
  return code;
};
const code = async (admin: 'admin.a' | 'admin.b', studentId: string) => (await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {})).code as string;
async function quiz(title: string) {
  const s = readState();
  const asg = await enaraApi.post('/api/assignments', await login('admin.a'), { classId: s.courseContext.enaraClassId, assessmentId: s.content.quizId, title, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 2, releasePolicy: 'manual' });
  const id = (asg.assignment ?? asg).id;
  const started = await enaraApi.post(`/api/me/assignments/${id}/attempts`, st.studentToken!, {});
  await enaraApi.post(`/api/me/assignments/${id}/attempts/${started.attempt.id}/submit`, st.studentToken!, { answers: ANSWERS });
  return started.attempt.id as string;
}

test.describe.serial('13 · Parents P4: parent emails through the safety path (captured)', () => {
  test("School A's admin: the parent email switches (new results is off by default); turn new results on", async ({ browser }) => {
    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const emails = page.getByTestId('ps-emails');
    await expect(emails.getByTestId('ps-email-linkConfirmed')).toBeChecked();
    await expect(emails.getByTestId('ps-email-weeklySummary')).toBeChecked();
    await expect(emails.getByTestId('ps-email-linkEnded')).toBeChecked();
    await expect(emails.getByTestId('ps-email-newResults')).not.toBeChecked();
    await emails.getByTestId('ps-email-newResults').check();
    await page.getByTestId('parent-school-settings').getByTestId('pc-save').click();
    await expect(page.getByTestId('ps-note')).toHaveText('Saved.');
    await shot(page, '13-parents-email-switches');
    await context.close();
    expect((await enaraApi.get('/api/parents-admin/schools/LT-SCHOOL-A/settings', await login('admin.a'))).emails).toMatchObject({ newResults: true });
  });

  test('a code-only parent (no address) gets nothing; with an email, linking a second child sends parent-link-confirmed', async ({ browser }) => {
    const s = readState();
    // The Moodle student (scenario 5's class) is child A.
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(activityUrl(s.activities.courseLink));
    const f = await enaraFrame(page);
    await expect.poll(() => f.evaluate(() => JSON.parse(sessionStorage.getItem('enara_user') || '{}').studentId || ''), { timeout: 60_000 }).not.toBe('');
    st.studentA = await f.evaluate(() => JSON.parse(sessionStorage.getItem('enara_user') || '{}').studentId);
    st.studentToken = await frameToken(f);
    await context.close();
    const started = await enaraApi.post('/api/parents/start', '', { code: await code('admin.a', st.studentA!) });
    st.token = started.token;
    st.parentId = sub(st.token!);
    expect(await parentEmails()).toEqual([]); // no address yet: no link-confirmed email
    await enaraApi.post('/api/parents/email/start', st.token!, { email: EMAIL });
    expect((await enaraApi.post('/api/parents/email/verify', st.token!, { email: EMAIL, code: await capturedCode('verify') })).verified).toBe(true);
    await enaraApi.post('/api/parents/link/confirm', st.token!, { code: await code('admin.b', 'LT-S-B04') });
    await expect.poll(async () => (await parentEmails()).filter((e) => e.template === 'parent-link-confirmed-en').map((e) => e.status)).toEqual(['captured']);
  });

  test('"Send code by email": parent-invite, captured through the test inbox redirect', async () => {
    const r = await enaraApi.post('/api/students/LT-S-A06/parent-codes', await login('admin.a'), { sendToEmail: `invitee.${STAMP}@enara-e2e.app` });
    expect(r.emailed).toEqual({ ok: true });
    const log = await maintenance('GET', '/lms-emails?template=parent-invite-en');
    expect(log.emails.length).toBeGreaterThan(0);
    expect(log.emails[0]).toMatchObject({ status: 'captured', redirected: true });
  });

  test('parent-new-results when a result is released, at most one per child per day', async () => {
    const admin = await login('admin.a');
    const first = await quiz(`E2E P4 quiz A ${STAMP}`);
    expect((await parentEmails()).filter((e) => e.template === 'parent-new-results-en')).toEqual([]); // held: nothing yet
    await enaraApi.post(`/api/grading/attempts/${first}/release`, admin, {});
    await expect.poll(async () => (await parentEmails()).filter((e) => e.template === 'parent-new-results-en').length).toBe(1);
    const second = await quiz(`E2E P4 quiz B ${STAMP}`);
    await enaraApi.post(`/api/grading/attempts/${second}/release`, admin, {});
    expect((await parentEmails()).filter((e) => e.template === 'parent-new-results-en')).toHaveLength(1);
  });

  test('the weekly step: ONE parent-weekly-summary for this parent of two children in two schools', async () => {
    const r = await maintenance('POST', '/parent-weekly', { force: true });
    expect(r.parents).toBeGreaterThan(0);
    const weekly = (await parentEmails()).filter((e) => e.template === 'parent-weekly-summary-en' && e.key.startsWith('weekly:'));
    expect(weekly).toHaveLength(1);
    expect(weekly[0].status).toBe('captured');
    // Once per week: running it again adds nothing.
    await maintenance('POST', '/parent-weekly', { force: true });
    expect((await parentEmails()).filter((e) => e.key.startsWith('weekly:'))).toHaveLength(1);
  });

  test('"Share this week -> Email" is no longer blocked: the summary goes out through the safety path', async ({ browser }) => {
    const report = await enaraApi.get(`/api/parents/learners/${st.studentA}/report`, st.token!);
    expect(report.shareEmail).toEqual({ blocked: false });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${ENARA}/`);
    await page.evaluate(([t]) => { localStorage.setItem('enara_token', t); localStorage.setItem('enara_ui_role', 'parent'); localStorage.setItem('enara_user', JSON.stringify({ role: 'parent', email: 'x' })); }, [st.token!]);
    await page.goto(`${ENARA}/parents`);
    await page.getByRole('button', { name: 'Share this week' }).click();
    const email = page.getByTestId('pp-share-email');
    await expect(email).toBeEnabled();
    await expect(page.getByTestId('pp-share-email-blocked')).toHaveCount(0);
    await email.click();
    await expect.poll(async () => (await parentEmails()).filter((e) => e.key.startsWith('share:')).map((e) => e.status)).toEqual(['captured']);
    await shot(page, '13-parents-share-email');
    await context.close();
  });

  test('parent-link-ended when the school unlinks; nothing when the parent unlinks themself', async () => {
    const learners = await enaraApi.get('/api/parents/learners', st.token!);
    const b = learners.learners.find((l: any) => l.studentId === 'LT-S-B04');
    const a = learners.learners.find((l: any) => l.studentId === st.studentA);
    const c = await (await import('@playwright/test')).request.newContext({ baseURL: ENARA, ignoreHTTPSErrors: true });
    const del = async (path: string, token: string) => { const r = await c.delete(path, { headers: { Authorization: `Bearer ${token}` } }); expect(r.status(), path).toBe(200); };
    await del(`/api/students/LT-S-B04/parent-links/${b.linkId}`, await login('admin.b'));
    await expect.poll(async () => (await parentEmails()).filter((e) => e.template === 'parent-link-ended-en').length).toBe(1);
    await del(`/api/parents/links/${a.linkId}`, st.token!);
    expect((await parentEmails()).filter((e) => e.template === 'parent-link-ended-en')).toHaveLength(1);
    await c.dispose();
    // Every parent email of this run went through the safety path: captured and redirected.
    const log = await maintenance('GET', '/lms-emails?limit=500');
    const parentRows = (log.emails as any[]).filter((e) => /^parent-(link-confirmed|link-ended|new-results|weekly-summary|invite)-/.test(e.template));
    expect(parentRows.length).toBeGreaterThan(0);
    for (const e of parentRows) expect(e).toMatchObject({ status: 'captured', redirected: true });
    saveState({ parentsP4: { parentId: st.parentId } });
  });
});

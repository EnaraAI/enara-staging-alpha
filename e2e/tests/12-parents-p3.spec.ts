import { test, expect, type Page } from '@playwright/test';
import { enaraApi, enaraFrame, enaraUiSession, frameToken, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { moodleSession } from '../lib/moodle';
import { activityUrl } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

// Scenario 12 (Parents P3, docs/parents/P3_NOTES.md). PARENT_GRADES_AFTER_REVIEW_ENABLED
// on, as on lms-test. The school's "Show results to parents" is "After the teacher
// releases them" by default (D7):
//   1. School A's admin sees the setting (after release) on the Parents page.
//   2. The Moodle student (launched from Moodle) is given a manual-release quiz on the
//      Moodle-made class and submits it; it is graded but held for the teacher.
//   3. A parent of that student sees "Waiting for the teacher" and no score; no
//      "score dropped" from it.
//   4. The result is released: the parent sees the score, and the class label is the
//      Moodle course's ENARA class name.
const TITLE = `E2E P3 manual-release quiz ${Date.now()}`;
const ANSWERS = { q1: '4', q2: '6', q3: '10', q4: '1' }; // 3 of 4 -> 75 %
const st: { studentId?: string; studentToken?: string; assignmentId?: string; attemptId?: string; page?: Page; close?: () => Promise<void> } = {};

const progressOf = async (token: string) => enaraApi.get(`/api/parents/learners/${st.studentId}/progress`, token);

test.describe.serial('12 · Parents P3: results reach parents only after release', () => {
  test("School A's admin: \"Show results to parents\" is \"After the teacher releases them\" by default", async ({ browser }) => {
    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const settings = page.getByTestId('parent-school-settings');
    await expect(settings.getByTestId('ps-results')).toContainText('Show results to parents');
    await expect(settings.getByTestId('ps-results-after')).toBeChecked();
    await shot(page, '12-parents-results-setting');
    await context.close();
    const status = await enaraApi.get('/api/parents-admin/status', await login('admin.a'));
    expect(status.settings.showResults).toBe('after_release');
  });

  test('the Moodle student submits a manual-release quiz on the Moodle-made class: graded, held for the teacher', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(activityUrl(s.activities.courseLink));
    const f = await enaraFrame(page);
    await expect.poll(() => f.evaluate(() => JSON.parse(sessionStorage.getItem('enara_user') || '{}').studentId || ''), { timeout: 60_000 }).not.toBe('');
    st.studentId = await f.evaluate(() => JSON.parse(sessionStorage.getItem('enara_user') || '{}').studentId);
    st.studentToken = await frameToken(f);
    await context.close();
    const admin = await login('admin.a');
    const classId = s.courseContext.enaraClassId;
    const asg = await enaraApi.post('/api/assignments', admin, {
      classId, assessmentId: s.content.quizId, title: TITLE, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 2, releasePolicy: 'manual',
    });
    st.assignmentId = (asg.assignment ?? asg).id;
    const started = await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts`, st.studentToken!, {});
    st.attemptId = started.attempt.id;
    await enaraApi.post(`/api/me/assignments/${st.assignmentId}/attempts/${st.attemptId}/submit`, st.studentToken!, { answers: ANSWERS });
  });

  test('the parent sees "Waiting for the teacher" and no score', async ({ browser }) => {
    const code = (await enaraApi.post(`/api/students/${st.studentId}/parent-codes`, await login('admin.a'), {})).code;
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror parent p3]', String(e).slice(0, 500)));
    st.page = page;
    st.close = () => context.close();
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });
    const token = await page.evaluate(() => localStorage.getItem('enara_token') || '');
    // Graded and finalized, not released.
    let item: any;
    await expect.poll(async () => { item = (await progressOf(token)).assessments.items.find((i: any) => i.id === st.attemptId); return item?.waiting === true; }, { timeout: 60_000 }).toBe(true);
    expect(item).toMatchObject({ score: null, passed: null, verified: false });
    // "Score dropped" reads released results only: the two latest VISIBLE scores decide it, never the held one
    // (the student's earlier released quiz results from scenario 4 may well be a real drop, 75 -> 25).
    const visible = (await progressOf(token)).assessments.items.filter((i: any) => i.score !== null);
    const status = await enaraApi.get(`/api/parents/learners/${st.studentId}/status`, token);
    if (visible.length >= 2 && visible[1].score - visible[0].score >= 20) {
      expect(status.status.reason).toMatchObject({ code: 'score_drop', params: { from: visible[1].score, to: visible[0].score } });
    } else {
      expect(status.status.reason.code).not.toBe('score_drop');
    }
    await page.getByTestId('pp-nav-progress').click();
    const row = page.getByTestId('pp-result').filter({ hasText: TITLE });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('pp-result-waiting')).toHaveText('Waiting for the teacher');
    await expect(row).not.toContainText('75%');
    await shot(page, '12-parents-waiting-for-teacher');
  });

  test('after the release the parent sees the score, labelled with the Moodle course\'s class', async () => {
    const admin = await login('admin.a');
    const r = await enaraApi.post(`/api/grading/attempts/${st.attemptId}/release`, admin, {});
    expect(r.gradingStatus).toBe('released');
    const page = st.page!;
    const token = await page.evaluate(() => localStorage.getItem('enara_token') || '');
    const progress = await progressOf(token);
    const item = progress.assessments.items.find((i: any) => i.id === st.attemptId);
    expect(item).toMatchObject({ score: 75, verified: true });
    expect(item.waiting).toBeUndefined();
    // A child in several classes: the label is the Moodle course's ENARA class name.
    if (item.class) {
      const classes = (await enaraApi.get('/api/parents-admin/classes', admin)).classes as { id: string; name: string }[];
      expect(item.class).toEqual({ id: readState().courseContext.enaraClassId, name: classes.find((c) => c.id === readState().courseContext.enaraClassId)?.name });
    }
    await page.reload();
    await page.getByTestId('pp-nav-progress').click();
    const row = page.getByTestId('pp-result').filter({ hasText: TITLE });
    await expect(row).toContainText('75%');
    await expect(row.getByTestId('pp-result-waiting')).toHaveCount(0);
    await shot(page, '12-parents-released-score');
    await st.close?.();
    saveState({ parentsP3: { attemptId: st.attemptId } });
  });
});

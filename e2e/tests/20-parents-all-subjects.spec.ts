import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { QUESTIONS } from '../lib/content';
import { shot } from '../lib/state';

// Scenario 20 (docs/parents/ALL_SUBJECTS_PLAN.md, PARENT_ALL_SUBJECTS_ENABLED on, as on lms-test):
//   1. A School A student (LT-S-A11) submits work in 3 subjects (English, Maths, Science), released automatically, plus one Maths quiz
//      the teacher has not released yet.
//   2. A new parent links with a code, on a phone screen: "All subjects" plus the 3 subject chips, one card per subject.
//   3. The Maths page shows the released score, the held quiz as "Waiting for the teacher" with no score, and suggestions.
//   4. No "Sample data" anywhere; Arabic is right-to-left with the same chips.
const STUDENT = 'LT-S-A11';
const CLASS = 'LT-C-ENG-7B';
const RUN = Date.now();
const ANSWERS = { q1: '4', q2: '6', q3: '10', q4: '1' }; // 3 of 4 -> 75 %
const ALL_RIGHT = { q1: '4', q2: '6', q3: '10', q4: '2' }; // 4 of 4 -> 100 %
const questions = () => QUESTIONS.map((q, i) => ({ id: `q${i + 1}`, type: 'multiple-choice', text: q.text, options: q.options, correctAnswer: q.options[0], points: 1, explanation: '' }));
const st: { held?: string; titles: Record<string, string> } = { titles: {} };

test.describe.serial('20 · Parents: every subject the child studies', () => {
  test('the student submits work in English, Maths and Science (and one Maths quiz held for the teacher)', async () => {
    const admin = await login('admin.a');
    const student = await login(STUDENT.toLowerCase());
    // Class membership is read from class enrollments (as in scenario 15): make sure the student is enrolled in the class.
    await enaraApi.post(`/api/multi-class/students/${STUDENT}/enrollments`, admin, { scope: 'class', targetId: CLASS }, [200, 201, 409]);
    const work = [
      { key: 'english', subject: 'English', title: `E2E English check ${RUN}`, release: 'auto', answers: ANSWERS },
      { key: 'maths', subject: 'Maths', title: `E2E Maths check ${RUN}`, release: 'auto', answers: ANSWERS },
      { key: 'science', subject: 'Science', title: `E2E Science check ${RUN}`, release: 'auto', answers: ANSWERS },
      { key: 'held', subject: 'Maths', title: `E2E Maths held quiz ${RUN}`, release: 'manual', answers: ALL_RIGHT },
    ];
    for (const w of work) {
      const a = await enaraApi.post('/api/assessments', admin, {
        title: w.title, subject: w.subject, assessmentKind: 'quiz', difficulty: 'Easy', duration: 10, status: 'active', lifecycle: 'published',
        maxAttempts: 2, answerReveal: 'after-submit', instructions: 'E2E item.', questions: questions(),
      });
      const asg = await enaraApi.post('/api/assignments', admin, {
        classId: CLASS, studentIds: [STUDENT], assessmentId: (a.assessment ?? a).id, title: w.title, dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxAttempts: 2, releasePolicy: w.release,
      });
      const asgId = (asg.assignment ?? asg).id;
      const started = await enaraApi.post(`/api/me/assignments/${asgId}/attempts`, student, {});
      await enaraApi.post(`/api/me/assignments/${asgId}/attempts/${started.attempt.id}/submit`, student, { answers: w.answers });
      st.titles[w.key] = w.title;
      if (w.key === 'held') st.held = started.attempt.id;
    }
  });

  test('a parent on a phone sees "All subjects" and the 3 subjects, one card each, and no "Sample data"', async ({ browser }) => {
    const code = (await enaraApi.post(`/api/students/${STUDENT}/parent-codes`, await login('admin.a'), {})).code;
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror parent subjects]', String(e).slice(0, 500)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    // Signed in once the child chip shows (as in scenario 12); then the session token is stored.
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });
    const token = await page.evaluate(() => localStorage.getItem('enara_token') || '');

    // API: the 3 subjects, the held quiz nowhere on the overview, and only "waiting" (no score) on the Maths page.
    let keys: string[] = [];
    await expect.poll(async () => { keys = ((await enaraApi.get(`/api/parents/learners/${STUDENT}/subjects`, token)).subjects as { key: string }[]).map((s) => s.key); return ['english', 'mathematics', 'science'].every((k) => keys.includes(k)); }, { timeout: 60_000 }).toBe(true);
    const maths = await enaraApi.get(`/api/parents/learners/${STUDENT}/subjects/mathematics`, token);
    const held = maths.subject.results.find((r: { id: string }) => r.id === st.held);
    expect(held).toMatchObject({ score: null, waiting: true });
    expect(maths.subject.results.find((r: { title: string }) => r.title === st.titles.maths)).toMatchObject({ score: 75 });
    expect(JSON.stringify(maths.recommendations)).not.toContain('100');

    // UI, phone width: chips and one card per subject.
    const chips = page.getByTestId('pp-subjects');
    await expect(chips.getByRole('button', { name: 'All subjects' })).toBeVisible({ timeout: 30_000 });
    for (const name of ['English', 'Maths', 'Science']) await expect(chips.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByTestId('pp-subject-card')).toHaveCount(keys.length);
    await expect(page.locator('body')).not.toContainText('Sample data');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, '20-parents-all-subjects');

    // Maths: released score shown, held quiz waiting with no score, suggestions card.
    await chips.getByRole('button', { name: 'Maths', exact: true }).click();
    const heldRow = page.getByTestId('pp-result').filter({ hasText: st.titles.held });
    await expect(heldRow.getByTestId('pp-result-waiting')).toHaveText('Waiting for the teacher');
    await expect(heldRow).not.toContainText('100%');
    await expect(page.getByTestId('pp-result').filter({ hasText: st.titles.maths })).toContainText('75%');
    await expect(page.getByTestId('pp-help')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Sample data');
    await shot(page, '20-parents-maths');

    // Progress tab for Maths: outcomes and results, still no held score.
    await page.getByTestId('pp-nav-progress').click();
    await expect(page.getByTestId('pp-result').filter({ hasText: st.titles.held })).not.toContainText('100%');
    await expect(page.locator('body')).not.toContainText('Sample data');

    // Arabic: right-to-left, the same chips.
    await page.getByTestId('pp-nav-home').click();
    await page.locator('.pp-langbtn').click();
    await expect(page.locator('.pp')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('pp-subjects').getByRole('button', { name: 'كل المواد' })).toBeVisible();
    await expect(page.getByTestId('pp-subjects').getByRole('button', { name: 'الرياضيات' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('بيانات تجريبية');
    await shot(page, '20-parents-arabic');
    await page.locator('.pp-langbtn').click(); // back to English for later runs on this browser
    await context.close();
  });
});

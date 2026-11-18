import { test, expect } from '@playwright/test';
import { answerAndSubmit } from '../lib/attempt';
import { PRACTICE_TITLE, QUIZ_TITLE } from '../lib/content';
import { enaraFrame, frameSession } from '../lib/enara';
import { moodleCli, moodleSession } from '../lib/moodle';
import { activityUrl } from '../lib/picker';
import { readState, recordTiming } from '../lib/state';
import { MOODLE } from '../lib/env';

// By course module: the quiz was picked twice (scenario 3 added a dated copy).
const grade = (cmid: number, user = 'student.test') => moodleCli('grade', { course: 'ENARATEST', cmid, user });

/** Polls Moodle's gradebook until the cell shows `value` (out of 100). */
async function expectMoodleGrade(activity: number, value: number, timer?: string) {
  const t0 = Date.now();
  await expect.poll(() => grade(activity).finalgrade, { timeout: 120_000, intervals: [1000, 2000, 3000] }).toBe(value);
  if (timer) recordTiming(timer, Date.now() - t0);
}

// Scenario 4 (Phase 3): grades go to the Moodle gradebook (AGS): a quiz sends
// the latest attempt (3/4 → 75, then 1/4 → 25); practice sends the best (3/4 →
// 75 stays after 1/4). The quiz here is the first one picked in scenario 2
// (the dated copy from scenario 3 is a separate activity with its own column).
test.describe.serial('4 · grades in the Moodle gradebook: quiz latest, practice best', () => {
  async function attempt(browser: any, cmid: number, correct: number, title: string) {
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(activityUrl(cmid));
    const f = await enaraFrame(page);
    expect((await frameSession(f)).role).toBe('student');
    await expect(f.getByRole('heading', { name: title })).toBeVisible();
    await answerAndSubmit(f, correct);
    await page.screenshot({ path: test.info().outputPath(`attempt-${correct}of4.png`), fullPage: true });
    await context.close();
  }

  test('quiz: 3/4 → Moodle shows 75', async ({ browser }) => {
    const s = readState();
    await attempt(browser, s.activities.quiz, 3, QUIZ_TITLE);
    await expectMoodleGrade(s.activities.quiz, 75, 'grade_submit_to_moodle_first');
  });

  test('quiz: then 1/4 → Moodle shows 25 (latest)', async ({ browser }) => {
    const s = readState();
    await attempt(browser, s.activities.quiz, 1, QUIZ_TITLE);
    await expectMoodleGrade(s.activities.quiz, 25, 'grade_submit_to_moodle_second');
  });

  test('practice: 3/4 → 75, then 1/4 → still 75 (best)', async ({ browser }) => {
    const s = readState();
    await attempt(browser, s.activities.practice, 3, PRACTICE_TITLE);
    await expectMoodleGrade(s.activities.practice, 75);
    await attempt(browser, s.activities.practice, 1, PRACTICE_TITLE);
    // Give the second result time to be sent (it must not lower the cell).
    await new Promise((r) => setTimeout(r, 15_000));
    expect(grade(s.activities.practice).finalgrade).toBe(75);
  });

  test('teacher sees the grades in Moodle\'s grader report', async ({ browser }) => {
    const { page, context } = await moodleSession(browser, 'teacher.test');
    const id = moodleCli('activities', { course: 'ENARATEST' }).course;
    await page.goto(`${MOODLE}/grade/report/grader/index.php?id=${id}`);
    await expect(page.getByText('Student Test').first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('grader-report.png'), fullPage: true });
    await context.close();
  });
});

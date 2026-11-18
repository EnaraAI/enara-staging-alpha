import { test, expect } from '@playwright/test';
import { enaraFrame, frameSession } from '../lib/enara';
import { PRACTICE_TITLE, QUIZ_TITLE } from '../lib/content';
import { moodleProvision, moodleSession } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, saveState } from '../lib/state';

const COURSE_LINK = 'ENARA home (course link)';

// Scenario 2 (Phase 2): the ENARA picker inside Moodle (Deep Linking), several
// items at once: a graded quiz, a practice (graded, best attempt) and the
// course link (no grade column).
test.describe.serial('2 · picker: multi-select, practice graded, course link without grade', () => {
  test('teacher picks quiz + practice + course link in one go', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    const { badges } = await addThroughPicker(page, {
      course: moodleProvision().courses.ENARATEST, courseShort: 'ENARATEST', typeid: s.schoolA.typeid,
      picks: [{ title: QUIZ_TITLE }, { title: PRACTICE_TITLE }, { title: COURSE_LINK }],
      shot: test.info().outputPath('picker.png'),
    });
    expect(badges[QUIZ_TITLE]).toContain('Grade column');
    expect(badges[PRACTICE_TITLE]).toContain('Grade column');
    expect(badges[PRACTICE_TITLE]).not.toContain('No grade column');
    expect(badges[COURSE_LINK]).toContain('No grade column');
    await page.screenshot({ path: test.info().outputPath('course-after-add.png'), fullPage: true });

    const quiz = activityByName('ENARATEST', QUIZ_TITLE);
    const practice = activityByName('ENARATEST', PRACTICE_TITLE);
    const link = activityByName('ENARATEST', COURSE_LINK);
    expect(quiz.instructorcustomparameters).toContain(`enara_assessment=${s.content.quizId}`);
    expect(practice.instructorcustomparameters).toContain(`enara_assessment=${s.content.practiceId}`);
    expect(link.instructorcustomparameters).toContain('enara_target=home');
    expect(quiz.grademax).toBe(100);
    expect(practice.grademax).toBe(100);
    saveState({ activities: { quiz: quiz.cmid, practice: practice.cmid, courseLink: link.cmid } });
    await context.close();
  });

  test('course link: student lands on their ENARA home, teacher on the Teaching Dashboard', async ({ browser }) => {
    const s = readState();
    const student = await moodleSession(browser, 'student.test');
    await student.page.goto(activityUrl(s.activities.courseLink));
    const sf = await enaraFrame(student.page);
    const ss = await frameSession(sf);
    expect(ss.role).toBe('student');
    expect(ss.target?.page ?? 'home').toMatch(/home|dashboard/);
    await student.page.screenshot({ path: test.info().outputPath('course-link-student.png'), fullPage: true });
    await student.context.close();

    const teacher = await moodleSession(browser, 'teacher.test');
    await teacher.page.goto(activityUrl(s.activities.courseLink));
    const tf = await enaraFrame(teacher.page);
    const ts = await frameSession(tf);
    expect(ts.role).toBe('teacher');
    await teacher.page.screenshot({ path: test.info().outputPath('course-link-teacher.png'), fullPage: true });
    await teacher.context.close();
  });

  test('the picked quiz opens on its assignment for the student', async ({ browser }) => {
    const s = readState();
    const student = await moodleSession(browser, 'student.test');
    await student.page.goto(activityUrl(s.activities.quiz));
    const sf = await enaraFrame(student.page);
    const ss = await frameSession(sf);
    expect(ss.role).toBe('student');
    // Lands on the bound assignment (Assignments, opened), ready to start.
    await expect(sf.getByRole('heading', { name: QUIZ_TITLE })).toBeVisible();
    await expect(sf.getByRole('button', { name: 'Start' })).toBeVisible();
    await student.page.screenshot({ path: test.info().outputPath('quiz-student.png'), fullPage: true });
    await student.context.close();
  });
});

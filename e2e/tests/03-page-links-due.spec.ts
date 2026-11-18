import { test, expect } from '@playwright/test';
import { enaraFrame, frameSession } from '../lib/enara';
import { QUIZ_TITLE } from '../lib/content';
import { moodleProvision, moodleSession } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

const GRADING = 'Grading';

/** A due date 9 days ahead at 23:59, as the picker's datetime-local field takes it, and the line Moodle gets. */
function dueIn9Days(): { local: string; line: RegExp } {
  const d = new Date(Date.now() + 9 * 86_400_000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const [y, m, day] = ymd.split('-');
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+y, +m - 1, 15)));
  return { local: `${ymd}T23:59`, line: new RegExp(`Due: ${Number(day)} ${month} ${y}, 11:59\\s?PM \\(Cairo time\\)`) };
}

// Scenario 3 (Phase 2b): a teacher-only page link (a student who opens it
// lands on their own home) and a due date picked in ENARA, written into the
// Moodle activity's description.
test.describe.serial('3 · page links (teacher-only) + due date in the description', () => {
  test('teacher picks the "Grading" page and the quiz again with a due date', async ({ browser }) => {
    const s = readState();
    const due = dueIn9Days();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    const { badges } = await addThroughPicker(page, {
      course: moodleProvision().courses.ENARATEST, courseShort: 'ENARATEST', typeid: s.schoolA.typeid,
      picks: [{ title: GRADING }, { title: QUIZ_TITLE, due: due.local }],
      shotName: '03-pages-picker-pages-due',
    });
    expect(badges[GRADING]).toContain('Teachers only');
    expect(badges[GRADING]).toContain('No grade column');
    expect(badges[QUIZ_TITLE]).toContain('Already added in this course');
    const grading = activityByName('ENARATEST', GRADING);
    const dated = activityByName('ENARATEST', QUIZ_TITLE); // the newest one
    expect(dated.cmid).not.toBe(s.activities.quiz);
    expect(grading.instructorcustomparameters).toContain('enara_target=grading');
    expect(dated.instructorcustomparameters).toMatch(/enara_due=\d{4}-\d\d-\d\dT/);
    expect(dated.intro).toMatch(due.line);
    saveState({ activities: { ...s.activities, grading: grading.cmid, datedQuiz: dated.cmid } });
    await context.close();
  });

  test('student opens the teacher-only link → lands on their own home', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(activityUrl(s.activities.grading));
    const f = await enaraFrame(page);
    const ss = await frameSession(f);
    expect(ss.role).toBe('student');
    expect(ss.target?.page ?? 'dashboard').toBe('dashboard');
    await expect(f.getByRole('heading', { name: GRADING })).toHaveCount(0);
    await shot(page, '03-pages-student-teacher-only-link');
    await context.close();
  });

  test('teacher opens the same link → the Grading page', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    await page.goto(activityUrl(s.activities.grading));
    const f = await enaraFrame(page);
    const ts = await frameSession(f);
    expect(ts.role).toBe('teacher');
    await expect(f.getByText(GRADING).first()).toBeVisible();
    await shot(page, '03-pages-teacher-grading-link');
    await context.close();
  });

  test('student opens the dated quiz: the ENARA assignment has the picked due date', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(activityUrl(s.activities.datedQuiz));
    const f = await enaraFrame(page);
    await expect(f.getByRole('heading', { name: QUIZ_TITLE })).toBeVisible();
    const d = new Date(Date.now() + 9 * 86_400_000);
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'Africa/Cairo' }).format(d);
    await expect(f.getByText(new RegExp(`Due ${month} \\d+, \\d{4}`))).toBeVisible();
    await shot(page, '03-pages-student-dated-quiz');
    await context.close();
  });
});

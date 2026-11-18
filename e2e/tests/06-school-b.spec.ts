import { test, expect } from '@playwright/test';
import { QUIZ_TITLE } from '../lib/content';
import { enaraApi, enaraFrame, frameSession, frameToken, login } from '../lib/enara';
import { MOODLE } from '../lib/env';
import { moodleCli, moodleProvision, moodleSession, moodleTools } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, recordTiming, saveState } from '../lib/state';

const COURSE_LINK = 'ENARA home (course link)';

async function launch(browser: any, user: 'teacher.test' | 'student.test', cmid: number) {
  const { page, context } = await moodleSession(browser, user);
  await page.goto(activityUrl(cmid));
  const f = await enaraFrame(page);
  const sess = await frameSession(f);
  const token = await frameToken(f);
  return { page, context, f, sess, token };
}

// Scenario 6 (Phase 1b): a second school on the same Moodle. School B's admin
// registers ENARA again ("Register as a new external tool"), its tool is limited
// to the School B category, and the same Moodle people get separate School B
// accounts that see nothing of School A. School A keeps working.
test.describe.serial('6 · School B on the same Moodle + isolation', () => {
  test('School B: registration link → Moodle "Register as a new external tool" → second tool', async ({ browser }) => {
    const admin = await login('enara.admin');
    const link = await enaraApi.post('/api/lms/registration-links', admin, { institutionId: 'LT-SCHOOL-B' });
    const t0 = Date.now();
    const { page, context } = await moodleSession(browser, 'admin');
    await page.goto(`${MOODLE}/mod/lti/toolconfigure.php`);
    await page.locator('#tool-url').fill(link.url);
    await page.locator('#tool-create-button').click();
    const reg = page.frameLocator('iframe[src*="startltiadvregistration"]');
    // Moodle may say "There are existing tools for this domain" (when it matches
    // the URL to the School A tool): then a new tool, never an update.
    const asNew = reg.getByRole('button', { name: 'Register as a new external tool' });
    const done = reg.getByText('ENARA is registered.');
    await expect(asNew.or(done)).toBeVisible({ timeout: 60_000 });
    if (await asNew.isVisible()) await asNew.click();
    await expect(done).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: test.info().outputPath('school-b-registered.png'), fullPage: true });
    await reg.locator('#close').click();
    await expect(page.locator('iframe[src*="startltiadvregistration"]')).toHaveCount(0, { timeout: 30_000 });
    const tools = moodleTools();
    const b = tools.find((t) => t.name !== 'ENARA' && /^ENARA \(/.test(t.name));
    expect(b, `a second ENARA tool named for School B (${tools.map((t) => t.name).join(', ')})`).toBeTruthy();
    expect(b!.name).toContain('Test School B');
    expect(b!.clientid).not.toBe(readState().schoolA.clientId);
    await context.close();
    const platforms = await enaraApi.get('/api/lms/platforms?institutionId=LT-SCHOOL-B', admin);
    const p = ((platforms.platforms ?? platforms) as any[]).find((x) => x.clientId === b!.clientid);
    expect(p?.status).toBe('active');
    moodleCli('tool-settings', { name: b!.name, category: 'School B' });
    const after = moodleTools().find((t) => t.id === b!.id)!;
    expect(after.state).toBe(1);
    expect(after.categories).toEqual([moodleProvision().categories['School B']]);
    saveState({ schoolB: { typeid: b!.id, clientId: b!.clientid, platformId: p.id, name: b!.name }, schoolBRegisteredAt: t0 });
    recordTiming('registration_school_b_ui', Date.now() - t0);
  });

  test('teacher.test adds the School B course link in "Enara School B Course"', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    await addThroughPicker(page, {
      course: moodleProvision().courses.ENARAB, courseShort: 'ENARAB', typeid: s.schoolB.typeid,
      picks: [{ title: COURSE_LINK }], shot: test.info().outputPath('school-b-picker.png'),
    });
    const link = activityByName('ENARAB', COURSE_LINK);
    saveState({ activities: { ...s.activities, schoolBCourseLink: link.cmid } });
    await context.close();
  });

  test('same Moodle teacher and student → separate School B accounts that see nothing of School A', async ({ browser }) => {
    const s = readState();
    const tA = await launch(browser, 'teacher.test', s.activities.courseLink);
    expect(tA.sess.institutionId).toBe('LT-SCHOOL-A');
    await tA.context.close();
    const tB = await launch(browser, 'teacher.test', s.activities.schoolBCourseLink);
    recordTiming('school_b_registration_to_first_launch', Date.now() - s.schoolBRegisteredAt);
    expect(tB.sess.role).toBe('teacher');
    expect(tB.sess.institutionId).toBe('LT-SCHOOL-B');
    expect(tB.sess.id).not.toBe(tA.sess.id);
    // School B's teacher account sees none of School A's work.
    const list = await enaraApi.get('/api/assessments?limit=200', tB.token);
    const titles = (Array.isArray(list) ? list : list.assessments ?? list.data ?? []).map((a: any) => a.title);
    expect(titles).not.toContain(QUIZ_TITLE);
    await tB.page.screenshot({ path: test.info().outputPath('school-b-teacher.png'), fullPage: true });
    await tB.context.close();

    const sA = await launch(browser, 'student.test', s.activities.courseLink);
    await sA.context.close();
    const sB = await launch(browser, 'student.test', s.activities.schoolBCourseLink);
    expect(sB.sess.role).toBe('student');
    expect(sB.sess.institutionId).toBe('LT-SCHOOL-B');
    expect(sB.sess.id).not.toBe(sA.sess.id);
    const mine = await enaraApi.get('/api/me/assignments', sB.token).catch(() => ({}));
    expect(JSON.stringify(mine)).not.toContain(QUIZ_TITLE);
    await sB.page.screenshot({ path: test.info().outputPath('school-b-student.png'), fullPage: true });
    await sB.context.close();
  });

  test('School A still works after School B joined (teacher and student)', async ({ browser }) => {
    const s = readState();
    const t = await launch(browser, 'teacher.test', s.activities.quiz);
    expect(t.sess.institutionId).toBe('LT-SCHOOL-A');
    await expect(t.f.getByText(QUIZ_TITLE).first()).toBeVisible();
    await t.context.close();
    const st = await launch(browser, 'student.test', s.activities.quiz);
    expect(st.sess.institutionId).toBe('LT-SCHOOL-A');
    await expect(st.f.getByRole('heading', { name: QUIZ_TITLE })).toBeVisible();
    await st.context.close();
  });
});

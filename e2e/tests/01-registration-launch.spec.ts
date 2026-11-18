import { test, expect } from '@playwright/test';
import { enaraApi, enaraFrame, frameSession, login, maintenance } from '../lib/enara';
import { ENARA, MOODLE, secrets } from '../lib/env';
import { moodleCli, moodleProvision, moodleSession, moodleTools, sesskey } from '../lib/moodle';
import { readState, recordTiming, saveState } from '../lib/state';
import { createContent } from '../lib/content';

// Scenario 1: boot, Phase 1b registration of School A through Moodle's own
// "Add LTI Advantage" (the path a school admin takes), the 4 settings Moodle
// cannot take from the registration, teacher and student launches (Phase 1a)
// and the teacher's student preview ("Switch role to... Student").
test.describe.serial('1 · registration (School A) + launches + student preview', () => {
  test('ENARA: migrate, fake seed, test content', async () => {
    const st = await maintenance('GET', '/status');
    expect(st.database).toBe('enara_staging_alpha');
    const m = await maintenance('POST', '/migrate');
    expect(m.pending).toEqual([]);
    const seed = await maintenance('POST', '/seed-lms-test', { password: secrets.enaraPassword });
    expect(seed.seeded.schools).toBe(2);
    const content = await createContent();
    saveState({ content });
  });

  test('School A: registration link (ENARA admin) → Moodle "Add LTI Advantage" → registered', async ({ browser }) => {
    const admin = await login('enara.admin');
    const link = await enaraApi.post('/api/lms/registration-links', admin, { institutionId: 'LT-SCHOOL-A' });
    expect(link.connectionWillBe).toBe('active');
    expect(link.url).toMatch(new RegExp(`^${ENARA}/lti/register/`));

    const t0 = Date.now();
    const { page, context } = await moodleSession(browser, 'admin');
    await page.goto(`${MOODLE}/mod/lti/toolconfigure.php`);
    await page.locator('#tool-url').fill(link.url);
    await page.locator('#tool-create-button').click();
    const reg = page.frameLocator('iframe[src*="startltiadvregistration"]');
    await expect(reg.getByText('ENARA is registered.')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: test.info().outputPath('registered.png'), fullPage: true });
    await reg.locator('#close').click();
    // Moodle closes its dialog on the close message and lists the new tool (Pending).
    await expect(page.locator('iframe[src*="startltiadvregistration"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('ENARA', { exact: true }).first()).toBeVisible();
    const tool = moodleTools().find((t) => t.name === 'ENARA');
    expect(tool, 'Moodle has a tool named ENARA').toBeTruthy();
    expect(tool!.state).toBe(2); // Pending until the admin activates it
    // Taken from the registration (PHASE_1B_NOTES "which Moodle settings the registration can set").
    expect(tool!.contentitem).toBe('1');
    expect(tool!.ltiservice_gradesynchronization).toBe('2');
    expect(tool!.ltiservice_memberships).toBe('1');
    await context.close();

    // ENARA side: an active connection for School A, made with a link.
    const platforms = await enaraApi.get('/api/lms/platforms?institutionId=LT-SCHOOL-A', admin);
    const list = (platforms.platforms ?? platforms) as any[];
    const p = list.find((x) => x.clientId === tool!.clientid);
    expect(p, 'ENARA connection for the Moodle client id').toBeTruthy();
    expect(p.status).toBe('active');
    saveState({ schoolA: { typeid: tool!.id, clientId: tool!.clientid, platformId: p.id }, registrationStartedAt: t0 });
    recordTiming('registration_school_a_ui', Date.now() - t0);
  });

  test('School A: the 4 manual Moodle settings, by script (Activate, chooser, Accept grades = Always, category)', async () => {
    const r = moodleCli('tool-settings', { name: 'ENARA', category: 'School A' });
    const tool = moodleTools().find((t) => t.id === r.typeid)!;
    expect(tool.state).toBe(1);
    expect(tool.coursevisible).toBe(2);
    expect(tool.acceptgrades).toBe('1');
    expect(tool.categories).toEqual([moodleProvision().categories['School A']]);
  });

  test('teacher adds a plain ENARA activity and launches it (Teaching Dashboard, no ENARA sign-in)', async ({ browser }) => {
    const s = readState();
    const course = moodleProvision().courses.ENARATEST;
    const { page, context } = await moodleSession(browser, 'teacher.test');
    // The activity chooser lists ENARA (Tool configuration usage = activity chooser).
    await page.goto(`${MOODLE}/course/modedit.php?add=lti&typeid=${s.schoolA.typeid}&course=${course}&section=0&return=0`);
    await page.locator('#id_name').fill('ENARA launch test');
    await page.locator('#id_submitbutton').click();
    await expect(page).toHaveURL(/mod\/lti\/view\.php/);
    const frame = await enaraFrame(page);
    const sess = await frameSession(frame);
    expect(sess.role).toBe('teacher');
    expect(sess.preview).toBe(false);
    await expect(frame.getByText('Opened from your LMS')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('teacher-launch.png'), fullPage: true });
    recordTiming('registration_to_first_launch', Date.now() - s.registrationStartedAt);
    saveState({ launchTestUrl: page.url() });
    await context.close();
  });

  test('student launches the same activity (student portal)', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(s.launchTestUrl);
    const frame = await enaraFrame(page);
    const sess = await frameSession(frame);
    expect(sess.role).toBe('student');
    expect(sess.preview).toBe(false);
    await page.screenshot({ path: test.info().outputPath('student-launch.png'), fullPage: true });
    await context.close();
  });

  test('teacher "Switch role to… Student" → read-only student preview', async ({ browser }) => {
    const s = readState();
    const course = moodleProvision().courses.ENARATEST;
    const { page, context } = await moodleSession(browser, 'teacher.test');
    await page.goto(`${MOODLE}/course/view.php?id=${course}`);
    const key = await sesskey(page);
    const ret = new URL(s.launchTestUrl).pathname + new URL(s.launchTestUrl).search;
    await page.goto(`${MOODLE}/course/switchrole.php?id=${course}&sesskey=${key}&switchrole=5&returnurl=${encodeURIComponent(ret)}`);
    await page.goto(s.launchTestUrl);
    const frame = await enaraFrame(page);
    const sess = await frameSession(frame);
    expect(sess.preview).toBe(true);
    await expect(frame.getByTestId('lms-preview-banner')).toHaveText('Preview as student — nothing is saved');
    await page.screenshot({ path: test.info().outputPath('student-preview.png'), fullPage: true });
    // Back to the normal role.
    await page.goto(`${MOODLE}/course/switchrole.php?id=${course}&sesskey=${await sesskey(page)}&switchrole=0&returnurl=${encodeURIComponent('/course/view.php?id=' + course)}`);
    await context.close();
  });
});

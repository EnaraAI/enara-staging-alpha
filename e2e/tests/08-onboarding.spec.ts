import { test, expect, type Page } from '@playwright/test';
import { enaraApi, enaraFrame, enaraUiSession, frameSession, login, maintenance } from '../lib/enara';
import { MOODLE } from '../lib/env';
import { moodleCli, moodleProvision, moodleSession, moodleTools } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, recordTiming, saveState, shot } from '../lib/state';

const SCHOOL = 'Test School C (fake)';
const COURSE_LINK = 'ENARA home (course link)';
const GOAL_MS = 15 * 60_000;
const MANUAL = ['acceptGradesAlways', 'activityChooser', 'restrictToCategory', 'activated'] as const;

const status = async (id: string) => enaraApi.get(`/api/lms/onboarding/${id}/status`, await login('enara.admin'));
const itemDone = (st: any, key: string) => st.checklist.find((c: any) => c.key === key)?.done === true;

/** ENARA admin: the "New school (LMS)" page, with the status page of one school open. */
async function openStatus(page: Page, institutionId: string) {
  await page.getByText('New school (LMS)', { exact: true }).first().click();
  const row = page.getByTestId('lms-onboarding-row').and(page.locator(`[data-institution-id="${institutionId}"]`));
  await row.getByTestId('lms-onboarding-open-status').click();
  const st = page.getByTestId('lms-status-page');
  await expect(st).toBeVisible();
  return st;
}

// Scenario 8 (LMS step 2): self-serve onboarding of Test School C, timed.
// ENARA admin "New school" → invite text (EN/AR; emails are only captured in
// this stack, never sent; the text is copied) → the Moodle admin pastes the one link in "Add
// LTI Advantage" → automatic connection check → status page (checklist, the
// 4 hand-ticked Moodle settings) → first teacher and student launch. The
// status page's timer must stay under the 15-minute goal.
test.describe.serial('8 · step 2 onboarding (timed)', () => {
  test('ENARA admin: "New school" → invite with the one Moodle link (EN/AR), no email sent', async ({ browser }) => {
    const { page, context } = await enaraUiSession(browser, 'enara.admin');
    await page.getByText('New school (LMS)', { exact: true }).first().click();
    await expect(page.getByTestId('lms-onboarding-page')).toBeVisible();
    const email = `school.c.admin.${Date.now()}@lms-test.example`; // reserved domain: never emailed
    await page.getByTestId('lms-new-school-name').fill(SCHOOL);
    await page.getByTestId('lms-new-school-country').selectOption('EG');
    await page.getByTestId('lms-new-school-timezone').selectOption('Africa/Cairo');
    await page.getByTestId('lms-new-school-admin-name').fill('Cara Test');
    await page.getByTestId('lms-new-school-admin-email').fill(email);
    await page.getByTestId('lms-new-school-features').selectOption('all');
    const t0 = Date.now();
    await page.getByTestId('lms-new-school-submit').click();
    const result = page.getByTestId('lms-new-school-result');
    await expect(result).toBeVisible({ timeout: 30_000 });
    const institutionId = (await result.getAttribute('data-institution-id'))!;
    const url = (await page.getByTestId('lms-invite-link').innerText()).trim();
    expect(url).toMatch(/^https:\/\/enara\.tool\.test\/lti\/register\//);
    // The invite text, in English and in Arabic, carries the one link.
    await expect(page.getByTestId('lms-invite-text-en')).toContainText(url);
    await expect(page.getByTestId('lms-invite-text-ar')).toContainText(url);
    expect(await page.getByTestId('lms-invite-text-ar').innerText()).toMatch(/[؀-ۿ]/);
    // Owner rule: no real email from this stack. LMS emails are CAPTURED (no
    // Resend key, LMS_EMAIL_CAPTURE): "Send email" renders lms-invite-connect in
    // the school's language (EG: Arabic) for the test inbox and records it; nothing is sent.
    await expect(page.getByTestId('lms-invite-send-email')).toBeEnabled();
    await enaraApi.post(`/api/lms/onboarding/${institutionId}/send-email`, await login('enara.admin'), {});
    const invites = ((await maintenance('GET', '/lms-emails?template=lms-invite-connect')).emails as any[]).filter((e) => e.institutionId === institutionId);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ status: 'captured', lang: 'ar', redirected: true });
    expect(invites[0].subject).toMatch(/^\[lms-test\] /);
    // The admin copies the invite text (this starts the 15-minute timer).
    await page.getByTestId('lms-invite-copy-en').click();
    await expect.poll(async () => itemDone(await status(institutionId), 'invite_sent'), { timeout: 30_000 }).toBe(true);
    await shot(page, '08-onboarding-new-school-invite');
    saveState({ schoolC: { institutionId, url, createdAt: t0 } });
    await context.close();
  });

  test('Moodle admin: the one link in "Add LTI Advantage" → registered, connection checked automatically', async ({ browser }) => {
    const s = readState();
    const before = new Set(moodleTools().map((t) => t.id));
    const { page, context } = await moodleSession(browser, 'admin');
    const t0 = Date.now();
    await page.goto(`${MOODLE}/mod/lti/toolconfigure.php`);
    await page.locator('#tool-url').fill(s.schoolC.url);
    await page.locator('#tool-create-button').click();
    const reg = page.frameLocator('iframe[src*="startltiadvregistration"]');
    const asNew = reg.getByRole('button', { name: 'Register as a new external tool' });
    const done = reg.getByText('ENARA is registered.');
    await expect(asNew.or(done)).toBeVisible({ timeout: 60_000 });
    if (await asNew.isVisible()) await asNew.click();
    await expect(done).toBeVisible({ timeout: 60_000 });
    await shot(page, '08-onboarding-moodle-registered');
    await reg.locator('#close').click();
    await expect(page.locator('iframe[src*="startltiadvregistration"]')).toHaveCount(0, { timeout: 30_000 });
    await context.close();
    const tool = moodleTools().find((t) => !before.has(t.id));
    expect(tool, 'a new ENARA tool in Moodle').toBeTruthy();
    expect(tool!.name).toContain('Test School C');
    // The 4 settings Moodle cannot take from a registration (done by hand in a real school).
    moodleCli('tool-settings', { typeid: tool!.id, category: 'School C' });
    expect(moodleTools().find((t) => t.id === tool!.id)!.categories).toEqual([moodleProvision().categories['School C']]);
    // ENARA: registered (active), and the automatic check after registration reached Moodle.
    await expect.poll(async () => itemDone(await status(s.schoolC.institutionId), 'registered'), { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => {
      const st = await status(s.schoolC.institutionId);
      const steps = st.platforms?.[0]?.check?.steps ?? [];
      return ['registered', 'reachable'].map((k) => steps.find((x: any) => x.key === k)?.status).join(',');
    }, { timeout: 60_000 }).toBe('ok,ok');
    recordTiming('onboarding_create_to_registered', Date.now() - s.schoolC.createdAt);
    saveState({ schoolC: { ...s.schoolC, typeid: tool!.id, registrationStartedAt: t0 } });
  });

  test('status page: connection check, the 4 hand-ticked Moodle settings', async ({ browser }) => {
    const s = readState();
    const { page, context } = await enaraUiSession(browser, 'enara.admin');
    const st = await openStatus(page, s.schoolC.institutionId);
    await expect(st.getByTestId('lms-status-school')).toContainText(SCHOOL);
    await expect(st.getByTestId('lms-check-step-registered')).toHaveAttribute('data-status', 'ok');
    await expect(st.getByTestId('lms-check-step-reachable')).toHaveAttribute('data-status', 'ok');
    for (const key of MANUAL) {
      const item = st.getByTestId(`lms-manual-${key}`);
      // The box shows the saved state: it turns on once the server has recorded the tick.
      const box = item.getByTestId(`lms-manual-${key}-checkbox`);
      await expect(box).toBeEnabled();
      if ((await item.getAttribute('data-checked')) !== 'true') await box.click();
      await expect(item).toHaveAttribute('data-checked', 'true', { timeout: 15_000 });
    }
    await expect(st.getByTestId('lms-status-item-registered')).toHaveAttribute('data-done', 'true');
    await expect(st.getByTestId('lms-status-item-invite_sent')).toHaveAttribute('data-done', 'true');
    await shot(page, '08-onboarding-status-registered');
    await context.close();
  });

  test('first teacher and student launch → goal reached on the status page, under 15 minutes', async ({ browser }) => {
    const s = readState();
    const teacher = await moodleSession(browser, 'teacher.test');
    await addThroughPicker(teacher.page, {
      course: moodleProvision().courses.ENARAC, courseShort: 'ENARAC', typeid: s.schoolC.typeid,
      picks: [{ title: COURSE_LINK }], shotName: '08-onboarding-picker',
    });
    const cmid = activityByName('ENARAC', COURSE_LINK).cmid;
    await teacher.page.goto(activityUrl(cmid));
    const tf = await enaraFrame(teacher.page);
    const ts = await frameSession(tf);
    expect(ts.role).toBe('teacher');
    expect(ts.institutionId).toBe(s.schoolC.institutionId);
    await shot(teacher.page, '08-onboarding-first-teacher-launch');
    await teacher.context.close();

    const student = await moodleSession(browser, 'student.test');
    await student.page.goto(activityUrl(cmid));
    const sf = await enaraFrame(student.page);
    const ss = await frameSession(sf);
    expect(ss.role).toBe('student');
    expect(ss.institutionId).toBe(s.schoolC.institutionId);
    await shot(student.page, '08-onboarding-first-student-launch');
    await student.context.close();
    recordTiming('onboarding_registration_to_first_launch', Date.now() - s.schoolC.registrationStartedAt);

    let st: any;
    await expect.poll(async () => {
      st = await status(s.schoolC.institutionId);
      return ['registered', 'activated', 'first_teacher_launch', 'first_student_launch'].every((k) => itemDone(st, k));
    }, { timeout: 30_000 }).toBe(true);
    expect(st.timer.goalReachedAt).toBeTruthy();
    recordTiming('onboarding_total_invite_to_goal', st.timer.elapsedMs);
    console.log(`ONBOARDING: invite to goal ${(st.timer.elapsedMs / 1000).toFixed(1)} s (goal ${GOAL_MS / 60_000} min), goalMet=${st.timer.goalMet}`);
    expect(st.timer.elapsedMs).toBeLessThanOrEqual(GOAL_MS);
    expect(st.timer.goalMet).toBe(true);

    const { page, context } = await enaraUiSession(browser, 'enara.admin');
    const sp = await openStatus(page, s.schoolC.institutionId);
    for (const key of ['registered', 'activated', 'first_teacher_launch', 'first_student_launch']) {
      await expect(sp.getByTestId(`lms-status-item-${key}`)).toHaveAttribute('data-done', 'true');
    }
    await expect(sp.getByTestId('lms-status-elapsed')).not.toHaveText('—');
    // "Check again" after the first launches: activated and roster now pass too.
    await sp.getByTestId('lms-status-check-again').click();
    for (const key of ['registered', 'reachable', 'services', 'activated', 'roster']) {
      await expect(sp.getByTestId(`lms-check-step-${key}`)).toHaveAttribute('data-status', 'ok', { timeout: 30_000 });
    }
    for (const key of MANUAL) await expect(sp.getByTestId(`lms-manual-${key}`)).toHaveAttribute('data-checked', 'true');
    await shot(page, '08-onboarding-status-goal-reached');
    await context.close();
  });
});

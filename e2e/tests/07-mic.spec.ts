import { test, expect, chromium } from '@playwright/test';
import { SPEAKING_TITLE } from '../lib/content';
import { enaraFrame, frameSession } from '../lib/enara';
import { moodleProvision, moodleSession } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, saveState } from '../lib/state';

/** Student: open the speaking exam activity, start it, and reach the microphone check. */
async function openSpeakingExam(page: import('@playwright/test').Page, cmid: number) {
  await page.goto(activityUrl(cmid));
  const f = await enaraFrame(page);
  expect((await frameSession(f)).role).toBe('student');
  await expect(f.getByRole('heading', { name: SPEAKING_TITLE })).toBeVisible();
  const start = f.getByRole('button', { name: /^(Start speaking exam|Continue|Start another attempt)$/ });
  await start.click();
  await expect(f.getByRole('button', { name: 'Test microphone' })).toBeVisible({ timeout: 60_000 });
  return f;
}

// Scenario 7 (mic / new tab): the speaking exam's microphone check inside
// Moodle's frame. Chrome with fake media devices (allowed by Moodle's frame
// for the tool host: works in the frame); Chrome with the permission denied
// ("blocked in the frame" → "Open in a new tab", which opens a signed-in ENARA
// tab). Safari (WebKit): the "open the exam in a new tab" hint, in webkit.spec.ts.
test.describe.serial('7 · microphone checks (Chrome)', () => {
  test('teacher adds the speaking exam through the picker (mic badge)', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    const { badges } = await addThroughPicker(page, {
      course: moodleProvision().courses.ENARATEST, courseShort: 'ENARATEST', typeid: s.schoolA.typeid,
      picks: [{ title: SPEAKING_TITLE, type: 'Assignments' }], shot: test.info().outputPath('picker-speaking.png'),
    });
    expect(badges[SPEAKING_TITLE]).toContain('Microphone');
    saveState({ activities: { ...s.activities, speaking: activityByName('ENARATEST', SPEAKING_TITLE).cmid } });
    await context.close();
  });

  test('mic OK in the Moodle frame (fake device, permission granted)', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test', { permissions: ['microphone'] });
    const f = await openSpeakingExam(page, s.activities.speaking);
    await f.getByRole('button', { name: 'Test microphone' }).click();
    await expect(f.getByText('Microphone works').or(f.getByText('Not working'))).toBeVisible({ timeout: 30_000 });
    await expect(f.locator('[data-testid^="mic-problem-"]')).toHaveCount(0);
    await expect(f.getByText('Microphone works')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('mic-ok.png'), fullPage: true });
    await context.close();
  });

  test('mic blocked (permission denied) → "Open in a new tab" → a signed-in ENARA tab', async () => {
    const s = readState();
    // Full Chromium (new headless) without the auto-accept flag, denying every
    // permission prompt (what a student's "Block" does). The headless shell
    // answers NotSupportedError instead, so it cannot play this case.
    const browser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] });
    try {
      const { page, context } = await moodleSession(browser, 'student.test');
      const f = await openSpeakingExam(page, s.activities.speaking);
      await f.getByRole('button', { name: 'Test microphone' }).click();
      const notice = f.getByTestId('mic-problem-blocked_in_frame');
      await expect(notice).toBeVisible({ timeout: 30_000 }).catch(async (e) => {
        await page.screenshot({ path: test.info().outputPath('mic-blocked-failed.png'), fullPage: true });
        throw e;
      });
      await page.screenshot({ path: test.info().outputPath('mic-blocked.png'), fullPage: true });
      const [tab] = await Promise.all([context.waitForEvent('page'), notice.getByRole('button', { name: 'Open in a new tab' }).click()]);
      await tab.waitForURL(/\/(assignments|lms|$)/, { timeout: 60_000 });
      await expect.poll(() => tab.evaluate(() => !!sessionStorage.getItem('enara_token')), { timeout: 60_000 }).toBe(true);
      expect(await tab.evaluate(() => window.self === window.top)).toBe(true);
      await expect(tab.getByText(SPEAKING_TITLE).first()).toBeVisible({ timeout: 60_000 });
      await tab.screenshot({ path: test.info().outputPath('mic-new-tab.png'), fullPage: true });
      await context.close();
    } finally {
      await browser.close();
    }
  });
});

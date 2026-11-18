import { test, expect } from '@playwright/test';
import { enaraFrame, frameSession } from '../lib/enara';
import { moodleSession } from '../lib/moodle';
import { activityUrl } from '../lib/picker';
import { readState, shot } from '../lib/state';

// Scenario 7, Safari (WebKit): Safari has no frame-policy API, so before the
// speaking exam ENARA shows "open the exam in a new tab" inside the frame. The
// launch itself runs without third-party cookies (WebKit blocks them).
test.describe.serial('7 · microphone checks (Safari / WebKit)', () => {
  test('student in Safari: launch works in the frame and the "open in a new tab" hint is shown', async ({ browser }) => {
    const s = readState();
    test.skip(!s.activities?.speaking, 'needs the speaking exam activity from 07-mic.spec.ts');
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.goto(activityUrl(s.activities.speaking));
    const f = await enaraFrame(page);
    expect((await frameSession(f)).role).toBe('student');
    const start = f.getByRole('button', { name: /^(Start speaking exam|Continue|Start another attempt)$/ });
    const hint = f.getByTestId('safari-frame-hint');
    await expect(start.or(hint).first()).toBeVisible({ timeout: 60_000 });
    if (await start.first().isVisible()) await start.first().click();
    await expect(f.getByTestId('safari-frame-hint')).toBeVisible({ timeout: 60_000 });
    await expect(f.getByTestId('safari-frame-hint').getByRole('button', { name: 'open the exam in a new tab' })).toBeVisible();
    await shot(page, '07-mic-safari-safari-hint');
    await context.close();
  });
});

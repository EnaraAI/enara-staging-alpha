import { test, expect, chromium } from '@playwright/test';
import { SPEAKING_TITLE } from '../lib/content';
import { enaraFrame, frameSession } from '../lib/enara';
import { moodleProvision, moodleSession } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

/** Student: open the speaking exam activity, start it, and reach the microphone check. */
async function openSpeakingExam(page: import('@playwright/test').Page, cmid: number, label: string) {
  await page.goto(activityUrl(cmid));
  const f = await enaraFrame(page);
  expect((await frameSession(f)).role).toBe('student');
  // The assignment opens with its "Start speaking exam" button (or, once started, the mic check).
  const start = f.getByRole('button', { name: /^(Start speaking exam|Continue|Start another attempt)$/ });
  const micTest = f.getByRole('button', { name: 'Test microphone' });
  try {
    const skip = f.getByRole('button', { name: 'Skip tour' });
    await skip.waitFor({ state: 'visible', timeout: 4_000 }).then(() => skip.click(), () => undefined);
    await expect(start.or(micTest).first()).toBeVisible({ timeout: 60_000 });
    if (await start.first().isVisible()) await start.first().click();
    await expect(micTest).toBeVisible({ timeout: 60_000 });
  } catch (e) {
    await shot(page, `07-mic-FAILED-${label}`);
    console.log(`SPEAKING FRAME (${f.url()}):`, (await f.locator('body').innerText().catch(() => '')).slice(0, 800));
    throw e;
  }
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
      picks: [{ title: SPEAKING_TITLE, type: 'Assignments' }], shotName: '07-mic-picker-speaking',
    });
    expect(badges[SPEAKING_TITLE]).toContain('Microphone');
    saveState({ activities: { ...s.activities, speaking: activityByName('ENARATEST', SPEAKING_TITLE).cmid } });
    await context.close();
  });

  test('mic OK in the Moodle frame (fake device, permission granted)', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test', { permissions: ['microphone'] });
    const f = await openSpeakingExam(page, s.activities.speaking, 'ok');
    await f.getByRole('button', { name: 'Test microphone' }).click();
    await expect(f.getByText('Microphone works').or(f.getByText('Not working'))).toBeVisible({ timeout: 30_000 });
    await expect(f.locator('[data-testid^="mic-problem-"]')).toHaveCount(0);
    await expect(f.getByText('Microphone works')).toBeVisible();
    await shot(page, '07-mic-ok');
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
      const f = await openSpeakingExam(page, s.activities.speaking, 'blocked');
      await f.getByRole('button', { name: 'Test microphone' }).click();
      // The on-load check may already show the notice: wait until the probe
      // the click started has settled too ("Not working"), so the notice is final.
      await expect(f.getByText('Not working')).toBeVisible({ timeout: 30_000 });
      const notice = f.getByTestId('mic-problem-blocked_in_frame');
      await expect(notice).toBeVisible({ timeout: 30_000 }).catch(async (e) => {
        await shot(page, '07-mic-blocked-failed');
        throw e;
      });
      const open = notice.getByRole('button', { name: 'Open in a new tab' });
      // Keep the button away from the frame's edges: Playwright cannot see an
      // element of the (Moodle) parent page lying over a cross-origin frame.
      await open.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(open).toBeEnabled();
      // Moodle moves the activity frame after load (its resize script, the
      // course-index drawer's transition). A mouse click is sent at page
      // coordinates, so wait until the frame has stopped moving.
      const frameRect = () => page.evaluate(() => {
        const r = document.getElementById('contentframe')!.getBoundingClientRect();
        return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}@${Math.round(window.scrollY)}`;
      });
      const rects: string[] = [];
      await expect.poll(async () => {
        rects.push(await frameRect());
        const last = rects.slice(-5);
        return last.length === 5 && last.every((r) => r === last[0]);
      }, { timeout: 15_000, intervals: [150] }).toBe(true);
      await shot(page, '07-mic-blocked');
      // Evidence if the click is lost: what the frame document receives.
      await f.evaluate(() => {
        const w = window as any;
        w.__e2eEvents = [];
        for (const t of ['pointerdown', 'mousedown', 'click']) document.addEventListener(t, (e) => w.__e2eEvents.push(`${t}:${(e.target as HTMLElement)?.textContent?.trim().slice(0, 30)}`), true);
      });
      const tabPromise = context.waitForEvent('page', { timeout: 30_000 });
      const box = await open.boundingBox();
      await open.click();
      // The product's outcomes: a new tab ("Opened in a new tab"), or the
      // browser blocked it (a one-minute link to click), or an error.
      const outcome = notice.getByText(/Opened in a new tab|Your browser blocked the new tab/).or(notice.getByRole('alert'));
      const reacted = await outcome.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
      if (!reacted) {
        const hit = box ? await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}#${el.id}.${String(el.className).slice(0, 60)}` : 'none'; }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }) : 'no box';
        const seen = await f.evaluate(() => (window as any).__e2eEvents);
        console.log(`MOUSE CLICK LOST: button box ${JSON.stringify(box)}; parent hit ${hit}; frame events ${JSON.stringify(seen)}; frame rects ${rects.slice(-3).join(' ')} -> now ${await frameRect()}`);
        await shot(page, '07-mic-blocked-click-lost');
        test.info().annotations.push({ type: 'mouse-click-lost', description: `parent hit ${hit}; frame events ${JSON.stringify(seen)}` });
        // Keyboard activation (focus + Enter) is a user gesture too, and does not depend on coordinates.
        await open.focus();
        await f.page().keyboard.press('Enter');
      }
      await expect(outcome.first()).toBeVisible({ timeout: 30_000 }).catch(async (e) => {
        await shot(page, '07-mic-blocked-no-outcome');
        console.log('NOTICE AFTER CLICK:', await notice.innerText().catch(() => '(gone)'));
        throw e;
      });
      const blockedLink = notice.getByRole('link', { name: /Open ENARA in a new tab/ });
      let tab;
      if (await blockedLink.isVisible()) {
        console.log('The browser blocked the blank tab; following the product\'s one-minute link.');
        [tab] = await Promise.all([context.waitForEvent('page'), blockedLink.click()]);
      } else {
        tab = await tabPromise;
      }
      await tab.waitForURL(/\/(assignments|lms|$)/, { timeout: 60_000 });
      await expect.poll(() => tab.evaluate(() => !!sessionStorage.getItem('enara_token')), { timeout: 60_000 }).toBe(true);
      expect(await tab.evaluate(() => window.self === window.top)).toBe(true);
      await expect(tab.getByText(SPEAKING_TITLE).first()).toBeVisible({ timeout: 60_000 });
      await shot(tab, '07-mic-new-tab');
      await context.close();
    } finally {
      await browser.close();
    }
  });
});

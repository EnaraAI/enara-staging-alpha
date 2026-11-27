import { test, expect, request, type Route } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { LIVE_STUDENT, endCall, liveCallSession, openCoursePage, startCall, type LiveCall } from '../lib/liveCall';
import { shot } from '../lib/state';

// Scenario 48 (live tutor quick fix 3, switch liveTimeUsed): GET /api/me/tutor/live-usage (read only) gives the
// learner's live calls used and left today, minutes used today and the longest a call may run (null here: this stack
// sets no maximum). The course page's tutor panel and the kids app's tutor show it next to the live call button; with
// no calls left the start buttons say so. In the call: this call's time, today's minutes, calls left, and a warning 2
// minutes before the maximum length (none without one). Voice-only call with every provider faked (lib/liveCall.ts),
// nothing paid; the "no calls left" and "maximum length" states are given by Playwright routes.
const KIDS_STUDENT = 'LT-S-A06'; // 14, School A; switched to the kids app for this scenario only, then back

const usage = (over: Record<string, unknown> = {}) => ({ callsUsedToday: 3, callsLeftToday: 27, dailyLimit: 30, secondsUsedToday: 600, minutesUsedToday: 10, maxCallSeconds: null, ...over });
const fake = (call: LiveCall, body: Record<string, unknown>) =>
  call.context.route(/\/api\/me\/tutor\/live-usage$/, (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));

test.describe.serial('48 · Live tutor: time used today and calls left (liveTimeUsed)', () => {
  test('API: learners only, read only; nothing used yet, 30 calls left, no maximum length', async () => {
    const anon = await request.newContext({ baseURL: ENARA, ignoreHTTPSErrors: true });
    expect((await anon.get('/api/me/tutor/live-usage')).status()).toBe(401);
    expect((await anon.get('/api/me/tutor/live-usage', { headers: { Authorization: `Bearer ${await login('teacher.a1')}` } })).status()).toBe(403);
    await anon.dispose();
    const u = await enaraApi.get('/api/me/tutor/live-usage', await login(LIVE_STUDENT));
    expect(u).toEqual({ callsUsedToday: 0, callsLeftToday: 30, dailyLimit: 30, secondsUsedToday: 0, minutesUsedToday: 0, maxCallSeconds: null });
  });

  test('course page and call start screen show calls left; none left: the buttons say so', async ({ browser }) => {
    const call = await liveCallSession(browser);
    const { page } = call;
    await openCoursePage(call);
    const line = page.getByTestId('live-usage').first();
    await expect(line).toContainText('30 live calls left today · 0 min used today');
    await expect(line).toContainText('المكالمات المباشرة المتبقية اليوم: 30');
    await page.getByRole('button', { name: /Live AI Tutor/ }).click();
    await expect(page.getByRole('button', { name: 'Start call' })).toBeEnabled();
    await expect(page.getByTestId('live-usage').last()).toContainText('30 live calls left today');
    await shot(page, '48-live-usage-start');
    await endCall(call);

    // No calls left (the server's answer, faked): the live tutor button and the call's start button say so.
    await fake(call, usage({ callsUsedToday: 30, callsLeftToday: 0, secondsUsedToday: 3600, minutesUsedToday: 60 }));
    await page.reload();
    await openCoursePage(call);
    const none = page.getByTestId('live-tutor-no-calls');
    await expect(none).toBeVisible({ timeout: 60_000 });
    await expect(none).toBeDisabled();
    await expect(none).toContainText('No live calls left today');
    await expect(none).toContainText('لم تتبقَّ لك مكالمات مباشرة اليوم');
    await expect(page.getByTestId('live-usage').first()).toContainText('60 min used today');
    await shot(page, '48-live-usage-none-left');
    await call.context.close();
  });

  test('in the call: this call, today, calls left; a warning 2 minutes before the maximum length, none without one', async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const call = await liveCallSession(browser);
    const { page } = call;
    await openCoursePage(call);

    // Switch off: no usage in the call.
    await startCall(call);
    await expect(page.getByText(/talking without a face/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('live-call-usage')).toHaveCount(0);
    await endCall(call);

    // Switch on, no maximum length (this stack's real answer): the clock runs, no warning.
    call.features = { timeUsed: true };
    await startCall(call);
    const inCall = page.getByTestId('live-call-usage');
    await expect(inCall).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('live-call-left')).toHaveText('29', { timeout: 30_000 });
    await expect(page.getByTestId('live-call-today')).toHaveText('0');
    await expect(inCall).toContainText('هذه المكالمة');
    const first = await page.getByTestId('live-call-clock').innerText();
    await expect.poll(() => page.getByTestId('live-call-clock').innerText(), { timeout: 10_000 }).not.toBe(first);
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('live-call-ending')).toHaveCount(0);
    await endCall(call);

    // A maximum of 125 s (faked): the warning shows from 5 s in (2 minutes before the end).
    await fake(call, usage({ maxCallSeconds: 125 }));
    await startCall(call);
    await expect(page.getByTestId('live-call-today')).toHaveText('10', { timeout: 30_000 });
    await expect(page.getByTestId('live-call-left')).toHaveText('26');
    const ending = page.getByTestId('live-call-ending');
    await expect(ending).toBeVisible({ timeout: 30_000 });
    await expect(ending.getByRole('alert')).toContainText('About 2 minutes left in this call.');
    await expect(ending.getByRole('alert')).toContainText('تبقّت دقيقتان تقريبًا على نهاية هذه المكالمة.');
    await expect(page.getByTestId('live-call-ending-clock')).toHaveText(/^[01]:\d\d$/);
    await shot(page, '48-live-usage-in-call-warning');
    await endCall(call);
    await call.context.close();
  });

  test('kids app: the tutor shows calls left next to "Talk live"', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.patch(`/api/students/${KIDS_STUDENT}`, admin, { uiMode: 'kids' });
    try {
      const call = await liveCallSession(browser, { student: KIDS_STUDENT.toLowerCase() });
      const { page } = call;
      await page.getByRole('button', { name: /Ask Enara|اسأل إنارة/ }).first().click();
      await expect(page.getByRole('button', { name: /Talk live|تحدّث مباشرة/ })).toBeVisible({ timeout: 30_000 });
      const line = page.getByTestId('live-usage');
      await expect(line).toBeVisible({ timeout: 30_000 });
      await expect(line).toHaveAttribute('data-calls-left', '30');
      await expect(line).toContainText(/30 live calls left today|المكالمات المباشرة المتبقية اليوم: 30/);
      await shot(page, '48-live-usage-kids');
      await call.context.close();
    } finally {
      await enaraApi.patch(`/api/students/${KIDS_STUDENT}`, admin, { uiMode: 'standard' });
    }
  });
});

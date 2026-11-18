import { test, expect, chromium, type Frame, type Page } from '@playwright/test';
import { QUIZ_TITLE } from '../lib/content';
import { enaraFrame, frameSession } from '../lib/enara';
import { moodleCli, moodleProvision, moodleSession } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

// Scenario 9 (LMS Phase 8, "more activities, no grade"): the AI tutor session,
// the live avatar session and the diagnostic check, added through the ENARA
// picker in Moodle and opened as a student and a teacher. No real AI call is
// ever made: the suite's ENARA has no AI tutor or avatar provider (as
// lms-test today) and AI is paused, so the student pages must say so plainly
// (English and Arabic, with a reference code) instead of starting a session.
// Grade columns: ENARA asks for none. With the tool's "Accept grades from the
// tool: Always" (the documented setting) Moodle adds an empty column of its
// own that ENARA never fills; with "Delegate to teacher" Moodle makes none
// (and a graded quiz still gets its column). The tool is put back to Always.
// Mic: Chrome with fake devices (mic works in the frame), then the frame
// blocking the mic → "Open in a new tab" → the same activity, signed in.

const TUTOR = 'AI tutor session';
const AVATAR = 'Live avatar session';
const DIAGNOSTIC = 'Diagnostic check';
const ACCEPT = { always: 1, delegate: 2 } as const;
const setAcceptGrades = (typeid: number, value: number) => expect(moodleCli('tool-acceptgrades', { typeid, value }).acceptgrades).toBe(value);

/** Waits until Moodle has stopped moving its activity frame (resize script, drawer transition): mouse clicks use page coordinates. */
async function frameSettled(page: Page) {
  const rect = () => page.evaluate(() => {
    const el = document.getElementById('contentframe');
    if (!el) return 'none';
    const r = el.getBoundingClientRect();
    return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}@${Math.round(window.scrollY)}`;
  });
  const seen: string[] = [];
  await expect.poll(async () => {
    seen.push(await rect());
    const last = seen.slice(-5);
    return last.length === 5 && last.every((r) => r === last[0]);
  }, { timeout: 15_000, intervals: [150] }).toBe(true);
}

/**
 * Clicks a button inside ENARA's frame once the frame has settled; if nothing
 * reacts (a click lost to a moving frame, as in scenario 7), activates it with
 * the keyboard instead (focus + Enter is a user gesture too).
 */
async function press(page: Page, button: import('@playwright/test').Locator, reaction: import('@playwright/test').Locator) {
  await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await frameSettled(page);
  await button.click();
  const reacted = await reaction.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
  if (!reacted) {
    test.info().annotations.push({ type: 'mouse-click-lost', description: 'keyboard activation used' });
    await button.focus();
    await page.keyboard.press('Enter');
  }
}

/** Student or teacher: open the Moodle activity and return ENARA's frame on the activity page. */
async function openActivity(page: Page, cmid: number, testId: string, label: string): Promise<Frame> {
  await page.goto(activityUrl(cmid));
  const f = await enaraFrame(page);
  await frameSession(f);
  await expect(f.getByTestId(testId)).toBeVisible({ timeout: 60_000 }).catch(async (e) => {
    await shot(page, `09-phase8-FAILED-${label}`);
    console.log(`ACTIVITY FRAME (${f.url()}):`, (await f.locator('body').innerText().catch(() => '')).slice(0, 800));
    throw e;
  });
  return f;
}

test.describe.serial('9 · Phase 8: tutor, live avatar and diagnostic activities (no grade)', () => {
  test.afterAll(() => {
    // Whatever happened, School A's tool goes back to the documented "Always".
    const s = readState();
    if (s.schoolA?.typeid) moodleCli('tool-acceptgrades', { typeid: s.schoolA.typeid, value: ACCEPT.always });
  });

  test('teacher adds all three through the picker (No grade column, mic on tutor and avatar); Moodle\'s "Always" column stays empty', async ({ browser }) => {
    const s = readState();
    setAcceptGrades(s.schoolA.typeid, ACCEPT.always);
    const { page, context } = await moodleSession(browser, 'teacher.test');
    const { badges } = await addThroughPicker(page, {
      course: moodleProvision().courses.ENARATEST, courseShort: 'ENARATEST', typeid: s.schoolA.typeid,
      picks: [{ title: TUTOR }, { title: AVATAR }, { title: DIAGNOSTIC }],
      shotName: '09-phase8-picker',
    });
    for (const t of [TUTOR, AVATAR, DIAGNOSTIC]) expect(badges[t], t).toContain('No grade column');
    expect(badges[TUTOR]).toContain('Microphone');
    expect(badges[AVATAR]).toContain('Microphone');
    expect(badges[DIAGNOSTIC]).not.toContain('Microphone');
    await shot(page, '09-phase8-course-after-add');

    const tutor = activityByName('ENARATEST', TUTOR);
    const avatar = activityByName('ENARATEST', AVATAR);
    const diagnostic = activityByName('ENARATEST', DIAGNOSTIC);
    // Custom parameters only: the page target, never a token, code or id of anyone.
    expect(tutor.instructorcustomparameters.trim()).toBe('enara_target=tutor-session');
    expect(avatar.instructorcustomparameters.trim()).toBe('enara_target=live-avatar');
    expect(diagnostic.instructorcustomparameters.trim()).toBe('enara_target=diagnostic');
    // "Always": Moodle makes its own column (ENARA asked for none); it stays empty (checked after the launches).
    for (const a of [tutor, avatar, diagnostic]) expect(a.grademax, a.name).toBe(100);
    saveState({ activities: { ...s.activities, p8Tutor: tutor.cmid, p8Avatar: avatar.cmid, p8Diagnostic: diagnostic.cmid } });
    await context.close();
  });

  test('with "Delegate to teacher" the three get no grade column at all, and a graded quiz still gets its own', async ({ browser }) => {
    const s = readState();
    setAcceptGrades(s.schoolA.typeid, ACCEPT.delegate);
    try {
      const { page, context } = await moodleSession(browser, 'teacher.test');
      await addThroughPicker(page, {
        course: moodleProvision().courses.ENARATEST, courseShort: 'ENARATEST', typeid: s.schoolA.typeid,
        picks: [{ title: TUTOR }, { title: AVATAR }, { title: DIAGNOSTIC }, { title: QUIZ_TITLE }],
        shotName: '09-phase8-picker-delegate',
      });
      for (const name of [TUTOR, AVATAR, DIAGNOSTIC]) {
        const a = activityByName('ENARATEST', name); // the newest one
        expect(a.cmid, name).not.toBe(s.activities[name === TUTOR ? 'p8Tutor' : name === AVATAR ? 'p8Avatar' : 'p8Diagnostic']);
        expect(a.grademax, `${name}: no grade item`).toBeNull();
      }
      expect(activityByName('ENARATEST', QUIZ_TITLE).grademax).toBe(100);
      await context.close();
    } finally {
      setAcceptGrades(s.schoolA.typeid, ACCEPT.always);
    }
  });

  test('student opens each one: the right ENARA page, "No grade", and a clear EN/AR message instead of a session (no AI provider here)', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test', { permissions: ['microphone'] });
    for (const [cmid, kind, page_, title, codes] of [
      [s.activities.p8Tutor, 'tutor', 'activity-tutor', TUTOR, /^activity_(provider_not_configured|ai_paused)$/],
      [s.activities.p8Avatar, 'avatar', 'activity-avatar', AVATAR, /^activity_(provider_not_configured|ai_paused)$/],
      [s.activities.p8Diagnostic, 'diagnostic', 'activity-diagnostic', DIAGNOSTIC, /^activity_(no_objectives|feature_off)$/],
    ] as const) {
      const f = await openActivity(page, cmid, `lms-activity-${kind}`, `student-${kind}`);
      expect((await frameSession(f)).target ?? { page: page_ }).toMatchObject({ page: page_ });
      await expect(f.getByRole('heading', { name: title })).toBeVisible();
      await expect(f.getByTestId('lms-activity-no-grade')).toBeVisible();
      const problem = f.getByTestId('lms-activity-unavailable');
      await expect(problem).toBeVisible({ timeout: 30_000 });
      await expect(problem.locator('p[lang="ar"]')).toHaveText(/[؀-ۿ]/);
      expect(await f.getByTestId('lms-activity-code').innerText()).toMatch(codes);
      await expect(f.getByTestId('lms-activity-start')).toHaveCount(0);
      if (kind !== 'diagnostic') {
        // The mic check still works (fake device, permission granted inside Moodle's frame).
        await press(page, f.getByRole('button', { name: /Test microphone/ }), f.getByTestId('lms-activity-mic-result'));
        await expect(f.getByTestId('lms-activity-mic-result')).toHaveText(/Microphone works/, { timeout: 30_000 });
        await expect(f.locator('[data-testid^="mic-problem-"]')).toHaveCount(0);
      } else {
        await expect(f.getByRole('button', { name: /Test microphone/ })).toHaveCount(0);
      }
      await shot(page, `09-phase8-student-${kind}`);
    }
    await context.close();
    // Nothing was ever sent to the gradebook for them.
    for (const cmid of [s.activities.p8Tutor, s.activities.p8Avatar, s.activities.p8Diagnostic]) {
      const g = moodleCli('grade', { course: 'ENARATEST', cmid, user: 'student.test' });
      expect(g.finalgrade ?? null, `cmid ${cmid}`).toBeNull();
    }
  });

  test("teacher opens the tutor activity: the class overview (no grade, not set up here, the class's counts)", async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    const f = await openActivity(page, s.activities.p8Tutor, 'lms-activity-overview-tutor', 'teacher-tutor');
    expect((await frameSession(f)).role).toBe('teacher');
    await expect(f.getByTestId('lms-activity-no-grade')).toBeVisible();
    await expect(f.getByTestId('lms-activity-unavailable')).toBeVisible({ timeout: 30_000 });
    await expect(f.getByTestId('lms-activity-class-counts')).toBeVisible();
    await expect(f.getByTestId('lms-activity-class-counts')).toContainText('Students in the class');
    await shot(page, '09-phase8-teacher-tutor');
    await context.close();
  });

  test('mic blocked in the frame (live avatar) → "Open in a new tab" → a signed-in ENARA tab on the same activity', async () => {
    const s = readState();
    // As in scenario 7: full Chromium denying every permission prompt (a student's "Block").
    const browser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] });
    try {
      const { page, context } = await moodleSession(browser, 'student.test');
      const f = await openActivity(page, s.activities.p8Avatar, 'lms-activity-avatar', 'blocked');
      await press(page, f.getByRole('button', { name: /Test microphone/ }), f.getByTestId('lms-activity-mic-result'));
      await expect(f.getByTestId('lms-activity-mic-result')).toHaveText(/Not working/, { timeout: 30_000 });
      const notice = f.getByTestId('mic-problem-blocked_in_frame');
      await expect(notice).toBeVisible({ timeout: 30_000 }).catch(async (e) => {
        await shot(page, '09-phase8-blocked-failed');
        throw e;
      });
      const open = notice.getByRole('button', { name: /Open in a new tab/ });
      await expect(open).toBeEnabled();
      await shot(page, '09-phase8-mic-blocked');
      const tabPromise = context.waitForEvent('page', { timeout: 30_000 });
      const outcome = notice.getByText(/Opened in a new tab|Your browser blocked the new tab/).or(notice.getByRole('alert'));
      await press(page, open, outcome);
      await expect(outcome.first()).toBeVisible({ timeout: 30_000 });
      const blockedLink = notice.getByRole('link', { name: /Open ENARA in a new tab/ });
      let tab;
      if (await blockedLink.isVisible()) {
        [tab] = await Promise.all([context.waitForEvent('page'), blockedLink.click()]);
      } else {
        tab = await tabPromise;
      }
      await expect.poll(() => tab.evaluate(() => !!sessionStorage.getItem('enara_token')), { timeout: 60_000 }).toBe(true);
      expect(await tab.evaluate(() => window.self === window.top)).toBe(true);
      // The same activity page, top level (where the browser can ask for the mic).
      await expect(tab.getByTestId('lms-activity-avatar')).toBeVisible({ timeout: 60_000 });
      await expect(tab.getByRole('heading', { name: AVATAR })).toBeVisible();
      await shot(tab, '09-phase8-new-tab');
      await context.close();
    } finally {
      await browser.close();
    }
  });
});

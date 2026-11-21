import { test, expect, type Route } from '@playwright/test';
import { enaraFrame, frameSession } from '../lib/enara';
import { moodleSession } from '../lib/moodle';
import { activityUrl } from '../lib/picker';
import { readState, shot } from '../lib/state';

// Scenario 19 (tutor replies shown as formatted text, 21 Nov 2026): the learner opens the AI tutor
// activity from scenario 9 inside Moodle and asks a question. The suite's ENARA has no AI provider
// and AI is paused, so the browser is given a MOCK tutor reply (Playwright routes: the activity is
// "ready", a session opens, the reply comes back). The reply is Markdown with maths, a citation and
// model HTML. What the learner sees: no raw ** or lines starting with #, the maths readable (3/4 -> ¾,
// x^2 -> x²), the citation a small chip naming its source, and the HTML shown as text, never run.

const MOCK_REPLY = [
  '# Fractions',
  '**Well done!** You worked out that 3/4 of the pizza is left [1].',
  '',
  '- First, square it: x^2',
  '- Then write *the answer*',
  '',
  '<script>window.__enaraMarkdownXss = 1</script>',
].join('\n');

const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test('learner chat: a Markdown tutor reply shows formatted, with no raw ** or # and nothing run', async ({ browser }) => {
  const s = readState();
  expect(s.activities?.p8Tutor, 'the tutor activity from scenario 9').toBeTruthy();
  const { page, context } = await moodleSession(browser, 'student.test');

  await context.route(/\/api\/lms\/activities\/tutor(\?.*)?$/, (route) => json(route, {
    kind: 'tutor', ready: true, code: null, graded: false, needsMicrophone: true, classId: null, overview: null,
  }));
  await context.route(/\/api\/me\/tutor\/sessions(\/[^/?]+\/messages)?(\?.*)?$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    if (!/\/messages(\?|$)/.test(route.request().url())) return json(route, { id: 'e2e-markdown-session' });
    return json(route, {
      userMessage: { role: 'user', text: 'How much pizza is left?' },
      assistantMessage: { role: 'assistant', text: MOCK_REPLY, timestamp: new Date().toISOString(), meta: { citations: [{ n: 1, fileName: 'Fractions.pdf', page: 2 }] } },
    });
  });

  await page.goto(activityUrl(s.activities.p8Tutor));
  const f = await enaraFrame(page);
  await frameSession(f);
  const start = f.getByTestId('lms-activity-start');
  await expect(start).toBeVisible({ timeout: 60_000 });
  const input = f.getByTestId('tutor-input');
  await start.scrollIntoViewIfNeeded();
  await start.click();
  if (!(await input.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false))) {
    await start.focus(); // a click lost to Moodle's moving frame (scenario 9): the keyboard instead
    await page.keyboard.press('Enter');
  }
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill('How much pizza is left?');
  await input.press('Enter');

  const reply = f.getByTestId('tutor-reply').filter({ hasText: 'Well done!' }).last();
  await expect(reply).toBeVisible({ timeout: 30_000 });
  const text = await reply.innerText();
  expect(text).not.toContain('**');
  expect(text.split('\n').filter((line) => /^\s*#/.test(line))).toEqual([]);
  await expect(reply.locator('strong', { hasText: 'Well done!' })).toBeVisible();
  await expect(reply.locator('li')).toHaveCount(2);
  expect(text).toContain('¾');
  expect(text).toContain('x²');
  const cite = reply.getByTestId('tutor-cite').first();
  await expect(cite).toBeVisible();
  await expect(cite).toHaveAttribute('title', /Fractions\.pdf, page 2/);
  expect(text).toContain('<script>');
  expect(await f.evaluate(() => (window as unknown as { __enaraMarkdownXss?: number }).__enaraMarkdownXss)).toBeUndefined();
  await shot(page, '19-tutor-markdown');
  await context.close();
});

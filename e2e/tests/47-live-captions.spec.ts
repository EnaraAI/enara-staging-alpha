import { test, expect } from '@playwright/test';
import { endCall, liveCallSession, openCoursePage, startCall, tutorReply } from '../lib/liveCall';
import { shot } from '../lib/state';

// Scenario 47 (live tutor quick fix 2, switch liveCaptions): a captions toggle in the live call, off by default and
// remembered in the browser. The caption area shows the tutor's words as each sentence is spoken and what was heard
// from the learner, as clean text (no Markdown, citation markers or LaTeX), in the call's language (Arabic right to
// left), the last few lines only, inside the tutor's pane (never over the visual aid) and readable on a phone.
// Voice-only call with every provider faked (lib/liveCall.ts), nothing paid.
test.describe.serial('47 · Live tutor: captions (liveCaptions)', () => {
  test('off by default; tutor and learner lines, clean text, Arabic right to left, last lines only, beside the visual aid, phone, remembered', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const call = await liveCallSession(browser);
    const { page } = call;
    await openCoursePage(call);

    // Switch off: no toggle, no caption area.
    await startCall(call);
    await expect(page.getByText(/talking without a face/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('live-captions-toggle')).toHaveCount(0);
    await expect(page.getByTestId('live-captions')).toHaveCount(0);
    await endCall(call);

    // Switch on: the toggle starts off.
    call.features = { captions: true };
    await startCall(call);
    const toggle = page.getByTestId('live-captions-toggle');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await expect(toggle).toHaveAttribute('data-state', 'off');
    await expect(toggle).toContainText('Captions off');
    await expect(toggle).toContainText('التسميات التوضيحية مُتوقِّفة');
    await expect(page.getByTestId('live-captions')).toHaveCount(0);

    // On: the tutor's opening is there.
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'on');
    await expect(toggle).toContainText('Captions on');
    await expect(page.getByRole('button', { name: /^Captions on: the tutor’s words and yours/ })).toBeVisible();
    const box = page.getByTestId('live-captions');
    await expect(box).toBeVisible();
    const tutorLines = box.locator('[data-who="tutor"]');
    await expect(tutorLines.last()).toContainText('What is your name?', { timeout: 30_000 });
    await expect(box).toHaveAttribute('dir', 'ltr');

    // The learner's words, then a Markdown reply shown as clean words.
    call.reply = (q) => (q.kind === 'turn' ? '**Well done!** You said it right [1]. The answer is $x^2$ today.' : tutorReply(q));
    await call.learnerSays('My name is Salma and I live in Cairo');
    await expect(box.locator('[data-who="learner"]').last()).toHaveText(/You:\s*My name is Salma and I live in Cairo/, { timeout: 30_000 });
    await expect(tutorLines.last()).toContainText('Well done!', { timeout: 30_000 });
    await expect(tutorLines.last()).toContainText('x squared', { timeout: 30_000 });
    const clean = await tutorLines.last().innerText();
    expect(clean).not.toMatch(/\*\*|\[1\]|\$|\\/);
    await shot(page, '47-live-captions-en');

    // Arabic: the call's language turns the captions right to left; each line's own text is dir=auto.
    call.reply = (q) => (q.kind === 'turn' ? 'أحسنت! **اسمك** جميل جدًا.' : tutorReply(q));
    await call.learnerSays('اسمي سلمى وأسكن في القاهرة', 'ar');
    await expect(box.locator('[data-who="learner"]').last()).toContainText('اسمي سلمى', { timeout: 30_000 });
    await expect(tutorLines.last()).toContainText('أحسنت', { timeout: 30_000 });
    await expect(box).toHaveAttribute('dir', 'rtl');
    await expect(box).toHaveAttribute('lang', 'ar');
    await expect(tutorLines.last()).toContainText('المعلّم');
    await expect(tutorLines.last().getByTestId('live-caption-text')).toHaveAttribute('dir', 'auto');
    expect(await tutorLines.last().innerText()).not.toContain('**');
    await shot(page, '47-live-captions-ar');

    // The last few lines only.
    call.reply = (q) => (q.kind === 'turn' ? 'Good. Next one.' : tutorReply(q));
    for (const said of ['I like football very much', 'My sister is ten years old']) {
      const before = call.queries.length;
      await call.learnerSays(said);
      await expect.poll(() => call.queries.length, { timeout: 30_000 }).toBeGreaterThan(before);
    }
    await expect(box.locator('[data-who="learner"]').last()).toContainText('My sister is ten years old', { timeout: 30_000 });
    expect(await box.getByTestId('live-caption-line').count()).toBeLessThanOrEqual(4);

    // A visual aid opens beside the tutor: the captions never cover it.
    call.artifactHtml = '<!doctype html><p style="font:20px sans-serif">A table of greetings</p>';
    const panel = page.getByTitle('Visual Aid');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    const overlaps = async () => {
      const a = await box.boundingBox();
      const b = await panel.boundingBox();
      if (!a || !b) return true;
      return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    };
    await expect.poll(overlaps, { message: 'captions beside the visual aid (desktop; after the 0.5 s layout transition)', timeout: 10_000 }).toBe(false);
    await shot(page, '47-live-captions-visual');

    // Phone width: still readable, inside the screen, still not over the visual aid.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000); // the panes' 0.5 s layout transition
    await expect(box).toBeVisible();
    await expect(box.locator('[data-who="learner"]').last()).toBeInViewport();
    const fontPx = await box.getByTestId('live-caption-text').last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(14);
    const phone = await box.boundingBox();
    expect(phone && phone.x >= 0 && phone.x + phone.width <= 390).toBe(true);
    await expect.poll(overlaps, { message: 'captions beside the visual aid (phone)', timeout: 10_000 }).toBe(false);
    await shot(page, '47-live-captions-phone');
    await page.setViewportSize({ width: 1366, height: 900 });

    // Remembered in this browser: the next call starts with captions on; off is remembered too.
    call.artifactHtml = null;
    await endCall(call);
    await startCall(call);
    await expect(toggle).toHaveAttribute('data-state', 'on', { timeout: 30_000 });
    await expect(page.getByTestId('live-captions')).toBeVisible();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('data-state', 'off');
    await expect(page.getByTestId('live-captions')).toHaveCount(0);
    await endCall(call);
    await startCall(call);
    await expect(toggle).toHaveAttribute('data-state', 'off', { timeout: 30_000 });
    await endCall(call);
    await call.context.close();
  });
});

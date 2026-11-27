import { test, expect, type Route } from '@playwright/test';
import { endCall, liveCallSession, openCoursePage, SESSION_ID, startCall, type LiveQuery } from '../lib/liveCall';
import { shot } from '../lib/state';

// Scenario 48 (live tutor item 5, switch liveExpressive): the expressive avatar. Voice-only call (lib/liveCall.ts: no
// video or speech provider, nothing paid). The tutor's replies carry the server's cue lines ({"cue":"curious"}); a cue
// is never shown anywhere on the page. When a drawing opens, the panel goes on the side the face is turned to (the call
// start says which), pulses with "Look here / انظر هنا" for a moment, and the tutor's words begin "Look at the picture."
// With the switch off (no expressive in the call start) the panel opens as before: right side, no pulse.
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const ndjson = (route: Route, lines: unknown[]) => route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${lines.map((l) => JSON.stringify(l)).join('\n')}\n` });
const CUE_TEXT = /\[\s*(happy|warm|supportive|curious|concerned|angry|sad|distressed|laughter)\s*\]/i;

test.describe.serial('48 · Live tutor: expressive avatar (liveExpressive)', () => {
  test('cues never show; a drawing opens on the face side with a pulse and "Look at the picture"; switch off as before', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const call = await liveCallSession(browser);
    const { page, context } = call;
    let expressive: { panel: 'left' | 'right' } | null = { panel: 'left' };
    // The call start, as the server sends it with the switch on (the face takes cues, panel on its left) or off.
    await context.route(/\/api\/avatar\/session$/, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return json(route, { session_id: SESSION_ID, provider: 'video', session_token: 'e2e-not-a-session-token', speech: 'server', fallback_reason: null, pronunciation: false, features: { captions: true }, ...(expressive ? { expressive } : {}) });
    });
    // The tutor: a warm opening; asked for a drawing, a curious cue, the drawing and the look line.
    await context.route(/\/api\/avatar\/query-stream$/, (route) => {
      const body = route.request().postDataJSON() as { kind?: string; messages?: LiveQuery['messages'] };
      call.queries.push({ kind: body.kind ?? 'turn', messages: body.messages ?? [], at: Date.now() });
      if (body.kind === 'opening') return ndjson(route, [...(expressive ? [{ cue: 'warm' }] : []), { content: 'Hello! Shall we practise?' }]);
      if (body.kind === 'nudge') return ndjson(route, [{ content: 'Take your time.' }]);
      return ndjson(route, [...(expressive ? [{ cue: 'curious' }] : []), { visual: 'drawing' }, { content: expressive ? 'Look at the picture. ' : '' }, { content: 'Here are three red apples.' }]);
    });
    await openCoursePage(call);

    // Switch on, with captions on (liveCaptions): a cue never reaches a caption.
    await startCall(call);
    await expect(page.getByText(/talking without a face/)).toBeVisible({ timeout: 30_000 }); // voice-only call
    const toggle = page.getByTestId('live-captions-toggle');
    if ((await toggle.getAttribute('data-state')) !== 'on') await toggle.click();
    const captions = page.getByTestId('live-captions');
    await expect(captions.locator('[data-who="tutor"]').last()).toContainText('Shall we practise?', { timeout: 30_000 });
    await call.learnerSays('Can you draw three apples?');
    const panel = page.getByTestId('visual-aid-panel');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveAttribute('data-panel-side', 'left');
    const look = page.getByTestId('visual-aid-look');
    await expect(look).toBeVisible();
    await expect(look).toContainText('Look here');
    await expect(look).toContainText('انظر هنا');
    await shot(page, '48-expressive-drawing-left');
    const p = await panel.boundingBox();
    const f = await page.getByTestId('live-avatar-frame').boundingBox();
    expect(p && f && p.x + p.width <= f.x + 1, 'the panel is left of the face').toBe(true);
    // The cue reached the call (the frame records it) but no cue tag is shown anywhere.
    await expect(page.getByTestId('live-avatar-frame')).toHaveAttribute('data-cue-sent', /^curious@/);
    expect(await page.locator('body').innerText()).not.toMatch(CUE_TEXT);
    await expect(captions).toContainText('Here are three red apples', { timeout: 30_000 });
    await expect(captions).toContainText('Look at the picture');
    expect(await captions.innerText()).not.toMatch(CUE_TEXT);
    // The pulse is only a moment.
    await expect(look).toBeHidden({ timeout: 10_000 });
    expect(await page.locator('body').innerText()).not.toMatch(CUE_TEXT);
    await endCall(call);

    // Switch off: the panel opens as before (right of the face, no pulse), and no cue reaches the call.
    expressive = null;
    await startCall(call);
    await expect(page.getByText(/talking without a face/)).toBeVisible({ timeout: 30_000 });
    await call.learnerSays('Can you draw three apples?');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveAttribute('data-panel-side', 'right');
    await expect(page.getByTestId('visual-aid-look')).toHaveCount(0);
    const p2 = await panel.boundingBox();
    const f2 = await page.getByTestId('live-avatar-frame').boundingBox();
    expect(p2 && f2 && p2.x >= f2.x + f2.width - 1, 'the panel is right of the face').toBe(true);
    await expect(page.getByTestId('live-avatar-frame')).not.toHaveAttribute('data-cue-sent', /.+/);
    await shot(page, '48-expressive-off');
    await endCall(call);
    await context.close();
  });
});

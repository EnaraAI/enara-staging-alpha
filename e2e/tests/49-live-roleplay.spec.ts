import { test, expect, type Route } from '@playwright/test';
import { endCall, liveCallSession, openCoursePage, startCall, type LiveCall, type LiveQuery } from '../lib/liveCall';
import { shot } from '../lib/state';

// Scenario 49 (live tutor item 4, role-play lessons; switch liveRolePlay on): the scene card in the live call. Voice-only call as in
// scenario 46 (lib/liveCall.ts: no video or speech provider, nothing paid). With the switch on, the server sends the scene card with each
// tutor turn ({ scene } in /api/avatar/query-stream; null outside a scene); here Playwright stands in for that reply. The learner asks for a
// role-play; the tutor starts the restaurant scene and puts up a Visual Aid. What the learner sees: a small card with the setting, the
// character and their goal; Arabic reads right to left; it never covers the Visual Aid; on a phone it starts collapsed and opens on a tap;
// it goes away when the scene is over.

const SCENE = {
  id: 'restaurant-order',
  title: { en: 'Ordering at a restaurant', ar: 'الطلب في مطعم' },
  setting: { en: 'A small restaurant in the evening', ar: 'مطعم صغير في المساء' },
  character: { en: 'Karim, a waiter', ar: 'كريم، نادل' },
  goal: { en: 'Order a drink and a meal, then ask for the bill', ar: 'اطلب مشروبًا ووجبة، ثم اطلب الحساب' },
  beat: 1, beats: 8, phase: 'beat',
};
const ASK = 'Can we do a role-play at a restaurant?';
const DONE = 'Thank you, that is all.';

/** The tutor's replies with the switch on: { scene } on every turn (the card, or null), a Visual Aid with the first scene line. */
async function roleplayReplies(call: LiveCall) {
  await call.context.route(/\/api\/avatar\/query-stream$/, (route: Route) => {
    const body = route.request().postDataJSON() as { kind?: string; messages?: LiveQuery['messages'] };
    const q: LiveQuery = { kind: body.kind ?? 'turn', messages: body.messages ?? [], at: Date.now() };
    call.queries.push(q);
    const last = q.messages.at(-1)?.content ?? '';
    const lines: Record<string, unknown>[] = q.kind === 'turn' && last === ASK
      ? [{ visual: 'drawing' }, { scene: SCENE }, { content: "Let's do a short role-play. I am Karim, your waiter. " }, { content: 'Good evening. A table for one?' }]
      : q.kind === 'turn' && last === DONE
        ? [{ scene: null }, { content: 'Well done in the restaurant! Now back to our lesson.' }]
        : [{ scene: null }, { content: 'Hello! I am your tutor today. What would you like to practise?' }];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${lines.map((l) => JSON.stringify(l)).join('\n')}\n` });
  });
}

test.describe.serial('49 · Live tutor: role-play scene card (liveRolePlay)', () => {
  test('desktop: setting, character and goal; Arabic right to left; never over the Visual Aid; gone after the scene', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const call = await liveCallSession(browser);
    const { page } = call;
    await roleplayReplies(call);
    await openCoursePage(call);
    await startCall(call);
    await expect(page.getByText(/talking without a face/)).toBeVisible({ timeout: 30_000 }); // voice-only call
    await expect(page.getByTestId('roleplay-card')).toHaveCount(0); // no scene yet

    await call.learnerSays(ASK);
    const card = page.getByTestId('roleplay-card');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toHaveAttribute('dir', 'ltr');
    await expect(page.getByTestId('roleplay-card-title')).toHaveText('Ordering at a restaurant');
    await expect(card).toContainText('Step 1 of 8');
    await expect(page.getByTestId('roleplay-card-details')).toBeVisible();
    await expect(card).toContainText('A small restaurant in the evening');
    await expect(card).toContainText('Karim, a waiter');
    await expect(page.getByTestId('roleplay-card-goal')).toHaveText('Order a drink and a meal, then ask for the bill');

    // The Visual Aid is open next to it: the card and the panel never overlap.
    const visual = page.getByTitle('Visual Aid');
    await expect(visual).toBeVisible({ timeout: 30_000 });
    const a = (await card.boundingBox())!; const b = (await visual.boundingBox())!;
    const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    expect(overlap, 'the scene card never covers the Visual Aid').toBe(0);
    await shot(page, '49-live-roleplay-en');

    // Arabic: the same card, right to left (keyboard).
    await page.getByTestId('roleplay-card-lang').focus();
    await page.keyboard.press('Enter');
    await expect(card).toHaveAttribute('dir', 'rtl');
    await expect(card).toHaveAttribute('lang', 'ar');
    await expect(page.getByTestId('roleplay-card-title')).toHaveText('الطلب في مطعم');
    await expect(page.getByTestId('roleplay-card-goal')).toHaveText('اطلب مشروبًا ووجبة، ثم اطلب الحساب');
    await expect(card).toContainText('الخطوة 1 من 8');
    await expect(card).toContainText('كريم، نادل');
    await shot(page, '49-live-roleplay-ar');

    // The scene is over: the server sends no card, and it goes away.
    await call.learnerSays(DONE);
    await expect(card).toHaveCount(0, { timeout: 30_000 });
    await endCall(call);
    await call.context.close();
  });

  test('phone: the card starts collapsed to one line and opens on a tap', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const call = await liveCallSession(browser);
    const { page } = call;
    await roleplayReplies(call);
    await openCoursePage(call);
    await startCall(call);
    await page.setViewportSize({ width: 390, height: 844 });
    await call.learnerSays(ASK);
    const card = page.getByTestId('roleplay-card');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('roleplay-card-title')).toHaveText('Ordering at a restaurant');
    await expect(page.getByTestId('roleplay-card-details')).toBeHidden();
    await expect(page.getByTestId('roleplay-card-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect((await card.boundingBox())!.height).toBeLessThan(80);
    const visual = page.getByTitle('Visual Aid');
    await expect(visual).toBeVisible({ timeout: 30_000 });
    const a = (await card.boundingBox())!; const b = (await visual.boundingBox())!;
    expect(Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)) * Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))).toBe(0);
    await shot(page, '49-live-roleplay-phone-collapsed');
    await page.getByTestId('roleplay-card-toggle').click();
    await expect(page.getByTestId('roleplay-card-details')).toBeVisible();
    await expect(page.getByTestId('roleplay-card-goal')).toHaveText('Order a drink and a meal, then ask for the bill');
    await shot(page, '49-live-roleplay-phone-open');
    await endCall(call);
    await call.context.close();
  });
});

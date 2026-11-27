import { test, expect } from '@playwright/test';
import { endCall, liveCallSession, openCoursePage, startCall } from '../lib/liveCall';
import { shot } from '../lib/state';

// Scenario 46 (live tutor quick fix 1, switch liveMute): in a live call the learner can turn their microphone off
// and on, and the tutor's voice off and on. Voice-only call (lib/liveCall.ts: no video or speech provider, nothing
// paid). Microphone off closes ENARA's transcription session (no audio is sent, nothing said reaches the tutor) and
// the "nudge a quiet learner" turn never fires; on again opens a new session and the tutor answers. With the switch
// off the call has no such buttons (the call looks as before).
test.describe.serial('46 · Live tutor: microphone and tutor voice off/on (liveMute)', () => {
  test('switch off: no mute buttons; switch on: microphone and voice toggles work, by mouse and keyboard', async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const call = await liveCallSession(browser);
    const { page } = call;
    await openCoursePage(call);

    // Switch off (no features in the call start): the call has no controls.
    await startCall(call);
    await expect(page.getByText(/talking without a face/)).toBeVisible({ timeout: 30_000 }); // voice-only call
    await expect(page.getByTestId('live-mic-toggle')).toHaveCount(0);
    await expect(page.getByTestId('live-voice-toggle')).toHaveCount(0);
    await endCall(call);

    // Switch on.
    call.features = { mute: true };
    await startCall(call);
    const mic = page.getByTestId('live-mic-toggle');
    const voice = page.getByTestId('live-voice-toggle');
    await expect(mic).toBeVisible({ timeout: 30_000 });
    await expect(mic).toHaveAttribute('data-state', 'on');
    await expect(mic).toContainText('Microphone on');
    await expect(mic).toContainText('الميكروفون يعمل');
    await expect(page.getByRole('button', { name: /^Microphone on: the tutor can hear you/ })).toBeVisible();
    await expect(voice).toHaveAttribute('data-state', 'on');
    await expect(voice).toContainText('Tutor voice on');
    await expect(voice).toContainText('صوت المعلّم يعمل');
    await expect.poll(() => call.stt.filter((s) => !s.closed).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await shot(page, '46-live-mute-on');

    // Microphone off: the transcription session closes and none reopens; the tutor's question gets no nudge.
    const opened = call.stt.length;
    await mic.click();
    await expect(mic).toHaveAttribute('data-state', 'off');
    await expect(mic).toContainText('Microphone off');
    await expect(mic).toContainText('الميكروفون مُغلَق');
    await expect(page.getByRole('button', { name: /^Microphone off: the tutor cannot hear you/ })).toBeVisible();
    await expect.poll(() => call.stt.every((s) => s.closed), { timeout: 15_000, message: 'no transcription session open' }).toBe(true);
    await shot(page, '46-live-mute-mic-off');
    const queriesWhileOff = call.queries.length;
    await page.waitForTimeout(26_000); // longer than the 22 s nudge wait
    expect(call.queries.slice(queriesWhileOff).map((q) => q.kind), 'no nudge while the microphone is off').toEqual([]);
    expect(call.stt.length, 'no transcription session reopened while off').toBe(opened);

    // Microphone on (keyboard): a new session opens and what the learner says reaches the tutor.
    await mic.focus();
    await page.keyboard.press('Enter');
    await expect(mic).toHaveAttribute('data-state', 'on');
    await expect.poll(() => call.stt.length, { timeout: 30_000 }).toBeGreaterThan(opened);
    await call.learnerSays('My name is Salma and I live in Cairo');
    await expect.poll(() => call.queries.some((q) => q.kind === 'turn' && q.messages.at(-1)?.content === 'My name is Salma and I live in Cairo'), { timeout: 30_000 }).toBe(true);

    // Tutor voice off and on again (mouse, then keyboard Space).
    await voice.click();
    await expect(voice).toHaveAttribute('data-state', 'off');
    await expect(voice).toContainText('Tutor voice off');
    await expect(voice).toContainText('صوت المعلّم مكتوم');
    await expect(page.getByRole('button', { name: /^Tutor voice off: you cannot hear the tutor/ })).toBeVisible();
    await shot(page, '46-live-mute-voice-off');
    await voice.focus();
    await page.keyboard.press('Space');
    await expect(voice).toHaveAttribute('data-state', 'on');
    await endCall(call);
    await call.context.close();
  });
});

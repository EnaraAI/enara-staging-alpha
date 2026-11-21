import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';

// Scenario 18 (kidsSpeaking, owner go 21 Nov 2026): on lms-test children can speak to the tutor (the kids chat microphone) and to the live
// avatar. An internal environment switch only, with no user setting: the app reads two booleans. Audio is never stored (unit tests).
test('the kids app is told to show the chat microphone and the live call', async () => {
  const t = await login('lt-s-a04');
  const r = await enaraApi.get('/api/me/tutor/speaking', t);
  expect(r).toEqual({ microphone: true, liveCall: true });
});

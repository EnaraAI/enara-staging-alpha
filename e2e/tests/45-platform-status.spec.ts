import { test, expect, request } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { ENARA } from '../lib/env';

// Scenario 45: the design app's "Models & Mishkat" screen reads GET /api/platform/status (LMS_DESIGN_PLATFORM_STATUS, as on
// lms-test). Read-only: ENARA admins get configuration presence, model names and counts; a school admin gets 403, no token 401.
// Nothing here calls Mishkat or any AI service (this stack has neither).
test.describe.serial('45 · Platform status (design app)', () => {
  test('ENARA admin only; booleans, names and counts, no addresses', async () => {
    const anon = await request.newContext({ baseURL: ENARA, ignoreHTTPSErrors: true });
    expect((await anon.get('/api/platform/status')).status()).toBe(401);
    const school = await anon.get('/api/platform/status', { headers: { Authorization: `Bearer ${await login('admin.a')}` } });
    expect(school.status()).toBe(403);
    await anon.dispose();

    const s = await enaraApi.get('/api/platform/status', await login('enara.admin'));
    expect(Object.keys(s).sort()).toEqual(['checkedAt', 'email', 'mishkat', 'models']);
    for (const lang of ['ar', 'en']) expect(s.mishkat[lang]).toEqual({ configured: false, splitOn: false });
    expect(s.mishkat.scoredLast24h === 'unavailable' || typeof s.mishkat.scoredLast24h === 'number').toBe(true);
    expect(s.email).toMatchObject({ resendKeyPresent: false, configured: false, lmsEmailsEnabled: true, dailyCeiling: 1000 });
    for (const k of ['sent', 'held', 'failed']) expect(typeof s.email.today[k]).toBe('number');
    expect(typeof s.models.tutor).toBe('string');
    expect(JSON.stringify(s)).not.toMatch(/https?:\/\//);
    expect(Date.parse(s.checkedAt)).toBeGreaterThan(0);
  });
});

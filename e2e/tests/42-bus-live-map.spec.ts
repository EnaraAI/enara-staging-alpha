import { test, expect } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 42: the live bus map (owner "go" 25 Nov 2026: the supervisor's phone shares the position during a trip).
//   1. School admin, "Bus supervisors" tab: turns the live map on, adds a supervisor for the route, creates a one-time sign-in code.
//   2. Supervisor phone (/bus, location faked by Playwright): signs in with the code, starts the morning trip, the phone sends its
//      position; "Running late 10 min" reaches the parents as the usual bus notice.
//   3. Parent phone: Today shows the live map with the bus, the stop pin and "about N min away", and when it was last updated.
//   4. The code works once. The trip ends: the parent's live map goes away; the school sees the trip in its history (no positions).
const RUN = Date.now();
const ROUTE = `Live ${RUN}`;
const KEY = ROUTE.toLowerCase();
const STOP = { lat: 30.0444, lng: 31.2357 };
const START = { latitude: 30.0600, longitude: 31.2500 };

test.describe.serial('42 · Live bus map: supervisor phone, school tab, parent map', () => {
  test('school sets it up, the supervisor shares a trip, the parent sees the bus live', async ({ browser }) => {
    test.setTimeout(240_000);
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { buses: true, notifications: true, timetable: true, attendance: true, announcements: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students).slice(-3)[0].id;
    const imp = async (section: string, csv: string) => {
      const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section, csv });
      expect(p.counts.rejected, JSON.stringify(p.problems)).toBe(0);
      await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    };
    await imp('bus_routes', ['Route,Bus number,Supervisor,Supervisor phone,Stop,Morning,Afternoon', `${ROUTE},42,Hala,01000000042,North Gate,6:40,14:40`, `${ROUTE},42,,,Park Street,6:55,14:25`, `${ROUTE},42,,,School gate,7:20,14:00`].join('\n'));
    await imp('bus_assignments', `Student ID,Route,Stop\n${student},${ROUTE},Park Street`);
    // Trip hours all day for the test, whatever the time of the run; the stop pin through the API (the map click is the same call).
    await enaraApi.put('/api/school-app/bus-live/settings', admin, { enabled: false, windows: [{ from: '00:00', to: '23:59' }], routesOff: [] });
    await enaraApi.put('/api/school-app/bus-live/stops', admin, { routeKey: KEY, stopName: 'Park Street', ...STOP });

    // 1. The school admin's "Bus supervisors" tab.
    const staff = await enaraUiSession(browser, 'admin.a', 'School staff');
    await staff.page.getByRole('button', { name: 'Bus supervisors', exact: true }).first().click();
    const tab = staff.page.getByTestId('bus-admin');
    await expect(tab.getByTestId('bus-admin-settings')).toBeVisible({ timeout: 30_000 });
    await tab.getByTestId('bus-live-enabled').check();
    await tab.getByTestId('bus-live-save').click();
    await expect(tab.getByTestId('bus-admin-note')).toContainText('Saved');
    const form = tab.getByTestId('bus-sup-form');
    await form.getByTestId('bus-sup-name').fill(`Hala ${RUN}`);
    await form.getByTestId('bus-sup-phone').fill('01000000042');
    await form.getByTestId(`bus-sup-route-${KEY}`).check();
    await form.getByTestId('bus-sup-add').click();
    const sup = tab.getByTestId('bus-sup').filter({ hasText: `Hala ${RUN}` });
    await expect(sup).toBeVisible();
    await sup.getByTestId('bus-sup-code').click();
    const code = (await tab.getByTestId('bus-code-value').innerText()).trim();
    expect(code).toMatch(/^BUS-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(tab.getByTestId('bus-admin-pins')).toContainText('Park Street');
    await shot(staff.page, 'bus-42-01-admin-tab');

    // 2. The supervisor's phone.
    const phoneCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, geolocation: START, permissions: ['geolocation'] });
    const phone = await phoneCtx.newPage();
    phone.on('pageerror', (e) => console.log('[pageerror bus phone]', String(e).slice(0, 400)));
    await phone.goto(`${ENARA}/bus`);
    await phone.getByTestId('bus-code').fill(code);
    await phone.getByTestId('bus-signin').click();
    const route = phone.getByTestId('bus-route').filter({ hasText: ROUTE });
    await expect(route).toBeVisible({ timeout: 30_000 });
    await route.getByTestId('bus-start-morning').click();
    await expect(phone.getByTestId('bus-sharing')).toContainText('Sharing your location', { timeout: 30_000 });
    await expect(phone.getByTestId('bus-last-sent')).toContainText('Last sent', { timeout: 30_000 });
    await phone.getByTestId('bus-late-10').click();
    await expect(phone.getByTestId('bus-msg')).toContainText('Parents were told');
    await shot(phone, 'bus-42-02-supervisor-phone');

    // The code works once.
    const again = await enaraApi.post('/api/bus/start', '', { code }, [400]);
    expect(JSON.stringify(again)).toContain('Code not valid or expired');

    // 3. The parent's phone: the live map on Today.
    const parentCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await parentCtx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror bus parent]', String(e).slice(0, 400)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill((await enaraApi.post(`/api/students/${student}/parent-codes`, admin, {})).code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    const live = page.getByTestId('pp-bus-live');
    await expect(live).toBeVisible({ timeout: 45_000 });
    await expect(live).toHaveAttribute('data-stale', '0');
    await expect(live.getByTestId('pp-bus-eta')).toContainText(/about \d+ min away/);
    await expect(live.getByTestId('live-map')).toBeVisible();
    await expect(live.getByTestId('pp-bus-live-updated')).toContainText('Updated');
    await expect(page.getByTestId('pp-today-bus')).toContainText('About 10 minutes late');
    await shot(page, 'bus-42-03-parent-live');

    // The school sees the running trip.
    await staff.page.reload();
    await staff.page.getByRole('button', { name: 'Bus supervisors', exact: true }).first().click();
    await expect(staff.page.getByTestId('bus-running').filter({ hasText: ROUTE })).toBeVisible({ timeout: 30_000 });

    // 4. The supervisor ends the trip: the parent's live map goes away (next poll), the history keeps who and when.
    phone.once('dialog', (d) => void d.accept());
    await phone.getByTestId('bus-end').click();
    await expect(phone.getByTestId('bus-route').filter({ hasText: ROUTE })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId('pp-today-bus')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pp-bus-live')).toHaveCount(0);
    const view = await enaraApi.get('/api/school-app/bus-live', admin);
    expect(view.running.filter((r: { routeKey: string }) => r.routeKey === KEY)).toHaveLength(0);
    expect(view.history.find((h: { routeName: string }) => h.routeName === ROUTE)).toMatchObject({ endReason: 'ended' });
    expect(JSON.stringify(view.history)).not.toContain('"lat"');

    // Switching the school off: the phone can no longer start a trip.
    await enaraApi.put('/api/school-app/bus-live/settings', admin, { enabled: false });
    await phone.reload();
    await expect(phone.getByTestId('bus-off')).toBeVisible({ timeout: 30_000 });
    await shot(phone, 'bus-42-04-switched-off');
    await Promise.all([phoneCtx.close(), parentCtx.close(), staff.context.close()]);
  });
});

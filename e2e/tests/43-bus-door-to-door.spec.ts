import { test, expect } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 43: door to door (owner "go" 25 Nov 2026: the parent sets the home, the school confirms; all notices on; the supervisor
// sees the child's first name and the note).
//   1. The school turns door to door on for a route. The parent sets the pickup point on the Bus page: "Waiting for the school".
//   2. The school confirms it in the Bus supervisors tab.
//   3. The supervisor starts the morning trip near the home: the next home shows the child's first name and the note; the parent
//      gets "about 5 minutes away"; "Picked up" is tapped and the parent sees "Picked up at …" on the live map and in notifications.
const RUN = Date.now();
const ROUTE = `Homes ${RUN}`;
const KEY = ROUTE.toLowerCase();
const NOTE = `Building 12, gate 3 (${RUN})`;
const NEAR = { latitude: 30.0640, longitude: 31.3450 };

test.describe.serial('43 · Door to door: home pickup point, school confirms, supervisor taps Picked up', () => {
  test('the whole cycle', async ({ browser }) => {
    test.setTimeout(300_000);
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { buses: true, notifications: true, timetable: true, attendance: true, announcements: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string; name: string }[] }[]).flatMap((g) => g.students).slice(-4)[0];
    const first = student.name.trim().split(/\s+/)[0];
    const imp = async (section: string, csv: string) => {
      const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section, csv });
      expect(p.counts.rejected, JSON.stringify(p.problems)).toBe(0);
      await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    };
    await imp('bus_routes', ['Route,Bus number,Supervisor,Supervisor phone,Stop,Morning,Afternoon', `${ROUTE},43,Hala,01000000043,School gate,7:20,14:00`].join('\n'));
    await imp('bus_assignments', `Student ID,Route,Stop\n${student.id},${ROUTE},School gate`);
    await enaraApi.put('/api/school-app/bus-live/settings', admin, { enabled: true, windows: [{ from: '00:00', to: '23:59' }], routesOff: [] });
    await enaraApi.put('/api/school-app/bus-live/homes/door-to-door', admin, { routeKey: KEY, on: true });
    const sup = await enaraApi.post('/api/school-app/bus-live/supervisors', admin, { name: `Hala ${RUN}`, routeKeys: [KEY] });
    const { code } = await enaraApi.post(`/api/school-app/bus-live/supervisors/${sup.id}/code`, admin, {});

    // 1. The parent sets the pickup point.
    const parentCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, geolocation: NEAR, permissions: ['geolocation'] });
    const page = await parentCtx.newPage();
    page.on('pageerror', (e) => console.log('[pageerror d2d parent]', String(e).slice(0, 400)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill((await enaraApi.post(`/api/students/${student.id}/parent-codes`, admin, {})).code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await page.getByTestId('pp-school-home-bus').click({ timeout: 45_000 });
    const pickup = page.getByTestId('pp-pickup');
    await expect(pickup).toBeVisible({ timeout: 30_000 });
    await pickup.getByTestId('pp-pickup-edit').click();
    await pickup.getByTestId('pp-pickup-here').click();
    await pickup.getByTestId('pp-pickup-note').fill(NOTE);
    await pickup.getByTestId('pp-pickup-save').click();
    await expect(pickup.getByTestId('pp-pickup-status')).toContainText('Waiting for the school');
    await shot(page, 'bus-43-01-parent-pickup');

    // 2. The school confirms it.
    const staff = await enaraUiSession(browser, 'admin.a', 'School staff');
    await staff.page.getByRole('button', { name: 'Bus supervisors', exact: true }).first().click();
    const homes = staff.page.getByTestId('bus-admin-homes');
    await expect(homes).toBeVisible({ timeout: 30_000 });
    await homes.getByTestId('bus-homes-route').selectOption(KEY);
    const row = homes.getByTestId('bus-home-row').filter({ hasText: student.name });
    await expect(row.getByTestId('bus-home-state')).toContainText('Waiting for you');
    await row.getByTestId('bus-home-confirm').click();
    await expect(row.getByTestId('bus-home-state')).toContainText('Confirmed');
    await shot(staff.page, 'bus-43-02-school-confirms');
    await page.reload();
    // A reload opens the School screen on its first view, not the bus: open the bus section again (its tab, or its tile).
    await page.getByTestId('pp-school-buses').or(page.getByTestId('pp-school-home-bus')).first().click({ timeout: 30_000 });
    await expect(page.getByTestId('pp-pickup').getByTestId('pp-pickup-status')).toContainText('Confirmed by the school', { timeout: 30_000 });

    // 3. The supervisor's trip: next home, "5 minutes away", Picked up.
    const phoneCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, geolocation: NEAR, permissions: ['geolocation'] });
    const phone = await phoneCtx.newPage();
    await phone.goto(`${ENARA}/bus`);
    await phone.getByTestId('bus-code').fill(code);
    await phone.getByTestId('bus-signin').click();
    await phone.getByTestId('bus-route').filter({ hasText: ROUTE }).getByTestId('bus-start-morning').click();
    const next = phone.getByTestId('bus-next-home');
    await expect(next).toContainText(first, { timeout: 30_000 });
    await expect(next).toContainText(NOTE);
    await expect(phone.getByTestId('bus-last-sent')).toContainText('Last sent', { timeout: 30_000 }); // the position (next to the home) is in
    await shot(phone, 'bus-43-03-next-home');
    await next.getByTestId('bus-home-done').click();
    await expect(phone.getByTestId('bus-homes-done')).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await page.getByTestId('pp-school-buses').or(page.getByTestId('pp-school-home-bus')).first().click({ timeout: 30_000 }); // back to the bus section after the reload
    await expect(page.getByTestId('pp-bus-live').getByTestId('pp-bus-child-status')).toContainText('Picked up at', { timeout: 45_000 });
    await shot(page, 'bus-43-04-parent-picked-up');
    const token = await page.evaluate(() => localStorage.getItem('enara_token') || sessionStorage.getItem('enara_token') || '');
    const notes = await enaraApi.get('/api/parents/school/notifications', token);
    const titles = (notes.notifications as { title: string }[]).map((n) => n.title).join(' | ');
    expect(titles).toContain('about 5 minutes away');
    expect(titles).toContain('was picked up at');
    await Promise.all([parentCtx.close(), phoneCtx.close(), staff.context.close()]);
  });
});

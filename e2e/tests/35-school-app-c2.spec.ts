import { test, expect } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 35 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step c2): the bus screens.
//   1. Parent on a phone: Home shows today's bus times; the Bus view shows the morning and afternoon trips, the stop time, the
//      supervisor's call button (phones shared) and all stops; Arabic RTL without sideways scroll.
//   2. The school sends a delay notice on its screen; the parent sees the red notice on the bus view and in notifications.
const RUN = Date.now();
const ROUTE = `Line ${RUN}`;

test.describe.serial('35 · Parents school app (c2): bus screens', () => {
  test('parent phone view; the school sends a delay notice from its screen', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { buses: true, notifications: true, timetable: true, attendance: true, announcements: true });
    await enaraApi.put('/api/school-app/buses/phones', admin, { busPhonesShared: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students).slice(-2)[0].id;
    const imp = async (section: string, csv: string) => {
      const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section, csv });
      expect(p.counts.rejected, JSON.stringify(p.problems)).toBe(0);
      await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    };
    await imp('bus_routes', ['Route,Bus number,Supervisor,Supervisor phone,Stop,Morning,Afternoon', `${ROUTE},21,Hala,01000000021,North Gate,6:40,14:40`, `${ROUTE},21,,,Park Street,6:55,14:25`, `${ROUTE},21,,,School gate,7:20,14:00`].join('\n'));
    await imp('bus_assignments', `Student ID,Route,Stop\n${student},${ROUTE},Park Street`);

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror school c2]', String(e).slice(0, 500)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill((await enaraApi.post(`/api/students/${student}/parent-codes`, admin, {})).code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('pp-school-home-bus')).toContainText('06:55', { timeout: 30_000 });

    await page.getByTestId('pp-school-home-bus').click();
    await expect(page.getByTestId('pp-bus-morning').getByTestId('pp-bus-time')).toHaveText('06:55');
    await expect(page.getByTestId('pp-bus-afternoon').getByTestId('pp-bus-time')).toHaveText('14:25');
    await expect(page.getByTestId('pp-bus-morning').getByTestId('pp-bus-call')).toHaveAttribute('href', 'tel:01000000021');
    await page.getByTestId('pp-bus-morning').getByRole('button', { name: 'All stops' }).click();
    await expect(page.getByTestId('pp-bus-stops').locator('li')).toHaveCount(3);
    await shot(page, 'school-c2-01-bus');

    // The school sends a delay notice on its screen.
    const staff = await enaraUiSession(browser, 'admin.a', 'School staff');
    await staff.page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const buses = staff.page.getByTestId('sa-buses');
    await expect(buses).toBeVisible({ timeout: 30_000 });
    await buses.getByTestId('sa-bus-route').selectOption(ROUTE);
    await buses.getByTestId('sa-bus-minutes').fill('25');
    await buses.getByTestId('sa-bus-message').fill(`Road works ${RUN}`);
    await buses.getByTestId('sa-bus-send').click();
    await expect(buses.getByTestId('sa-bus-msg')).toContainText('Sent to the parents of 1 children');
    await shot(staff.page, 'school-c2-02-admin-bus');
    await staff.context.close();

    await page.reload();
    await page.locator('.pp-nav').getByRole('button', { name: 'School' }).click();
    await page.getByTestId('pp-school-buses').click();
    await expect(page.getByTestId('pp-bus-morning').getByTestId('pp-bus-notice')).toContainText('About 25 minutes late');
    await expect(page.getByTestId('pp-bus-afternoon').getByTestId('pp-bus-notice')).toHaveCount(0);
    await shot(page, 'school-c2-03-bus-delay');
    await page.locator('.pp-langbtn').click();
    await expect(page.locator('.pp')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('pp-bus-morning').getByTestId('pp-bus-notice')).toContainText('متأخرة نحو');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no sideways scroll on the bus view (Arabic)').toBeLessThanOrEqual(0);
    await shot(page, 'school-c2-04-bus-ar');
    await page.locator('.pp-langbtn').click();
    await page.getByTestId('pp-bell').click();
    await expect(page.getByTestId('pp-notification').filter({ hasText: ROUTE })).toBeVisible();
    await context.close();
  });
});

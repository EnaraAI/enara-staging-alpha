import { test, expect } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 32 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step b2): the fee screens.
//   1. Parent on a phone: Home shows the next instalment and "1 overdue"; the Fees view shows totals, each instalment's status and
//      "Payment is made at the school"; Arabic RTL without sideways scroll.
//   2. School admin: the overdue filter lists the instalment; "Mark paid" with a receipt number; the parent then sees it paid.
const RUN = Date.now();
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const day = (n: number) => cairo(new Date(Date.now() + n * 86_400_000));
const PLAN = `Tuition ${RUN}`;

test.describe.serial('32 · Parents school app (b2): fee screens', () => {
  test('parent phone view, then the school marks the overdue instalment paid', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { fees: true, timetable: true, attendance: true, announcements: true, notifications: true });
    await enaraApi.put('/api/school-app/fees/visibility', admin, { feesVisibleTo: 'all' });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students)[2].id;
    const csv = ['Student ID,Plan,Instalment No.,Amount,Due date,Status,Paid date,Receipt ref',
      `${student},${PLAN},1,15000,${day(-70)},paid,${day(-71)},R-${RUN}`, `${student},${PLAN},2,15000,${day(-5)},due,,`, `${student},${PLAN},3,15000,${day(60)},,,`].join('\n');
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'fees', csv });
    expect(p.counts.rejected).toBe(0);
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror school b2]', String(e).slice(0, 500)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill((await enaraApi.post(`/api/students/${student}/parent-codes`, admin, {})).code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('pp-school-home-fees')).toContainText('overdue', { timeout: 30_000 });
    await shot(page, 'school-b2-01-home-fees');

    await page.getByTestId('pp-school-home-fees').click();
    const plan = page.getByTestId('pp-fee-plan').filter({ hasText: PLAN });
    await expect(plan.getByTestId('pp-instalment')).toHaveCount(3);
    await expect(plan.locator('[data-testid="pp-instalment"][data-status="overdue"]')).toHaveCount(1);
    await expect(plan.locator('[data-testid="pp-instalment"][data-status="paid"]')).toContainText(`R-${RUN}`);
    await expect(page.getByTestId('pp-fees-pay-at-school')).toContainText('Payment is made at the school');
    await expect(page.getByTestId('pp-school-source')).toContainText("From the school's fee record");
    await shot(page, 'school-b2-02-fees');

    await page.locator('.pp-langbtn').click();
    await expect(page.locator('.pp')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('pp-school-fees')).toHaveText('الرسوم');
    await expect(page.getByTestId('pp-fees-pay-at-school')).toContainText('يتم الدفع في المدرسة');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no sideways scroll on fees (Arabic)').toBeLessThanOrEqual(0);
    await shot(page, 'school-b2-03-fees-ar');
    await page.locator('.pp-langbtn').click();

    // The school marks the overdue instalment paid on its screen.
    const staff = await enaraUiSession(browser, 'admin.a', 'School staff');
    await staff.page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const fees = staff.page.getByTestId('sa-fees');
    await expect(fees).toBeVisible({ timeout: 30_000 });
    await fees.getByTestId('sa-fees-filter-overdue').click();
    const row = fees.getByTestId('sa-fee-row').filter({ hasText: PLAN });
    await expect(row).toHaveCount(1);
    await row.getByTestId('sa-fee-ref').fill(`R2-${RUN}`);
    await shot(staff.page, 'school-b2-04-admin-fees');
    await row.getByTestId('sa-fee-paid').click();
    await expect(fees.getByTestId('sa-fee-row').filter({ hasText: PLAN })).toHaveCount(0);
    await staff.context.close();

    await page.reload();
    await page.getByTestId('pp-nav-home').click(); await page.getByTestId('pp-school-home').getByRole('button').first().click(); // redesign: School opens from Today
    await page.getByTestId('pp-school-fees').click();
    await expect(page.getByTestId('pp-fee-plan').filter({ hasText: PLAN }).locator('[data-testid="pp-instalment"][data-status="paid"]')).toHaveCount(2);
    await expect(page.getByTestId('pp-fee-plan').filter({ hasText: PLAN })).toContainText(`R2-${RUN}`);
    await context.close();
  });
});

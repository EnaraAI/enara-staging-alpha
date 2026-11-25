import { test, expect } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 37 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step d2): the request and consent screens.
//   1. Parent on a phone: Home shows "1 to answer"; the Consent view shows the form; the parent picks "I agree", ticks "I confirm" and
//      sends; the answer shows with its time. The parent sends a request.
//   2. The school answers the request on its screen; the parent sees the reply. The school's dashboard shows the signed answer.
//   3. Arabic RTL without sideways scroll.
const RUN = Date.now();
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

test.describe.serial('37 · Parents school app (d2): request and consent screens', () => {
  test('parent signs a form and sends a request; the school answers', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { requests: true, consents: true, notifications: true, timetable: true, attendance: true, announcements: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students).slice(-3)[0].id;
    await enaraApi.post('/api/school-app/consents', admin, { title: `Zoo trip ${RUN}`, body: 'The class visits the Giza Zoo on Wednesday by school bus.', audience: 'student', audienceValue: student, deadline: cairo(new Date(Date.now() + 4 * 86_400_000)) });

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror school d2]', String(e).slice(0, 500)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill((await enaraApi.post(`/api/students/${student}/parent-codes`, admin, {})).code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('pp-school-home-consents')).toContainText('to answer', { timeout: 30_000 });

    await page.getByTestId('pp-school-home-consents').click();
    const form = page.getByTestId('pp-consent').filter({ hasText: `Zoo trip ${RUN}` });
    await expect(form.getByTestId('pp-consent-sign')).toBeDisabled();
    await form.getByTestId('pp-consent-option-agree').check();
    await form.getByTestId('pp-consent-confirm').check();
    await shot(page, 'school-d2-01-consent');
    await form.getByTestId('pp-consent-sign').click();
    await expect(page.getByTestId('pp-consent').filter({ hasText: `Zoo trip ${RUN}` }).getByTestId('pp-consent-answer')).toContainText('Your answer: I agree');

    await page.getByTestId('pp-school-requests').click();
    await page.getByTestId('pp-request-type').selectOption('teacher_meeting');
    await page.getByTestId('pp-request-details').fill(`Meeting about homework ${RUN}`);
    await page.getByTestId('pp-request-send').click();
    await expect(page.getByTestId('pp-request-sent')).toBeVisible();
    await expect(page.getByTestId('pp-request').filter({ hasText: `Meeting about homework ${RUN}` })).toHaveAttribute('data-status', 'new');

    // The school answers on its screen and sees the signed form.
    const staff = await enaraUiSession(browser, 'admin.a', 'School staff');
    await staff.page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const inbox = staff.page.getByTestId('sa-requests');
    await expect(inbox).toBeVisible({ timeout: 30_000 });
    const row = inbox.getByTestId('sa-request').filter({ hasText: `Meeting about homework ${RUN}` });
    await row.getByTestId('sa-req-status').selectOption('done');
    await row.getByTestId('sa-req-reply').fill('Thursday 10:00 with Ms Salma.');
    await row.getByTestId('sa-req-save').click();
    await expect(inbox.getByTestId('sa-request').filter({ hasText: `Meeting about homework ${RUN}` })).toHaveCount(0);
    const cons = staff.page.getByTestId('sa-consents');
    await cons.getByTestId('sa-cons-row').filter({ hasText: `Zoo trip ${RUN}` }).getByTestId('sa-cons-open').click();
    await expect(cons.getByTestId('sa-cons-counts')).toContainText('I agree: 1');
    await shot(staff.page, 'school-d2-02-admin-requests-consent');
    await staff.context.close();

    await page.reload();
    await page.getByTestId('pp-nav-home').click(); await page.getByTestId('pp-school-home').getByRole('button').first().click(); // redesign: School opens from Today
    await page.getByTestId('pp-school-requests').click();
    await expect(page.getByTestId('pp-request').filter({ hasText: `Meeting about homework ${RUN}` }).getByTestId('pp-request-reply')).toHaveText('Thursday 10:00 with Ms Salma.');
    await shot(page, 'school-d2-03-request-answered');
    await page.locator('.pp-langbtn').click();
    await expect(page.locator('.pp')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('pp-school-requests')).toHaveText('الطلبات');
    for (const v of ['requests', 'consents']) {
      await page.getByTestId(`pp-school-${v}`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `no sideways scroll on ${v} (Arabic)`).toBeLessThanOrEqual(0);
    }
    await shot(page, 'school-d2-04-consent-ar');
    await page.locator('.pp-langbtn').click();
    await context.close();
  });
});

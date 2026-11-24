import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 39 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step e2): the assistant on a phone, English and Arabic.
//   The parent opens the chat button, asks about fees (answer with its source line), asks for a certificate (offer → confirm → the
//   request appears on the Requests tab, marked as sent), and asks in Arabic (Arabic answer, right to left, no sideways scroll).
const RUN = Date.now();
const cairo = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

test.describe.serial('39 · Parents school app (e2): the assistant on a phone', () => {
  test('ask, see the source, confirm a request; Arabic', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { chat: true, fees: true, requests: true, notifications: true, timetable: true, attendance: true, announcements: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students).slice(-4)[0].id;
    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'fees', csv: `Student ID,Plan,Instalment No.,Amount,Due date\n${student},Chat UI ${RUN},1,8000,${cairo(new Date(Date.now() + 30 * 86_400_000))}` });
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror school e2]', String(e).slice(0, 500)));
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill((await enaraApi.post(`/api/students/${student}/parent-codes`, admin, {})).code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });

    await page.getByTestId('pp-chat-open').click();
    await page.getByTestId('pp-chat-input').fill('How much is left to pay?');
    await page.getByTestId('pp-chat-send').click();
    const first = page.getByTestId('pp-chat-answer').first();
    await expect(first).toContainText('Payment is made at the school', { timeout: 30_000 });
    await expect(first.getByTestId('pp-chat-source')).toContainText("Source: fee record");

    await page.getByTestId('pp-chat-input').fill('I need an enrolment certificate please');
    await page.getByTestId('pp-chat-send').click();
    await expect(page.getByTestId('pp-chat-confirm')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'school-e2-01-chat');
    await page.getByTestId('pp-chat-confirm').click();
    await expect(page.getByTestId('pp-chat-created')).toBeVisible();
    const reqs = await enaraApi.get(`/api/parents/school/learners/${student}/requests`, await page.evaluate(() => localStorage.getItem('enara_token') || ''));
    expect(reqs.requests[0]).toMatchObject({ type: 'certificate', via: 'chat', status: 'new' });
    await page.keyboard.press('Escape');

    await page.locator('.pp-langbtn').click();
    await expect(page.locator('.pp')).toHaveAttribute('dir', 'rtl');
    await page.getByTestId('pp-chat-open').click();
    await page.getByTestId('pp-chat-input').fill('كم المتبقي من الرسوم؟');
    await page.getByTestId('pp-chat-send').click();
    await expect(page.getByTestId('pp-chat-answer').last()).toContainText('يتم الدفع في المدرسة', { timeout: 30_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no sideways scroll with the chat open (Arabic)').toBeLessThanOrEqual(0);
    await shot(page, 'school-e2-02-chat-ar');
    await page.keyboard.press('Escape');
    await page.locator('.pp-langbtn').click();
    await context.close();
  });
});

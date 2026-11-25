import { test, expect } from '@playwright/test';
import { enaraApi, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 28 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step a2): the parent school screens, on a phone (390 px).
//   1. A parent links with a code; then the school imports today's timetable, an absence and a school-wide announcement.
//   2. Home shows the School card (absent today); the bell shows the unread count; the School tab shows the timetable (today
//      highlighted, with its source), attendance and announcements; notifications can be marked read.
//   3. Arabic: right-to-left, Arabic labels, no sideways scroll.
//   4. The school turns every section off: the School tab, the bell and the Home card disappear.
const RUN = Date.now();
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', weekday: 'long' }).format(now);
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
const ALL_ON = { timetable: true, announcements: true, attendance: true, notifications: true };

test.describe.serial('28 · Parents school app (a2): parent screens', () => {
  test('phone: Home card, bell, timetable, attendance, announcements, notifications; Arabic RTL; sections off hide it all', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, ALL_ON);
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const g = (roster.groups as { name: string; students: { id: string }[] }[]).find((x) => x.students.length >= 1);
    expect(g, 'a School A class with a student').toBeTruthy();
    const student = g!.students[g!.students.length - 1].id;

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror school a2]', String(e).slice(0, 500)));
    const code = (await enaraApi.post(`/api/students/${student}/parent-codes`, admin, {})).code;
    await page.goto(`${ENARA}/parents`);
    await page.locator('#si-code').fill(code);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });

    // The school's data arrives after the parent linked (so the absence and the announcement notify this parent).
    const imp = async (section: string, rows: string[][]) => {
      const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section, csv: csv(rows) });
      expect(p.counts.rejected, `${section} rows rejected`).toBe(0);
      await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});
    };
    await imp('timetable', [['Class', 'Day', 'Period', 'Start', 'End', 'Subject', 'Teacher', 'Room'], [g!.name, weekday, '1', '00:00', '23:58', `Science ${RUN}`, 'Ms Mona', '12']]);
    await imp('attendance', [['Date', 'Student ID', 'Status', 'Note'], [today, student, 'absent', `note ${RUN}`]]);
    await enaraApi.post('/api/school-app/announcements', admin, { audience: 'school', title: `Sports day ${RUN}`, body: 'Wear the sports uniform.' });

    await page.reload();
    await page.getByTestId('pp-nav-school').click({ timeout: 30_000 });
    const home = page.getByTestId('pp-school-home');
    await expect(home).toBeVisible({ timeout: 30_000 });
    await expect(home).toContainText('Absent');
    await expect(home).toContainText(`Science ${RUN}`);
    await expect(page.getByTestId('pp-nav-messages').locator('.pp-badge')).toBeVisible();
    await shot(page, 'school-a2-01-home-card');

    await page.getByTestId('pp-nav-school').click(); await page.getByTestId('pp-school-home').getByRole('button').first().click(); // design A: the School tab lists the sections
    await expect(page).toHaveURL(/\/parents\/school$/);
    await page.getByTestId('pp-school-timetable').click();
    await expect(page.locator('.pp-school-today')).toContainText(`Science ${RUN}`);
    await expect(page.locator('.pp-school-today')).toContainText('Ms Mona');
    await expect(page.getByTestId('pp-school-source')).toContainText("From the school's timetable · updated");
    await shot(page, 'school-a2-02-timetable');

    await page.getByTestId('pp-school-attendance').click();
    await expect(page.getByTestId('pp-att-row').filter({ hasText: `note ${RUN}` })).toContainText('Absent');
    await expect(page.getByTestId('pp-school-source')).toContainText('attendance sheet');
    await shot(page, 'school-a2-03-attendance');

    await page.getByTestId('pp-school-announcements').click();
    await expect(page.getByTestId('pp-announcement').filter({ hasText: `Sports day ${RUN}` })).toContainText('Whole school');
    await shot(page, 'school-a2-04-announcements');

    await page.getByTestId('pp-nav-messages').click(); await page.getByTestId('pp-msg-notifications').click();
    await expect(page.getByTestId('pp-notification').filter({ hasText: 'was absent on' }).first()).toBeVisible();
    await expect(page.getByTestId('pp-notification').filter({ hasText: `Sports day ${RUN}` })).toBeVisible();
    await shot(page, 'school-a2-05-notifications');
    await page.getByTestId('pp-notif-markall').click();
    await expect(page.getByTestId('pp-notif-unread')).toContainText('0 unread');
    await expect(page.getByTestId('pp-nav-messages').locator('.pp-badge')).toHaveCount(0);

    // Arabic: right to left, Arabic labels, nothing wider than the phone.
    await page.locator('.pp-langbtn').click();
    await expect(page.locator('.pp')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('pp-nav-messages')).toContainText('الرسائل');
    await page.getByTestId('pp-school-timetable').click();
    await expect(page.getByTestId('pp-school-timetable')).toHaveText('الجدول');
    await expect(page.getByTestId('pp-school-source')).toContainText('من جدول المدرسة');
    for (const v of ['today', 'attendance', 'announcements', 'notifications']) {
      await page.getByTestId(`pp-school-${v}`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `no sideways scroll on ${v} (Arabic)`).toBeLessThanOrEqual(0);
      await shot(page, `school-a2-ar-${v}`);
    }
    await page.getByTestId('pp-nav-home').click();
    await expect(page.getByTestId('pp-nav-home')).toContainText('الرئيسية');
    await page.getByTestId('pp-nav-school').click();
    await expect(page.getByTestId('pp-school-home')).toBeVisible();
    await shot(page, 'school-a2-ar-home-card');
    await page.locator('.pp-langbtn').click(); // back to English for later runs on this browser

    // The school turns every section off: everything school-related disappears for the parent.
    await enaraApi.put('/api/school-app/sections', admin, { timetable: false, announcements: false, attendance: false, notifications: false });
    await page.goto(`${ENARA}/parents`);
    await expect(page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('pp-nav-home')).toContainText('Home');
    await expect(page.getByTestId('pp-nav-messages')).toHaveCount(0); // no school messages: the Messages tab is hidden
    await expect(page.getByTestId('pp-school-home')).toHaveCount(0);
    await expect(enaraApi.get(`/api/parents/school/learners/${student}/timetable`, await page.evaluate(() => localStorage.getItem('enara_token') || ''))).rejects.toThrow(/-> 404/);

    await enaraApi.put('/api/school-app/sections', admin, ALL_ON); // back on for later runs
    await context.close();
  });
});

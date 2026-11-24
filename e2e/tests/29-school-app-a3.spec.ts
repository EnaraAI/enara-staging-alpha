import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { enaraApi, enaraUiSession, login } from '../lib/enara';

// Scenario 29 (docs/lms/PARENTS_SCHOOL_APP_PLAN.md, step a3): the school admin's screens on the staff Parents page.
//   1. School A's admin sees the school app card with the section switches.
//   2. Downloads the Excel timetable template (built from the school's classes), uploads it unchanged: the preview shows
//      2 new rows and none rejected; import, then undo from the import log.
//   3. Uploads an attendance CSV with one bad row: the row and its reason are listed; the good row is imported.
//   4. Writes an announcement on the screen, sees it in the list, and withdraws it.
const RUN = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test.describe.serial('29 · Parents school app (a3): school admin screens', () => {
  test('sections, Excel template → preview → import → undo, CSV with a bad row, announcement compose and withdraw', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { timetable: true, announcements: true, attendance: true, notifications: true });
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students)[0].id;

    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const card = page.getByTestId('school-app-admin');
    await expect(card).toBeVisible({ timeout: 30_000 });
    for (const s of ['timetable', 'attendance', 'announcements', 'notifications']) await expect(page.getByTestId(`sa-section-${s}`)).toBeChecked();

    // Excel template, uploaded as it is.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sa-template-timetable').click()]);
    expect(dl.suggestedFilename()).toBe('timetable.xlsx');
    const path = await dl.path();
    await page.getByTestId('sa-file-timetable').setInputFiles({ name: 'timetable.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(path!) });
    const pv = page.getByTestId('sa-preview-timetable');
    await expect(pv).toBeVisible({ timeout: 30_000 });
    await expect(pv.getByTestId('sa-count-total')).toContainText('2');
    await expect(pv.getByTestId('sa-count-rejected')).toContainText('0');
    await page.getByTestId('sa-confirm-timetable').click();
    await expect(page.getByTestId('sa-msg-timetable')).toHaveText('Imported.');
    const row = page.locator('[data-testid="sa-log-row"][data-section="timetable"]').first();
    await expect(row).toHaveAttribute('data-status', 'confirmed');
    await row.getByTestId('sa-undo').click();
    await expect(page.locator('[data-testid="sa-log-row"][data-section="timetable"]').first()).toHaveAttribute('data-status', 'undone');

    // Attendance CSV with one bad row.
    const csv = `Date,Student ID,Status,Note\n${today},${student},late,bus ${RUN}\n${today},NO-SUCH-STUDENT,absent,\n`;
    await page.getByTestId('sa-file-attendance').setInputFiles({ name: 'attendance.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const pa = page.getByTestId('sa-preview-attendance');
    await expect(pa).toBeVisible({ timeout: 30_000 });
    await expect(pa.getByTestId('sa-count-rejected')).toContainText('1');
    await expect(pa.getByTestId('sa-problem')).toHaveCount(1);
    await expect(pa.getByTestId('sa-problem')).toContainText('3');
    await page.getByTestId('sa-confirm-attendance').click();
    await expect(page.getByTestId('sa-msg-attendance')).toHaveText('Imported.');
    await expect(page.locator('[data-testid="sa-log-row"][data-section="attendance"]').first()).toHaveAttribute('data-status', 'confirmed');

    // Announcement written on the screen, then withdrawn.
    const title = `Trip ${RUN}`;
    await page.getByTestId('sa-ann-title').fill(title);
    await page.getByTestId('sa-ann-body').fill('Bring a packed lunch.');
    await page.getByTestId('sa-ann-publish').click();
    await expect(page.getByTestId('sa-ann-msg')).toHaveText('Published.');
    const ann = page.getByTestId('sa-ann-row').filter({ hasText: title });
    await expect(ann).toBeVisible();
    await ann.getByTestId('sa-ann-withdraw').click();
    await expect(page.getByTestId('sa-ann-row').filter({ hasText: title })).toContainText('Withdrawn');
    const list = await enaraApi.get('/api/school-app/announcements', admin);
    expect(list.announcements.find((a: { title: string }) => a.title === title)?.withdrawn).toBe(true);

    await context.close();
  });
});

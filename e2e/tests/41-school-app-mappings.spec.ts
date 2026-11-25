import { test, expect } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { shot } from '../lib/state';

// Scenario 41: saved column mappings for imports. A school's own export uses its own column names:
//   1. API: the preview asks to match the columns (askMapping), the admin's choice previews, confirm saves it for the school,
//      the next file with the same names imports without asking; forgetting removes it.
//   2. Admin page: an attendance file with unknown names shows "Match your columns"; choosing them previews; after import the
//      card says the names are remembered.
const RUN = Date.now();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');

test.describe.serial('41 · Parents school app: saved column mappings', () => {
  test('API: match once, remembered for the next file, forget', async () => {
    const admin = await login('admin.a');
    await enaraApi.put('/api/school-app/sections', admin, { timetable: true, announcements: true, attendance: true, notifications: true });
    await enaraApi.delete('/api/school-app/imports/mappings/attendance', admin);
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students)[0].id;
    const file = csv([['Yom', 'Code talib', 'Status', `Extra ${RUN}`], [today, student, 'present', 'x']]);

    // Without askMapping: the old error stays for API callers.
    const err = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: file }, [400]);
    expect(err.code ?? err.error?.code ?? JSON.stringify(err)).toContain('MISSING_COLUMNS');

    const ask = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: file, askMapping: true });
    expect(ask.needsMapping).toBe(true);
    expect(ask.headers).toEqual(['Yom', 'Code talib', 'Status', `Extra ${RUN}`]);
    expect(ask.missing.sort()).toEqual(['date', 'student']);

    const bad = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: file, mapping: { Yom: 'not_a_column' } }, [400]);
    expect(JSON.stringify(bad)).toContain('Unknown column');

    const p = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: file, askMapping: true, mapping: { Yom: 'date', 'Code talib': 'student', [`Extra ${RUN}`]: '' } });
    expect(p.needsMapping).toBeUndefined();
    expect(p.counts.rejected).toBe(0);
    await enaraApi.post(`/api/school-app/imports/${p.importId}/confirm`, admin, {});

    const saved = await enaraApi.get('/api/school-app/imports/mappings', admin);
    const att = (saved.mappings as { section: string; map: Record<string, string> }[]).find((m) => m.section === 'attendance');
    expect(att?.map).toMatchObject({ yom: 'date', 'code talib': 'student', [`extra ${RUN}`]: '' });

    // The next file with the same names: no question.
    const again = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: file, askMapping: true });
    expect(again.needsMapping).toBeUndefined();
    expect(again.counts.total).toBe(1);

    expect((await enaraApi.delete('/api/school-app/imports/mappings/attendance', admin)).cleared).toBe(true);
    const after = await enaraApi.post('/api/school-app/imports/preview', admin, { section: 'attendance', csv: file, askMapping: true });
    expect(after.needsMapping).toBe(true);
  });

  test('admin page: match your columns, preview, import, remembered', async ({ browser }) => {
    const admin = await login('admin.a');
    await enaraApi.delete('/api/school-app/imports/mappings/attendance', admin);
    const roster = await enaraApi.get('/api/school-app/roster', admin);
    const student = (roster.groups as { students: { id: string }[] }[]).flatMap((g) => g.students)[0].id;

    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    await expect(page.getByTestId('school-app-admin')).toBeVisible({ timeout: 30_000 });
    const file = csv([['Yom', 'Code talib', 'Status'], [today, student, 'absent']]);
    await page.getByTestId('sa-file-attendance').setInputFiles({ name: 'our-export.csv', mimeType: 'text/csv', buffer: Buffer.from(file) });
    const match = page.getByTestId('sa-match-attendance');
    await expect(match).toBeVisible({ timeout: 30_000 });
    await expect(match).toContainText('Match your columns');
    await expect(page.getByTestId('sa-match-preview-attendance')).toBeDisabled();
    await match.getByTestId('sa-match-col-0').selectOption('date');
    await match.getByTestId('sa-match-col-1').selectOption('student');
    await match.scrollIntoViewIfNeeded();
    await shot(page, 'school-maps-01-match-columns');
    await page.getByTestId('sa-match-preview-attendance').click();
    const pv = page.getByTestId('sa-preview-attendance');
    await expect(pv).toBeVisible({ timeout: 30_000 });
    await expect(pv.getByTestId('sa-count-rejected')).toContainText('0');
    await page.getByTestId('sa-confirm-attendance').click();
    await expect(page.getByTestId('sa-msg-attendance')).toHaveText('Imported.');
    await expect(page.getByTestId('sa-saved-map-attendance')).toContainText('remembered', { timeout: 30_000 });
    await shot(page, 'school-maps-02-remembered');

    // The same file again goes straight to the preview.
    await page.getByTestId('sa-file-attendance').setInputFiles({ name: 'our-export.csv', mimeType: 'text/csv', buffer: Buffer.from(file) });
    await expect(page.getByTestId('sa-preview-attendance')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('sa-match-attendance')).toHaveCount(0);
    await page.getByTestId('sa-forget-map-attendance').click();
    await expect(page.getByTestId('sa-saved-map-attendance')).toHaveCount(0, { timeout: 30_000 });
    await context.close();
  });
});

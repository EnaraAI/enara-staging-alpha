import { test, expect } from '@playwright/test';
import { enaraUiSession, maintenance } from '../lib/enara';
import { shot } from '../lib/state';

// Scenario 14 (Parents P5, docs/parents/P5_NOTES.md). PARENT_CSV_INVITES_ENABLED on, as on
// lms-test; School A's admin turns "CSV invites" on (off by default per school).
//   - Upload a CSV: two children of the same parent, an unknown student, a duplicate, a bad
//     email and another school's student. The preview marks each row; nothing is sent yet.
//   - Confirm: ONE parent-invite email for that parent (both children, codes in the body
//     only), captured through the safety path (never sent in this stack).
//   - The list: Revoke one, Resend the other (a new email).
const STAMP = Date.now();
const PARENT = `csv.parent.${STAMP}@enara-e2e.app`; // fake; captured, never sent
const CSV = [
  'student_ref,parent_email,parent_name,language',
  `LT-S-A07,${PARENT},Hoda,en`,
  `LT-S-A09,${PARENT.toUpperCase()},,`,
  `LT-S-NOPE,someone.${STAMP}@enara-e2e.app,,`,
  `LT-S-A07,${PARENT},,`,
  'LT-S-A10,not-an-email,,',
  `LT-S-B01,school.b.${STAMP}@enara-e2e.app,,`,
].join('\n');
const CODE_IN_URL = /ENR[-%20+]*[A-Z0-9]{4}[-%20+]*[A-Z0-9]{4}/i;
const csvRows = async () => ((await maintenance('GET', '/parent-emails?limit=500')).emails as any[]);

test.describe.serial('14 · Parents P5: CSV invitations, one email per parent', () => {
  test("School A's admin turns CSV invites on, checks a CSV (preview) and sends: ONE email for the parent of two children", async ({ browser }) => {
    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    const visited: string[] = [];
    page.on('request', (r) => visited.push(r.url()));
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const settings = page.getByTestId('parent-school-settings');
    await settings.getByTestId('ps-csv').check();
    await settings.getByTestId('pc-save').click();
    await expect(page.getByTestId('ps-note')).toHaveText('Saved.');
    await page.reload();
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const box = page.getByTestId('parent-csv-invites');
    await expect(box).toBeVisible();
    await box.getByTestId('pci-file').setInputFiles({ name: 'parents.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await box.getByRole('button', { name: 'Check the file' }).click();
    const rows = box.getByTestId('pci-row');
    await expect(rows).toHaveCount(6);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).toEqual(['ok', 'ok', 'unknown_student', 'duplicate', 'bad_email', 'unknown_student']);
    await expect(box).not.toContainText(PARENT); // addresses are masked
    expect((await csvRows()).filter((e) => e.key.startsWith('csvinvite:'))).toEqual([]); // nothing sent before Confirm
    await shot(page, '14-parents-csv-preview');
    await box.getByTestId('pci-confirm').click();
    await expect(box.getByTestId('pci-note')).toHaveText("2 invitations sent in 1 email. The codes are only in the parents' emails.");
    const sent = (await csvRows()).filter((e) => e.key.startsWith('csvinvite:'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: 'parent-invite-en', status: 'captured' });
    const log = await maintenance('GET', '/lms-emails?template=parent-invite-en');
    expect(log.emails[0]).toMatchObject({ status: 'captured', redirected: true });
    await expect(box.getByTestId('pci-invite')).toHaveCount(2);
    expect(await box.getByTestId('pci-invite').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).toEqual(['sent', 'sent']);
    await shot(page, '14-parents-csv-sent');

    // Revoke one, resend the other (a new code, a new email).
    await box.getByTestId('pci-invite').first().getByRole('button', { name: 'Revoke' }).click();
    await expect(box.getByTestId('pci-note')).toHaveText('Revoked: the code stopped working.');
    await expect(box.locator('[data-testid="pci-invite"][data-status="revoked"]')).toHaveCount(1);
    await box.locator('[data-testid="pci-invite"][data-status="sent"]').getByRole('button', { name: 'Resend' }).click();
    await expect(box.getByTestId('pci-note')).toHaveText('A new code was sent; the old one stopped working.');
    await expect.poll(async () => (await csvRows()).filter((e) => e.key.startsWith('csvresend:')).map((e) => e.status)).toEqual(['captured']);
    expect(visited.filter((u) => CODE_IN_URL.test(u))).toEqual([]);
    await context.close();
  });
});

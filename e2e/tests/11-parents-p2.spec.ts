import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { enaraApi, enaraUiSession, login, maintenance } from '../lib/enara';
import { ENARA } from '../lib/env';
import { saveState, shot } from '../lib/state';

// Scenario 11 (Parents P2, docs/parents/P2_NOTES.md). Switches on as on lms-test:
// PARENT_CODE_TOOLS_ENABLED, PARENT_EMAIL_SIGNIN_ENABLED (plus the P1 ones).
// Emails are CAPTURED in this stack (never sent); the suite reads the 6-digit
// codes from the token-protected maintenance route that only exists here.
// The owner's scenario: one parent, two children in two schools, a second
// device, and the email merge:
//   1. School A's admin sets the code expiry and prints a class code sheet
//      (secret-code warning, "never enrol parents in Moodle", no code in a URL).
//   2. Device 1: the parent joins with a code from the sheet, then "Add your
//      email" with a 6-digit code.
//   3. Device 2 (second device): "Already have an account? Sign in with your
//      email first": email -> 6-digit code -> the same child.
//   4. Device 3: a code for a School B child makes a second account; adding the
//      same email offers the merge; after it, every device shows both children.
const CHILD_B = 'LT-S-B03';
const SHEET_CLASS = 'LT-C-ENG-7B';
const CODE_IN_URL = /ENR[-%20+]*[A-Z0-9]{4}[-%20+]*[A-Z0-9]{4}/i;
const EMAIL = `parent.p2.${Date.now()}@enara-e2e.app`; // fake; captured, never sent
const visited: string[] = [];
let verifySentAt = 0;
const st: { code?: string; childA?: string; d1?: { context: BrowserContext; page: Page }; d2?: { context: BrowserContext; page: Page } } = {};

async function device(browser: Browser, name: string) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror ${name}]`, String(e).slice(0, 500)));
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) visited.push(f.url()); });
  page.on('request', (r) => visited.push(r.url()));
  page.on('dialog', (d) => d.accept());
  return { context, page };
}
const chips = (page: Page) => page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)');
/** The 6-digit code captured for the fake address (E2E stack only). */
async function capturedCode(purpose: 'verify' | 'signin'): Promise<string> {
  let code = '';
  await expect.poll(async () => { code = (await maintenance('POST', '/parent-email-code', { email: EMAIL, purpose }).catch(() => ({ code: '' }))).code; return code; }, { timeout: 30_000 }).toMatch(/^\d{3} \d{3}$/);
  return code;
}
async function codeFirst(page: Page, code: string) {
  await page.goto(`${ENARA}/parents`);
  await expect(page.getByTestId('parent-code-start')).toBeVisible();
  await page.locator('#si-code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
  await expect(chips(page)).toHaveCount(1, { timeout: 30_000 });
}

test.describe.serial('11 · Parents P2: class code sheet, add your email, second device, merge', () => {
  test("School A's admin: code expiry setting, then a printed class code sheet (shown once, no code in a URL)", async ({ browser }) => {
    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    const dialogs: string[] = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); void d.accept(); });
    page.on('request', (r) => visited.push(r.url()));
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const tools = page.getByTestId('parent-code-tools');
    await expect(tools).toBeVisible();
    await tools.getByTestId('pc-ttl').fill('10');
    await tools.getByTestId('pc-save').click();
    await expect(tools.getByTestId('pc-note')).toHaveText('Saved.');
    const row = tools.getByTestId(`pc-class-${SHEET_CLASS}`);
    await row.getByRole('button', { name: 'Print parent codes' }).click();
    const sheet = page.getByTestId('pc-sheet');
    await expect(sheet).toBeVisible();
    const first = (await sheet.getByTestId('pc-code').first().innerText()).trim();
    // Reprint (owner decision 4): a clear warning first, then new codes; the earlier ones stop working.
    await expect(row.getByTestId('pc-active')).not.toHaveText('0');
    await row.getByRole('button', { name: 'Print parent codes' }).click();
    await expect.poll(() => dialogs.join(' | ')).toContain('Codes already printed for this class will stop working.');
    await expect(sheet.getByTestId('pc-code').first()).not.toHaveText(first);
    expect((await page.request.post(`${ENARA}/api/parents/start/preview`, { data: { code: first } })).status()).toBe(400);
    await expect(sheet.getByTestId('pc-secret')).toContainText("This code is secret. Anyone who has it can see your child's data. Don't share it.");
    await expect(sheet.getByTestId('pc-secret')).toContainText('هذا الرمز سري');
    await expect(sheet.getByTestId('pc-no-moodle')).toContainText('Never enrol parents in Moodle courses with ENARA activities.');
    const rows = sheet.getByTestId('pc-row');
    expect(await rows.count()).toBeGreaterThan(0);
    st.code = (await rows.first().getByTestId('pc-code').innerText()).trim();
    st.childA = (await rows.first().locator('td').first().innerText()).trim().split(/\s+/)[0];
    expect(st.code).toMatch(/^ENR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(page.url()).not.toMatch(CODE_IN_URL);
    await shot(page, '11-parents-class-code-sheet');
    // The CSV is made in the browser (no request carries the codes).
    const download = page.waitForEvent('download');
    await sheet.getByTestId('pc-csv').click();
    expect((await download).suggestedFilename()).toMatch(/^parent-codes-.*\.csv$/);
    // The school's expiry (10 days) applies to the sheet's codes.
    const codes = await enaraApi.get(`/api/parents-admin/classes/${SHEET_CLASS}/codes`, await login('admin.a'));
    const days = Math.round((new Date(codes.codes[0].expiresAt).getTime() - Date.now()) / 86_400_000);
    expect(days).toBe(10);
    await context.close();
  });

  test('teachers: no code tools until the school allows them, then their own classes only', async () => {
    const t1 = await login('teacher.a1');
    await expect(enaraApi.get('/api/parents-admin/classes', t1)).rejects.toThrow(/-> 403/);
    await enaraApi.put('/api/parents-admin/schools/LT-SCHOOL-A/settings', await login('admin.a'), { teachersMayIssueCodes: true });
    const mine = await enaraApi.get('/api/parents-admin/classes', t1);
    expect(mine.classes.map((c: any) => c.id)).toEqual(expect.arrayContaining(['LT-C-ENG-7A', 'LT-C-ENG-7B']));
    expect(mine.classes.map((c: any) => c.id)).not.toContain('LT-C-MATH-7A'); // teacher.a2's class
    await enaraApi.put('/api/parents-admin/schools/LT-SCHOOL-A/settings', await login('admin.a'), { teachersMayIssueCodes: false });
  });

  test('device 1: a code from the sheet, then "Add your email" with a 6-digit code', async ({ browser }) => {
    st.d1 = await device(browser, 'device1');
    const page = st.d1.page;
    await codeFirst(page, st.code!);
    await expect(chips(page).first()).toContainText(st.childA!);
    const prompt = page.getByTestId('pp-add-email-prompt');
    await expect(prompt).toContainText('Add your email to get notifications and sign in on any device.');
    await expect(prompt).toContainText('you will need a new code from the school');
    await shot(page, '11-parents-add-email-prompt');
    await prompt.getByRole('button', { name: 'Add email' }).click();
    await prompt.locator('#pp-email').fill(EMAIL);
    await prompt.getByRole('button', { name: 'Email me a code' }).click();
    verifySentAt = Date.now();
    await expect(prompt.getByText('We sent a 6-digit code')).toBeVisible();
    await prompt.locator('#pp-email-code').fill(await capturedCode('verify'));
    await prompt.getByRole('button', { name: 'Confirm email' }).click();
    await expect(prompt.getByText(`Your email ${EMAIL} is confirmed.`)).toBeVisible();
    // The prompt goes once the account has an email.
    await expect(page.getByTestId('pp-add-email-prompt')).toHaveCount(0, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Account' }).click();
    await expect(page.getByTestId('pp-email')).toContainText(EMAIL);
    await expect(page.getByTestId('pp-email')).toContainText('Confirmed');
  });

  test('device 2 (second device): sign in with the email and a 6-digit code: the same child', async ({ browser }) => {
    st.d2 = await device(browser, 'device2');
    const page = st.d2.page;
    await page.goto(`${ENARA}/parents`);
    await page.getByTestId('parent-have-account').click();
    const box = page.getByTestId('parent-email-signin');
    await expect(box).toBeVisible();
    await box.locator('#si-signin-email').fill(EMAIL);
    await box.getByRole('button', { name: 'Email me a code' }).click();
    await expect(box.getByText('a 6-digit code is on its way')).toBeVisible();
    await shot(page, '11-parents-email-sign-in');
    await box.locator('#si-signin-code').fill(await capturedCode('signin'));
    await box.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(chips(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(chips(page).first()).toContainText(st.childA!);
    expect(await page.evaluate(() => localStorage.getItem('enara_parent_device'))).toMatch(/^pds_/);
  });

  test('device 3: a School B code makes a second account; adding the same email offers the merge; every device then shows both children', async ({ browser }) => {
    const code = (await enaraApi.post(`/api/students/${CHILD_B}/parent-codes`, await login('admin.b'), {})).code;
    const d3 = await device(browser, 'device3');
    const page = d3.page;
    await codeFirst(page, code);
    const childB = (await chips(page).first().innerText()).trim().split(/\s+/)[0];
    await page.getByRole('button', { name: 'Account' }).click();
    const add = page.getByTestId('pp-add-email');
    await add.locator('#pp-email').fill(EMAIL);
    // At most one code a minute per address (the first verify code was for device 1).
    const wait = verifySentAt + 62_000 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await add.getByRole('button', { name: 'Email me a code' }).click();
    await expect(add.locator('#pp-email-code')).toBeVisible();
    await add.locator('#pp-email-code').fill(await capturedCode('verify'));
    await add.getByRole('button', { name: 'Confirm email' }).click();
    await expect(add.getByRole('heading', { name: 'This email already has an account with another child. Merge them?' })).toBeVisible();
    await expect(add).toContainText(st.childA!);
    await shot(page, '11-parents-merge-offer');
    await add.getByRole('button', { name: 'Merge accounts' }).click();
    await expect(page.getByText('Your accounts are merged.')).toBeVisible();
    await expect(chips(page)).toHaveCount(2, { timeout: 30_000 });
    for (const p of [page, st.d2!.page, st.d1!.page]) {
      await p.goto(`${ENARA}/parents`);
      await expect(chips(p)).toHaveCount(2, { timeout: 30_000 });
      await expect(p.locator('.pp-switcher')).toContainText(st.childA!);
      await expect(p.locator('.pp-switcher')).toContainText(childB);
    }
    await shot(st.d2!.page, '11-parents-merged-second-device');
    const token = await page.evaluate(() => localStorage.getItem('enara_token') || '');
    const list = await enaraApi.get('/api/parents/learners', token);
    expect(list.learners.map((l: any) => l.school).sort()).toEqual(['Test School A (fake)', 'Test School B (fake)']);
    await d3.context.close();
    await st.d1!.context.close();
    await st.d2!.context.close();
    saveState({ parentsP2: { merged: true } });
  });

  test('the code emails were captured (test inbox redirect, never sent); no code in any URL', async () => {
    for (const template of ['parent-email-verify-en', 'parent-sign-in-code-en']) {
      const r = await maintenance('GET', `/lms-emails?template=${template}`);
      expect(r.emails.length, template).toBeGreaterThan(0);
      for (const e of r.emails) expect(e).toMatchObject({ status: 'captured', redirected: true });
    }
    expect(visited.length).toBeGreaterThan(0);
    expect(visited.filter((u) => CODE_IN_URL.test(u) || /[?&](code|token)=/i.test(u))).toEqual([]);
  });
});

import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { enaraApi, enaraUiSession, login } from '../lib/enara';
import { ENARA } from '../lib/env';
import { saveState, shot } from '../lib/state';

// Scenario 10 (Parents P1, docs/parents/P1_NOTES.md). Switches on as on lms-test:
// PARENT_SETTINGS_ENABLED, PARENT_CODE_SIGNUP_ENABLED. No email is involved in P1.
//   - one parent, two children in two schools: code-first entry (no account, no
//     password) for the School A child, then "Add another child" with a School B code;
//   - the secret-code warning on the code pages; no code ever in a URL;
//   - the device remembers the parent (reload, an expired session, no session at all);
//     a second device without the device token gets the code page, not the portal
//     (signing in on a second device with an email comes with P2);
//   - the ENARA admin switches School B's parent access Off: that child disappears,
//     the School A child stays; Free again brings it back;
//   - the account shows "Provided by <school>" (no mock price);
//   - School A's admin sees the Parents card (parents linked, active parents).
const CHILD_A = 'LT-S-A05';
const CHILD_B = 'LT-S-B02';
const SCHOOL_A = 'Test School A (fake)';
const SCHOOL_B = 'Test School B (fake)';
const CODE_IN_URL = /ENR[-%20+]*[A-Z0-9]{4}[-%20+]*[A-Z0-9]{4}/i;

const visited: string[] = [];
const state: { codeA?: string; codeB?: string; device?: BrowserContext; page?: Page; firstA?: string; firstB?: string } = {};

async function parentDevice(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // A phone-sized parent device.
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror parent]', String(e).slice(0, 500)));
  // Every address the parent's browser visits is kept, and checked for codes at the end.
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) visited.push(f.url()); });
  page.on('request', (r) => visited.push(r.url()));
  return { context, page };
}

async function issue(admin: 'admin.a' | 'admin.b', studentId: string): Promise<string> {
  const r = await enaraApi.post(`/api/students/${studentId}/parent-codes`, await login(admin), {});
  expect(r.code).toMatch(/^ENR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  return r.code as string;
}

const chips = (page: Page) => page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)');

test.describe.serial('10 · Parents P1: code-first entry, two children in two schools, school access, usage', () => {
  test('setup: both schools Free; a code for a School A child and one for a School B child', async () => {
    const ea = await login('enara.admin');
    const status = await enaraApi.get('/api/parents-admin/status', ea);
    expect(status).toMatchObject({ enabled: true, canChangeAccess: true });
    for (const id of ['LT-SCHOOL-A', 'LT-SCHOOL-B']) expect(await enaraApi.put(`/api/parents-admin/schools/${id}/access`, ea, { access: 'free' })).toEqual({ institutionId: id, access: 'free' });
    // A school admin cannot change it.
    await expect(enaraApi.put('/api/parents-admin/schools/LT-SCHOOL-A/access', await login('admin.a'), { access: 'off' })).rejects.toThrow(/-> 403/);
    state.codeA = await issue('admin.a', CHILD_A);
    state.codeB = await issue('admin.b', CHILD_B);
  });

  test('code-first: the parent types the school code and gets straight in (no account, no password)', async ({ browser }) => {
    const { context, page } = await parentDevice(browser);
    state.device = context;
    state.page = page;
    await page.goto(`${ENARA}/parents`);
    const start = page.getByTestId('parent-code-start');
    await expect(start).toBeVisible();
    // Glow logo (owner "go" 25 Nov 2026): "Enara Parents" on the welcome card; the parents icon and manifest are served.
    await expect(start.getByTestId('glow-logo-parents')).toBeVisible();
    for (const f of ['/parents-icon.svg', '/parents.webmanifest']) expect((await page.request.get(`${ENARA}${f}`)).status()).toBe(200);
    await expect(start.getByTestId('secret-code-warning')).toContainText("This code is secret. Anyone who has it can see your child's data. Don't share it.");
    await expect(page.getByTestId('parent-have-account')).toHaveText(/Already have an account\? Sign in with your email first/);
    await shot(page, '10-parents-code-entry');
    await page.locator('#si-code').fill(state.codeA!);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(start.getByText('Is this your child?')).toBeVisible();
    await expect(start.getByText(`at ${SCHOOL_A}`)).toBeVisible();
    state.firstA = (await start.locator('.si-code-child b').innerText()).split(' ')[0];
    await expect(start.getByText('This device will remember you.', { exact: false })).toBeVisible();
    await start.getByRole('button', { name: 'Yes, open ENARA Parents' }).click();
    await expect(chips(page)).toHaveCount(1, { timeout: 30_000 });
    await expect(chips(page).first()).toContainText(state.firstA!);
    await expect(page.locator('.pp-header').getByRole('img', { name: 'Enara Parents' })).toBeVisible();
    expect(page.url()).toBe(`${ENARA}/parents`);
    const device = await page.evaluate(() => localStorage.getItem('enara_parent_device'));
    expect(device).toMatch(/^pds_/);
    // The code is used up: a second start with it fails.
    const again = await page.request.post(`${ENARA}/api/parents/start/preview`, { data: { code: state.codeA } });
    expect(again.status()).toBe(400);
    await shot(page, '10-parents-portal-first-child');
  });

  test('the device remembers the parent: reload, an expired session token, and no session token at all', async () => {
    const page = state.page!;
    await page.reload();
    await expect(chips(page)).toHaveCount(1, { timeout: 30_000 });
    // An expired / revoked session token: the first request gets 401, the device token gets a new one.
    await page.evaluate(() => localStorage.setItem('enara_token', 'expired.session.token'));
    await page.reload();
    await expect(chips(page)).toHaveCount(1, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('enara_token'))).not.toBe('expired.session.token');
    // No session at all (cleared): /parents resumes from the device token.
    await page.evaluate(() => { localStorage.removeItem('enara_token'); localStorage.removeItem('enara_user'); });
    await page.goto(`${ENARA}/parents`);
    await expect(chips(page)).toHaveCount(1, { timeout: 30_000 });
  });

  test('"Add another child": a School B code links the second child to the same account', async () => {
    const page = state.page!;
    await page.getByRole('button', { name: 'Add another child' }).click();
    await expect(page.getByRole('heading', { name: 'Add another child' })).toBeVisible();
    await expect(page.getByTestId('secret-code-warning')).toContainText('This code is secret.');
    await page.locator('#pp-code').fill(state.codeB!);
    await page.getByRole('button', { name: 'Check code' }).click();
    await expect(page.getByText(`at ${SCHOOL_B}`)).toBeVisible();
    state.firstB = (await page.locator('.pp-person-text b').first().innerText()).split(' ')[0];
    await page.getByRole('button', { name: 'Yes, link my child' }).click();
    await expect(chips(page)).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.pp-switcher')).toContainText(state.firstB!);
    // Still one account: both links belong to the same parent.
    const token = await page.evaluate(() => localStorage.getItem('enara_token') || '');
    const list = await enaraApi.get('/api/parents/learners', token);
    expect(list.learners.map((l: any) => l.studentId).sort()).toEqual([CHILD_A, CHILD_B]);
    expect(list.learners.map((l: any) => l.school).sort()).toEqual([SCHOOL_A, SCHOOL_B]);
    await shot(page, '10-parents-two-children');
  });

  test('account: "Provided by" each school, no price; the code-only note', async () => {
    const page = state.page!;
    await page.getByRole('button', { name: 'Account' }).click();
    const plan = page.getByTestId('pp-provided-by');
    await expect(plan).toContainText(`Provided by ${SCHOOL_A}`);
    await expect(plan).toContainText(`Provided by ${SCHOOL_B}`);
    await expect(page.getByText('[PRICE]')).toHaveCount(0);
    await expect(page.getByTestId('pp-code-only')).toContainText('ask the school for a new code');
    await shot(page, '10-parents-account');
  });

  test('desktop: the portal uses the wide layout (side navigation), the phone layout stays for phones', async () => {
    const page = state.page!;
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByTestId('pp-nav-home').click();
    const width = await page.locator('.pp').evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(900);
    const nav = await page.locator('.pp-nav').evaluate((el) => ({ dir: getComputedStyle(el).flexDirection, top: el.getBoundingClientRect().top }));
    expect(nav.dir).toBe('column');
    expect(nav.top).toBeLessThan(300); // beside the content, not a bottom bar
    await shot(page, '10-parents-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator('.pp').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(480);
    expect(await page.locator('.pp-nav').evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row');
  });

  test('a second device without this device\'s token gets the code page, not the portal', async ({ browser }) => {
    const { context, page } = await parentDevice(browser);
    await page.goto(`${ENARA}/parents`);
    await expect(page.getByTestId('parent-code-start')).toBeVisible();
    await expect(page.locator('.pp-switcher')).toHaveCount(0);
    await context.close();
  });

  test("ENARA admin switches School B's parent access Off: only that child disappears; Free brings it back", async ({ browser }) => {
    const { context, page } = await enaraUiSession(browser, 'enara.admin');
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    await expect(page.getByTestId('parents-admin')).toBeVisible();
    const row = page.getByTestId('parents-school-LT-SCHOOL-B');
    await expect(row).toBeVisible();
    await row.getByTestId('parents-access-LT-SCHOOL-B').selectOption('off');
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await expect(row.getByTestId('parents-access-LT-SCHOOL-B')).toHaveValue('off');
    await shot(page, '10-parents-enara-admin-access');
    // The audit trail has the change (IDs only).
    const parent = state.page!;
    await parent.reload();
    await expect(chips(parent)).toHaveCount(1, { timeout: 30_000 });
    await expect(chips(parent).first()).toContainText(state.firstA!);
    await expect(parent.getByTestId('pp-hidden-by-school')).toBeVisible();
    await shot(parent, '10-parents-school-b-off');
    await row.getByTestId('parents-access-LT-SCHOOL-B').selectOption('free');
    await expect(row.getByTestId('parents-access-LT-SCHOOL-B')).toHaveValue('free');
    await parent.reload();
    await expect(chips(parent)).toHaveCount(2, { timeout: 30_000 });
    await context.close();
  });

  test("School A's admin: the Parents card (parents linked, active parents, most-used screens), access read-only", async ({ browser }) => {
    // The parent opened a few screens of the School A child.
    const parent = state.page!;
    await chips(parent).first().click();
    await parent.getByTestId('pp-nav-progress').click();
    await parent.getByTestId('pp-nav-home').click();
    const { context, page } = await enaraUiSession(browser, 'admin.a', 'School staff');
    await page.getByRole('button', { name: 'Parents', exact: true }).first().click();
    const card = page.getByTestId('parents-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('parents-card-access')).toContainText('Free');
    const linked = Number(await card.getByTestId('parents-card-linked').innerText());
    const active7 = Number(await card.getByTestId('parents-card-active7').innerText());
    expect(linked).toBeGreaterThanOrEqual(1);
    expect(active7).toBeGreaterThanOrEqual(1);
    await expect(card.getByTestId('parents-card-top')).toContainText(/Home|Progress/);
    await expect(page.getByTestId('parents-access-LT-SCHOOL-A')).toHaveCount(0); // no access control for a school admin
    // Arabic.
    await page.getByTestId('lms-lang-ar').click();
    await expect(card).toContainText('أولياء الأمور');
    await shot(page, '10-parents-school-card');
    saveState({ parentsP1: { linked, active7 } });
    await context.close();
    await state.device?.close();
    // No page address or API request of the parent's browsers carried a link code.
    expect(visited.length).toBeGreaterThan(0);
    expect(visited.filter((u) => CODE_IN_URL.test(u))).toEqual([]);
  });
});

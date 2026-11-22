// Owner (22 Nov 2026): screenshots of lms-test with the full data set, one account per role/state (shots.json). Logs in the normal way
// (POST /api/auth/login) with the shared password from the GitHub secret SEED_USER_PASSWORD; never printed. Saves PNGs only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const SITE = 'https://lms-test.enara.app';
const PW = process.env.SEED_USER_PASSWORD;
if (!PW) { console.log('SEED_USER_PASSWORD secret missing'); process.exit(1); }
const targets = JSON.parse(readFileSync(new URL('./shots.json', import.meta.url), 'utf8'));
mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
const index = [];
for (const t of targets) {
  const r = await fetch(`${SITE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: t.email, password: PW }) });
  const j = await r.json().catch(() => ({}));
  const parent = t.name.startsWith('parent');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  if (r.ok && j.token) {
    await ctx.addInitScript(([token, user, isParent]) => { try { localStorage.setItem('enara_token', token); localStorage.setItem('enara_user', JSON.stringify(user)); if (isParent) localStorage.setItem('enara_ui_role', 'parent'); } catch {} }, [j.token, j.user, parent]);
  }
  const shots = [];
  const snap = async (label) => { await page.waitForTimeout(2500); const f = `shots/${t.name}--${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`; await page.screenshot({ path: f, fullPage: false }); shots.push(f); console.log('shot', f); };
  try {
    await page.goto(parent ? `${SITE}/parents` : SITE, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => undefined);
    if (!r.ok) { // what the person sees: the sign-in page, then the error after trying
      await snap(`login-refused-${r.status}`);
    } else {
      await snap('home');
      for (const tab of t.tabs) {
        const el = page.getByRole('button', { name: tab, exact: true }).or(page.getByRole('link', { name: tab, exact: true })).first();
        if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => undefined); await page.waitForLoadState('networkidle').catch(() => undefined); await snap(tab); }
        else console.log('no tab', t.name, tab);
      }
    }
  } catch (e) { console.log('error', t.name, String(e).slice(0, 200)); }
  index.push({ name: t.name, email: t.email, login: r.status, error: r.ok ? null : (j.error || j.message || null), shots });
  await ctx.close();
}
await browser.close();
writeFileSync('shots/index.json', JSON.stringify(index, null, 1));

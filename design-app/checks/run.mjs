// Playwright checks for design.enara.app, per role: sign in with the seed accounts, open every screen of the role's area,
// in English and Arabic, on phone and desktop. The page is served from this build at https://design.enara.app (requests
// to that host are answered from dist/), so the browser origin is exactly design.enara.app and every API call goes to the
// real lms-test API with real CORS. The deployed copy is the same build (checked separately). Never test.enara.app.
// Env: SEED_USER_PASSWORD (GitHub secret; never printed). Output: one line per screen + checks/out/summary.json + screenshots.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const DIST = new URL('../dist/', import.meta.url).pathname, OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PW = process.env.SEED_USER_PASSWORD;
if (!PW) { console.log('SEED_USER_PASSWORD missing'); process.exit(1); }
const ORIGIN = 'https://design.enara.app';
const ACCOUNTS = [
  { role: 'student', email: 'menna.osman@school.enara.app', home: '/student', screens: ['/student', '/student/chat', '/student/avatar', '/student/assignment', '/student/results'] },
  { role: 'kids', email: 'khaled.nasser@school.enara.app', home: '/kids', screens: ['/kids', '/kids/lesson', '/kids/chat', '/kids/reward'] },
  { role: 'parent', email: 'ghada.kim@school.enara.app', home: '/parent', screens: ['/parent', '/parent/progress', '/parent/fees', '/parent/bus', '/parent/attendance', '/parent/chat'] },
  { role: 'parent (Arabic school)', email: 'kareem.helmy@school.enara.app', home: '/parent', screens: ['/parent'] },
  { role: 'teacher', email: 'shahd.morsy@school.enara.app', home: '/teacher', screens: ['/teacher', '/teacher/grading', '/teacher/builder', '/teacher/errors'] },
  { role: 'school admin', email: 'ahmed.anwar@school.enara.app', home: '/school', screens: ['/school', '/school/imports', '/school/announcements', '/school/requests', '/school/sections'] },
  { role: 'platform admin', email: 'mariam.shawky@school.enara.app', home: '/platform', screens: ['/platform', '/platform/usage', '/platform/models'] },
];
const only = (process.env.ONLY_ROLES || '').split(',').map((s) => s.trim()).filter(Boolean);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const VIEWS = [{ name: 'phone', viewport: { width: 390, height: 844 } }, { name: 'desktop', viewport: { width: 1280, height: 800 } }];
const results = [];
const browser = await chromium.launch();
for (const acc of ACCOUNTS.filter((a) => !only.length || only.includes(a.role))) {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: view.viewport, deviceScaleFactor: 1 });
    await ctx.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = join(DIST, path === '/' ? 'index.html' : path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, body: readFileSync(file), headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    const apiFail = []; page.on('response', (r) => { if (r.url().startsWith('https://lms-test.enara.app/api/') && r.status() >= 400) apiFail.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('requestfailed', (r) => { if (r.url().startsWith('https://lms-test.enara.app/')) apiFail.push(`failed ${new URL(r.url()).pathname} ${r.failure()?.errorText}`); });
    // Sign in (English), then every screen in English and Arabic.
    await page.goto(`${ORIGIN}/#/login?lang=en`);
    await page.getByLabel('Email').fill(acc.email);
    await page.getByLabel('Password').fill(PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    let signedIn = true;
    try { await page.waitForURL((u) => u.hash.startsWith(`#${acc.home}`), { timeout: 20_000 }); } catch { signedIn = false; }
    if (!signedIn) {
      const alert = await page.locator('[role=alert]').first().textContent().catch(() => null);
      results.push({ role: acc.role, view: view.name, screen: 'login', ok: false, note: `sign-in failed: ${alert ?? page.url()}`, apiFail: [...apiFail] });
      await page.screenshot({ path: `${OUT}${acc.role.replace(/\W+/g, '_')}--login--${view.name}.png` });
      await ctx.close(); continue;
    }
    for (const lang of ['en', 'ar']) {
      for (const s of acc.screens) {
        const before = errors.length, beforeApi = apiFail.length;
        await page.goto(`${ORIGIN}/#${s}?lang=${lang}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(400);
        const where = new URL(page.url()).hash.split('?')[0].slice(1);
        const sample = await page.getByTestId('sample-ribbon').count();
        const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        const file = `${acc.role.replace(/\W+/g, '_')}--${s.replace(/\//g, '_')}--${lang}--${view.name}.png`;
        await page.screenshot({ path: OUT + file, fullPage: false });
        const r = { role: acc.role, view: view.name, lang, screen: s, landed: where, wired: sample === 0, overflowX, pageErrors: errors.slice(before), apiFail: apiFail.slice(beforeApi), file };
        r.ok = where === s && r.pageErrors.length === 0 && r.apiFail.length === 0 && !overflowX;
        results.push(r);
      }
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(OUT + 'summary.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.role.padEnd(22)} ${r.view.padEnd(7)} ${(r.lang ?? '').padEnd(2)} ${r.screen.padEnd(22)} ${r.wired === undefined ? '' : r.wired ? 'wired ' : 'sample'} ${r.note ?? ''}${r.apiFail?.length ? ' api:' + r.apiFail.join(',') : ''}${r.pageErrors?.length ? ' errors:' + r.pageErrors.join(' | ') : ''}${r.overflowX ? ' overflow-x' : ''}`);
const bad = results.filter((r) => !r.ok).length;
console.log(`SUMMARY screens ${results.length}, ok ${results.length - bad}, failed ${bad}, wired ${results.filter((r) => r.wired).length}`);
process.exit(0);

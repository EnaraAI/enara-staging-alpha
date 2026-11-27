// Playwright checks for design.enara.app, per role: sign in with the seed accounts, open every screen of the role's area,
// in English and Arabic, on phone and desktop. The page is served from this build at https://design.enara.app (requests
// to that host are answered from dist/), so the browser origin is exactly design.enara.app and every API call goes to the
// real lms-test API with real CORS. The deployed copy is the same build (checked separately). Never test.enara.app.
// Requests to design.enara.app go through worker/index.js (its CSP and redirects), as on the deployed site.
// The kids account opens the lms-test kids app (#/kids, a copy of lms-test's own) and is compared with lms-test itself:
// the same screens on both, side by side (kidscompare--<screen>--<lang>--<device>--design.png / --lmstest.png).
// Env: SEED_USER_PASSWORD (GitHub secret; never printed). Output: one line per screen + checks/out/summary.json + screenshots.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const worker = (await import('../worker/index.js')).default;
const DIST = new URL('../dist/', import.meta.url).pathname, OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PW = process.env.SEED_USER_PASSWORD;
if (!PW) { console.log('SEED_USER_PASSWORD missing'); process.exit(1); }
const ORIGIN = 'https://design.enara.app';
const ACCOUNTS = [
  { role: 'student', email: 'menna.osman@school.enara.app', home: '/student', screens: ['/student', '/student/chat', '/student/avatar', '/student/assignment', '/student/results'] },
  { role: 'parent', email: 'ghada.kim@school.enara.app', home: '/parent', screens: ['/parent', '/parent/progress', '/parent/fees', '/parent/bus', '/parent/attendance', '/parent/chat'] },
  { role: 'parent (Arabic school)', email: 'kareem.helmy@school.enara.app', home: '/parent', screens: ['/parent'] },
  { role: 'teacher', email: 'shahd.morsy@school.enara.app', home: '/teacher', screens: ['/teacher', '/teacher/grading', '/teacher/builder', '/teacher/errors'] },
  { role: 'school admin', email: 'ahmed.anwar@school.enara.app', home: '/school', screens: ['/school', '/school/imports', '/school/announcements', '/school/requests', '/school/sections'] },
  { role: 'platform admin', email: 'mariam.shawky@school.enara.app', home: '/platform', screens: ['/platform', '/platform/usage', '/platform/models'] },
];
const only = (process.env.ONLY_ROLES || '').split(',').map((s) => s.trim()).filter(Boolean);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const KIDS = { email: 'khaled.nasser@school.enara.app', lmsTest: 'https://lms-test.enara.app' };
const VIEWS = [{ name: 'phone', viewport: { width: 390, height: 844 } }, { name: 'desktop', viewport: { width: 1280, height: 800 } }];
// design.enara.app from dist/, through the worker (CSP header, lms-test redirects), as Cloudflare serves it.
const ASSETS = { async fetch(req) {
  const path = new URL(req.url).pathname;
  const file = join(DIST, path === '/' ? 'index.html' : decodeURIComponent(path));
  if (!existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file), { status: 200, headers: { 'content-type': TYPES[extname(file)] || 'application/octet-stream' } });
} };
async function serveDesign(route) {
  const res = await worker.fetch(new Request(route.request().url(), { method: route.request().method() }), { ASSETS });
  return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
}
const results = [];
const browser = await chromium.launch();
for (const acc of ACCOUNTS.filter((a) => !only.length || only.includes(a.role))) {
  for (const view of VIEWS) {
    const ctx = await browser.newContext({ viewport: view.viewport, deviceScaleFactor: 1 });
    await ctx.route(`${ORIGIN}/**`, serveDesign);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    const apiFail = []; page.on('response', (r) => { if (r.url().startsWith('https://lms-test.enara.app/api/') && r.status() >= 400) apiFail.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('requestfailed', (r) => { if (r.url().startsWith('https://lms-test.enara.app/') && !/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) apiFail.push(`failed ${new URL(r.url()).pathname} ${r.failure()?.errorText}`); });
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
        await page.waitForTimeout(600); await page.screenshot({ path: OUT + file, fullPage: false });
        const r = { role: acc.role, view: view.name, lang, screen: s, landed: where, wired: sample === 0, overflowX, pageErrors: errors.slice(before), apiFail: apiFail.slice(beforeApi), file };
        r.ok = where === s && r.pageErrors.length === 0 && r.apiFail.length === 0 && !overflowX;
        results.push(r);
      }
    }
    await ctx.close();
  }
}
// Kids: the copied kids app on design.enara.app and lms-test's own, the same screens, phone and desktop, English and Arabic.
// Nothing paid is started: avatar/live-call, tutor-message and speech requests are blocked outright (and would fail the run).
const TAB_KEYS = { 'Home': 'home', 'الرئيسية': 'home', 'My learning': 'learning', 'دروسي': 'learning', 'My skills': 'skills', 'مهاراتي': 'skills',
  'Homework': 'homework', 'واجباتي': 'homework', 'My plan': 'plan', 'خطتي': 'plan', 'Quizzes': 'quizzes', 'اختباراتي': 'quizzes', 'My results': 'results', 'نتائجي': 'results' };
const PAID = /\/api\/(avatar|tutor\/live|me\/tutor\/sessions\/[^/]+\/messages|speaking|tts|stt)|anam\.ai|elevenlabs\.io|rt\.enara\.app/;
async function kidsSide(side, view) {
  const ctx = await browser.newContext({ viewport: view.viewport, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', locale: 'en-US' });
  if (side === 'design') await ctx.route(`${ORIGIN}/**`, serveDesign);
  await ctx.route(PAID, (route) => (route.request().method() === 'GET' && !/anam|elevenlabs|rt\.enara/.test(route.request().url()) ? route.continue() : route.abort('blockedbyclient')));
  const page = await ctx.newPage();
  const errors = [], apiFail = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  // Requests the check itself blocks (paid calls, the relay health probe) are not failures.
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.url().startsWith(`${KIDS.lmsTest}/api/`) && r.status() >= 400) apiFail.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('requestfailed', (r) => { if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(r.failure()?.errorText ?? '')) apiFail.push(`failed ${r.url().slice(0, 80)} ${r.failure()?.errorText}`); });
  const role = side === 'design' ? 'kids' : 'kids (lms-test)';
  // Sign in through each site's own login page; one retry, because lms-test is slow to wake.
  const signIn = async () => {
    if (side === 'design') {
      await page.goto(`${ORIGIN}/#/login?lang=en`);
      await page.getByLabel('Email').fill(KIDS.email); await page.getByLabel('Password').fill(PW);
      await page.getByRole('button', { name: 'Sign in' }).click();
    } else {
      await page.goto(`${KIDS.lmsTest}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.locator('#si-email').fill(KIDS.email); await page.locator('#si-pass').fill(PW);
      await page.locator('button.si-submit').click();
    }
    return page.locator('.ek-root nav.ek-rail').waitFor({ timeout: 45_000 }).then(() => true, () => false);
  };
  let opened = await signIn();
  if (!opened) { errors.splice(0); apiFail.splice(0); opened = await signIn(); }
  try { if (!opened) throw new Error('not opened'); } catch {
    results.push({ role, view: view.name, screen: 'login', ok: side !== 'design', reference: side !== 'design', refOk: false, note: `kids app did not open: ${page.url()}`, pageErrors: errors.splice(0), apiFail: apiFail.splice(0) });
    await page.screenshot({ path: `${OUT}kidscompare--login--en--${view.name}--${side === 'design' ? 'design' : 'lmstest'}.png` });
    return ctx.close();
  }
  const settle = async () => {
    await page.locator('.ek-state--loading').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
    await page.waitForTimeout(600);
  };
  const shot = async (screen, lang) => {
    const file = `kidscompare--${screen}--${lang}--${view.name}--${side === 'design' ? 'design' : 'lmstest'}.png`;
    await page.screenshot({ path: OUT + file });
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const r = { role, view: view.name, lang, screen: `kids:${screen}`, landed: side === 'design' ? new URL(page.url()).hash.split('?')[0].slice(1) : '', wired: side === 'design' ? true : undefined, overflowX, pageErrors: errors.splice(0), apiFail: apiFail.splice(0), file };
    r.ok = r.pageErrors.length === 0 && r.apiFail.length === 0 && (side !== 'design' || r.landed === '/kids');
    // lms-test.enara.app is the reference picture only: its own errors are listed, never counted as design-app failures.
    if (side !== 'design') { r.reference = true; r.refOk = r.ok; r.ok = true; }
    results.push(r);
  };
  for (const lang of ['en', 'ar']) {
    await page.evaluate((l) => localStorage.setItem('enara_kids_lang', l), lang);
    await page.reload();
    const railOk = await page.locator('.ek-root nav.ek-rail').waitFor({ timeout: 30_000 }).then(() => true, () => false);
    const tabs = page.locator('nav.ek-rail .ek-tab:not(.ek-tab--quiet)');
    if (!railOk || !(await tabs.count())) {
      await page.screenshot({ path: `${OUT}kidscompare--norail--${lang}--${view.name}--${side === 'design' ? 'design' : 'lmstest'}.png` });
      results.push({ role, view: view.name, lang, screen: 'kids:tabs', ok: side !== 'design', reference: side !== 'design', refOk: false, note: `no kids tabs after reload (${side}): ${page.url()}`, pageErrors: errors.splice(0), apiFail: apiFail.splice(0) });
      continue;
    }
    for (let i = 0; i < await tabs.count(); i++) {
      const label = (await tabs.nth(i).innerText()).trim();
      await tabs.nth(i).click(); await settle();
      await shot(TAB_KEYS[label] ?? `tab${i + 1}`, lang);
    }
    // The tutor drawer (text chat; nothing is sent, and the live call button is never pressed).
    await tabs.first().click({ timeout: 10_000 }).catch(() => {}); await settle();
    const ask = page.locator('.ek-app__tutor').first();
    if (await ask.count()) {
      await ask.click(); await page.locator('.ek-drawer__panel').waitFor({ timeout: 10_000 }).catch(() => {}); await settle();
      await shot('tutor', lang); // the next language reloads the page, which closes the drawer
    }
  }
  await ctx.close();
}
if (!only.length || only.includes('kids')) {
  // One side failing (or lms-test being slow) never stops the run: it is recorded as a failure with a screenshot.
  const safe = (side, view) => kidsSide(side, view).catch((e) => { results.push({ role: 'kids (compare)', view: view.name, screen: `kids:${side}`, ok: false, note: `crashed: ${String(e?.message ?? e).split('\n')[0]}` }); });
  // One side at a time: each kids screen makes many calls, and both sites share the one lms-test backend.
  for (const view of VIEWS) { await safe('design', view); await safe('lmstest', view); }
}

await browser.close();
writeFileSync(OUT + 'summary.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.role.padEnd(22)} ${r.view.padEnd(7)} ${(r.lang ?? '').padEnd(2)} ${r.screen.padEnd(22)} ${r.wired === undefined ? '' : r.wired ? 'wired ' : 'sample'} ${r.note ?? ''}${r.apiFail?.length ? ' api:' + r.apiFail.join(',') : ''}${r.pageErrors?.length ? ' errors:' + r.pageErrors.join(' | ') : ''}${r.overflowX ? ' overflow-x' : ''}`);
const bad = results.filter((r) => !r.ok).length;
for (const r of results.filter((x) => x.reference && !x.refOk)) console.log(`REF  lms-test ${r.view} ${r.lang ?? ''} ${r.screen} (lms-test's own errors) api:${(r.apiFail ?? []).slice(0, 4).join(',')}`);
console.log(`SUMMARY screens ${results.length}, ok ${results.length - bad}, failed ${bad}, wired ${results.filter((r) => r.wired).length}`);
process.exit(0);

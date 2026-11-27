// Screenshots of every screen: phone (390 x 844, 2x) and desktop (1280 x 800, 2x), English and Arabic, JPEG.
// Usage: node scripts/shots.mjs [screen-id ...]   (serves dist/ with vite preview first)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const PORT = Number(process.env.SHOTS_PORT || 4179), BASE = `http://localhost:${PORT}/`;
// SHOTS_DEV=1 uses the dev server (no build needed; safe when several people work in this folder at once).
const only = process.argv.slice(2);
const server = spawn('npx', process.env.SHOTS_DEV ? ['vite', '--port', String(PORT), '--strictPort'] : ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, process.env.SHOTS_DEV ? 5000 : 2500));
const browser = await chromium.launch();
const out = new URL('../shots/', import.meta.url).pathname; mkdirSync(out, { recursive: true });
const page0 = await browser.newPage();
await page0.goto(BASE);
const ids = await page0.evaluate(() => [...document.querySelectorAll('a[href^="#/s/"]')].map((a) => a.getAttribute('href').match(/#\/s\/([\w-]+)/)[1]).filter((v, i, s) => s.indexOf(v) === i));
await page0.close();
const views = [{ name: 'phone', viewport: { width: 390, height: 844 } }, { name: 'desktop', viewport: { width: 1280, height: 800 } }];
const index = [];
for (const id of ids.filter((i) => !only.length || only.includes(i))) {
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    for (const lang of ['en', 'ar']) {
      await page.goto(`${BASE}#/s/${id}?lang=${lang}${process.env.DARK ? '&dark=1' : ''}`); await page.reload(); await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150);
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      const file = `${id}--${v.name}--${lang}${process.env.DARK ? '--dark' : ''}.jpg`;
      // Grow the viewport to the page height, so pinned bars (tab bar, chat input) sit at the bottom as a user sees them
      // after scrolling to the end, instead of where the first screen ends.
      const fullH = await page.evaluate(() => document.documentElement.scrollHeight);
      if (fullH > v.viewport.height) { await page.setViewportSize({ width: v.viewport.width, height: fullH }); await page.waitForTimeout(150); }
      await page.screenshot({ path: out + file, type: 'jpeg', quality: 82, fullPage: true });
      await page.setViewportSize(v.viewport);
      index.push({ id, view: v.name, lang, file, overflowX: scrollW > v.viewport.width, errors: [...errors] });
    }
    await ctx.close();
  }
}
if (!only.length && !process.env.DARK) writeFileSync(out + 'index.json', JSON.stringify(index, null, 1));
await browser.close(); server.kill();
const bad = index.filter((x) => x.overflowX || x.errors.length);
console.log(`shots: ${index.length}, sideways scroll or errors: ${bad.length}`); for (const b of bad) console.log('  ', b.file, b.overflowX ? 'overflow-x' : '', b.errors.join(' | '));

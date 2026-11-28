// Screenshots of the preview (fixture data): node screenshots.mjs <outDir>   (start dev_server.mjs on :8788 first)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'shots', base = 'http://localhost:8788';
const browser = await chromium.launch();
const problems = [];
for (const scheme of ['light', 'dark']) for (const [dev, vp] of [['phone', { width: 390, height: 844 }], ['wide', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(`${scheme}/${dev} pageerror ${e}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`${scheme}/${dev} console ${m.text()}`); });
  const shot = async name => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (sw > 0) problems.push(`${scheme}/${dev}/${name}: horizontal scroll ${sw}px`);
    await page.screenshot({ path: `${out}/${name}-${dev}-${scheme}.png`, fullPage: dev === 'phone' ? false : false });
  };
  await page.goto(base + '/');
  await page.waitForTimeout(300); await shot('1-login');
  await page.fill('#password', 'preview-only'); await page.click('button[type=submit]');
  await page.waitForSelector('#list .card'); await page.waitForTimeout(300); await shot('2-review');
  await page.click('#list .card [data-act=open]'); await page.waitForSelector('#sheetBody .timeline, #sheetBody .panel'); await page.waitForTimeout(400); await shot('3-lead');
  await page.click('#sheetClose');
  await page.locator('[data-tab=pipeline]:visible').click(); await page.waitForSelector('#board .col'); await page.waitForTimeout(200);
  if (dev === 'phone') await page.click('#stageChips [data-stage=proposal_sent]');
  await shot('4-pipeline');
  await page.locator('[data-tab=insights]:visible').click(); await page.waitForSelector('#insights .tiles'); await page.waitForTimeout(300); await shot('5-insights');
  await page.evaluate(() => document.querySelector('#ch-sent').scrollIntoView()); await page.waitForTimeout(100); await shot('5b-insights-charts');
  await page.locator('[data-tab=ask]:visible').click(); await page.waitForSelector('#starters button');
  await page.click('#starters button'); await page.waitForSelector('.prop'); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(100); await shot('6-ask');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.locator('[data-tab=settings]:visible').click(); await page.waitForTimeout(200); await shot('7-settings');
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no problems');

// Builds one PDF of every screen from shots/ (no new screenshots): cover, contents, then per screen a phone page
// (English + Arabic) and a desktop page (English + Arabic), then dark mode. A4 landscape; images keep full resolution.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = new URL('../', import.meta.url).pathname;
const idx = JSON.parse(readFileSync(root + 'shots/index.json'));
const reg = {};
for (const area of ['shared', 'student', 'kids', 'parent', 'teacher', 'school', 'platform']) {
  for (const f of readdirSync(`${root}src/screens/${area}`).filter((x) => /\.tsx?$/.test(x))) {
    const s = readFileSync(`${root}src/screens/${area}/${f}`, 'utf8');
    for (const m of s.matchAll(/id:\s*'([\w-]+)',[\s\S]{0,240}?title:\s*\{\s*en:\s*'([^']+)',\s*ar:\s*'([^']+)'/g)) reg[m[1]] ??= { area, en: m[2], ar: m[3] };
  }
}
const AREAS = [['shared', 'Shared', 'مشترك', 'Learners & Parents theme'], ['student', 'Student (teens and adults)', 'الطالب', 'Learners & Parents theme'], ['kids', 'Kids (under 9)', 'الأطفال', 'Kids theme'], ['parent', 'Parent', 'ولي الأمر', 'Learners & Parents theme'], ['teacher', 'Teacher', 'المعلم', 'School admin theme'], ['school', 'School admin', 'إدارة المدرسة', 'School admin theme'], ['platform', 'Platform admin', 'إدارة المنصة', 'School admin theme']];
const ids = [...new Set(idx.map((x) => x.id))];
const IMG_DIR = process.env.IMG_DIR || `${root}shots`; // a folder of smaller copies keeps the PDF light
const img = (f) => `file://${IMG_DIR}/${f}`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
let n = 0;
const page = (head, body) => `<section class="page"><header><span class="area">${head.area}</span><h2>${head.title}${head.ar ? ` <span class="ar">${esc(head.ar)}</span>` : ''}</h2><span class="tag">${head.tag}</span><span class="num">${++n + 2}</span></header><div class="body">${body}</div></section>`;
const pair = (a, b, la, lb) => `<figure><img src="${img(a)}"><figcaption>${la}</figcaption></figure><figure><img src="${img(b)}"><figcaption>${lb}</figcaption></figure>`;
let pages = '', toc = '';
const ONLY = (process.env.ONLY_AREAS || '').split(',').filter(Boolean); // e.g. ONLY_AREAS=kids,parent for a smaller part
for (const [a, en, ar, theme] of AREAS) {
  const list = ids.filter((id) => reg[id]?.area === a && (!ONLY.length || ONLY.includes(a)));
  if (!list.length) continue;
  toc += `<li><b>${en}</b> <span class="ar">${ar}</span> <i>${theme}</i><ol>${list.map((id) => `<li>${esc(reg[id].en)} <span class="ar">${esc(reg[id].ar)}</span></li>`).join('')}</ol></li>`;
  for (const id of list) {
    const h = { area: en, title: esc(reg[id].en), ar: reg[id].ar };
    pages += page({ ...h, tag: 'Phone · 390 px' }, pair(`${id}--phone--en.jpg`, `${id}--phone--ar.jpg`, 'English', 'العربية'));
    pages += page({ ...h, tag: 'Desktop · 1280 px' }, pair(`${id}--desktop--en.jpg`, `${id}--desktop--ar.jpg`, 'English', 'العربية'));
  }
}
for (const id of (!ONLY.length || ONLY.includes('dark') ? ['student-home', 'kids-home', 'school-dashboard'] : [])) {
  pages += page({ area: 'Dark mode', title: esc(reg[id].en), ar: reg[id].ar, tag: 'Dark · phone and desktop' }, `<figure class="s"><img src="${img(`${id}--phone--en--dark.jpg`)}"><figcaption>Phone · English</figcaption></figure><figure class="s"><img src="${img(`${id}--phone--ar--dark.jpg`)}"><figcaption>Phone · العربية</figcaption></figure><figure class="w"><img src="${img(`${id}--desktop--en--dark.jpg`)}"><figcaption>Desktop · English</figcaption></figure>`);
}
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; } body { margin: 0; font-family: 'IBM Plex Sans Arabic', sans-serif; /* static font: no Type 3 glyphs in the PDF */ color: #1b2440; }
.ar { font-family: 'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif; direction: rtl; unicode-bidi: isolate; color: #5b6480; font-weight: 500; }
.page { width: 297mm; height: 210mm; padding: 9mm 12mm 8mm; display: flex; flex-direction: column; page-break-after: always; break-after: page; overflow: hidden; }
header { display: flex; align-items: baseline; gap: 10px; border-bottom: 1.5px solid #e3e7f0; padding-bottom: 5px; margin-bottom: 6mm; }
header h2 { margin: 0; font-size: 17px; flex: 1; } .area { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #c58a00; }
.tag { font-size: 11px; color: #5b6480; background: #f0f3f9; border-radius: 99px; padding: 2px 9px; } .num { font-size: 10px; color: #98a0b8; }
.body { flex: 1; min-height: 0; display: flex; gap: 8mm; justify-content: center; align-items: flex-start; }
figure { margin: 0; flex: 1 1 0; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 3px; }
figure img { max-width: 100%; max-height: calc(100% - 16px); object-fit: contain; border: 1px solid #e3e7f0; border-radius: 6px; box-shadow: 0 1px 3px rgb(0 0 0 / .06); }
figcaption { font-size: 10px; color: #5b6480; font-weight: 600; } figure.s { flex: 0.55 1 0; } figure.w { flex: 1.6 1 0; }
.cover { background: #1c2d5a; color: #fff; justify-content: center; padding: 25mm 28mm; }
.cover h1 { font-size: 40px; margin: 0 0 10px; } .cover p { font-size: 15px; color: #c9d2ea; max-width: 190mm; line-height: 1.6; margin: 0 0 6px; }
.cover .lamp { width: 54px; height: 54px; margin-bottom: 22px; } .cover .ar { color: #f2c14e; font-size: 24px; }
.toc { padding: 12mm 16mm; } .toc h2 { margin: 0 0 6mm; } .toc > ol { columns: 3; column-gap: 10mm; font-size: 11.5px; margin: 0; padding-inline-start: 4mm; }
.toc > ol > li { break-inside: avoid; margin-bottom: 5mm; } .toc i { display: block; color: #98a0b8; font-size: 10px; } .toc ol ol { padding-inline-start: 5mm; margin: 2px 0; color: #374061; }
</style><link rel="stylesheet" href="file://${root}node_modules/@fontsource/ibm-plex-sans-arabic/400.css"><link rel="stylesheet" href="file://${root}node_modules/@fontsource/ibm-plex-sans-arabic/700.css"></head><body>
<section class="page cover"><svg class="lamp" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#fff" fill-opacity=".12"/><path d="M16 6c4.4 0 8 3.4 8 7.7 0 2.7-1.4 4.6-3.1 6-.9.8-1.4 1.6-1.4 2.6V23h-7v-.7c0-1-.5-1.8-1.4-2.6C9.4 18.3 8 16.4 8 13.7 8 9.4 11.6 6 16 6Z" fill="#f2c14e"/><rect x="12.5" y="24.5" width="7" height="2.2" rx="1.1" fill="#fff"/></svg>
<h1>ENARA design system preview <span class="ar">إنارة</span></h1>
<p>${ids.length} screens across seven areas, each in English and Arabic (right to left), on phone (390 px) and desktop (1280 px), plus dark mode. Three themes on one set of tokens: Kids, Learners &amp; Parents, School admin.</p>
<p>Static screens with sample data, from branch claude/design-preview. Not merged, not deployed. 27 November 2026.</p></section>
<section class="page toc"><h2>Contents</h2><ol>${toc}<li><b>Dark mode</b><ol><li>Student home</li><li>Kids home</li><li>School dashboard</li></ol></li></ol></section>
${pages}</body></html>`;
const out = process.argv[2] || `${root}ENARA-design-preview.pdf`;
writeFileSync(`${root}shots/print.html`, html);
const browser = await chromium.launch();
const p = await browser.newPage();
await p.goto(`file://${root}shots/print.html`, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: out, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log('pages', n + 2, 'screens', ids.length, '->', out);

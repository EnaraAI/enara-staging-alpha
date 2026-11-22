// Owner (22 Nov 2026): "did the avatar draw graphics during calls? let me see them". Reads the last on-screen visual of each test call
// from lms-test (maintenance route, test database, fake learners) and saves it as a PNG, rendered as the student's screen panel would.
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const CALLS = Object.fromEntries('a02=av-7f6e8ee3-1d55-4e63-a853-cf9dfc1e8d65,a03=av-2314fe6f-d485-4179-8792-c5bbd998ef8e,a04=av-ca53d9a7-75ea-4ab0-986e-1105182cf0c2,a05=av-d0b081f7-64f3-487a-a9cd-240dda8ff4ce,a06=av-46fd9e1e-2caa-4d45-8d93-d3b705da72f7,a07=av-13a3fba0-367d-40d3-87fb-90c26e176b7e,c01=av-164f185b-3725-40dd-8c98-5a8c2b72bff3,c02=av-4029e4d9-64a5-4cca-bbc9-b087360af45e,c03=av-751ceb56-de8b-4898-aadc-058cc21c0e70,c04=av-3dcbf6c5-b240-4315-b505-dff8463000d7,c05=av-0e54319a-0052-40fd-b33f-47094b1b1630'.split(',').map((x) => x.split('=')));
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}` };
const r = await fetch(`https://lms-test.enara.app/api/maintenance/avatar-visuals?ids=${Object.values(CALLS).join(',')}`, { headers: H }).then((x) => x.json());
mkdirSync('vis', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 2 });
const index = [];
for (const [call, id] of Object.entries(CALLS)) {
  const v = (r.visuals ?? []).find((x) => x.id === id);
  if (!v?.html) { index.push({ call, visual: false }); console.log(call, 'no visual stored'); continue; }
  await page.setContent(v.html, { waitUntil: 'networkidle' }).catch(() => undefined);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `vis/${call}.png`, fullPage: true });
  writeFileSync(`vis/${call}.html`, v.html);
  index.push({ call, visual: true, bytes: v.html.length });
  console.log(call, 'saved');
}
await browser.close();
writeFileSync('vis/index.json', JSON.stringify(index, null, 1));

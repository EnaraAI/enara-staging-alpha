// Read-only maintenance checks on lms-test (GET only), named in check.json. Waits until the route answers (a new route appears after
// its deploy). Prints the JSON answer: these routes return numbers and model text only, never keys or learner data.
import { readFileSync } from 'fs';
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}` };
const { paths } = JSON.parse(readFileSync(new URL('./check.json', import.meta.url), 'utf8'));
for (const p of paths) {
  if (!/^\/[a-z0-9-]+(\?[a-zA-Z0-9=&_-]*)?$/.test(p)) { console.log('SKIP', p); continue; }
  let r = null;
  for (let i = 0; i < 40; i++) { r = await fetch(`${SITE}/api/maintenance${p}`, { headers: H, signal: AbortSignal.timeout(90_000) }).catch(() => null); if (r && r.status !== 404) break; await new Promise((x) => setTimeout(x, 30_000)); }
  console.log('CHECK', p, 'HTTP', r?.status ?? 0, (await r?.text().catch(() => '') ?? '').slice(0, 3000));
}

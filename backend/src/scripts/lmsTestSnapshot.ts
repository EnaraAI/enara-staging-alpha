import { readFileSync, writeFileSync } from 'fs';

// Multi-class step 5 switch-on check on the LMS TEST site only
// (lms-test.enara.app, fake data). Reads every page the step 5 features touch,
// as school admin A and B, the teachers and the seeded students, and saves the
// JSON. Two snapshots (before and after a feature is switched on) are compared
// with --compare a.json b.json: every difference is printed. Keys that change
// with the clock alone are listed in TIME_KEYS and reported separately, never
// silently dropped. No writes.
//
//   LMS_TEST_PASSWORD_FILE=<file> npx tsx src/scripts/lmsTestSnapshot.ts --out snap.json
//   npx tsx src/scripts/lmsTestSnapshot.ts --compare before.json after.json

const BASE = 'https://lms-test.enara.app';
const DOMAIN = 'lms-test.example';
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const TIME_KEYS = new Set(['requestId', 'generatedAt', 'now', 'serverTime', 'timestamp', 'scoreWindow']); // scoreWindow = last 90 days from now
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    let json: Json = null;
    try { json = t ? JSON.parse(t) : null; } catch { json = t; }
    if (r.status === 429 && attempt < 4) { await sleep(20_000 * (attempt + 1)); continue; }
    return { status: r.status, json };
  }
}
const list = (j: Json, key: string): Json[] => (Array.isArray(j) ? j : j?.[key] ?? j?.data ?? j?.items ?? []);

async function snapshot(out: string) {
  const pw = readFileSync(process.env.LMS_TEST_PASSWORD_FILE!, 'utf8').trim();
  const login = async (email: string) => { const r = await call(null, 'POST', '/api/auth/login', { email, password: pw }); await sleep(800); return r.status === 200 ? (r.json.token as string) : null; };
  const pages: Record<string, { status: number; body: Json }> = {};
  const get = async (who: string, tok: string, p: string) => { const r = await call(tok, 'GET', p); pages[`${who} ${p}`] = { status: r.status, body: r.json }; };
  for (const [who, school] of [['admin.a', 'LT-SCHOOL-A'], ['admin.b', 'LT-SCHOOL-B']] as const) {
    const t = await login(`${who}@${DOMAIN}`);
    if (!t) throw new Error(`${who} sign-in failed`);
    const classes = list((await call(t, 'GET', '/api/course-instances')).json, 'courseInstances').filter((c: Json) => c.institutionId === school).map((c: Json) => c.id).sort();
    const assessments = list((await call(t, 'GET', '/api/assessments')).json, 'assessments').filter((a: Json) => a.institutionId === school).map((a: Json) => a.id).sort();
    for (const p of ['/api/analytics/overview', '/api/analytics/weekly-summary', '/api/age-bands', '/api/credits', '/api/students?limit=1000', '/api/teaching/overview']) await get(who, t, p);
    for (const c of classes) for (const p of [`/api/teaching/classes/${c}/roster`, `/api/learning/analytics/ttu?courseId=${c}`, `/api/analytics/courses/${c}`, `/api/teacher/attendance/roster?courseInstanceId=${c}&date=2026-11-17`]) await get(who, t, p);
    for (const a of assessments) await get(who, t, `/api/assessments/${a}/attempts`);
  }
  for (const who of ['teacher.a1', 'teacher.a2', 'teacher.b1']) {
    const t = await login(`${who}@${DOMAIN}`);
    if (!t) continue;
    for (const p of ['/api/teaching/overview', '/api/learning/analytics/ttu', '/api/teacher/attendance/classes']) await get(who, t, p);
    const mine = list((await call(t, 'GET', '/api/teacher/attendance/classes')).json, 'classes').map((c: Json) => c.id ?? c.courseInstanceId).filter(Boolean).sort();
    for (const c of mine) await get(who, t, `/api/teacher/attendance/roster?courseInstanceId=${c}&date=2026-11-17`);
  }
  for (const id of ['LT-S-A01', 'LT-S-A02', 'LT-S-A05', 'LT-S-A08', 'LT-S-A10', 'LT-S-A15', 'LT-S-B01']) {
    const t = await login(`${id.toLowerCase()}@${DOMAIN}`);
    if (!t) continue;
    for (const p of ['/api/me', '/api/me/courses', '/api/me/dashboard', '/api/me/assessments', '/api/me/next-steps']) await get(id, t, p);
  }
  writeFileSync(out, JSON.stringify(pages));
  console.log(`saved ${Object.keys(pages).length} pages`);
}

function diff(a: Json, b: Json, path: string, out: { real: string[]; time: string[] }) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (TIME_KEYS.has(k) && k in a && k in b) { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.time.push(`${path}.${k}`); continue; }
      diff(a[k], b[k], `${path}.${k}`, out);
    }
    return;
  }
  out.real.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} -> ${JSON.stringify(b)?.slice(0, 120)}`);
}

function compare(fa: string, fb: string) {
  const a = JSON.parse(readFileSync(fa, 'utf8'));
  const b = JSON.parse(readFileSync(fb, 'utf8'));
  const out = { real: [] as string[], time: [] as string[] };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], k, out);
  console.log(JSON.stringify({ pages: Object.keys(b).length, realDifferences: out.real.length, real: out.real.slice(0, 50), timeOnlyKeys: [...new Set(out.time.map((x) => x.split('.').pop()))], timeOnlyCount: out.time.length }, null, 1));
  if (out.real.length) process.exitCode = 1;
}

const i = process.argv.indexOf('--compare');
if (i > 0) compare(process.argv[i + 1], process.argv[i + 2]);
else snapshot(process.argv[process.argv.indexOf('--out') + 1]).catch((e) => { console.error(e.message); process.exit(1); });

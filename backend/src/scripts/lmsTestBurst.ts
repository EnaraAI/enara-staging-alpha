import { readFileSync, writeFileSync } from 'fs';

// Multi-class: INTENSIVE churn burst on the LMS TEST site only
// (lms-test.enara.app, fake data). Replaces the multi-day shadow wait
// (Mohamed, 2026-11-17). Hundreds of changes through the app's own endpoints,
// in batches; after EVERY batch:
//   1. a read pass over every shadowed page (rosters, time-to-understand,
//      course analytics, overview, and the class list of signed-in students);
//   2. the shadow report: mismatches and errors must not increase;
//   3. the backfill dry run as a consistency check of the dual write: nothing
//      to create or reactivate and no conflicts (inSync).
// It stops at the first batch that fails a check, and writes a JSON log.
//
//   LMS_TEST_PASSWORD_FILE=<file> MAINTENANCE_TOKEN_FILE=<file> \
//     npx tsx src/scripts/lmsTestBurst.ts --batches 40 --ops 12 --out <file>
//
// It refuses any address other than https://lms-test.enara.app and never
// changes the seeded students used in the documented logins.

const BASE = 'https://lms-test.enara.app';
const DOMAIN = 'lms-test.example';
const SCHOOL = 'LT-SCHOOL-A';
const PROTECTED = new Set(['LT-S-A01', 'LT-S-A08']);
const PREFIX = 'Burst ';
const MAX_BURST_STUDENTS = 40;

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (n: string, d: number) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) || d : d; };
const argS = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };

async function call(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  if (!path.startsWith('/api/')) throw new Error('bad path');
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json: Json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (r.status === 429 && attempt < 4) { await sleep(20_000 * (attempt + 1)); continue; }
    return { status: r.status, json };
  }
}
const list = (j: Json, key: string): Json[] => (Array.isArray(j) ? j : j?.[key] ?? j?.data ?? j?.items ?? []);

async function main() {
  const password = readFileSync(process.env.LMS_TEST_PASSWORD_FILE!, 'utf8').trim();
  const maint = readFileSync(process.env.MAINTENANCE_TOKEN_FILE!, 'utf8').trim();
  const batches = arg('--batches', 40);
  const opsPerBatch = arg('--ops', 12);
  const outFile = argS('--out');
  // --skip a,b: leave out some kinds of change (e.g. delete_student while a decision is pending).
  const skip = new Set((argS('--skip') ?? '').split(',').filter(Boolean));
  let s = arg('--seed', 20261117) >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rand() * xs.length)] : undefined);

  const log: Json = { started: new Date().toISOString(), base: BASE, batches: [], totals: { ops: 0, opFailures: 0, reads: 0, readFailures: 0 }, stoppedAt: null };
  const save = () => outFile && writeFileSync(outFile, JSON.stringify(log, null, 1));

  let adminAt = 0;
  let admin = '';
  const adminToken = async () => {
    if (Date.now() - adminAt > 20 * 60_000) {
      const r = await call(null, 'POST', '/api/auth/login', { email: `admin.a@${DOMAIN}`, password });
      if (r.status !== 200) throw new Error(`admin sign-in ${r.status}`);
      admin = r.json.token; adminAt = Date.now();
    }
    return admin;
  };
  // A few signed-in students for the student class-list check (sign-ins are rate limited).
  const studentTokens: { id: string; token: string; at: number }[] = [];
  for (const id of ['LT-S-A01', 'LT-S-A08', 'LT-S-A02', 'LT-S-A05', 'LT-S-A10', 'LT-S-A15']) {
    const r = await call(null, 'POST', '/api/auth/login', { email: `${id.toLowerCase()}@${DOMAIN}`, password });
    if (r.status === 200) studentTokens.push({ id, token: r.json.token, at: Date.now() });
    await sleep(1500);
  }
  const maintGet = (p: string) => fetch(`${BASE}/api/maintenance/${p}`, { headers: { Authorization: `Bearer ${maint}` } }).then((r) => r.json());
  const maintPost = (p: string, b: unknown) => fetch(`${BASE}/api/maintenance/${p}`, { method: 'POST', headers: { Authorization: `Bearer ${maint}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  const shadowTotals = async () => {
    const rep: Json = await maintGet('enrollment-shadow-report?days=2&required=1');
    const t: Record<string, { checks: number; mismatches: number; errors: number }> = {};
    for (const f of rep.features) t[f.feature] = { checks: f.checks, mismatches: f.mismatches, errors: f.errors };
    return t;
  };
  let prev = await shadowTotals();
  log.shadowAtStart = prev;

  for (let b = 1; b <= batches; b++) {
    const tok = await adminToken();
    const groups = list((await call(tok, 'GET', '/api/batches')).json, 'batches').filter((g: Json) => g.institutionId === SCHOOL && !String(g.name).startsWith(PREFIX));
    const classes = list((await call(tok, 'GET', '/api/course-instances')).json, 'courseInstances').filter((c: Json) => c.institutionId === SCHOOL);
    let students = list((await call(tok, 'GET', '/api/students?limit=1000')).json, 'students').filter((x: Json) => x.institutionId === SCHOOL);
    const movable = () => students.filter((x: Json) => !PROTECTED.has(x.id));
    const batch: Json = { batch: b, ops: [] as Json[], reads: { ok: 0, failed: [] as string[] } };
    const stamp = `${Date.now().toString(36)}`;
    const op = async (name: string, fn: () => Promise<number>) => {
      let status = 0;
      try { status = await fn(); } catch (e) { status = -1; batch.ops.push({ op: name, status, error: (e as Error).message }); return; }
      batch.ops.push({ op: name, status });
      log.totals.ops++;
      if (status >= 400 || status < 0) log.totals.opFailures++;
    };

    for (let k = 0; k < opsPerBatch; k++) {
      const kinds = ['add', 'add_nogroup', 'move', 'leave_group', 'enroll', 'unenroll', 'temp_group', 'delete_student'].filter((k) => !skip.has(k));
      const kind = pick(kinds)!;
      if (kind === 'add' || kind === 'add_nogroup') {
        const g = kind === 'add' ? pick(groups) : undefined;
        await op(kind, async () => {
          const r = await call(tok, 'POST', '/api/students', { name: `${PREFIX}${stamp}-${k}`, email: `burst-${stamp}-${k}@${DOMAIN}`, grade: 'Grade 7', ...(g ? { batchId: g.id } : {}), institutionId: SCHOOL });
          if (r.json?.id) students.push({ ...r.json });
          return r.status;
        });
      } else if (kind === 'move') {
        const m = pick(movable()); const to = pick(groups.filter((g: Json) => g.id !== m?.batchId));
        if (m && to) await op(kind, async () => { const r = await call(tok, 'PATCH', `/api/students/${m.id}`, { batchId: to.id }); if (r.status < 300) m.batchId = to.id; return r.status; });
      } else if (kind === 'leave_group') {
        const m = pick(movable().filter((x: Json) => x.batchId));
        if (m) await op(kind, async () => { const r = await call(tok, 'PATCH', `/api/students/${m.id}`, { batchId: '' }); if (r.status < 300) m.batchId = undefined; return r.status; });
      } else if (kind === 'enroll') {
        const c = pick(classes); const j = pick(movable().filter((x: Json) => !(c?.studentIds ?? []).includes(x.id)));
        if (c && j) await op(kind, async () => { const r = await call(tok, 'POST', `/api/course-instances/${c.id}/students`, { studentId: j.id }); if (r.status < 300) (c.studentIds ??= []).push(j.id); return r.status; });
      } else if (kind === 'unenroll') {
        const c = pick(classes.filter((x: Json) => (x.studentIds ?? []).some((id: string) => !PROTECTED.has(id))));
        const id = c ? pick((c.studentIds as string[]).filter((x) => !PROTECTED.has(x))) : undefined;
        if (c && id) await op(kind, async () => { const r = await call(tok, 'DELETE', `/api/course-instances/${c.id}/students/${id}`); if (r.status < 300) c.studentIds = c.studentIds.filter((x: string) => x !== id); return r.status; });
      } else if (kind === 'temp_group') {
        await op(kind, async () => {
          const g = await call(tok, 'POST', '/api/batches', { name: `${PREFIX}group ${stamp}-${k}`, academicYear: '2026', institutionId: SCHOOL });
          const gid = g.json?.id ?? g.json?.batch?.id;
          if (g.status >= 400 || !gid) return g.status;
          for (const n of [1, 2]) {
            const r = await call(tok, 'POST', '/api/students', { name: `${PREFIX}${stamp}-${k}-${n}`, email: `burst-${stamp}-${k}-${n}@${DOMAIN}`, grade: 'Grade 8', batchId: gid, institutionId: SCHOOL });
            if (r.status >= 400) return r.status;
          }
          return (await call(tok, 'DELETE', `/api/batches/${gid}`)).status;
        });
      } else if (kind === 'delete_student') {
        const d = pick(students.filter((x: Json) => String(x.name).startsWith(PREFIX) || String(x.name).startsWith('Churn ')));
        if (d) await op(kind, async () => { const r = await call(tok, 'DELETE', `/api/students/${d.id}`); if (r.status < 300) students = students.filter((x: Json) => x.id !== d.id); return r.status; });
      }
      await sleep(300);
    }
    // Keep the data small: delete the oldest burst students above the cap.
    const extra = students.filter((x: Json) => String(x.name).startsWith(PREFIX)).slice(0, Math.max(0, students.filter((x: Json) => String(x.name).startsWith(PREFIX)).length - MAX_BURST_STUDENTS));
    if (!skip.has('delete_student')) for (const d of extra) await op('cap_delete', async () => (await call(tok, 'DELETE', `/api/students/${d.id}`)).status);

    // Read pass over every shadowed page.
    const read = async (t: string, p: string) => { const r = await call(t, 'GET', p); if (r.status === 200) batch.reads.ok++; else batch.reads.failed.push(`${p} -> ${r.status}`); };
    await read(tok, '/api/analytics/overview');
    for (const c of classes) {
      await read(tok, `/api/teaching/classes/${c.id}/roster`);
      await read(tok, `/api/learning/analytics/ttu?courseId=${c.id}`);
      await read(tok, `/api/analytics/courses/${c.id}`);
    }
    for (const st of studentTokens) await read(st.token, '/api/me/courses');
    log.totals.reads += batch.reads.ok + batch.reads.failed.length;
    log.totals.readFailures += batch.reads.failed.length;

    // Checks: shadow deltas and dual-write consistency.
    const now = await shadowTotals();
    batch.shadowDelta = Object.fromEntries(Object.keys(now).map((f) => [f, { checks: now[f].checks - (prev[f]?.checks ?? 0), mismatches: now[f].mismatches - (prev[f]?.mismatches ?? 0), errors: now[f].errors - (prev[f]?.errors ?? 0) }]));
    prev = now;
    const dry: Json = await maintPost('enrollment-backfill', { mode: 'dry-run', institutionId: SCHOOL });
    const r = dry.report;
    batch.consistency = { inSync: r.inSync, wouldCreate: r.wouldCreate, wouldReactivate: r.wouldReactivate.count, conflicts: r.conflicts.activeNotInOldFields.count, doesNotFit: Object.fromEntries(Object.entries(r.doesNotFit).map(([k, v]: [string, Json]) => [k, v.count]).filter(([, n]) => (n as number) > 0)) };
    log.batches.push(batch);
    save();
    const bad = Object.values(batch.shadowDelta).some((d: Json) => d.mismatches || d.errors) || !r.inSync || batch.reads.failed.length || batch.ops.some((o: Json) => o.status >= 400 || o.status < 0);
    console.log(`batch ${b}/${batches}: ops ${batch.ops.length}, reads ${batch.reads.ok}/${batch.reads.ok + batch.reads.failed.length}, inSync ${r.inSync}, shadow mismatches ${Object.values(batch.shadowDelta).reduce((a: number, d: Json) => a + d.mismatches, 0)}, errors ${Object.values(batch.shadowDelta).reduce((a: number, d: Json) => a + d.errors, 0)}${bad ? '  <-- STOP' : ''}`);
    if (bad) { log.stoppedAt = b; break; }
    // Refresh student tokens every ~40 minutes.
    for (const st of studentTokens) if (Date.now() - st.at > 40 * 60_000) {
      const rr = await call(null, 'POST', '/api/auth/login', { email: `${st.id.toLowerCase()}@${DOMAIN}`, password });
      if (rr.status === 200) { st.token = rr.json.token; st.at = Date.now(); }
    }
  }
  log.finished = new Date().toISOString();
  log.shadowAtEnd = await shadowTotals();
  save();
  console.log(JSON.stringify({ totals: log.totals, stoppedAt: log.stoppedAt, shadowAtEnd: log.shadowAtEnd }));
  if (log.stoppedAt) process.exitCode = 1;
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });

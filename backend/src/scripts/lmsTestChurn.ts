import { readFileSync } from 'fs';

// Multi-class: daily CHURN on the LMS TEST site only (lms-test.enara.app, fake
// data), approved by Mohamed 2026-11-17 (S5-2). It changes the fake data
// through the app's own endpoints, as a fake school admin, so dual write,
// backfill and the shadow check are tested against real-looking changes:
//   1. add a new student to a group;
//   2. move a student to another group;
//   3. enroll a student in a class explicitly;
//   4. remove an explicit class member;
//   5. create a temporary group, put 2 new students in it, delete the group
//      (their batchId keeps pointing at it: the "deleted group" case);
//   6. delete churn students older than 2 days (keeps the data small).
// Then a READ pass calls every shadowed page: class rosters, the time-to-
// understand report, the analytics overview (school admin A and B), and the
// course list and dashboard of every seeded student who can sign in.
//
//   LMS_TEST_PASSWORD_FILE=<file> npx tsx src/scripts/lmsTestChurn.ts [--read-only] [--seed N]
//
// It refuses any address other than https://lms-test.enara.app. It never
// touches the seeded students used in the documented logins (PROTECTED).

const BASE = 'https://lms-test.enara.app';
const DOMAIN = 'lms-test.example';
const SCHOOL_A = 'LT-SCHOOL-A';
const PROTECTED = new Set(['LT-S-A01', 'LT-S-A08']);
const CHURN_PREFIX = 'Churn ';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const out = { started: new Date().toISOString(), base: BASE, ops: [] as { op: string; status: number; ids?: Record<string, string> }[], reads: { ok: 0, failed: [] as string[] }, errors: [] as string[] };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

async function call(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  if (!path.startsWith('/api/')) throw new Error('bad path');
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: Json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: r.status, json };
}

async function login(email: string, password: string): Promise<string | null> {
  const r = await call(null, 'POST', '/api/auth/login', { email, password });
  return r.status === 200 ? (r.json?.token as string) : null;
}

function list(j: Json, key: string): Json[] {
  if (Array.isArray(j)) return j;
  if (Array.isArray(j?.[key])) return j[key];
  if (Array.isArray(j?.data)) return j.data;
  if (Array.isArray(j?.items)) return j.items;
  return [];
}

async function op(name: string, fn: () => Promise<{ status: number; ids?: Record<string, string> }>) {
  try {
    const r = await fn();
    out.ops.push({ op: name, ...r });
    if (r.status >= 400) out.errors.push(`${name}: HTTP ${r.status}`);
  } catch (e) {
    out.errors.push(`${name}: ${(e as Error).message}`);
  }
}

async function read(token: string, path: string) {
  try {
    const r = await call(token, 'GET', path);
    if (r.status === 200) out.reads.ok++;
    else out.reads.failed.push(`${path.replace(/[A-Z0-9-]{6,}/g, ':id')} -> ${r.status}`);
  } catch (e) {
    out.reads.failed.push(`${path}: ${(e as Error).message}`);
  }
}

async function main() {
  const pwFile = process.env.LMS_TEST_PASSWORD_FILE;
  if (!pwFile) throw new Error('LMS_TEST_PASSWORD_FILE is required');
  const password = readFileSync(pwFile, 'utf8').trim();
  const readOnly = process.argv.includes('--read-only');
  const si = process.argv.indexOf('--seed');
  const seed = si > 0 ? Number(process.argv[si + 1]) : Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const rand = rng(seed);
  const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rand() * xs.length)] : undefined);

  const admin = await login(`admin.a@${DOMAIN}`, password);
  const adminB = await login(`admin.b@${DOMAIN}`, password);
  if (!admin || !adminB) throw new Error('fake admin sign-in failed');

  if (!readOnly) {
    const groups = list((await call(admin, 'GET', '/api/batches')).json, 'batches').filter((g: Json) => g.institutionId === SCHOOL_A && !String(g.name).startsWith(CHURN_PREFIX));
    const classes = list((await call(admin, 'GET', '/api/course-instances')).json, 'courseInstances').filter((c: Json) => c.institutionId === SCHOOL_A);
    const students = list((await call(admin, 'GET', '/api/students?limit=500')).json, 'students').filter((s: Json) => s.institutionId === SCHOOL_A);
    const movable = students.filter((s: Json) => !PROTECTED.has(s.id));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

    // 1. add a new student to a group
    const g1 = pick(groups);
    await op('add_student', async () => {
      const r = await call(admin, 'POST', '/api/students', { name: `${CHURN_PREFIX}${stamp}a`, email: `churn-${stamp}a@${DOMAIN}`, grade: 'Grade 7', batchId: g1?.id, institutionId: SCHOOL_A });
      return { status: r.status, ids: { student: r.json?.id ?? r.json?.student?.id, group: g1?.id } };
    });

    // 2. move a student to another group
    const mover = pick(movable);
    const to = pick(groups.filter((g: Json) => g.id !== mover?.batchId));
    if (mover && to) await op('move_student', async () => ({ status: (await call(admin, 'PATCH', `/api/students/${mover.id}`, { batchId: to.id })).status, ids: { student: mover.id, from: mover.batchId ?? '', to: to.id } }));

    // 3. enroll a student explicitly in a class they're not listed in
    const cls = pick(classes);
    const joiner = pick(movable.filter((s: Json) => !(cls?.studentIds ?? []).includes(s.id)));
    if (cls && joiner) await op('enroll_in_class', async () => ({ status: (await call(admin, 'POST', `/api/course-instances/${cls.id}/students`, { studentId: joiner.id })).status, ids: { student: joiner.id, class: cls.id } }));

    // 4. remove an explicit class member (never a protected one)
    const withMembers = classes.filter((c: Json) => (c.studentIds ?? []).some((id: string) => !PROTECTED.has(id) && id !== joiner?.id));
    const cls2 = pick(withMembers);
    const leaver = cls2 ? pick((cls2.studentIds as string[]).filter((id) => !PROTECTED.has(id) && id !== joiner?.id)) : undefined;
    if (cls2 && leaver) await op('remove_from_class', async () => ({ status: (await call(admin, 'DELETE', `/api/course-instances/${cls2.id}/students/${leaver}`)).status, ids: { student: leaver, class: cls2.id } }));

    // 5. temporary group: create, fill with 2 new students, delete the group
    await op('temp_group_cycle', async () => {
      const g = await call(admin, 'POST', '/api/batches', { name: `${CHURN_PREFIX}group ${stamp}`, academicYear: '2026', institutionId: SCHOOL_A });
      const gid = g.json?.id ?? g.json?.batch?.id;
      if (g.status >= 400 || !gid) return { status: g.status };
      for (const k of ['b', 'c']) {
        const s = await call(admin, 'POST', '/api/students', { name: `${CHURN_PREFIX}${stamp}${k}`, email: `churn-${stamp}${k}@${DOMAIN}`, grade: 'Grade 8', batchId: gid, institutionId: SCHOOL_A });
        if (s.status >= 400) return { status: s.status };
      }
      const d = await call(admin, 'DELETE', `/api/batches/${gid}`);
      return { status: d.status, ids: { group: gid } };
    });

    // 6. delete churn students older than 2 days
    const cutoff = Date.now() - 2 * 86_400_000;
    for (const s of students.filter((x: Json) => String(x.name).startsWith(CHURN_PREFIX) && new Date(x.createdAt ?? x.enrollmentDate ?? Date.now()).getTime() < cutoff)) {
      await op('delete_old_churn_student', async () => ({ status: (await call(admin, 'DELETE', `/api/students/${s.id}`)).status, ids: { student: s.id } }));
    }
  }

  // READ pass over every shadowed feature
  for (const [tok, school] of [[admin, SCHOOL_A], [adminB, 'LT-SCHOOL-B']] as const) {
    await read(tok, '/api/analytics/overview');
    const classes = list((await call(tok, 'GET', '/api/course-instances')).json, 'courseInstances').filter((c: Json) => c.institutionId === school);
    for (const c of classes) {
      await read(tok, `/api/teaching/classes/${c.id}/roster`);
      await read(tok, `/api/learning/analytics/ttu?courseId=${c.id}`);
      await read(tok, `/api/analytics/courses/${c.id}`);
    }
    const students = list((await call(tok, 'GET', '/api/students?limit=500')).json, 'students').filter((s: Json) => s.institutionId === school && /^LT-S-/.test(s.id));
    for (const s of students) {
      const st = await login(`${String(s.id).toLowerCase()}@${DOMAIN}`, password);
      if (!st) { out.reads.failed.push(`student sign-in ${s.id}`); continue; }
      await read(st, '/api/me/courses');
      await read(st, '/api/me/dashboard');
    }
  }

  console.log(JSON.stringify({ ...out, finished: new Date().toISOString(), seed }, null, 1));
  if (out.errors.length || out.reads.failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(JSON.stringify({ ...out, fatal: (e as Error).message }, null, 1));
  process.exit(1);
});

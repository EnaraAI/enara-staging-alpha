// Read-only probe: every 3 s for ~4 min. /ready on lms-test and test.enara.app, and on lms-test also a real database query
// (GET /api/maintenance/status: listCollections, maintenance token) at the same moment. States and timings only.
const TOKEN = process.env.LMSTEST_MAINTENANCE_TOKEN;
async function hit(url, auth) {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: 'manual', headers: auth ? { Authorization: `Bearer ${TOKEN}` } : {}, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => null);
    return { s: r.status, ms: Date.now() - t, mongo: j?.checks?.mongo, db: typeof j?.collections === 'number', ra: r.headers.get('retry-after') };
  } catch { return { s: 0, ms: Date.now() - t }; }
}
const rows = []; const N = 80;
for (let i = 0; i < N; i++) {
  const [a, b, c] = await Promise.all([hit('https://lms-test.enara.app/ready'), hit('https://lms-test.enara.app/api/maintenance/status', true), hit('https://test.enara.app/ready')]);
  rows.push({ t: new Date().toISOString().slice(11, 19), a, b, c });
  console.log(`${rows.at(-1).t} lms /ready ${a.s} ${a.mongo ?? ''} ${a.ms}ms | lms db-query ${b.s}${b.db ? ' ok' : ''} ${b.ms}ms${b.ra ? ' retry-after' : ''} | test /ready ${c.s} ${c.mongo ?? ''} ${c.ms}ms`);
  await new Promise((r) => setTimeout(r, 3000));
}
const bad = (x) => x.s !== 200;
const n = (f) => rows.filter(f).length;
console.log(`\nSUMMARY of ${N}: lms /ready not 200: ${n((r) => bad(r.a))}; lms db-query not 200: ${n((r) => bad(r.b))}; test /ready not 200: ${n((r) => bad(r.c))}`);
console.log(`lms /ready 503 while the real query in the same instant was 200: ${n((r) => bad(r.a) && !bad(r.b))}; both failed together: ${n((r) => bad(r.a) && bad(r.b))}`);
console.log(`lms and test /ready failing in the same instant: ${n((r) => bad(r.a) && bad(r.c))}`);

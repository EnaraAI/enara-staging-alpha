// Parents school app (e): try the assistant on lms-test with the real DeepSeek provider. First reloads the school app seed (it turns
// the assistant on for the seeded schools), then POST /api/maintenance/school-chat-check. Prints counts and answers (seed data only);
// never a secret.
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
const post = async (path, body) => { const r = await fetch(`${SITE}/api/maintenance${path}`, { method: 'POST', headers: H, body: JSON.stringify(body), signal: AbortSignal.timeout(280_000) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };
const seed = await post('/full-seed', { action: 'run-school-app' });
console.log('SEED', seed.status, JSON.stringify(seed.body?.counts ?? seed.body));
const t = Date.now();
const r = await post('/school-chat-check', {});
console.log('CHECK', r.status, 'seconds', Math.round((Date.now() - t) / 1000));
if (!r.body) process.exit(1);
console.log('SUMMARY', JSON.stringify({ schools: r.body.schools, asked: r.body.asked, model: r.body.model, code: r.body.code, refused: r.body.refused }));
for (const x of r.body.results ?? []) console.log('Q', JSON.stringify(x));
if (r.status >= 400) process.exit(1);

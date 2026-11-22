// Owner (22 Nov 2026): load the full data set on lms-test (POST /api/maintenance/full-seed). Prints counts only: no passwords, no
// user list (that is in docs/lms/SEED_USERS.md). ACTION=run|remove|status.
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
const call = async (action) => { const r = await fetch(`${SITE}/api/maintenance/full-seed`, { method: 'POST', headers: H, body: JSON.stringify({ action }), signal: AbortSignal.timeout(300_000) }); const j = await r.json().catch(() => ({})); return { status: r.status, body: j }; };
const action = process.env.ACTION || 'run';
const t = Date.now(); const out = await call(action);
const { users, ...rest } = out.body ?? {};
console.log('ACTION', action, 'HTTP', out.status, 'seconds', Math.round((Date.now() - t) / 1000));
console.log('RESULT', JSON.stringify({ ...rest, users: Array.isArray(users) ? users.length : undefined }));
const st = await call('status'); console.log('STATUS', JSON.stringify(st.body));
if (out.status >= 400) process.exit(1);

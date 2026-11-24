// Read-only: /ready on each site, 6 times, 20 s apart (states only).
const sites = ['https://test.enara.app/ready', 'https://lms-test.enara.app/ready', 'https://enara.app/'];
for (let i = 0; i < 6; i++) {
  const row = [];
  for (const u of sites) {
    try { const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(30000) }); const j = await r.json().catch(() => null); row.push(`${new URL(u).host} ${r.status}${j?.checks?.mongo ? ` mongo=${j.checks.mongo}` : ''}`); }
    catch { row.push(`${new URL(u).host} no answer`); }
  }
  console.log(new Date().toISOString().slice(11, 19), row.join(' | '));
  if (i < 5) await new Promise((r) => setTimeout(r, 20000));
}

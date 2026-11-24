// Vercel move (owner go, 24 Nov 2026): transfer ONE project from the old team to the new team with Vercel's own project transfer,
// then verify. Names and states only are printed: never a value, never the transfer code, never a token.
//   before: old project, its domains, env keys/targets/types, SHA-256 of every readable value (kept in memory only)
//   transfer: POST /v1/projects/:id/transfer-request (old team) -> PUT /v1/projects/transfer-request/:code (new team)
//   after:  same project in the new team: env names/targets/types equal, hashes equal for readable values, sensitive ones present,
//           domains equal, the same production deployment. LMS_KEK must be present (sensitive: presence + behaviour check).
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
const OLD_TEAM = 'team_xbSucLT1roYt4njeB4tRPfKQ';
const ALLOWED = ['enara-lms-test', 'enara-staging-alpha', 'enara-landing'];
const NAME = readFileSync(new URL('./transfer-target.txt', import.meta.url), 'utf8').trim();
const DRY = readFileSync(new URL('./transfer-mode.txt', import.meta.url), 'utf8').trim() !== 'transfer';  // anything but "transfer" = dry run
const lines = []; const say = (s) => { lines.push(s); console.log(s); };
const die = (s) => { say(`STOP: ${s}`); writeFileSync('transfer.md', lines.join('\n') + '\n'); process.exit(1); };
if (!ALLOWED.includes(NAME)) die(`"${NAME}" is not one of ${ALLOWED.join(', ')}`);
for (const k of ['VERCEL_TOKEN_OLD', 'VERCEL_TOKEN_NEW']) if (!process.env[k]) die(`${k} is not set`);
async function api(tok, path, { method = 'GET', body } = {}) {
  const r = await fetch('https://api.vercel.com' + path, { method, headers: { Authorization: `Bearer ${process.env[tok]}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
const sha = (v) => createHash('sha256').update(String(v ?? '')).digest('hex');
async function snapshot(tok, teamId, idOrName) {
  const p = await api(tok, `/v9/projects/${encodeURIComponent(idOrName)}?teamId=${teamId}`);
  if (p.status !== 200) return null;
  const list = (await api(tok, `/v10/projects/${p.j.id}/env?teamId=${teamId}&decrypt=true`)).j.envs ?? [];
  const env = {};
  for (const e of list) {
    const key = `${e.key} [${[].concat(e.target ?? []).sort().join(',')}${e.gitBranch ? ` @${e.gitBranch}` : ''}]`;
    let hash = null;
    if (e.type !== 'sensitive') {  // readable: the single-variable endpoint returns the decrypted value
      const one = await api(tok, `/v1/projects/${p.j.id}/env/${e.id}?teamId=${teamId}`);
      hash = one.status === 200 && typeof one.j.value === 'string' ? sha(one.j.value) : `unreadable(${one.status})`;
    }
    env[key] = { name: e.key, type: e.type, hash };
  }
  const domains = ((await api(tok, `/v9/projects/${p.j.id}/domains?teamId=${teamId}&limit=100`)).j.domains ?? []).map((d) => d.name).sort();
  const dep = ((await api(tok, `/v6/deployments?teamId=${teamId}&projectId=${p.j.id}&target=production&limit=1&state=READY`)).j.deployments ?? [])[0];
  return { id: p.j.id, name: p.j.name, nodeVersion: p.j.nodeVersion, region: p.j.serverlessFunctionRegion, protection: p.j.ssoProtection?.deploymentType ?? 'none', env, domains, dep: dep?.uid ?? null };
}
async function probe(url) {
  try { const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) }); const j = await r.json().catch(() => null); return `${r.status}${j?.checks?.mongo ? ` mongo=${j.checks.mongo}` : ''}`; }
  catch { return 'no answer'; }
}
// ---- new team
const teams = (await api('VERCEL_TOKEN_NEW', '/v2/teams?limit=20')).j.teams ?? [];
if (teams.length !== 1) die(`the new token sees ${teams.length} teams; expected exactly 1`);
const NEW_TEAM = teams[0].id;
if (NEW_TEAM === OLD_TEAM) die('the new token points at the old team');
say(`# Vercel transfer: ${NAME}`);
say(`_${new Date().toISOString()} · old team ${OLD_TEAM} → new team ${teams[0].slug} (${NEW_TEAM})${DRY ? ' · DRY RUN (no transfer)' : ''}_`);
// ---- before
const before = await snapshot('VERCEL_TOKEN_OLD', OLD_TEAM, NAME);
if (!before) {
  const already = await snapshot('VERCEL_TOKEN_NEW', NEW_TEAM, NAME);
  die(already ? 'the project is already in the new team (nothing to do)' : 'project not found in the old team');
}
const sites = before.domains.filter((d) => !d.endsWith('.vercel.app')).map((d) => `https://${d}${NAME === 'enara-landing' ? '/' : '/ready'}`);
const probesBefore = {}; for (const u of sites) probesBefore[u] = await probe(u);
say(`- Before: project ${before.id}, ${Object.keys(before.env).length} variables (${Object.values(before.env).filter((e) => e.type === 'sensitive').length} sensitive), domains ${before.domains.join(', ')}, production deployment ${before.dep}`);
say(`- Site before: ${Object.entries(probesBefore).map(([u, s]) => `${u} → ${s}`).join('; ')}`);
if (DRY) { writeFileSync('transfer.md', lines.join('\n') + '\n'); process.exit(0); }
// ---- transfer
const req = await api('VERCEL_TOKEN_OLD', `/v1/projects/${before.id}/transfer-request?teamId=${OLD_TEAM}`, { method: 'POST', body: {} });
if (![200, 201].includes(req.status) || typeof req.j.code !== 'string') die(`transfer request refused by Vercel: HTTP ${req.status} ${req.j.error?.code ?? ''} ${req.j.error?.message ?? ''}`.trim());
const acc = await api('VERCEL_TOKEN_NEW', `/v1/projects/transfer-request/${encodeURIComponent(req.j.code)}?teamId=${NEW_TEAM}`, { method: 'PUT', body: {} });
if (![200, 202].includes(acc.status)) die(`accept refused by Vercel: HTTP ${acc.status} ${acc.j.error?.code ?? ''} ${acc.j.error?.message ?? ''} (the request expires in 24 h; nothing moved)`.trim());
say(`- Transfer accepted (HTTP ${acc.status})`);
// ---- after (the transfer may take a little while to show)
let after = null;
for (let i = 0; i < 30 && !after; i++) { await new Promise((r) => setTimeout(r, 10000)); after = await snapshot('VERCEL_TOKEN_NEW', NEW_TEAM, NAME); }
if (!after) die('the project does not show in the new team after 5 min');
const gone = await snapshot('VERCEL_TOKEN_OLD', OLD_TEAM, NAME);
const diff = [];
for (const k of new Set([...Object.keys(before.env), ...Object.keys(after.env)])) {
  const a = before.env[k], b = after.env[k];
  if (!a || !b) { diff.push(`${k}: ${a ? 'missing in new' : 'extra in new'}`); continue; }
  if (a.type !== b.type) diff.push(`${k}: type ${a.type} → ${b.type}`);
  else if (a.hash !== b.hash) diff.push(`${k}: value differs`);
}
const kek = Object.values(after.env).some((e) => e.name === 'LMS_KEK');
say(`- After: project ${after.id} in the new team${gone ? ' (STILL listed in the old team)' : ', gone from the old team'}`);
say(`- Variables: ${diff.length ? `DIFFER: ${diff.join('; ')}` : `all match (${Object.keys(after.env).length}; readable values by hash, sensitive ones by name and type)`}`);
if (Object.values(before.env).some((e) => e.name === 'LMS_KEK')) say(`- LMS_KEK: ${kek ? 'present (sensitive: value checked by behaviour, below)' : 'MISSING'}`);
say(`- Domains: ${JSON.stringify(after.domains) === JSON.stringify(before.domains) ? `same (${after.domains.join(', ')})` : `before ${before.domains.join(', ')} / after ${after.domains.join(', ') || 'none'}`}`);
say(`- Production deployment: ${after.dep === before.dep ? `same (${after.dep})` : `before ${before.dep} / after ${after.dep}`}`);
say(`- Settings: Node ${before.nodeVersion}→${after.nodeVersion}, region ${before.region}→${after.region}, protection ${before.protection}→${after.protection}`);
await new Promise((r) => setTimeout(r, 20000));
for (const u of sites) say(`- Site after: ${u} → ${await probe(u)} (before: ${probesBefore[u]})`);
writeFileSync('transfer.md', lines.join('\n') + '\n');
writeFileSync('new-team.txt', `${NEW_TEAM}\n${after.id}\n`);
if (diff.length || !after.dep) process.exit(1);

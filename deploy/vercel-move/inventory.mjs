// Vercel move, step 1 (owner go, 24 Nov 2026): READ-ONLY inventory of the old account. Writes Markdown with NAMES ONLY.
// Every field is whitelisted: an env entry contributes key/target/type/branch only, never its value (plain values appear in API lists).
import { writeFileSync } from 'node:fs';
const TOKEN = process.env.VERCEL_TOKEN_OLD;
if (!TOKEN) { console.log('VERCEL_TOKEN_OLD is not set'); process.exit(1); }
const API = 'https://api.vercel.com';
async function get(path) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`${path.split('?')[0]} -> HTTP ${r.status}`);
  return r.json();
}
const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null)).toString();
const out = [];
const L = (s = '') => out.push(s);
const user = await get('/v2/user').catch((e) => ({ error: e.message }));
const teams = (await get('/v2/teams?limit=100')).teams ?? [];
L('# Vercel move: inventory of the old account (names only)');
L(`_Generated ${new Date().toISOString()} by a read-only GitHub Action. No values; variable names, targets and types only._`);
L();
L(`Token scope: ${teams.length} team(s): ${teams.map((t) => `${t.slug} (${t.id})`).join(', ') || 'none'}; personal account ${user.user?.username ? 'present' : 'unknown'}.`);
const scopes = [...teams.map((t) => ({ label: `team ${t.slug}`, teamId: t.id })), { label: 'personal account', teamId: null }];
for (const s of scopes) {
  let projects = [];
  try {
    let next; do {
      const r = await get(`/v9/projects?${q({ teamId: s.teamId, limit: 100, until: next })}`);
      projects.push(...(r.projects ?? [])); next = r.pagination?.next;
    } while (next);
  } catch (e) { L(); L(`## ${s.label}: could not list projects (${e.message})`); continue; }
  L(); L(`## ${s.label}: ${projects.length} project(s)`);
  for (const p0 of projects) {
    const tq = q({ teamId: s.teamId });
    const p = await get(`/v9/projects/${p0.id}?${tq}`);
    const domains = (await get(`/v9/projects/${p.id}/domains?${tq}&limit=100`).catch(() => ({ domains: [] }))).domains ?? [];
    const envs = (await get(`/v10/projects/${p.id}/env?${tq}`).catch(() => ({ envs: [] }))).envs ?? [];
    const deps = (await get(`/v6/deployments?${q({ teamId: s.teamId, projectId: p.id, target: 'production', limit: 1, state: 'READY' })}`).catch(() => ({ deployments: [] }))).deployments ?? [];
    const d = deps[0];
    L(); L(`### ${p.name}`);
    L(`| Setting | Value |`); L(`|---|---|`);
    const row = (k, v) => L(`| ${k} | ${v === undefined || v === null || v === '' ? '—' : String(v).replace(/\|/g, '\\|')} |`);
    row('Project id', p.id); row('Framework', p.framework); row('Node version', p.nodeVersion);
    row('Region (functions)', p.serverlessFunctionRegion); row('Root directory', p.rootDirectory);
    row('Install command', p.installCommand); row('Build command', p.buildCommand); row('Output directory', p.outputDirectory);
    row('Dev command', p.devCommand); row('Ignored build step', p.commandForIgnoringBuildStep);
    row('Git', p.link ? `${p.link.type} ${p.link.org ?? ''}/${p.link.repo ?? ''}` : 'not connected');
    row('Production branch', p.link?.productionBranch);
    row('Auto-expose system env', p.autoExposeSystemEnvs);
    row('Deployment protection', p.ssoProtection ? `Vercel auth (${p.ssoProtection.deploymentType})` : 'none');
    row('Password protection', p.passwordProtection ? 'yes' : 'no');
    row('Fluid compute', p.resourceConfig?.fluid ?? p.fluid);
    row('Function max duration / memory (project)', [p.resourceConfig?.functionDefaultTimeout, p.resourceConfig?.functionDefaultMemoryType].filter(Boolean).join(' / '));
    row('Crons', p.crons?.definitions?.length ? p.crons.definitions.map((c) => `${c.schedule} ${c.path}`).join('; ') : 'none');
    row('Live production deployment', d ? `${d.uid} (${new Date(d.created).toISOString()})` : 'none found');
    row('Live commit', d?.meta?.githubCommitSha ? `${d.meta.githubCommitSha} (${d.meta.githubCommitRef ?? '?'})` : d ? 'not from git (CLI deploy)' : '—');
    L(); L(`**Domains (${domains.length}):** ${domains.map((x) => `${x.name}${x.redirect ? ` → ${x.redirect}` : ''}${x.gitBranch ? ` [branch ${x.gitBranch}]` : ''}${x.verified === false ? ' (unverified)' : ''}`).join(', ') || 'none'}`);
    L(); L(`**Environment variables (${envs.length}), names only:**`); L();
    L('| Name | Targets | Type | Git branch |'); L('|---|---|---|---|');
    for (const e of [...envs].sort((a, b) => a.key.localeCompare(b.key))) L(`| ${e.key} | ${[].concat(e.target ?? []).join(', ')} | ${e.type} | ${e.gitBranch ?? '—'} |`);
    const sens = envs.filter((e) => e.type === 'sensitive').map((e) => e.key);
    L(); L(`Sensitive (cannot be read back, must be re-entered by hand): ${sens.length ? sens.join(', ') : 'none'}`);
  }
}
writeFileSync('VERCEL_MOVE.md', out.join('\n') + '\n');
console.log(`inventory written: ${out.length} lines`);

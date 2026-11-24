// One test of every environment variable, Part 1 (owner go, 24 Nov 2026): from outside, read-only, all projects of the new team.
// Prints and writes names and states only. Readable values are checked in memory (format), never printed; sensitive ones cannot be read.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const TOKEN = process.env.VERCEL_TOKEN_NEW; const TEAM = 'team_fHEDYVPWJ218PaXEBwnBMFvk';
const api = async (p) => { const r = await fetch('https://api.vercel.com' + p + (p.includes('?') ? '&' : '?') + `teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } }); if (!r.ok) throw new Error(`${p.split('?')[0]} HTTP ${r.status}`); return r.json(); };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const SYSTEM = /^(VERCEL|VERCEL_.*|NODE_ENV|CI|PORT|TZ|HOME|PATH|npm_.*)$/;
const out = []; const L = (s = '') => out.push(s);
L('# Environment variable check, Part 1 (outside, read-only)'); L(`_${new Date().toISOString()} · new team · names and states only_`);
function codeOf(sha) {
  const files = git('ls-tree', '-r', '--name-only', sha).split('\n').filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !/node_modules|\.test\.|\/test\/|e2e\/|research\//.test(f) && /^(backend\/src|api|frontend|relay)\//.test(f));
  let text = ''; for (const f of files) { try { text += git('show', `${sha}:${f}`) + '\n'; } catch {} }
  return text;
}
function formatProblem(name, v, engineFeatures) {
  if (v === '') return 'empty';
  if (v !== v.trim()) return 'leading/trailing space or newline';
  if (/(_URL|_URI|ENDPOINT|_ORIGIN)$/.test(name) && !/ORIGINS$/.test(name)) { try { new URL(v); } catch { return 'not a URL'; } }
  if (/(_ORIGINS)$/.test(name)) { for (const o of v.split(',').map((s) => s.trim()).filter(Boolean)) { try { new URL(o); } catch { if (!o.includes('*')) return 'an origin is not a URL'; } } }
  if (/(_MS|_SECONDS|_SIZE|_LIMIT|_USD|_MAX|_MIN|_TIMEOUT|_DAYS|_PERCENT)$/.test(name) && !/^-?\d+(\.\d+)?$/.test(v)) return 'not a number';
  if (/(_ENABLED|^ENARA_STAGING)$/.test(name) && !/^(true|false|1|0)$/.test(v)) return 'not true/false';
  if (name === 'ENARA_ENGINE_V2' && engineFeatures) { const bad = v.split(',').map((s) => s.trim()).filter((s) => s && s !== 'all' && !engineFeatures.has(s) && !engineFeatures.has(`bundle:${s}`)); if (bad.length) return `unknown features: ${bad.join(', ')}`; }
  return null;
}
async function probe(url) { try { const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) }); const j = await r.json().catch(() => null); return { status: r.status, checks: j?.checks ?? null }; } catch { return { status: 0, checks: null }; } }
const projects = (await api('/v9/projects?limit=100')).projects ?? [];
const summary = [];
for (const p0 of projects.sort((a, b) => a.name.localeCompare(b.name))) {
  const p = await api(`/v9/projects/${p0.id}`);
  const envs = (await api(`/v10/projects/${p.id}/env`)).envs ?? [];
  const domains = ((await api(`/v9/projects/${p.id}/domains?limit=50`)).domains ?? []).map((d) => d.name).filter((d) => !d.endsWith('.vercel.app'));
  const dep = ((await api(`/v6/deployments?projectId=${p.id}&target=production&limit=1&state=READY`)).deployments ?? [])[0];
  const sha = dep?.meta?.githubCommitSha;
  L(); L(`## ${p.name} (${domains.join(', ')})`);
  let code = null, engineFeatures = null;
  if (sha) { try { code = codeOf(sha); const m = code.match(/export type EngineV2Feature = ([^;]+);/); if (m) engineFeatures = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]), ...[...code.matchAll(/v\.includes\('([a-z0-9]+)'\) && [A-Z0-9_]+\.includes\(feature\)/g)].map((x) => `bundle:${x[1]}`)); } catch (e) { L(`Live commit ${sha.slice(0, 8)} not readable here (${e.message.split('\n')[0]})`); } }
  L(`Live code: ${sha ? `commit ${sha.slice(0, 8)}` : 'not deployed from git (names in code cannot be compared)'}`);
  const rows = []; let bad = 0;
  const names = new Set();
  for (const e of [...envs].sort((a, b) => a.key.localeCompare(b.key))) {
    names.add(e.key);
    let fmt = 'sensitive: cannot be read';
    if (e.type !== 'sensitive') {
      const one = await fetch(`https://api.vercel.com/v1/projects/${p.id}/env/${e.id}?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).then((r) => r.json()).catch(() => ({}));
      const prob = typeof one.value === 'string' ? formatProblem(e.key, one.value, engineFeatures) : 'could not read';
      fmt = prob ? `**${prob}**` : 'ok'; if (prob) bad++;
    }
    const used = code == null ? '—' : (code.includes(e.key) ? 'yes' : '**not read by the live code**');
    rows.push(`| ${e.key} | ${[].concat(e.target ?? []).join(', ')} | ${e.type} | ${fmt} | ${used} |`);
  }
  L(); L('| Variable | Targets | Type | Value format | Read by live code |'); L('|---|---|---|---|---|'); rows.forEach((r) => L(r));
  if (code) {
    const read = new Set([...code.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g), ...code.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g), ...code.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)].map((m) => m[1]));
    const missing = [...read].filter((n) => !names.has(n) && !SYSTEM.test(n)).sort();
    L(); L(`Read by the live code but not set in Vercel (most are optional with a default; listed for review): ${missing.length ? missing.join(', ') : 'none'}`);
  }
  const live = [];
  for (const d of domains) {
    if (p.name === 'enara-landing') { const r = await probe(`https://${d}/`); live.push(`${d}/ → ${r.status}`); continue; }
    const r = await probe(`https://${d}/ready`);
    live.push(`${d}/ready → ${r.status}${r.checks ? ' ' + Object.entries(r.checks).map(([k, v]) => `${k}=${v}`).join(' ') : ''}`);
  }
  L(); L(`Running site: ${live.join('; ')}`);
  summary.push(`- **${p.name}**: ${envs.length} variables, ${envs.filter((e) => e.type === 'sensitive').length} sensitive; format problems: ${bad}; ${live.join('; ')}`);
}
writeFileSync('ENV_CHECK.md', ['# Environment variable check — summary', ...summary, '', ...out.slice(1)].join('\n') + '\n');
console.log(summary.join('\n'));

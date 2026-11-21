// Copies named keys (owner "yes", 21 Nov 2026) from the Vercel project behind test.enara.app to enara-lms-test (Production).
// The source project is ONLY READ (GET); nothing is written there, so test.enara.app stays frozen. Values pass through memory only:
// never printed, logged or written to disk. The summary names each key with copied / already set / missing / not readable.
import { appendFileSync } from 'node:fs';
import { PROJECT_ID, TEAM_ID } from './lib.mjs';

const API = 'https://api.vercel.com';
const SOURCE_DOMAIN = 'test.enara.app';
const KEYS = ['ANAM_API_KEY', 'ANAM_AVATAR_ID', 'ANAM_VOICE_ID_EN', 'ANAM_VOICE_ID_EN_FEMALE', 'AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'];
const token = process.env.VERCEL_TOKEN;
if (!token) { console.log('VERCEL_TOKEN is not set'); process.exit(1); }

async function api(path, { method = 'GET', body } = {}) {
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Vercel ${method} ${path.split('?')[0].replace(/\/env\/[^/]+$/, '/env/<id>')}: HTTP ${res.status}`), { status: res.status });
  return json;
}

async function sourceProject() {
  let until = '';
  for (let page = 0; page < 20; page++) {
    const r = await api(`/v9/projects?limit=100${until ? `&until=${until}` : ''}`);
    for (const p of r.projects ?? []) {
      if (p.id === PROJECT_ID) continue;
      const d = await api(`/v9/projects/${p.id}/domains?limit=100`);
      if ((d.domains ?? []).some((x) => x.name === SOURCE_DOMAIN)) return p;
    }
    until = r.pagination?.next; if (!until) break;
  }
  return null;
}

const out = [];
const src = await sourceProject();
if (!src) { console.log(`no project found with the domain ${SOURCE_DOMAIN}`); process.exit(1); }
if (src.id === PROJECT_ID) { console.log('source equals the target; refusing'); process.exit(1); }
const srcEnv = (await api(`/v10/projects/${src.id}/env`)).envs ?? [];
const dstEnv = (await api(`/v10/projects/${PROJECT_ID}/env`)).envs ?? [];
for (const key of KEYS) {
  const dstHas = dstEnv.some((e) => e.key === key && (e.target ?? []).includes('production'));
  const s = srcEnv.filter((e) => e.key === key).sort((a, b) => Number((b.target ?? []).includes('production')) - Number((a.target ?? []).includes('production')))[0];
  if (!s) { out.push(`${key}: ${dstHas ? 'already set on lms-test (not in source)' : 'missing in the source project'}`); continue; }
  if (s.type === 'sensitive') { out.push(`${key}: not readable (Sensitive in the source); ${dstHas ? 'already set on lms-test' : 'please set it in enara-lms-test yourself'}`); continue; }
  let value;
  try { value = (await api(`/v1/projects/${src.id}/env/${s.id}`)).value; } catch { out.push(`${key}: could not read from the source`); continue; }
  if (typeof value !== 'string' || !value) { out.push(`${key}: empty in the source`); continue; }
  await api(`/v10/projects/${PROJECT_ID}/env?upsert=true`, { method: 'POST', body: { key, value, type: 'encrypted', target: ['production'] } });
  value = undefined;
  out.push(`${key}: copied${dstHas ? ' (replaced the lms-test value)' : ''}`);
}
const text = [`Source project: ${src.name} (read only). Target: enara-lms-test (Production). Values are never shown.`, ...out.map((l) => `- ${l}`), 'They take effect at the next lms-test deploy.'].join('\n');
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);

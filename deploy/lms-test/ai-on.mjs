// One-off (owner "Turn AI on", 21 Nov 2026): sets AI_PAUSED=false on enara-lms-test (Production) only. test.enara.app is frozen and untouched.
// The $25 test spend cap (AI_TEST_SPEND_CAP_USD) stays. Prints names and states only. Takes effect at the next lms-test deploy.
import { PROJECT_ID, TEAM_ID, FROZEN_HOSTS } from './lib.mjs';
const API = 'https://api.vercel.com';
const token = process.env.VERCEL_TOKEN;
if (!token) { console.log('VERCEL_TOKEN is not set'); process.exit(1); }
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vercel ${method} ${path.split('?')[0]}: HTTP ${res.status}`);
  return json;
}
const p = await api(`/v9/projects/${PROJECT_ID}`);
if (p.name !== 'enara-lms-test') { console.log('not enara-lms-test; refusing'); process.exit(1); }
const d = await api(`/v9/projects/${PROJECT_ID}/domains?limit=100`);
if ((d.domains ?? []).some((x) => FROZEN_HOSTS.includes(x.name))) { console.log('project has a frozen domain; refusing'); process.exit(1); }
const env = (await api(`/v10/projects/${PROJECT_ID}/env`)).envs ?? [];
const cap = env.some((e) => e.key === 'AI_TEST_SPEND_CAP_USD' && (e.target ?? []).includes('production'));
if (!cap) { console.log('AI_TEST_SPEND_CAP_USD is not set; refusing to turn AI on without the cap'); process.exit(1); }
await api(`/v10/projects/${PROJECT_ID}/env?upsert=true`, { method: 'POST', body: { key: 'AI_PAUSED', value: 'false', type: 'plain', target: ['production'] } });
console.log('AI_PAUSED=false set on enara-lms-test (Production). Spend cap present. Takes effect at the next lms-test deploy.');

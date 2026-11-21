// DeepSeek check and comparison on lms-test (owner, 21 Nov 2026): GET /api/maintenance/llm-check, then each of the 20 past tutor turns
// (fake learners, research prompts) through POST /api/maintenance/llm-compare. Results go to out/results.json (no secrets: the provider
// key stays on the server; the maintenance token is only sent to lms-test).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
mkdirSync('out', { recursive: true });
const check = await (await fetch(`${SITE}/api/maintenance/llm-check`, { headers: H, signal: AbortSignal.timeout(300_000) })).json();
console.log('CHECK', JSON.stringify({ ...check, models: undefined, modelIds: (check.models ?? []).map((m) => m.id) }));
const turns = JSON.parse(readFileSync(new URL('./turns.json', import.meta.url), 'utf8'));
const results = [];
for (const t of turns) {
  const r = await fetch(`${SITE}/api/maintenance/llm-compare`, { method: 'POST', headers: H, body: JSON.stringify({ messages: [{ role: 'user', content: t.prompt }], max_tokens: 900 }), signal: AbortSignal.timeout(120_000) }).then((x) => x.json()).catch((e) => ({ ok: false, reason: String(e) }));
  results.push({ id: t.id, ageGroup: t.ageGroup, kind: t.kind, learner: t.learner, claude: t.claude, deepseek: r.text ?? null, ms: r.ms, usage: r.usage, stop: r.stop, ok: r.ok, reason: r.reason });
  console.log('TURN', t.id, r.ok, r.ms, JSON.stringify(r.usage ?? {}));
}
writeFileSync('out/results.json', JSON.stringify({ check, results }, null, 1));

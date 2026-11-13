// Generic metered caller for targeted audits / adjudication. Input: tasks.jsonl {taskId, system, user}.
//   npx tsx audit_calls.ts --tasks f --res f --attempts f --key-file k --cap <remaining USD> [--conc 4]
import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
const BACKEND = '/tmp/claude-0/-home-user/49a4ff52-d976-534d-8a81-a05801e1bd1b/scratchpad/enara-staging-alpha/backend';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Anthropic = require(path.join(BACKEND, 'node_modules/@anthropic-ai/sdk')).default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { unitPriceUsd } = require(path.join(BACKEND, 'src/services/priceCatalog'));
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) { const a = process.argv[i]; if (a.startsWith('--')) args.set(a.slice(2), process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true'); }
const MODEL = 'claude-haiku-5-5'; const MAX_TOKENS = 8000; const EFFORT = 'high';
const CAP = Number(args.get('cap')); const CONC = Number(args.get('conc') ?? '4');
const WORST = 20000 * 0.1e-6 + MAX_TOKENS * 0.5e-6;
const tasks = readFileSync(args.get('tasks')!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const FORBIDDEN = [/qorvath/i, /benchlearner/i, /ltb-stu-/i, /ltb-school-/i, /bench\.invalid/i, /synthetic school/i, /bench admin/i, /ltb-b-\d/i, /ltb-lsn-/i, /ltb-obj-/i, /ltb-cur-/i];
const cost = (u: any) => (u.input_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'input_token') + (u.output_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'output_token')
  + (u.cache_read_input_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'cache_read_token') + (u.cache_creation_input_tokens ?? 0) * unitPriceUsd('anthropic', MODEL, 'cache_write_token');
const client = new Anthropic({ apiKey: readFileSync(args.get('key-file')!, 'utf8').trim(), timeout: 180_000, maxRetries: 0 });
let metered = 0; let reserved = 0; let seq = 0; let capHit = false;
const ATT = args.get('attempts')!; const RES = args.get('res')!;
writeFileSync(ATT, ''); writeFileSync(RES, '');

async function call(t: any, messages: any[]) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (metered + reserved + WORST > CAP) { capHit = true; return null; }
    reserved += WORST; const t0 = Date.now();
    const rec: any = { id: `aud-${String(++seq).padStart(4, '0')}`, taskId: t.taskId, attempt, model: MODEL, effort: EFFORT };
    try {
      const res = await client.messages.create({ model: MODEL, max_tokens: MAX_TOKENS, output_config: { effort: EFFORT }, system: t.system, messages });
      const usd = cost(res.usage); metered += usd;
      appendFileSync(ATT, JSON.stringify({ ...rec, status: 200, latencyMs: Date.now() - t0, modelServed: res.model, stopReason: res.stop_reason, usage: res.usage, costUsd: Number(usd.toFixed(6)) }) + '\n');
      return res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e: any) {
      appendFileSync(ATT, JSON.stringify({ ...rec, status: e?.status ?? 'network_error', error: e?.name, costUsd: 0 }) + '\n');
      if (!(!e?.status || e.status === 429 || e.status >= 500) || attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 5000));
    } finally { reserved -= WORST; }
  }
  return null;
}
const parse = (s: string | null) => { if (!s) return null; const m = s.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

(async () => {
  const out = new Map<string, any>(); let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++];
      const leaks = FORBIDDEN.filter((re) => re.test(t.system) || re.test(t.user)).map(String);
      if (leaks.length) { out.set(t.taskId, { taskId: t.taskId, status: 'PRIVACY_BLOCK', leaks }); continue; }
      const msgs: any[] = [{ role: 'user', content: t.user }];
      let txt = await call(t, msgs); let j = parse(txt);
      if (!j && txt) { msgs.push({ role: 'assistant', content: txt }, { role: 'user', content: 'Reply with only the JSON object.' }); txt = await call(t, msgs); j = parse(txt); }
      out.set(t.taskId, { taskId: t.taskId, status: j ? 'OK' : (capHit ? 'CAP' : 'UNPARSEABLE'), result: j });
      console.log(t.taskId, j ? 'OK' : 'FAIL', `$${metered.toFixed(4)}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  for (const t of tasks) appendFileSync(RES, JSON.stringify(out.get(t.taskId)) + '\n');
  console.log('done', JSON.stringify({ meteredUsd: Number(metered.toFixed(6)), calls: seq, capHit }));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

// Idle-timeout probe (owner, 21 Nov 2026): how long the DeepSeek server on Modal stays warm after the last call, and what the warm-up ping
// changes for a learner's first reply after a long quiet gap. Reads only times (no learner data; fake turn). No Modal or Vercel setting is
// changed. Must not run while other tests use the model (they keep it warm).
import { writeFileSync, mkdirSync } from 'node:fs';
const SITE = 'https://lms-test.enara.app';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (path, body) => fetch(`${SITE}/api/maintenance/${path}`, { method: 'POST', headers: H, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(330_000) }).then((r) => r.json()).catch((e) => ({ ok: false, reason: String(e) }));
const TURN = { history: [{ role: 'user', content: 'Can I practise, please?' }, { role: 'assistant', content: 'What is 2/8 + 3/8?' }], query: '5/16', learner: 'Age: 11 (a child).', practice: true };
const turn = async () => { const r = await post('tutor-eval', { arm: 'fast', stream: true, turn: TURN }); return { ok: r.ok, firstWordsMs: r.firstVisibleMs, wholeMs: r.wholeMs }; };
const log = []; const note = (x) => { const e = { at: new Date().toISOString(), ...x }; log.push(e); console.log(JSON.stringify(e)); };
mkdirSync('out', { recursive: true });
const save = (extra) => writeFileSync('out/idle.json', JSON.stringify({ log, ...extra }, null, 1));

// Phase 1: growing quiet gaps; a ping much slower than the warm ones means the server had gone idle (and how long it took to start).
note({ step: 'warm-ping', ...(await post('llm-ping')) });
note({ step: 'warm-ping', ...(await post('llm-ping')) });
const warm = log.filter((e) => e.ok).map((e) => e.ms); const warmMs = Math.max(...warm, 400);
let idleAfterMin = null; let coldStartMs = null;
// First run (cancelled to save time) showed it still warm after quiet gaps of 1, 2, 4, 6, 9, 13 and 18 min; continue from there.
for (const gapMin of [25, 40]) {
  await sleep(gapMin * 60_000);
  const r = await post('llm-ping'); note({ step: 'gap', gapMin, ...r });
  if (r.ok && r.ms > Math.max(4 * warmMs, 3000)) { idleAfterMin = gapMin; coldStartMs = r.ms; break; }
}
save({ idleAfterMin, coldStartMs });
// Phase 2: the learner's first reply after a quiet gap longer than the timeout, without and with the warm-up ping (sent when the page
// opens; the learner types for about 10 s).
if (idleAfterMin === null) { save({ idleAfterMin, coldStartMs, note: 'still warm after 40 quiet minutes: no cold start to measure' }); process.exit(0); }
const gap = idleAfterMin + 2;
note({ step: 'warm-turn', ...(await turn()) });
for (let i = 0; i < 1; i++) { // one round each (owner, to save time)
  await sleep(gap * 60_000);
  note({ step: 'cold-turn-no-warmup', gapMin: gap, ...(await turn()) });
  await sleep(gap * 60_000);
  const ping = post('llm-ping'); await sleep(10_000);
  const t = await turn(); const p = await ping;
  note({ step: 'cold-turn-with-warmup', gapMin: gap, pingMs: p.ms, ...t });
}
save({ idleAfterMin, coldStartMs, warmPingMs: warm });

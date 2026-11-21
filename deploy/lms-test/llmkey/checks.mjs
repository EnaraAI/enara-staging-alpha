// One-off (owner, 21 Nov 2026): checks the DeepSeek endpoint on Modal and sets TUTOR_LLM_API_KEY on enara-lms-test (Production) only.
// The key arrives only as process.env.TUTOR_LLM_API_KEY (decrypted in memory by the workflow) and is never printed, logged or written.
// Prints: auth mode, model ids, max output tokens info, cold/warm latency, streaming check, a test reply (first 120 chars), usage.
import { PROJECT_ID, TEAM_ID, FROZEN_HOSTS } from '../lib.mjs';
const BASE = 'https://enaraai--ep-deepseek-v4-1-flash-1017-server.us-west.modal.direct/v1';
const KEY = process.env.TUTOR_LLM_API_KEY;
if (!KEY) { console.log('no key'); process.exit(1); }
const bearer = { Authorization: `Bearer ${KEY}` };
const dot = KEY.indexOf('.');
const split = dot > 0 ? { 'Modal-Key': KEY.slice(0, dot), 'Modal-Secret': KEY.slice(dot + 1) } : null;
async function get(path, h) { const t = Date.now(); const r = await fetch(BASE + path, { headers: h, signal: AbortSignal.timeout(600_000) }); return { status: r.status, ms: Date.now() - t, body: await r.text() }; }
let auth = null, H = null;
for (const [name, h] of [['bearer', bearer], ['modal-key/secret', split]]) {
  if (!h) continue;
  const r = await get('/models', h); console.log(`models via ${name}: HTTP ${r.status} in ${r.ms} ms`);
  if (r.status === 200) { auth = name; H = h; console.log('MODELS', r.body.slice(0, 1500)); break; }
}
if (!H) { console.log('auth failed both ways'); process.exit(2); }
const models = JSON.parse((await get('/models', H)).body).data ?? [];
const model = models[0]?.id; console.log('MODEL_ID', model, 'max_model_len', models[0]?.max_model_len ?? 'n/a');
async function chat(stream, maxTokens = 120) {
  const body = { model, stream, max_tokens: maxTokens, temperature: 0.4, messages: [
    { role: 'system', content: 'You are a patient English tutor for a 10-year-old. Reply in at most 2 short sentences, then ask ONE question.' },
    { role: 'user', content: 'I goed to the park yesterday.' }], ...(stream ? { stream_options: { include_usage: true } } : {}) };
  const t = Date.now();
  const r = await fetch(BASE + '/chat/completions', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(600_000) });
  if (!stream) { const j = await r.json(); return { status: r.status, ms: Date.now() - t, text: j.choices?.[0]?.message?.content ?? JSON.stringify(j).slice(0, 300), usage: j.usage, finish: j.choices?.[0]?.finish_reason }; }
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '', first = null, text = '', usage = null, chunks = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      const j = JSON.parse(d); const c = j.choices?.[0]?.delta?.content; if (c) { if (first === null) first = Date.now() - t; text += c; chunks++; } if (j.usage) usage = j.usage; } }
  return { status: r.status, ms: Date.now() - t, first, chunks, text, usage };
}
const cold = await chat(false); console.log('CALL1 (cold?)', JSON.stringify({ status: cold.status, ms: cold.ms, finish: cold.finish, usage: cold.usage }), 'reply:', String(cold.text).slice(0, 120));
const warm = []; for (let i = 0; i < 3; i++) { const w = await chat(false); warm.push(w.ms); }
console.log('WARM_MS', JSON.stringify(warm));
const st = await chat(true); console.log('STREAM', JSON.stringify({ status: st.status, totalMs: st.ms, firstTokenMs: st.first, chunks: st.chunks, usage: st.usage }), 'reply:', st.text.slice(0, 120));
const big = await chat(false, 8192); console.log('MAX8192', JSON.stringify({ status: big.status, finish: big.finish, usage: big.usage }));
// Set the key on enara-lms-test only (Sensitive, Production). Never printed.
const VT = process.env.VERCEL_TOKEN;
async function v(path, init = {}) { const r = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`, { ...init, headers: { Authorization: `Bearer ${VT}`, 'Content-Type': 'application/json' } }); if (!r.ok) throw new Error(`Vercel ${init.method ?? 'GET'} ${path.split('?')[0]} HTTP ${r.status}`); return r.json(); }
const p = await v(`/v9/projects/${PROJECT_ID}`); if (p.name !== 'enara-lms-test') { console.log('not enara-lms-test; refusing'); process.exit(3); }
const d = await v(`/v9/projects/${PROJECT_ID}/domains?limit=100`); if ((d.domains ?? []).some((x) => FROZEN_HOSTS.includes(x.name))) { console.log('frozen domain; refusing'); process.exit(3); }
await v(`/v10/projects/${PROJECT_ID}/env?upsert=true`, { method: 'POST', body: JSON.stringify({ key: 'TUTOR_LLM_API_KEY', value: KEY, type: 'sensitive', target: ['production'] }) });
console.log('TUTOR_LLM_API_KEY set on enara-lms-test (Production, Sensitive). AUTH_MODE', auth);

// Local preview with made-up fixture data (never production data): node dev_server.mjs [port]
// Serves out/site.mjs on http://localhost:<port> with node:sqlite standing in for D1. Password: "preview-only".
// The Ask tab answers from a scripted stand-in for the Anthropic API (no network call, no key).
import http from 'node:http';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fixtureDocs } from './fixture.mjs';
const here = new URL('.', import.meta.url).pathname;
const { default: worker } = await import(here + 'out/site.mjs');
const sq = new DatabaseSync(':memory:');
sq.exec(fs.readFileSync(here + 'schema.sql', 'utf8'));
const ins = sq.prepare('INSERT INTO docs (coll, id, data, version, updated_at) VALUES (?, ?, ?, ?, ?)');
for (const d of fixtureDocs(Date.now())) ins.run(d.coll, d.id, JSON.stringify(d.data), d.version || 1, new Date().toISOString());
const DB = { prepare(sql) { let params = []; const st = {
  bind(...p) { params = p; return st; },
  async first() { return sq.prepare(sql).get(...params) ?? null; },
  async all() { return { results: sq.prepare(sql).all(...params) }; },
  async run() { const r = sq.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; } }; return st; } };
const env = { DB, SITE_PASSWORD: 'preview-only', SESSION_KEY: 'preview-session-key', ANTHROPIC_API_KEY: 'preview-not-a-key' };

// Scripted stand-in for the Messages API: search drafted leads, propose approving the best one and a shorter draft.
globalThis.fetch = async (url, o) => {
  const b = JSON.parse(o.body), last = b.messages[b.messages.length - 1];
  const reply = x => new Response(JSON.stringify(x), { status: 200 });
  if (typeof last.content === 'string') return reply({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'search_leads', input: { status: 'drafted' } }] });
  const res = last.content[0];
  if (res.tool_use_id === 'u1') {
    const top = JSON.parse(res.content).leads.sort((a, c) => (c.score || 0) - (a.score || 0))[0];
    return reply({ stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: 'u2', name: 'propose_action', input: { action: 'approve', leadId: top.id, reason: 'Score 5, a named head of school with a direct email, and a strong digital-learning fit.' } },
      { type: 'tool_use', id: 'u3', name: 'propose_action', input: { action: 'add_task', leadId: top.id, title: 'Call the school office if no reply in a week', due: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) } },
    ] });
  }
  return reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'You have **5 drafts** waiting. Start with these:\n\n1. **Cedar Grove International School** (Cairo): score 5, named head of school.\n2. **Al Waha Bilingual School** (Riyadh): score 4, Arabic draft ready.\n3. **Gulf Skills Training Centre** (Dubai): score 4, the new training-centre segment.\n\nI suggested approving the first one and a follow-up task. Confirm below if you agree.' }] });
};

const port = Number(process.argv[2]) || 8788;
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }), env);
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].replace(/; Secure/, ''); // plain http on localhost only
  res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log('preview on http://localhost:' + port));

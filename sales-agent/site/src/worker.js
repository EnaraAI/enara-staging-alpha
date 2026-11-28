// ENARA sales agent website (sales.enara.app). Password login, then the lead tracker backed by D1.
// APP_HTML, APP_JS and LOGIN_HTML are inlined by build.py.

const enc = new TextEncoder();
const DAY = 86400;
const SESSION_DAYS = 30;
// cdnjs is allowed only for the spreadsheet (SheetJS) and PDF (pdf.js) readers used by uploads.
const CSP = "default-src 'none'; script-src 'self' https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://assets.enara.app; connect-src 'self' https://cdnjs.cloudflare.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
const STATUSES = new Set(['drafted', 'approved', 'sent', 'replied', 'not_interested', 'do_not_contact', 'skipped']);
const COUNTRY_CODES = new Set(['EG', 'SA', 'IQ', 'AE', 'KW', 'QA', 'BH', 'OM']);
const SEGMENT_CODES = new Set(['international_school', 'private_school', 'school_group', 'language_center', 'training_center', 'university']);

function headers(extra = {}) {
  return {
    'Content-Security-Policy': CSP,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Strict-Transport-Security': 'max-age=31536000',
    'Cache-Control': 'no-store',
    ...extra,
  };
}
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: headers({ 'Content-Type': 'text/html; charset=utf-8', ...extra }) });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: headers({ 'Content-Type': 'application/json; charset=utf-8' }) });

async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  let s = ''; for (const c of sig) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// The password lives in the Worker secret SITE_PASSWORD (change it in Cloudflare any time).
// A session is "<expiry>.<signature>"; the signature covers the password, so changing it signs everyone out.
const passKey = env => sha256hex('enara-sales:' + (env.SITE_PASSWORD || ''));
async function makeSession(env) {
  const exp = String(Date.now() + SESSION_DAYS * DAY * 1000);
  return exp + '.' + await hmac(env.SESSION_KEY, exp + '.' + await passKey(env));
}
// A per-session key for the chat rate limit (a hash of the session cookie's signature, never the cookie itself).
async function sessionKey(req) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)es=([0-9]+)\.([A-Za-z0-9_-]+)/);
  return (await sha256hex('chat:' + (m ? m[2] : ''))).slice(0, 32);
}
async function signedIn(req, env) {
  if (!env.SITE_PASSWORD || !env.SESSION_KEY) return false;
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)es=([0-9]+)\.([A-Za-z0-9_-]+)/);
  if (!m || Number(m[1]) < Date.now()) return false;
  return same(m[2], await hmac(env.SESSION_KEY, m[1] + '.' + await passKey(env)));
}

function loginPage(msg = '', status = 200) {
  const err = msg ? `<p class="err" role="alert">${msg}</p>` : '';
  return html(LOGIN_HTML.replace('<!--ERROR-->', err), status);
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return a;
}
const str = (v, max) => typeof v === 'string' && v.length <= max;
const iso = v => typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v));

// Only the fields the tracker page may change.
function cleanLeadPatch(p) {
  if (!isObj(p)) return null;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'status') { if (!STATUSES.has(v)) return null; out.status = v; }
    else if (k === 'draft') { if (!isObj(v) || !str(v.subject, 300) || !str(v.body, 8000)) return null; out.draft = { subject: v.subject, body: v.body }; }
    else if (k === 'notes') { if (!str(v, 2000)) return null; out.notes = v; }
    else if (k === 'approvedAt' || k === 'repliedAt' || k === 'updatedAt') { if (!iso(v)) return null; out[k] = v; }
    else if (k === 'error' || k === 'nextFollowUp') { if (v !== null) return null; out[k] = null; }
    else if (k === 'sentLog') {
      if (!Array.isArray(v) || v.length > 20) return null;
      const log = [];
      for (const e of v) {
        if (!isObj(e) || !Number.isInteger(e.step) || e.step < 1 || e.step > 3 || !iso(e.at)) return null;
        const item = { step: e.step, at: e.at };
        if (e.manual === true) item.manual = true;
        if (e.subject !== undefined) { if (!str(e.subject, 300)) return null; item.subject = e.subject; }
        if (e.resendId !== undefined) { if (!str(e.resendId, 100)) return null; item.resendId = e.resendId; }
        log.push(item);
      }
      out.sentLog = log;
    } else {
      const c = cleanCrmField(k, v, out);
      if (c !== true) return null;
    }
  }
  return out;
}

function cleanSettings(s) {
  if (!isObj(s)) return null;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!int(s.newPerDay, 1, 20) || !int(s.sendCapPerDay, 1, 100) || typeof s.paused !== 'boolean') return null;
  if (!Array.isArray(s.countries) || !s.countries.every(c => COUNTRY_CODES.has(c))) return null;
  if (!Array.isArray(s.segments) || !s.segments.every(c => SEGMENT_CODES.has(c))) return null;
  for (const k of ['senderName', 'senderTitle', 'senderPhone']) if (!str(s[k], 120)) return null;
  if (!str(s.focus, 2000)) return null;
  if (!str(s.demoFormUrl, 500) || (s.demoFormUrl && !s.demoFormUrl.startsWith('https://'))) return null;
  return {
    newPerDay: s.newPerDay, sendCapPerDay: s.sendCapPerDay, paused: s.paused,
    countries: [...new Set(s.countries)], segments: [...new Set(s.segments)],
    senderName: s.senderName, senderTitle: s.senderTitle, senderPhone: s.senderPhone,
    focus: s.focus, demoFormUrl: s.demoFormUrl,
  };
}

// "Run now" buttons fire the Claude routine through its API trigger (URL and token are Worker secrets).
const FIRE_PREFIX = 'https://api.anthropic.com/v1/claude_code/routines/';
const RUN_COOLDOWN_MS = 10 * 60 * 1000;
const RUN_TEXT = {
  full: 'Manual run started from sales.enara.app. Do a normal run now (steps 0 to 4).',
  send: 'Manual run started from sales.enara.app. Only do steps 0 and 1: send the approved emails within all the limits, write a run record if anything was sent, then stop. Skip follow-ups and research in this run.',
};
const runReady = env => !!(env.ROUTINE_TOKEN && typeof env.ROUTINE_FIRE_URL === 'string' && env.ROUTINE_FIRE_URL.startsWith(FIRE_PREFIX) && env.ROUTINE_FIRE_URL.endsWith('/fire'));
async function readDoc(db, id) {
  const r = await db.prepare("SELECT data FROM docs WHERE coll = 'config' AND id = ?1").bind(id).first();
  return r ? JSON.parse(r.data) : null;
}
async function writeDoc(db, id, data, now) {
  await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('config', ?1, ?2, 1, ?3) ON CONFLICT (coll, id) DO UPDATE SET data = excluded.data, version = docs.version + 1, updated_at = excluded.updated_at")
    .bind(id, JSON.stringify(data), now).run();
}

async function readBody(req, max = 64000) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) return null;
  try { const t = await req.text(); return t.length > max ? null : JSON.parse(t); } catch { return null; }
}

// Uploaded lists: the browser turns .xlsx/.csv into rows and PDFs into text; the agent reads them from D1.
function cleanImport(b) {
  if (!isObj(b) || !str(b.name, 200) || !b.name.trim() || !str(b.note || '', 500)) return null;
  if (b.kind === 'sheet') {
    if (!Array.isArray(b.rows) || b.rows.length < 2 || b.rows.length > 2001) return null;
    for (const r of b.rows) if (!Array.isArray(r) || r.length > 30 || !r.every(c => str(c, 300))) return null;
    return { name: b.name.trim(), kind: 'sheet', note: b.note || '', rows: b.rows, total: b.rows.length - 1 };
  }
  if (b.kind === 'pdf') {
    if (!str(b.text, 450000) || b.text.trim().length < 50 || !Number.isInteger(b.pages) || b.pages < 1 || b.pages > 2000) return null;
    return { name: b.name.trim(), kind: 'pdf', note: b.note || '', text: b.text, total: b.pages };
  }
  return null;
}

async function api(req, env, url) {
  if (!await signedIn(req, env)) return json({ error: 'signed_out' }, 401);
  if (req.headers.get('X-Req') !== '1') return json({ error: 'bad_request' }, 400);
  const db = env.DB;
  const now = new Date().toISOString();

  if (url.pathname === '/api/state' && req.method === 'GET') {
    const leads = (await db.prepare("SELECT id, data, version FROM docs WHERE coll = 'leads'").all()).results
      .map(r => ({ ...JSON.parse(r.data), id: r.id, version: r.version }));
    const s = await db.prepare("SELECT data FROM docs WHERE coll = 'config' AND id = 'settings'").first();
    const runs = (await db.prepare("SELECT data FROM docs WHERE coll = 'runs' ORDER BY json_extract(data, '$.at') DESC LIMIT 6").all()).results
      .map(r => JSON.parse(r.data));
    const ctl = (await readDoc(db, 'control')) || {};
    const imports = (await db.prepare("SELECT id, json_extract(data, '$.name') AS name, json_extract(data, '$.kind') AS kind, json_extract(data, '$.status') AS status, json_extract(data, '$.total') AS total, json_extract(data, '$.processed') AS processed, json_extract(data, '$.leadsCreated') AS leadsCreated, json_extract(data, '$.uploadedAt') AS uploadedAt, json_extract(data, '$.agentNote') AS agentNote FROM docs WHERE coll = 'imports' ORDER BY json_extract(data, '$.uploadedAt') DESC LIMIT 20").all()).results;
    const tasks = (await db.prepare("SELECT id, data, version FROM docs WHERE coll = 'tasks' AND json_extract(data, '$.done') = 0 ORDER BY json_extract(data, '$.due') LIMIT 500").all()).results
      .map(r => ({ ...JSON.parse(r.data), id: r.id, version: r.version }));
    const dnc = (await db.prepare("SELECT data FROM docs WHERE coll = 'dnc' ORDER BY json_extract(data, '$.at') DESC LIMIT 300").all()).results.map(r => JSON.parse(r.data));
    return json({ leads, settings: s ? JSON.parse(s.data) : null, runs, imports, tasks, dnc, control: { ...ctl, runReady: runReady(env), chatReady: !!env.ANTHROPIC_API_KEY } });
  }

  if (url.pathname === '/api/insights' && req.method === 'GET') {
    const range = url.searchParams.get('range') || '30';
    if (!Object.prototype.hasOwnProperty.call(RANGES, range)) return json({ error: 'bad_request' }, 400);
    return json(await insightsData(db, range));
  }

  const lg = url.pathname.match(/^\/api\/leads\/([A-Za-z0-9_.~:@+-]{1,200})$/);
  if (lg && req.method === 'GET') {
    const d = await leadDetail(db, lg[1]);
    return d ? json(d) : json({ error: 'not_found' }, 404);
  }

  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);

  if (url.pathname === '/api/chat') {
    const chat = cleanChat(await readBody(req, 120000));
    if (!chat) return json({ error: 'bad_request' }, 400);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'chat_not_set_up' }, 503);
    if (!await chatRateOk(db, await sessionKey(req))) return json({ error: 'rate_limited' }, 429);
    const out = await chatReply(env, chat);
    if (out.error) return json({ error: out.error }, out.status);
    return json(out);
  }

  if (url.pathname === '/api/export') {
    const b = await readBody(req, 300000);
    if (!isObj(b) || !Array.isArray(b.ids) || !b.ids.length || b.ids.length > 5000 || !b.ids.every(leadIdOk)) return json({ error: 'bad_request' }, 400);
    const csv = await exportCsv(db, [...new Set(b.ids)]);
    return new Response(csv, { headers: headers({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="enara-leads.csv"' }) });
  }

  if (url.pathname === '/api/upload') {
    const b = await readBody(req, 1600000);
    const imp = cleanImport(b);
    if (!imp) return json({ error: 'bad_request' }, 400);
    const waiting = await db.prepare("SELECT COUNT(*) AS n FROM docs WHERE coll = 'imports' AND json_extract(data, '$.status') IN ('new', 'processing')").first();
    if (waiting && waiting.n >= 20) return json({ error: 'too_many' }, 429);
    const id = 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const data = { ...imp, status: 'new', processed: 0, leadsCreated: 0, uploadedAt: now };
    await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('imports', ?1, ?2, 1, ?3)").bind(id, JSON.stringify(data), now).run();
    return json({ ok: true, id });
  }

  const body = await readBody(req);
  if (!isObj(body)) return json({ error: 'bad_request' }, 400);

  const rm = url.pathname.match(/^\/api\/imports\/(imp-[a-z0-9-]{3,40})\/remove$/);
  if (rm) {
    await db.prepare("DELETE FROM docs WHERE coll = 'imports' AND id = ?1").bind(rm[1]).run();
    return json({ ok: true });
  }

  if (url.pathname === '/api/leads') {
    const m = cleanManualLead(body.lead);
    if (!m) return json({ error: 'bad_request' }, 400);
    const out = await addManualLead(db, m, now);
    return out.error ? json(out, 409) : json({ ok: true, id: out.id });
  }

  const ac = url.pathname.match(/^\/api\/leads\/([A-Za-z0-9_.~:@+-]{1,200})\/activity$/);
  if (ac) {
    const a = cleanActivity(body);
    if (!a) return json({ error: 'bad_request' }, 400);
    if (!await db.prepare("SELECT 1 AS x FROM docs WHERE coll = 'leads' AND id = ?1").bind(ac[1]).first()) return json({ error: 'not_found' }, 404);
    return json({ ok: true, id: await addActivity(db, ac[1], a.kind, a.text, now) });
  }

  if (url.pathname === '/api/tasks') {
    const t = cleanTask(body);
    if (!t) return json({ error: 'bad_request' }, 400);
    if (!await db.prepare("SELECT 1 AS x FROM docs WHERE coll = 'leads' AND id = ?1").bind(t.leadId).first()) return json({ error: 'not_found' }, 404);
    const id = 'tsk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('tasks', ?1, ?2, 1, ?3)").bind(id, JSON.stringify({ ...t, createdAt: now }), now).run();
    return json({ ok: true, id });
  }
  const tk = url.pathname.match(/^\/api\/tasks\/(tsk-[a-z0-9-]{3,40})$/);
  if (tk) {
    const patch = cleanTaskPatch(body.patch);
    if (!patch || !Number.isInteger(body.version)) return json({ error: 'bad_request' }, 400);
    const row = await db.prepare("SELECT data, version FROM docs WHERE coll = 'tasks' AND id = ?1").bind(tk[1]).first();
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.version !== body.version) return json({ error: 'conflict' }, 409);
    if (patch.done !== undefined) patch.doneAt = patch.done ? now : null;
    const r = await db.prepare("UPDATE docs SET data = ?1, version = version + 1, updated_at = ?2 WHERE coll = 'tasks' AND id = ?3 AND version = ?4")
      .bind(JSON.stringify({ ...JSON.parse(row.data), ...patch }), now, tk[1], body.version).run();
    if (!r.meta || !r.meta.changes) return json({ error: 'conflict' }, 409);
    return json({ ok: true });
  }

  const m = url.pathname.match(/^\/api\/leads\/([A-Za-z0-9_.~:@+-]{1,200})$/);
  if (m) {
    const id = m[1];
    const patch = cleanLeadPatch(body.patch);
    if (!patch || !Number.isInteger(body.version)) return json({ error: 'bad_request' }, 400);
    const row = await db.prepare("SELECT data, version FROM docs WHERE coll = 'leads' AND id = ?1").bind(id).first();
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.version !== body.version) return json({ error: 'conflict' }, 409);
    const old = JSON.parse(row.data);
    applyLeadRules(old, patch, now);
    const merged = merge(JSON.parse(row.data), patch);
    const r = await db.prepare("UPDATE docs SET data = ?1, version = version + 1, updated_at = ?2 WHERE coll = 'leads' AND id = ?3 AND version = ?4")
      .bind(JSON.stringify(merged), now, id, body.version).run();
    if (!r.meta || !r.meta.changes) return json({ error: 'conflict' }, 409);
    await logLeadChange(db, id, old, patch, now);
    return json({ ok: true });
  }

  if (url.pathname === '/api/settings') {
    const s = cleanSettings(body.data);
    if (!s) return json({ error: 'bad_request' }, 400);
    s.updatedAt = now;
    await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('config', 'settings', ?1, 1, ?2) ON CONFLICT (coll, id) DO UPDATE SET data = excluded.data, version = docs.version + 1, updated_at = excluded.updated_at")
      .bind(JSON.stringify(s), now).run();
    return json({ ok: true });
  }

  if (url.pathname === '/api/run') {
    const mode = body.mode === 'send' || body.mode === 'full' ? body.mode : null;
    if (!mode) return json({ error: 'bad_request' }, 400);
    if (!runReady(env)) return json({ error: 'not_set_up' }, 503);
    const s = (await readDoc(db, 'settings')) || {};
    if (s.paused) return json({ error: 'paused' }, 409);
    const ctl = (await readDoc(db, 'control')) || {};
    const last = Date.parse(ctl.lastRunAt || '');
    if (!isNaN(last) && Date.now() - last < RUN_COOLDOWN_MS) return json({ error: 'too_soon' }, 429);
    await writeDoc(db, 'control', { ...ctl, lastRunAt: now, lastRunMode: mode, lastRunStatus: 'starting', lastRunSession: '' }, now);
    let res = null, out = {};
    try {
      res = await fetch(env.ROUTINE_FIRE_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.ROUTINE_TOKEN, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: RUN_TEXT[mode] }),
      });
      out = await res.json().catch(() => ({}));
    } catch { res = null; }
    if (!res || !res.ok) {
      const code = res ? res.status : 0;
      await writeDoc(db, 'control', { ...ctl, lastError: code ? `The run could not start (error ${code}).` : 'The run could not start (no answer).', lastErrorAt: now }, now);
      return json({ error: 'fire_failed', status: code }, 502);
    }
    const session = typeof out.claude_code_session_url === 'string' && out.claude_code_session_url.startsWith('https://claude.ai/') ? out.claude_code_session_url : '';
    await writeDoc(db, 'control', { lastRunAt: now, lastRunMode: mode, lastRunStatus: 'started', lastRunSession: session }, now);
    return json({ ok: true, session });
  }

  if (url.pathname === '/api/pause') {
    if (typeof body.paused !== 'boolean') return json({ error: 'bad_request' }, 400);
    const s = (await readDoc(db, 'settings')) || {};
    s.paused = body.paused; s.updatedAt = now;
    await writeDoc(db, 'settings', s, now);
    return json({ ok: true });
  }

  if (url.pathname === '/api/dnc') {
    const v = typeof body.value === 'string' ? body.value.trim().toLowerCase() : '';
    if (!v || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return json({ error: 'bad_request' }, 400);
    const key = 'e-' + v.replace(/[^a-z0-9_\-.~:@+]/g, '_');
    await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('dnc', ?1, ?2, 1, ?3) ON CONFLICT (coll, id) DO NOTHING")
      .bind(key, JSON.stringify({ value: v, kind: 'email', reason: 'Marked by owner', at: now }), now).run();
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return Response.redirect('https://' + url.host + url.pathname, 301);

    if (url.pathname.startsWith('/api/')) return api(req, env, url);

    if (url.pathname === '/login') {
      if (req.method !== 'POST') return Response.redirect(url.origin + '/', 303);
      const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
      const since = Date.now() - 15 * 60 * 1000;
      const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_fail WHERE ip = ?1 AND at > ?2').bind(ip, since).first();
      if (fails && fails.n >= 10) return loginPage('Too many tries. Wait 15 minutes and try again.', 429);
      let pw = '';
      try { const f = await req.formData(); pw = String(f.get('password') || ''); } catch {}
      if (!env.SITE_PASSWORD || !env.SESSION_KEY) return loginPage('The site password hasn’t been set up yet.', 503);
      const ok = pw.length > 0 && pw.length <= 200 && same(await sha256hex('enara-sales:' + pw), await passKey(env));
      if (!ok) {
        await env.DB.prepare('INSERT INTO login_fail (ip, at) VALUES (?1, ?2)').bind(ip, Date.now()).run();
        return loginPage('That password isn’t right.', 401);
      }
      await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?1 OR at < ?2').bind(ip, since).run();
      return new Response(null, { status: 303, headers: headers({ Location: '/', 'Set-Cookie': `es=${await makeSession(env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * DAY}` }) });
    }

    if (url.pathname === '/logout' && req.method === 'POST') {
      return new Response(null, { status: 303, headers: headers({ Location: '/', 'Set-Cookie': 'es=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' }) });
    }

    if (url.pathname === '/app.js') {
      if (!await signedIn(req, env)) return new Response('', { status: 401, headers: headers() });
      return new Response(APP_JS, { headers: headers({ 'Content-Type': 'text/javascript; charset=utf-8' }) });
    }

    if (url.pathname === '/favicon.svg') return new Response(FAVICON_SVG, { headers: headers({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }) });

    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: headers({ 'Content-Type': 'text/plain' }) });

    if (url.pathname === '/' && req.method === 'GET') return await signedIn(req, env) ? html(APP_HTML) : loginPage();

    return new Response('Not found', { status: 404, headers: headers({ 'Content-Type': 'text/plain' }) });
  },
};

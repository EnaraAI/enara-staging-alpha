{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COUNTRIES = {EG:'Egypt',SA:'Saudi Arabia',IQ:'Iraq',AE:'UAE',KW:'Kuwait',QA:'Qatar',BH:'Bahrain',OM:'Oman'};
const SEGMENTS = {international_school:'International schools',private_school:'Private schools',school_group:'School groups',language_center:'Language centres',university:'University English programmes'};
const GROUPS = {review:['drafted'],queued:['approved'],sent:['sent'],replied:['replied'],closed:['not_interested','do_not_contact','skipped']};
const STATUS = {drafted:'To review',approved:'Approved',sent:'Sent',replied:'Replied',not_interested:'Not interested',do_not_contact:'Do not contact',skipped:'Skipped'};
const STEP = {1:'First email',2:'Follow-up 1',3:'Follow-up 2'};
const DEF = {newPerDay:8,sendCapPerDay:50,paused:false,countries:Object.keys(COUNTRIES),segments:['international_school','private_school','school_group','language_center'],senderName:'Mohamed Elkholy',senderTitle:'',senderPhone:'',focus:'',demoFormUrl:''};
const MSG = {approve:'Approved. It goes out within the hour.',save:'Saved',unapprove:'Moved back to review',skip:'Skipped',dnc:'Marked do not contact',replied:'Marked as replied',noint:'Marked not interested',reopen:'Back in review',contacted:'Marked as contacted'};

let leads = [], settings = null, runs = [], imports = [], control = {}, loaded = false, running = false, view = 'review', country = 'all', q = '';
const dirty = {}; const busy = new Set(); let pending = false, hold = false;
const list = $('#list');

const cairoDay = d => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(d);
const fmt = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Africa/Cairo'}); };
const fmtTime = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Africa/Cairo'}); };
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return 'link'; } };
const S = () => ({...DEF, ...(settings || {})});
let tt; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800); };

async function api(path, body) {
  const opts = body ? {method:'POST', headers:{'Content-Type':'application/json','X-Req':'1'}, body:JSON.stringify(body), credentials:'same-origin'} : {headers:{'X-Req':'1'}, credentials:'same-origin', cache:'no-store'};
  const r = await fetch(path, opts);
  if (r.status === 401) { location.href = '/'; throw {code:'signed_out'}; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw {code: j.error || 'error', status: r.status};
  return j;
}

$('#country').insertAdjacentHTML('beforeend', Object.entries(COUNTRIES).map(([k,v]) => `<option value="${k}">${v}</option>`).join(''));
$('#s-countries').innerHTML = Object.entries(COUNTRIES).map(([k,v]) => `<label><input type="checkbox" name="c" value="${k}"> ${v}</label>`).join('');
$('#s-segments').innerHTML = Object.entries(SEGMENTS).map(([k,v]) => `<label><input type="checkbox" name="g" value="${k}"> ${v}</label>`).join('');

function sentToday() {
  const day = cairoDay(new Date()); let n = 0;
  for (const l of leads) for (const s of (l.sentLog || [])) if (!s.manual && s.at && cairoDay(new Date(s.at)) === day) n++;
  return n;
}

function renderTop() {
  const c = k => leads.filter(l => GROUPS[k].includes(l.status)).length;
  for (const k of ['review','queued','sent','replied','closed']) $('#c-' + k).textContent = loaded ? c(k) : '–';
  $('#c-all').textContent = leads.length;
  $('#today').textContent = sentToday(); $('#cap').textContent = S().sendCapPerDay;
  const p = $('#pill'), last = runs[0];
  p.classList.toggle('off', !!S().paused);
  $('#pillText').textContent = !loaded ? 'Loading…' : S().paused ? 'Paused: not searching or sending' : 'Runs every day, hourly 8:14–16:14 Cairo' + (last ? ' · last run ' + fmtTime(last.at) : '');
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === view));
}

function visible() {
  let L = view === 'all' ? leads.slice() : leads.filter(l => GROUPS[view].includes(l.status));
  if (country !== 'all') L = L.filter(l => l.country === country);
  if (q) L = L.filter(l => [l.org,l.city,l.email,l.contactName,l.contactRole,l.contactPhone].join(' ').toLowerCase().includes(q));
  const last = l => (l.sentLog || []).slice(-1)[0]?.at || '';
  if (view === 'review') L.sort((a,b) => (b.score||0) - (a.score||0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  else if (view === 'sent' || view === 'replied') L.sort((a,b) => last(b).localeCompare(last(a)));
  else L.sort((a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  return L;
}

function card(l) {
  const d = dirty[l.id] || {}, st = l.status, b = busy.has(l.id) ? ' disabled' : '';
  const subject = d.subject ?? l.draft?.subject ?? '', body = d.body ?? l.draft?.body ?? '', notes = d.notes ?? l.notes ?? '';
  const editable = st === 'drafted' || st === 'approved';
  const srcs = (Array.isArray(l.sources) ? l.sources : []).filter(u => typeof u === 'string' && u.startsWith('https://')).slice(0,4);
  const score = Math.max(0, Math.min(5, Number(l.score) || 0));
  const logs = (l.sentLog || []).map(s => `${esc(STEP[s.step] || 'Email')} ${s.manual ? 'contacted by you' : 'sent'} ${esc(fmt(s.at))}`).join(' · ');
  let acts = '';
  if (st === 'drafted') acts = l.email
    ? `<button class="go" data-act="approve"${b}>Approve</button><button data-act="save"${b}>Save edits</button><button data-act="skip" class="quiet"${b}>Skip</button><button data-act="dnc" class="quiet"${b}>Do not contact</button>`
    : `<button class="go" data-act="copy">Copy message</button><button data-act="contacted"${b}>Mark contacted</button><button data-act="skip" class="quiet"${b}>Skip</button>`;
  else if (st === 'approved') acts = `<button data-act="save"${b}>Save edits</button><button data-act="unapprove" class="quiet"${b}>Back to review</button>`;
  else if (st === 'sent') acts = `<button class="go" data-act="replied"${b}>They replied</button><button data-act="noint"${b}>Not interested</button><button data-act="dnc" class="quiet"${b}>Do not contact</button>`;
  else if (st === 'replied') acts = `<button data-act="noint"${b}>Not interested</button><button data-act="save"${b}>Save note</button>`;
  else if (st === 'skipped') acts = `<button data-act="reopen"${b}>Back to review</button>`;
  return `<article class="card" data-id="${esc(l.id)}">
    <h3>${esc(l.org || 'Unnamed organisation')}</h3>
    <div class="meta"><span>${esc(COUNTRIES[l.country] || l.country || '')}${l.city ? ' · ' + esc(l.city) : ''}</span><span>${esc(SEGMENTS[l.segment] || l.segment || '')}</span>${score ? `<span class="dots" title="Fit ${score} of 5">${'●'.repeat(score)}${'○'.repeat(5-score)}</span>` : ''}<span class="tag">${esc(STATUS[st] || st)}</span>${l.step > 1 ? `<span class="tag warn">${esc(STEP[l.step])}</span>` : ''}</div>
    <p class="who">${esc([l.contactName, l.contactRole].filter(Boolean).join(', ') || 'Contact')} · ${l.email ? `<span class="em">${esc(l.email)}</span>` : '<span class="em">No published email: call or use their contact form</span>'}${l.contactPhone ? ` · <span class="em">${esc(l.contactPhone)}</span>` : ''}</p>
    ${l.whyFit ? `<p class="why">${esc(l.whyFit)}</p>` : ''}
    ${srcs.length ? `<div class="src">${srcs.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(host(u))}</a>`).join('')}</div>` : ''}
    ${l.error ? `<div class="err">Last send failed: ${esc(l.error)}</div>` : ''}
    ${logs ? `<div class="log">${logs}${st === 'sent' && l.nextFollowUp ? ' · follow-up drafted after ' + esc(fmt(l.nextFollowUp)) : ''}</div>` : ''}
    ${(editable || subject) ? `<label>Subject</label><input name="subject" dir="auto" value="${esc(subject)}"${editable ? '' : ' readonly'}>
    <label>Message</label><textarea name="body" dir="auto"${editable ? '' : ' readonly'}>${esc(body)}</textarea>` : ''}
    <label>Your notes</label><input name="notes" dir="auto" value="${esc(notes)}" placeholder="e.g. spoke to the principal, call back in January">
    <div class="acts">${acts}</div>
  </article>`;
}

const EMPTY = {review:'Nothing to review. New drafts appear after each run.',queued:'No approved emails waiting.',sent:'Nothing sent yet.',replied:'No replies marked yet.',closed:'Nothing closed.',all:'No leads yet. The first run fills this list.'};
function render() {
  renderTop();
  if (!loaded) return;
  const a = document.activeElement;
  if (hold || (a && list.contains(a) && a.matches('input,textarea'))) { pending = true; return; }
  pending = false;
  const L = visible();
  list.innerHTML = L.length ? L.map(card).join('') : `<div class="empty">${esc(EMPTY[view])}</div>`;
}

list.addEventListener('pointerdown', () => { hold = true; }, true);
document.addEventListener('pointerup', () => setTimeout(() => { hold = false; if (pending) render(); }, 400));
list.addEventListener('focusout', () => setTimeout(() => { if (pending) render(); }, 450));
list.addEventListener('input', e => { const el = e.target, id = el.closest('.card')?.dataset.id; if (!id || !el.name) return; dirty[id] = {...(dirty[id] || {}), [el.name]: el.value}; });
list.addEventListener('click', e => { const btn = e.target.closest('button[data-act]'); if (!btn) return; act(btn.closest('.card').dataset.id, btn.dataset.act); });

const editableOf = l => l.status === 'drafted' || l.status === 'approved';
async function act(id, a) {
  const l = leads.find(x => x.id === id); if (!l) return;
  const d = dirty[id] || {}, subject = String(d.subject ?? l.draft?.subject ?? '').trim(), body = String(d.body ?? l.draft?.body ?? ''), notes = String(d.notes ?? l.notes ?? '');
  if (a === 'copy') { try { await navigator.clipboard.writeText((subject ? subject + '\n\n' : '') + body); toast('Copied'); } catch { toast('Copy was blocked: select the text and copy it.'); } return; }
  const now = new Date().toISOString(); let patch;
  if (a === 'approve') { if (!l.email) return toast('No email address for this lead.'); if (!subject || !body.trim()) return toast('Add a subject and a message first.'); patch = {status:'approved', draft:{subject, body}, notes, approvedAt:now, error:null}; }
  else if (a === 'save') patch = editableOf(l) ? {draft:{subject, body}, notes} : {notes};
  else if (a === 'unapprove' || a === 'reopen') patch = {status:'drafted'};
  else if (a === 'skip') patch = {status:'skipped', notes};
  else if (a === 'dnc') patch = {status:'do_not_contact', notes};
  else if (a === 'replied') patch = {status:'replied', repliedAt:now, notes};
  else if (a === 'noint') patch = {status:'not_interested', notes};
  else if (a === 'contacted') patch = {status:'sent', draft:{subject, body}, notes, nextFollowUp:null, sentLog:[...(l.sentLog || []), {step:l.step || 1, at:now, manual:true, subject}]};
  else return;
  patch.updatedAt = now; busy.add(id); render();
  try {
    await api('/api/leads/' + encodeURIComponent(id), {patch, version:l.version});
    if (a === 'dnc' && l.email) await api('/api/dnc', {value:l.email});
    delete dirty[id]; toast(MSG[a]);
  } catch (e) {
    toast(e && e.code === 'conflict' ? 'The agent just updated this lead, so it was reloaded. Please try again.' : 'Could not save. Try again.');
  } finally { busy.delete(id); await load(); }
}

function fillSettings() {
  const f = $('#settings'); if (f.contains(document.activeElement)) return;
  const s = S();
  $('#s-new').value = s.newPerDay; $('#s-cap').value = s.sendCapPerDay; $('#s-paused').checked = !!s.paused;
  $('#s-name').value = s.senderName || ''; $('#s-title').value = s.senderTitle || ''; $('#s-phone').value = s.senderPhone || ''; $('#s-focus').value = s.focus || ''; $('#s-form').value = s.demoFormUrl || '';
  f.querySelectorAll('input[name=c]').forEach(i => i.checked = (s.countries || []).includes(i.value));
  f.querySelectorAll('input[name=g]').forEach(i => i.checked = (s.segments || []).includes(i.value));
}
$('#settings').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, clamp = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const next = {newPerDay:clamp($('#s-new').value,1,20,8), sendCapPerDay:clamp($('#s-cap').value,1,100,50), paused:$('#s-paused').checked,
    countries:[...f.querySelectorAll('input[name=c]:checked')].map(i => i.value), segments:[...f.querySelectorAll('input[name=g]:checked')].map(i => i.value),
    senderName:$('#s-name').value.trim() || 'Mohamed Elkholy', senderTitle:$('#s-title').value.trim(), senderPhone:$('#s-phone').value.trim(), focus:$('#s-focus').value.trim(), demoFormUrl:(v => v.startsWith('https://') ? v : '')($('#s-form').value.trim())};
  try { await api('/api/settings', {data:next}); toast('Settings saved'); document.activeElement?.blur?.(); await load(); } catch { toast('Could not save settings.'); }
});

const COOL_MS = 10 * 60 * 1000;
function renderControls() {
  const ready = !!control.runReady, paused = !!S().paused;
  const last = Date.parse(control.lastRunAt || ''), wait = isNaN(last) ? 0 : last + COOL_MS - Date.now();
  const block = !loaded || !ready || paused || wait > 0 || running;
  $('#runFull').disabled = block; $('#runSend').disabled = block;
  $('#pauseBtn').disabled = !loaded || running;
  $('#pauseBtn').textContent = paused ? 'Resume agent' : 'Pause agent';
  let note = '';
  if (!loaded) note = '';
  else if (!ready) note = 'Run buttons need a one-time connection to the agent before they work.';
  else if (paused) note = 'The agent is paused: it won’t search or send until you resume it.';
  else if (!isNaN(last)) note = (control.lastRunMode === 'send' ? 'Sending started ' : 'Manual run started ') + fmtTime(control.lastRunAt) + (wait > 0 ? ' · next manual run from ' + fmtTime(new Date(last + COOL_MS).toISOString()) : '') + '.';
  if (control.lastError && control.lastErrorAt && (isNaN(last) || Date.parse(control.lastErrorAt) > last)) note = control.lastError;
  $('#ctlNote').textContent = note;
  const a = $('#ctlLink'), s = control.lastRunSession;
  if (typeof s === 'string' && s.startsWith('https://claude.ai/') && wait > 0) { a.href = s; a.hidden = false; } else a.hidden = true;
}
async function startRun(mode) {
  running = true; renderControls();
  try { await api('/api/run', {mode}); toast(mode === 'send' ? 'Sending approved emails now. They appear as Sent in a few minutes.' : 'Run started. New results appear here in a few minutes.'); }
  catch (e) { toast(e && e.code === 'too_soon' ? 'A run started less than 10 minutes ago.' : e && e.code === 'paused' ? 'Resume the agent first.' : e && e.code === 'not_set_up' ? 'The run buttons aren’t connected yet.' : 'The run couldn’t start. Try again in a minute.'); }
  finally { running = false; await load(); }
}
$('#runFull').addEventListener('click', () => startRun('full'));
$('#runSend').addEventListener('click', () => startRun('send'));
$('#pauseBtn').addEventListener('click', async () => {
  const p = !S().paused; running = true; renderControls();
  try { await api('/api/pause', {paused:p}); toast(p ? 'Agent paused' : 'Agent resumed'); } catch { toast('Could not change it. Try again.'); }
  finally { running = false; await load(); }
});
setInterval(renderControls, 30000);

// Uploads: read the file in the browser, send rows (spreadsheets) or text (PDFs) to the server.
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
const loadScript = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
let parsed = null;
async function parseFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (file.size > 15e6) throw {msg:'That file is over 15 MB. Split it into smaller files.'};
  if (ext === 'pdf') {
    await loadScript(CDN + 'pdf.js/3.11.174/pdf.min.js');
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
    let text = '';
    for (let p = 1; p <= Math.min(doc.numPages, 300) && text.length < 440000; p++) { const page = await doc.getPage(p); const c = await page.getTextContent(); text += c.items.map(i => i.str).join(' ') + '\n\n'; }
    text = text.replace(/[ \t]+/g, ' ').slice(0, 440000);
    if (text.trim().length < 50) throw {msg:'This PDF has no readable text (it may be a scan). Try a spreadsheet or a text-based PDF.'};
    return {kind:'pdf', text, pages:doc.numPages, summary:`${doc.numPages} page${doc.numPages === 1 ? '' : 's'} of text`};
  }
  if (['xlsx','xls','csv'].includes(ext)) {
    await loadScript(CDN + 'xlsx/0.18.5/xlsx.full.min.js');
    const wb = window.XLSX.read(await file.arrayBuffer(), {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    let rows = window.XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''});
    rows = rows.filter(r => r.some(c => String(c).trim())).slice(0, 2001).map(r => r.slice(0, 30).map(c => String(c).trim().slice(0, 300)));
    while (rows.length > 2 && JSON.stringify(rows).length > 1400000) rows.pop();
    if (rows.length < 2) throw {msg:'The first sheet needs a header row and at least one row of data.'};
    const more = wb.SheetNames.length > 1 ? ` (first sheet only: "${wb.SheetNames[0]}")` : '';
    return {kind:'sheet', rows, summary:`${rows.length - 1} row${rows.length === 2 ? '' : 's'}${more}`};
  }
  throw {msg:'Choose an .xlsx, .xls, .csv or .pdf file.'};
}
$('#upFile').addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0]; parsed = null; $('#upGo').disabled = true;
  if (!f) { $('#upInfo').textContent = ''; return; }
  $('#upInfo').textContent = 'Reading ' + f.name + '…';
  try { parsed = {...await parseFile(f), name:f.name}; $('#upInfo').textContent = 'Ready: ' + parsed.summary + '.'; $('#upGo').disabled = false; }
  catch (err) { $('#upInfo').textContent = (err && err.msg) || 'Couldn’t read that file. Check it opens normally and try again.'; }
});
$('#upGo').addEventListener('click', async () => {
  if (!parsed) return; $('#upGo').disabled = true;
  const note = $('#upNote').value.trim().slice(0, 500);
  const body = parsed.kind === 'sheet' ? {kind:'sheet', name:parsed.name, note, rows:parsed.rows} : {kind:'pdf', name:parsed.name, note, text:parsed.text, pages:parsed.pages};
  try { await api('/api/upload', body); toast('Uploaded. The agent starts on it at the next run.'); parsed = null; $('#upFile').value = ''; $('#upNote').value = ''; $('#upInfo').textContent = ''; }
  catch (e) { $('#upGo').disabled = false; toast(e && e.code === 'too_many' ? 'Too many lists are still waiting. Let the agent finish some first.' : 'Upload failed. Try again.'); }
  await load();
});
function renderImports() {
  const box = $('#upList');
  if (!imports.length) { box.innerHTML = ''; return; }
  const st = i => i.status === 'done' ? `Done: ${Number(i.leadsCreated) || 0} new lead${Number(i.leadsCreated) === 1 ? '' : 's'}` : i.status === 'processing' ? `In progress: ${Number(i.processed) || 0} of ${Number(i.total) || '?'}` : 'Waiting for the next run';
  box.innerHTML = imports.map(i => `<div class="run imp"><span><strong>${esc(i.name)}</strong> · ${esc(i.kind === 'pdf' ? 'PDF' : 'Spreadsheet')} · ${esc(st(i))} · ${esc(fmtTime(i.uploadedAt))}${i.agentNote ? `<br>${esc(i.agentNote)}` : ''}</span>${i.status === 'processing' ? '' : `<button type="button" data-rm="${esc(i.id)}">Remove</button>`}</div>`).join('');
}
$('#upList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-rm]'); if (!b) return;
  b.disabled = true;
  try { await api('/api/imports/' + encodeURIComponent(b.dataset.rm) + '/remove', {}); toast('Removed'); } catch { toast('Could not remove it.'); }
  await load();
});

function renderRuns() {
  const box = $('#runs');
  if (!runs.length) { box.innerHTML = '<div class="run">No runs yet. The agent runs every day, every hour from 8:14 to 16:14 Cairo time.</div>'; return; }
  box.innerHTML = runs.map(r => `<div class="run"><strong>${esc(fmtTime(r.at))}</strong> · found <b>${esc(r.found ?? 0)}</b> · drafted <b>${esc(r.drafted ?? 0)}</b> · sent <b>${esc(r.sent ?? 0)}</b> · follow-ups <b>${esc(r.followups ?? 0)}</b>${r.errors ? ` · errors <b>${esc(r.errors)}</b>` : ''}${r.note ? `<br>${esc(r.note)}` : ''}</div>`).join('');
}

document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; pending = false; hold = false; render(); if (b.classList.contains('stn')) list.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); }));
$('#country').addEventListener('change', e => { country = e.target.value; render(); });
$('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); render(); });

async function load() {
  try {
    const j = await api('/api/state');
    leads = Array.isArray(j.leads) ? j.leads : []; settings = j.settings || null; runs = Array.isArray(j.runs) ? j.runs : []; control = j.control || {}; imports = Array.isArray(j.imports) ? j.imports : [];
    loaded = true; render(); renderRuns(); fillSettings(); renderControls(); renderImports();
  } catch (e) {
    if (e && e.code === 'signed_out') return;
    if (!loaded) list.innerHTML = '<div class="empty">The lead list can’t be reached right now. Check your connection and reload.</div>';
  }
}
renderTop(); fillSettings(); load();
setInterval(() => { if (!document.hidden) load(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}

// Review: today's drafts and every lead list, with the same actions as before, plus tasks due and CSV export.
const MSG = {approve:'Approved. It goes out within the hour.',save:'Saved',unapprove:'Moved back to review',skip:'Skipped',dnc:'Marked do not contact',replied:'Marked as replied',noint:'Marked not interested',reopen:'Back in review',contacted:'Marked as contacted'};
const EMPTY = {review:'Nothing to review. New drafts appear after each run.',queued:'No approved emails waiting.',sent:'Nothing sent yet.',replied:'No replies marked yet.',closed:'Nothing closed.',manual:'No schools added by hand yet. Use "Add a school".',all:'No leads yet. The first run fills this list.'};
let view = 'review', country = 'all', q = '';
const dirty = {}; const busy = new Set(); let pending = false, hold = false;
const list = $('#list');

$('#country').insertAdjacentHTML('beforeend', Object.entries(COUNTRIES).map(([k,v]) => `<option value="${k}">${esc(v)}</option>`).join(''));

function sentToday() {
  const day = today(); let n = 0;
  for (const l of leads) for (const s of (l.sentLog || [])) if (!s.manual && s.at && cairoDay(new Date(s.at)) === day) n++;
  return n;
}

function renderTop() {
  const c = k => leads.filter(l => GROUPS[k].includes(l.status)).length;
  for (const k of Object.keys(GROUPS)) $('#c-' + k).textContent = loaded ? c(k) : '–';
  $('#c-all').textContent = loaded ? leads.length : '–';
  $('#today').textContent = sentToday(); $('#cap').textContent = S().sendCapPerDay;
  const n = loaded ? c('review') : 0, b = $('#b-review'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  const last = runs[0], paused = !!S().paused;
  const text = !loaded ? 'Loading…' : paused ? 'The agent is paused: not searching or sending.' : 'The agent runs every day, hourly 8:14 AM–4:14 PM Cairo' + (last ? ' · last run ' + fmtTime(last.at) : '') + '.';
  $('#pillText').textContent = text; $('#pillText2').textContent = text; $('#pillSr').textContent = text;
  $('#pillDot').classList.toggle('off', paused); $('#pillDot2').classList.toggle('off', paused);
  $$('#views [data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === view));
}

const matches = (l, words) => !words || [l.org,l.contactName,l.city,l.email].join(' ').toLowerCase().includes(words);
function visible() {
  let L = view === 'all' ? leads.slice() : leads.filter(l => GROUPS[view].includes(l.status));
  if (country !== 'all') L = L.filter(l => l.country === country);
  if (q) L = L.filter(l => matches(l, q));
  const last = l => (l.sentLog || []).slice(-1)[0]?.at || '';
  if (view === 'review') L.sort((a,b) => (b.score||0) - (a.score||0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  else if (view === 'sent' || view === 'replied') L.sort((a,b) => last(b).localeCompare(last(a)));
  else L.sort((a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  return L;
}

// The action buttons for a lead (cards and the detail view use the same ones).
function actionsFor(l) {
  const st = l.status, b = busy.has(l.id) ? ' disabled' : '';
  if (st === 'drafted') return l.email
    ? `<button class="btn primary" data-act="approve"${b}>Approve</button><button class="btn" data-act="save"${b}>Save edits</button><button class="btn ghost" data-act="skip"${b}>Skip</button><button class="btn ghost danger" data-act="dnc"${b}>Do not contact</button>`
    : `<button class="btn primary" data-act="copy">Copy message</button><button class="btn" data-act="contacted"${b}>Mark contacted</button><button class="btn ghost" data-act="skip"${b}>Skip</button>`;
  if (st === 'approved') return `<button class="btn" data-act="save"${b}>Save edits</button><button class="btn ghost" data-act="unapprove"${b}>Back to review</button>`;
  if (st === 'sent') return `<button class="btn primary" data-act="replied"${b}>They replied</button><button class="btn" data-act="noint"${b}>Not interested</button><button class="btn ghost danger" data-act="dnc"${b}>Do not contact</button>`;
  if (st === 'replied') return `<button class="btn" data-act="noint"${b}>Not interested</button><button class="btn" data-act="save"${b}>Save note</button>`;
  if (st === 'manual') return `<button class="btn" data-act="save"${b}>Save note</button>`;
  if (st === 'skipped') return `<button class="btn" data-act="reopen"${b}>Back to review</button>`;
  return '';
}
const editableOf = l => l.status === 'drafted' || l.status === 'approved';
function draftFields(l) {
  const d = dirty[l.id] || {}, editable = editableOf(l);
  const subject = d.subject ?? l.draft?.subject ?? '', body = d.body ?? l.draft?.body ?? '', lg = langOf(l);
  if (!editable && !subject) return '';
  const ro = editable ? '' : ' readonly';
  return `<label for="sj-${esc(l.id)}">Subject</label><input id="sj-${esc(l.id)}" name="subject" dir="auto" lang="${lg}" value="${esc(subject)}"${ro}>
    <label for="bd-${esc(l.id)}">Message</label><textarea id="bd-${esc(l.id)}" name="body" dir="auto" lang="${lg}"${ro}>${esc(body)}</textarea>`;
}
function notesField(l, idp) {
  const notes = (dirty[l.id] || {}).notes ?? l.notes ?? '';
  return `<label for="${idp}-${esc(l.id)}">Your notes</label><input id="${idp}-${esc(l.id)}" name="notes" dir="auto" value="${esc(notes)}" placeholder="e.g. spoke to the principal, call back in January">`;
}
function sentLine(l) {
  const logs = (l.sentLog || []).map(s => `${esc(STEP[s.step] || 'Email')} ${s.manual ? 'contacted by you' : 'sent'} ${esc(fmt(s.at))}`).join(' · ');
  return logs ? `<div class="log">${logs}${l.status === 'sent' && l.nextFollowUp ? ' · follow-up drafted after ' + esc(fmt(l.nextFollowUp)) : ''}</div>` : '';
}
function contactLine(l) {
  return `<p class="who">${esc([l.contactName, l.contactRole].filter(Boolean).join(', ') || 'Contact')} · ${l.email ? `<span class="em">${esc(l.email)}</span>` : '<span class="em">No published email: call or use their contact form</span>'}${l.contactPhone ? ` · <span class="em">${esc(l.contactPhone)}</span>` : ''}</p>`;
}
const sourcesOf = l => (Array.isArray(l.sources) ? l.sources : []).filter(u => typeof u === 'string' && u.startsWith('https://'));

function card(l) {
  const srcs = sourcesOf(l).slice(0, 4);
  return `<article class="card" data-id="${esc(l.id)}">
    <div class="card-top"><h3>${esc(l.org || 'Unnamed organisation')}</h3><button class="btn sm" data-act="open" aria-label="Open ${esc(l.org || 'lead')}">Open</button></div>
    <div class="meta"><span>${esc(placeOf(l))}</span><span>${esc(SEGMENT_ONE[l.segment] || l.segment || '')}</span>${scoreDots(l)}${statusTag(l.status)}${stageTag(l)}${l.step > 1 ? `<span class="tag warn">${esc(STEP[l.step])}</span>` : ''}</div>
    ${contactLine(l)}
    ${l.whyFit ? `<p class="why">${esc(l.whyFit)}</p>` : ''}
    ${srcs.length ? `<div class="src">${srcs.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(srcLabel(u))}</a>`).join('')}</div>` : ''}
    ${l.error ? `<div class="err" style="margin-top:8px">Last send failed: ${esc(l.error)}</div>` : ''}
    ${sentLine(l)}
    ${draftFields(l)}
    ${notesField(l, 'nt')}
    <div class="acts">${actionsFor(l)}</div>
  </article>`;
}

// Tasks due: overdue and due today, at the top of Review.
function renderDue() {
  const day = today(), open = tasks.filter(t => !t.done && t.due && t.due <= day).sort((a,b) => a.due.localeCompare(b.due));
  const over = open.filter(t => t.due < day), now = open.filter(t => t.due === day);
  const row = t => { const l = leadById(t.leadId); return `<div class="task" data-task="${esc(t.id)}"><input type="checkbox" aria-label="Done: ${esc(t.title)}" data-done="${esc(t.id)}"><div class="tt"><span>${esc(t.title)}</span><small>${l ? `<button class="linkbtn" data-open="${esc(l.id)}">${esc(l.org || 'Lead')}</button> · ` : ''}${t.due < day ? 'was due ' : 'due '}${esc(fmtDay(t.due))}</small></div></div>`; };
  const part = (title, tone, L) => L.length ? `<p class="due-h"><span class="tag ${tone}">${title}</span><span class="muted">${L.length}</span></p>${L.map(row).join('')}` : '';
  $('#dueTasks').innerHTML = part('Overdue', 'bad', over) + part('Due today', 'warn', now);
}
async function setTaskDone(id, done) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  try { await api('/api/tasks/' + encodeURIComponent(id), {patch:{done}, version:t.version}); toast(done ? 'Task done' : 'Task reopened'); }
  catch (e) { toast(errMsg(e)); }
  await load();
}
document.addEventListener('change', e => { const c = e.target.closest('input[data-done]'); if (c) setTaskDone(c.dataset.done, c.checked); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openLead(b.dataset.open); });

function renderList() {
  renderTop(); renderDue();
  if (!loaded) return;
  const a = document.activeElement;
  if (hold || (a && list.contains(a) && a.matches('input,textarea'))) { pending = true; return; }
  pending = false;
  const L = visible();
  list.innerHTML = L.length ? L.map(card).join('') : `<div class="empty">${esc(q || country !== 'all' ? 'No leads match this search.' : EMPTY[view])}</div>`;
}
renderers.push(renderList);

list.addEventListener('pointerdown', () => { hold = true; }, true);
document.addEventListener('pointerup', () => setTimeout(() => { hold = false; if (pending) renderList(); }, 400));
list.addEventListener('focusout', () => setTimeout(() => { if (pending) renderList(); }, 450));
document.addEventListener('input', e => { const el = e.target, id = el.closest('[data-id]')?.dataset.id; if (!id || !['subject','body','notes'].includes(el.name)) return; dirty[id] = {...(dirty[id] || {}), [el.name]: el.value}; });
document.addEventListener('click', e => { const btn = e.target.closest('button[data-act]'); if (!btn) return; const id = btn.closest('[data-id]')?.dataset.id; if (id) act(id, btn.dataset.act); });

async function act(id, a) {
  const l = leadById(id); if (!l) return;
  if (a === 'open') return openLead(id);
  const d = dirty[id] || {}, subject = String(d.subject ?? l.draft?.subject ?? '').trim(), body = String(d.body ?? l.draft?.body ?? ''), notes = String(d.notes ?? l.notes ?? '');
  if (a === 'copy') { try { await navigator.clipboard.writeText((subject ? subject + '\n\n' : '') + body); toast('Copied'); } catch { toast('Copy was blocked: select the text and copy it.'); } return; }
  const now = new Date().toISOString(); let patch;
  if (a === 'approve') { if (!l.email) return toast('No email address for this lead.'); if (!subject || !body.trim()) return toast('Add a subject and a message first.'); patch = {status:'approved', draft:{subject, body}, notes, approvedAt:now, error:null}; }
  else if (a === 'save') patch = editableOf(l) ? {draft:{subject, body}, notes} : {notes};
  else if (a === 'unapprove' || a === 'reopen') patch = {status:'drafted'};
  else if (a === 'skip') patch = {status:'skipped', notes};
  else if (a === 'dnc') patch = {status:'do_not_contact', notes};
  else if (a === 'replied') patch = {status:'replied', repliedAt:now, repliedStep:Math.min(3, Math.max(1, l.step || 1)), notes};
  else if (a === 'noint') patch = {status:'not_interested', notes};
  else if (a === 'contacted') patch = {status:'sent', draft:{subject, body}, notes, nextFollowUp:null, sentLog:[...(l.sentLog || []), {step:l.step || 1, at:now, manual:true, subject}]};
  else return;
  busy.add(id); renderAll();
  try {
    await patchLead(id, patch, l.version);
    if (a === 'dnc' && l.email) await api('/api/dnc', {value:l.email});
    delete dirty[id]; toast(MSG[a]);
  } catch (e) { toast(errMsg(e)); }
  finally { busy.delete(id); await load(); refreshLead(id); }
}

$$('#views [data-view]').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; pending = false; hold = false; renderList(); }));
$('#country').addEventListener('change', e => { country = e.target.value; renderList(); });
$('#q').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); renderList(); });

// CSV of the list on screen (the server builds it and escapes formula-like cells).
$('#exportBtn').addEventListener('click', async () => {
  const ids = visible().map(l => l.id);
  if (!ids.length) return toast('Nothing to export in this list.');
  try {
    const r = await fetch('/api/export', {method:'POST', headers:{'Content-Type':'application/json','X-Req':'1'}, body:JSON.stringify({ids}), credentials:'same-origin'});
    if (!r.ok) throw 0;
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = url; a.download = `enara-leads-${view}-${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Exported ${ids.length} lead${ids.length === 1 ? '' : 's'}`);
  } catch { toast('Export failed. Try again.'); }
});

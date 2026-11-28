// Lead detail: a full-screen sheet on phones, a side panel on wide screens.
let openId = null, detail = null, lastFocus = null;
const sheet = $('#sheet'), sheetBody = $('#sheetBody');
const KIND = {note:'Note',call:'Call',meeting:'Meeting',email_in:'Email from them',stage:'Stage',status:'Status'};

async function openLead(id) {
  if (!leadById(id)) return;
  lastFocus = document.activeElement; openId = id; detail = null;
  sheet.hidden = false; document.body.style.overflow = 'hidden';
  renderLead();
  $('#sheetClose').focus();
  await refreshLead(id);
}
async function refreshLead(id) {
  if (!openId || (id && id !== openId)) return;
  try { detail = await api('/api/leads/' + encodeURIComponent(openId)); } catch (e) { if (e && e.status === 404) { closeLead(); toast('That lead is no longer there.'); return; } }
  renderLead();
}
function closeLead() {
  sheet.hidden = true; openId = null; detail = null; document.body.style.overflow = '';
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}
$('#sheetClose').addEventListener('click', closeLead);
sheet.addEventListener('click', e => { if (e.target === sheet) closeLead(); });
document.addEventListener('keydown', e => {
  if (sheet.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeLead(); }
  if (e.key === 'Tab') { // keep focus inside the sheet
    const f = [...sheet.querySelectorAll('button,input,select,textarea,a[href]')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
$('#sheetAsk').addEventListener('click', () => { const id = openId; closeLead(); askAbout(id); });

function renderLead() {
  const l = leadById(openId) || detail?.lead; if (!l) return;
  const lead = {...(detail?.lead || {}), ...l};
  $('#sheetTitle').textContent = lead.org || 'School';
  const act = detail ? detail.activity : null, tk = detail ? detail.tasks : null;
  const srcs = sourcesOf(lead);
  const sent = (lead.sentLog || []).slice().reverse();
  const opts = (vals, cur, lab) => vals.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(lab ? lab[v] : v)}</option>`).join('');
  const draftPanel = `<div class="panel"><h2>Draft</h2>${draftFields(lead)}${notesField(lead, 'snt')}<div class="acts">${actionsFor(lead)}</div></div>`;
  sheetBody.innerHTML = `<div data-id="${esc(lead.id)}" style="display:grid;gap:14px">
    <div class="panel">
      <div class="meta" style="margin:0 0 8px">${statusTag(lead.status)}${stageTag(lead)}${scoreDots(lead)}${lead.step > 1 ? `<span class="tag warn">${esc(STEP[lead.step])}</span>` : ''}</div>
      <dl class="kv">
        <dt>Where</dt><dd>${esc(placeOf(lead) || '–')}</dd>
        <dt>Type</dt><dd>${esc(SEGMENT_ONE[lead.segment] || lead.segment || '–')}</dd>
        <dt>Contact</dt><dd>${esc([lead.contactName, lead.contactRole].filter(Boolean).join(', ') || '–')}</dd>
        <dt>Email</dt><dd>${lead.email ? `<a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a> <span class="muted">(${esc(lead.emailKind === 'role' ? 'office' : lead.emailKind || '')})</span>` : 'None published'}</dd>
        <dt>Work phone</dt><dd>${lead.contactPhone ? `<a href="tel:${esc(String(lead.contactPhone).replace(/[^+0-9]/g,''))}">${esc(lead.contactPhone)}</a>` : '–'}</dd>
        <dt>Website</dt><dd>${lead.website && /^https?:\/\//.test(lead.website) ? `<a href="${esc(lead.website)}" target="_blank" rel="noopener noreferrer">${esc(host(lead.website))}</a>` : '–'}</dd>
        <dt>Language</dt><dd>${lead.lang === 'ar' ? 'Arabic' : 'English'}</dd>
        <dt>Found by</dt><dd>${esc(lead.foundBy === 'manual' ? 'You' : lead.foundBy || '–')}${lead.createdAt ? ' · ' + esc(fmt(lead.createdAt)) : ''}</dd>
      </dl>
      ${lead.whyFit ? `<p class="why">${esc(lead.whyFit)}</p>` : ''}
      ${srcs.length ? `<p class="lbl">Sources</p><div class="src">${srcs.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(srcLabel(u))}</a>`).join('')}</div>` : ''}
      ${lead.error ? `<p class="err">Last send failed: ${esc(lead.error)}</p>` : ''}
    </div>

    ${editableOf(lead) ? draftPanel : ''}
    <form class="panel" id="dealForm">
      <h2>Deal</h2>
      <div class="grid2 stack">
        <div><label for="d-stage">Stage</label><select id="d-stage" name="stage" style="width:100%">${opts(['none', ...STAGES], lead.stage || 'none', STAGE)}</select></div>
        <div><label for="d-value">Deal value</label><div class="row" style="flex-wrap:nowrap"><input id="d-value" name="dealValue" type="number" min="0" step="any" inputmode="decimal" value="${lead.dealValue ?? ''}"><select name="currency" aria-label="Currency" style="min-width:96px">${opts(CURRENCIES, lead.currency || 'EGP')}</select></div></div>
      </div>
      <label for="d-next">Next step</label><input id="d-next" name="nextStep" maxlength="300" dir="auto" value="${esc(lead.nextStep || '')}" placeholder="e.g. send the proposal to the principal">
      <label for="d-due">Next step due</label><input id="d-due" name="nextStepDue" type="date" value="${esc(lead.nextStepDue || '')}">
      ${lead.stageAt ? `<p class="note">Stage since ${esc(fmt(lead.stageAt))}</p>` : ''}
      <div class="acts"><button class="btn primary" type="submit">Save deal</button></div>
    </form>

    ${editableOf(lead) ? '' : lead.draft?.subject ? `<div class="panel"><h2>Last draft</h2>${draftFields(lead)}${notesField(lead, 'snt')}<div class="acts">${actionsFor(lead)}</div></div>`
      : `<div class="panel"><h2>Notes</h2>${notesField(lead, 'snt')}<div class="acts">${actionsFor(lead) || `<button class="btn" data-act="save">Save note</button>`}</div></div>`}

    <div class="panel"><h2>Tasks</h2>
      ${tk === null ? '<p class="muted">Loading…</p>' : tk.length ? `<div class="due">${tk.map(t => `<div class="task${t.done ? ' done' : ''}"><input type="checkbox" data-done="${esc(t.id)}" aria-label="Done: ${esc(t.title)}"${t.done ? ' checked' : ''}><div class="tt"><span>${esc(t.title)}</span>${t.due ? `<small>due ${esc(fmtDay(t.due))}</small>` : ''}</div></div>`).join('')}</div>` : '<p class="muted" style="margin:0">No tasks yet.</p>'}
      <form id="taskForm" class="grid2 stack" style="align-items:end"><div><label for="t-title">New task</label><input id="t-title" maxlength="200" required placeholder="e.g. call the principal"></div><div><label for="t-due">Due</label><div class="row" style="flex-wrap:nowrap"><input id="t-due" type="date"><button class="btn" type="submit">Add</button></div></div></form>
    </div>

    <div class="panel"><h2>Activity</h2>
      <form id="actForm"><div class="row" style="flex-wrap:nowrap"><label class="sr" for="a-kind">Kind</label><select id="a-kind">${opts(['note','call','meeting','email_in'], 'note', KIND)}</select><label class="sr" for="a-text">What happened</label><input id="a-text" maxlength="2000" dir="auto" placeholder="What happened?" required></div><div class="acts"><button class="btn" type="submit">Add to log</button></div></form>
      ${act === null ? '<p class="muted">Loading…</p>' : act.length ? `<ul class="timeline" style="margin-top:12px">${act.map(a => `<li class="k-${esc(a.kind)}"><time datetime="${esc(a.at)}">${esc(fmtTime(a.at))} · ${esc(KIND[a.kind] || a.kind)}</time><span dir="auto">${esc(a.text)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing logged yet.</p>'}
    </div>

    <div class="panel"><h2>Emails</h2>
      ${sent.length ? `<ul class="timeline">${sent.map(s => `<li><time datetime="${esc(s.at)}">${esc(fmtTime(s.at))}</time>${esc(STEP[s.step] || 'Email')} ${s.manual ? 'contacted by you' : 'sent by the agent'}${s.subject ? `: <span dir="auto" lang="${langOf(lead)}">${esc(s.subject)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No emails sent yet.</p>'}
      ${lead.status === 'sent' && lead.nextFollowUp ? `<p class="note">Next follow-up drafted after ${esc(fmt(lead.nextFollowUp))}.</p>` : ''}
    </div>
  </div>`;
}

sheetBody.addEventListener('submit', async e => {
  e.preventDefault();
  const l = leadById(openId); if (!l) return;
  const f = e.target;
  try {
    if (f.id === 'dealForm') {
      const v = f.dealValue.value.trim(), num = v === '' ? null : Number(v);
      if (num !== null && !(Number.isFinite(num) && num >= 0)) return toast('Enter the deal value as a number.');
      await patchLead(l.id, {stage:f.stage.value, dealValue:num, currency:f.currency.value, nextStep:f.nextStep.value.trim(), nextStepDue:f.nextStepDue.value || ''}, l.version);
      toast('Deal saved');
    } else if (f.id === 'taskForm') {
      await api('/api/tasks', {leadId:l.id, title:$('#t-title').value.trim(), due:$('#t-due').value || ''});
      toast('Task added');
    } else if (f.id === 'actForm') {
      await api('/api/leads/' + encodeURIComponent(l.id) + '/activity', {kind:$('#a-kind').value, text:$('#a-text').value.trim()});
      toast('Added to the log');
    } else return;
  } catch (err) { toast(errMsg(err)); }
  await load(); refreshLead();
});

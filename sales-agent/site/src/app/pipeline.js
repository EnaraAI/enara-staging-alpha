// Pipeline: one column per stage (one stage at a time on phones), plus "Add a school".
let stageOn = 'replied';
function renderPipeline() {
  const inStage = s => leads.filter(l => (l.stage || 'none') === s);
  const totals = L => { const t = {}; for (const l of L) if (Number(l.dealValue) > 0) t[l.currency || 'EGP'] = (t[l.currency || 'EGP'] || 0) + Number(l.dealValue); return Object.entries(t).map(([c, v]) => money(v, c)).join(' · '); };
  $('#stageChips').innerHTML = STAGES.map(s => `<button type="button" data-stage="${s}" aria-pressed="${s === stageOn}">${esc(STAGE[s])} <span class="n">${loaded ? inStage(s).length : '–'}</span></button>`).join('');
  if (!loaded) { $('#board').innerHTML = '<div class="empty">Loading…</div>'; return; }
  const a = document.activeElement; if (a && $('#board').contains(a) && a.tagName === 'SELECT') return;
  const day = today();
  $('#board').innerHTML = STAGES.map(s => {
    const L = inStage(s).sort((x, y) => String(x.nextStepDue || '9').localeCompare(String(y.nextStepDue || '9')) || String(y.stageAt || '').localeCompare(String(x.stageAt || '')));
    const tot = totals(L);
    return `<section class="col${s === stageOn ? ' on' : ''}" aria-label="${esc(STAGE[s])}">
      <div class="col-h"><h2>${esc(STAGE[s])}</h2><span class="tag">${L.length}</span></div>
      ${tot ? `<div class="col-tot">${esc(tot)}</div>` : ''}
      ${L.length ? L.map(l => `<article class="pcard" data-id="${esc(l.id)}">
        <h3><button type="button" data-open="${esc(l.id)}">${esc(l.org || 'Unnamed organisation')}</button></h3>
        <div class="meta">${esc(placeOf(l))}${l.contactName ? ' · ' + esc(l.contactName) : ''}</div>
        ${Number(l.dealValue) > 0 ? `<div class="stat" style="font-weight:600">${esc(money(l.dealValue, l.currency || 'EGP'))}</div>` : ''}
        ${l.nextStep ? `<div style="font-size:14px" dir="auto">${esc(l.nextStep)}${l.nextStepDue ? ` <span class="tag ${l.nextStepDue < day ? 'bad' : l.nextStepDue === day ? 'warn' : ''}">${esc(fmtDay(l.nextStepDue))}</span>` : ''}</div>` : ''}
        <label class="sr" for="mv-${esc(l.id)}">Move ${esc(l.org || 'lead')} to</label>
        <select id="mv-${esc(l.id)}" data-move="${esc(l.id)}"><option value="">Move to…</option>${STAGES.filter(x => x !== s).map(x => `<option value="${x}">${esc(STAGE[x])}</option>`).join('')}</select>
      </article>`).join('') : '<p class="muted" style="margin:4px">Nothing here yet.</p>'}
    </section>`;
  }).join('');
}
renderers.push(() => { if (tab === 'pipeline') renderPipeline(); });
onTab.pipeline = renderPipeline;
$('#stageChips').addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; stageOn = b.dataset.stage; renderPipeline(); });
$('#board').addEventListener('change', async e => {
  const s = e.target.closest('select[data-move]'); if (!s || !s.value) return;
  const l = leadById(s.dataset.move); if (!l) return;
  const to = s.value; s.disabled = true;
  try { await patchLead(l.id, {stage:to}, l.version); toast(`Moved to ${STAGE[to]}`); stageOn = to; }
  catch (err) { toast(errMsg(err)); }
  s.blur(); await load(); renderPipeline();
});

// Add a school (manual lead): the agent never emails it, but uses it for duplicate checks.
const addDlg = $('#addDlg'), addForm = $('#addForm');
$('#a-country').innerHTML = Object.entries(COUNTRIES).map(([k,v]) => `<option value="${k}">${esc(v)}</option>`).join('');
$('#a-segment').innerHTML = '<option value="">Not sure</option>' + Object.entries(SEGMENT_ONE).map(([k,v]) => `<option value="${k}">${esc(v)}</option>`).join('');
$('#a-stage').innerHTML = ['none', ...STAGES].map(s => `<option value="${s}">${esc(STAGE[s])}</option>`).join('');
$$('[data-add-school]').forEach(b => b.addEventListener('click', () => { addForm.reset(); $('#addErr').textContent = ''; addDlg.showModal(); $('#a-org').focus(); }));
$('#addCancel').addEventListener('click', () => addDlg.close());
addForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = addForm, v = n => f[n].value.trim();
  const lead = {org:v('org'), country:f.country.value, city:v('city'), segment:f.segment.value, website:v('website'), contactName:v('contactName'), contactRole:v('contactRole'), email:v('email'), contactPhone:v('contactPhone'), stage:f.stage.value, lang:f.lang.value, notes:f.notes.value};
  if (lead.website && !lead.website.startsWith('https://')) lead.website = lead.website.startsWith('http://') ? 'https://' + lead.website.slice(7) : 'https://' + lead.website;
  $('#addSave').disabled = true; $('#addErr').textContent = '';
  try {
    const r = await api('/api/leads', {lead});
    addDlg.close(); toast('School added'); await load(); openLead(r.id);
  } catch (err) {
    $('#addErr').textContent = err && err.code === 'exists' ? 'This school (or this email) is already in your leads.' : 'Check the fields: the website must start with https://, and the email and phone must be work contacts.';
    if (err && err.code === 'exists' && err.id && leadById(err.id)) { const id = err.id; setTimeout(() => { addDlg.close(); openLead(id); }, 1200); }
  } finally { $('#addSave').disabled = false; }
});

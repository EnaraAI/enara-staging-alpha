// Shared state, helpers and the API call. build.py joins src/app/*.js inside one block.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COUNTRIES = {EG:'Egypt',SA:'Saudi Arabia',IQ:'Iraq',AE:'UAE',KW:'Kuwait',QA:'Qatar',BH:'Bahrain',OM:'Oman'};
const SEGMENTS = {international_school:'International schools',private_school:'Private schools',school_group:'School groups',language_center:'English teaching centres',training_center:'Training centres',university:'University English programmes'};
const SEGMENT_ONE = {international_school:'International school',private_school:'Private school',school_group:'School group',language_center:'English teaching centre',training_center:'Training centre',university:'University English programme'};
const GROUPS = {review:['drafted'],queued:['approved'],sent:['sent'],replied:['replied'],closed:['not_interested','do_not_contact','skipped'],manual:['manual']};
const STATUS = {drafted:'To review',approved:'Approved',sent:'Sent',replied:'Replied',not_interested:'Not interested',do_not_contact:'Do not contact',skipped:'Skipped',manual:'Added by you'};
const STATUS_TONE = {drafted:'warn',approved:'info',sent:'info',replied:'ok',not_interested:'',do_not_contact:'bad',skipped:'',manual:''};
const STAGES = ['replied','meeting_booked','demo_done','proposal_sent','won','lost'];
const STAGE = {none:'No stage',replied:'Replied',meeting_booked:'Meeting booked',demo_done:'Demo done',proposal_sent:'Proposal sent',won:'Won',lost:'Lost'};
const CURRENCIES = ['EGP','SAR','AED','KWD','QAR','BHD','OMR','IQD','USD'];
const STEP = {1:'First email',2:'Follow-up 1',3:'Follow-up 2'};
const DEF = {newPerDay:8,sendCapPerDay:50,paused:false,countries:Object.keys(COUNTRIES),segments:['international_school','private_school','school_group','language_center','training_center'],senderName:'Mohamed Elkholy',senderTitle:'',senderPhone:'',focus:'',demoFormUrl:''};

let leads = [], settings = null, runs = [], imports = [], tasks = [], dnc = [], control = {}, loaded = false, running = false;
let tab = 'review';

const cairoDay = d => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(d);
const today = () => cairoDay(new Date());
const fmt = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'Africa/Cairo'}); };
const fmtDay = day => { if (!day) return ''; const d = new Date(day + 'T12:00:00Z'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}); };
const fmtTime = iso => { const d = new Date(iso); if (isNaN(d)) return ''; const z = {timeZone:'Africa/Cairo'}; return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',...z}) + ', ' + d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,...z}); };
const host = u => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return 'link'; } };
const srcLabel = u => { try { const x = new URL(u), p = x.pathname.replace(/\/$/, ''); return x.hostname.replace(/^www\./,'') + (p ? (p.length > 28 ? p.slice(0, 27) + '…' : p) : ''); } catch { return 'link'; } };
const money = (v, c) => (Number(v) || 0).toLocaleString('en-US',{maximumFractionDigits:0}) + ' ' + (c || '');
const S = () => ({...DEF, ...(settings || {})});
const leadById = id => leads.find(l => l.id === id);
const langOf = l => l && l.lang === 'ar' ? 'ar' : 'en';
let tt; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3200); };

async function api(path, body) {
  const opts = body ? {method:'POST', headers:{'Content-Type':'application/json','X-Req':'1'}, body:JSON.stringify(body), credentials:'same-origin'} : {headers:{'X-Req':'1'}, credentials:'same-origin', cache:'no-store'};
  const r = await fetch(path, opts);
  if (r.status === 401) { location.href = '/'; throw {code:'signed_out'}; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw {code: j.error || 'error', status: r.status, id: j.id};
  return j;
}
const errMsg = e => e && e.code === 'conflict' ? 'The agent just updated this lead, so it was reloaded. Please try again.' : 'Could not save. Try again.';

// One lead change, exactly like the buttons: the lead's version must still match (409 otherwise).
async function patchLead(id, patch, version) {
  patch.updatedAt = new Date().toISOString();
  return api('/api/leads/' + encodeURIComponent(id), {patch, version});
}

const scoreDots = l => { const s = Math.max(0, Math.min(5, Number(l.score) || 0)); return s ? `<span class="dots" title="Fit ${s} of 5" aria-label="Fit ${s} of 5">${'●'.repeat(s)}${'○'.repeat(5-s)}</span>` : ''; };
const statusTag = st => `<span class="tag ${STATUS_TONE[st] || ''}">${esc(STATUS[st] || st)}</span>`;
const stageTag = l => l.stage && l.stage !== 'none' ? `<span class="tag ${l.stage === 'won' ? 'ok' : l.stage === 'lost' ? 'bad' : 'info'}">${esc(STAGE[l.stage] || l.stage)}</span>` : '';
const placeOf = l => [COUNTRIES[l.country] || l.country, l.city].filter(Boolean).join(' · ');

// Tabs: bottom bar on phones, top bar on wide screens; the hash keeps the tab on reload.
const TABS = ['review','pipeline','insights','ask','settings'];
const onTab = {};
function showTab(t, focus) {
  if (!TABS.includes(t)) t = 'review';
  tab = t;
  $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== t);
  $$('[data-tab]').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
  if (onTab[t]) onTab[t]();
  if (focus) { const h = $('#h-' + t); if (h) { h.tabIndex = -1; h.focus({preventScroll:true}); } window.scrollTo(0, 0); }
}
$$('[data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab, true)));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

const renderers = [];

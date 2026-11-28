// Ask: the chat. History stays in this browser; the last 20 turns go to /api/chat. Answers can carry proposal cards:
// Confirm runs the same request the buttons do (with the lead's version), so nothing changes without the owner.
const CHAT_KEY = 'es-chat-v1';
const STARTERS = ['Which drafts should I approve first?', 'How many replies this week?', 'Schools in Riyadh waiting for follow-up'];
const ACTION = {approve:'Approve the email', skip:'Skip this school', mark_replied:'Mark as replied', set_stage:'Move to a stage', add_note:'Add a note', add_task:'Add a task', update_draft:'Update the draft'};
let chat = [], chatLead = null, chatBusy = false;
const bumped = {}; // leads changed by a confirmed card in this browser: their version after our change
try { const s = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null'); if (s && Array.isArray(s.chat)) { chat = s.chat.slice(-60); chatLead = s.lead || null; } } catch {}
const saveChat = () => { try { localStorage.setItem(CHAT_KEY, JSON.stringify({chat: chat.slice(-60), lead: chatLead})); } catch {} };

// A small, safe Markdown subset: paragraphs, **bold**, lists and https links. Everything is escaped first.
function md(text) {
  const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]{1,200})\]\((https:\/\/[^\s)]{1,500})\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  const out = []; let listType = null, para = [];
  const flushP = () => { if (para.length) { out.push(`<p dir="auto">${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushL = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd(), ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) { flushP(); const t = ul ? 'ul' : 'ol'; if (listType !== t) { flushL(); out.push(`<${t} dir="auto">`); listType = t; } out.push(`<li>${inline((ul || ol)[1])}</li>`); }
    else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(line.replace(/^#+\s*/, '')); }
  }
  flushP(); flushL();
  return out.join('');
}

function propCard(p, mi, pi) {
  const l = leadById(p.leadId), lg = p.lang === 'ar' ? 'ar' : 'en';
  let what = '';
  if (p.action === 'set_stage') what = `<p style="margin:0">Move to <strong>${esc(STAGE[p.stage] || p.stage)}</strong></p>`;
  else if (p.action === 'add_note') what = `<pre dir="auto">${esc(p.text)}</pre>`;
  else if (p.action === 'add_task') what = `<p style="margin:0" dir="auto">${esc(p.title)}${p.due ? ` · due ${esc(fmtDay(p.due))}` : ''}</p>`;
  else if (p.action === 'update_draft') what = `<p style="margin:0"><strong dir="auto" lang="${lg}">${esc(p.subject)}</strong></p><pre dir="auto" lang="${lg}">${esc(p.body)}</pre>`;
  else if (p.action === 'approve') what = `<p class="note" style="margin:0">It goes out with the agent's next hourly run.</p>`;
  const state = p.done ? `<span class="tag ok">Done</span>` : p.failed ? `<span class="err">${esc(p.failed)}</span>` : '';
  return `<div class="prop"><h3>${esc(ACTION[p.action] || p.action)}: ${esc(p.org || (l && l.org) || p.leadId)}</h3>${p.reason ? `<p class="muted" style="margin:0" dir="auto">${esc(p.reason)}</p>` : ''}${what}
    <div class="row">${p.done ? state : `<button type="button" class="btn primary sm" data-confirm="${mi}:${pi}">Confirm</button><button type="button" class="btn sm" data-open="${esc(p.leadId)}">Open school</button>${state}`}</div></div>`;
}

function renderChat() {
  const ready = !!control.chatReady;
  $('#chatNote').innerHTML = loaded && !ready ? '<div class="empty" style="margin-bottom:12px">Chat isn’t connected yet. It starts working once the Anthropic API key is added to the website’s settings in Cloudflare.</div>' : '';
  $('#chatLog').innerHTML = chat.map((m, mi) => m.role === 'user'
    ? `<div class="msg me" dir="auto">${esc(m.content)}</div>`
    : `<div class="msg ai">${md(m.content)}</div>${(m.proposals || []).map((p, pi) => propCard(p, mi, pi)).join('')}`).join('')
    + (chatBusy ? '<div class="msg ai typing" aria-label="Thinking"><i></i><i></i><i></i></div>' : '');
  $('#starters').innerHTML = chat.length ? '' : STARTERS.map(s => `<button type="button" data-starter>${esc(s)}</button>`).join('');
  const l = chatLead && leadById(chatLead);
  $('#chatCtx').innerHTML = chatLead ? `<span class="ctx">About: ${esc(l ? l.org : chatLead)} <button type="button" class="btn ghost sm" id="ctxClear" aria-label="Stop asking about this school">×</button></span>` : '';
  $('#chatSend').disabled = chatBusy || (loaded && !ready);
}
onTab.ask = () => { renderChat(); setTimeout(() => $('#chatIn').focus({preventScroll:true}), 0); };
renderers.push(() => { if (tab === 'ask') renderChat(); });

function askAbout(id) { chatLead = id; saveChat(); showTab('ask', true); }

async function sendChat(text) {
  text = text.trim(); if (!text || chatBusy) return;
  if (text.length > 4000) return toast('Messages can be up to 4,000 characters.');
  chat.push({role:'user', content:text}); chatBusy = true; saveChat(); renderChat();
  $('#chatIn').value = ''; autoGrow();
  const turns = chat.slice(-20).map(m => ({role:m.role, content:m.content}));
  try {
    const r = await api('/api/chat', {messages:turns, leadId:chatLead || undefined});
    chat.push({role:'assistant', content:r.answer || '', proposals:Array.isArray(r.proposals) ? r.proposals : []});
  } catch (e) {
    chat.pop(); $('#chatIn').value = text; autoGrow();
    toast(e && e.code === 'chat_not_set_up' ? 'Chat isn’t connected yet.' : e && e.code === 'rate_limited' ? 'That’s a lot of questions: wait a few minutes and try again.' : e && e.code === 'chat_busy' ? 'The assistant is busy. Try again in a minute.' : 'The answer didn’t come through. Try again.');
  }
  chatBusy = false; saveChat(); renderChat();
  const last = $('#chatLog').lastElementChild; if (last) last.scrollIntoView({block:'nearest', behavior:'auto'});
}

async function confirmProp(mi, pi) {
  const p = chat[mi]?.proposals?.[pi]; if (!p || p.done) return;
  await load();
  const l = leadById(p.leadId);
  if (!l) { p.failed = 'That school is no longer in your leads.'; saveChat(); return renderChat(); }
  // The lead must be as it was when the assistant suggested this (or only changed by a card confirmed here).
  if (l.version !== p.version && l.version !== bumped[p.leadId]) { p.failed = 'This school changed since the suggestion. Open it to check, or ask again.'; saveChat(); return renderChat(); }
  const now = new Date().toISOString(); let patch = null;
  try {
    if (p.action === 'approve') {
      if (l.status !== 'drafted' || !l.email || !l.draft?.subject) throw {msg:'This email can’t be approved any more.'};
      patch = {status:'approved', draft:{subject:l.draft.subject, body:l.draft.body}, approvedAt:now, error:null};
    } else if (p.action === 'skip') patch = {status:'skipped'};
    else if (p.action === 'mark_replied') patch = {status:'replied', repliedAt:now, repliedStep:Math.min(3, Math.max(1, l.step || 1))};
    else if (p.action === 'set_stage') patch = {stage:p.stage};
    else if (p.action === 'update_draft') { if (!editableOf(l)) throw {msg:'This email can’t be edited any more.'}; patch = {draft:{subject:p.subject, body:p.body}}; }
    if (patch) { await patchLead(l.id, patch, l.version); bumped[l.id] = l.version + 1; }
    else if (p.action === 'add_note') await api('/api/leads/' + encodeURIComponent(l.id) + '/activity', {kind:'note', text:p.text});
    else if (p.action === 'add_task') await api('/api/tasks', {leadId:l.id, title:p.title, due:p.due || ''});
    p.done = true; p.failed = ''; toast('Done');
  } catch (e) { p.failed = e && e.msg ? e.msg : e && e.code === 'conflict' ? 'This school changed in the meantime. Open it to check.' : 'Could not do it. Try again.'; }
  saveChat(); await load(); renderChat();
}

const autoGrow = () => { const t = $('#chatIn'); t.style.height = 'auto'; t.style.height = Math.min(180, t.scrollHeight + 2) + 'px'; };
$('#chatIn').addEventListener('input', autoGrow);
$('#chatIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer:fine)').matches) { e.preventDefault(); sendChat($('#chatIn').value); } });
$('#chatForm').addEventListener('submit', e => { e.preventDefault(); sendChat($('#chatIn').value); });
$('#starters').addEventListener('click', e => { const b = e.target.closest('[data-starter]'); if (b) sendChat(b.textContent); });
$('#chatLog').addEventListener('click', e => { const b = e.target.closest('[data-confirm]'); if (!b) return; b.disabled = true; const [mi, pi] = b.dataset.confirm.split(':').map(Number); confirmProp(mi, pi); });
$('#chatCtx').addEventListener('click', e => { if (e.target.closest('#ctxClear')) { chatLead = null; saveChat(); renderChat(); } });
$('#chatNew').addEventListener('click', () => { chat = []; chatLead = null; saveChat(); renderChat(); $('#chatIn').focus(); });

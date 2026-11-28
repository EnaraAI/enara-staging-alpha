// Settings: run controls, uploads, agent settings, the do-not-contact list and recent runs.
$('#s-countries').innerHTML = Object.entries(COUNTRIES).map(([k,v]) => `<label><input type="checkbox" name="c" value="${k}"> ${esc(v)}</label>`).join('');
$('#s-segments').innerHTML = Object.entries(SEGMENTS).map(([k,v]) => `<label><input type="checkbox" name="g" value="${k}"> ${esc(v)}</label>`).join('');
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
  box.innerHTML = imports.map(i => `<div class="run imp"><span><strong>${esc(i.name)}</strong> · ${esc(i.kind === 'pdf' ? 'PDF' : 'Spreadsheet')} · ${esc(st(i))} · ${esc(fmtTime(i.uploadedAt))}${i.agentNote ? `<br>${esc(i.agentNote)}` : ''}</span>${i.status === 'processing' ? '' : `<button type="button" class="btn sm" data-rm="${esc(i.id)}">Remove</button>`}</div>`).join('');
}
$('#upList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-rm]'); if (!b) return;
  b.disabled = true;
  try { await api('/api/imports/' + encodeURIComponent(b.dataset.rm) + '/remove', {}); toast('Removed'); } catch { toast('Could not remove it.'); }
  await load();
});

function renderRuns() {
  const box = $('#runs');
  if (!runs.length) { box.innerHTML = '<div class="run">No runs yet. The agent runs every day, every hour from 8:14 AM to 4:14 PM Cairo time.</div>'; return; }
  box.innerHTML = runs.map(r => `<div class="run"><strong>${esc(fmtTime(r.at))}</strong> · found <b>${esc(r.found ?? 0)}</b> · drafted <b>${esc(r.drafted ?? 0)}</b> · sent <b>${esc(r.sent ?? 0)}</b> · follow-ups <b>${esc(r.followups ?? 0)}</b>${r.errors ? ` · errors <b>${esc(r.errors)}</b>` : ''}${r.note ? `<br>${esc(r.note)}` : ''}</div>`).join('');
}

function renderDnc() {
  const box = $('#dncList');
  box.innerHTML = dnc.length ? dnc.map(d => `<div class="run"><strong>${esc(d.value)}</strong>${d.reason ? ' · ' + esc(d.reason) : ''}${d.at ? ' · ' + esc(fmt(d.at)) : ''}</div>`).join('') : '<p class="muted" style="margin:0">No one yet.</p>';
}
$('#dncForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#dncIn').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast('Enter an email address.');
  try { await api('/api/dnc', {value:v}); $('#dncIn').value = ''; toast('Added to do not contact'); } catch { toast('Could not add it.'); }
  await load();
});
renderers.push(() => { renderRuns(); fillSettings(); renderControls(); renderImports(); renderDnc(); });

// Autonomy: one switch per action (all off by default), the limits, the reply inbox and the targeting note.
const AUTO = [
  ['bounces', 'Bounces', 'When an email bounces, mark the school and look for another work contact; the new draft waits for you.'],
  ['staleTasks', 'Stale deals', 'A deal with no next step for 7 days gets a task.'],
  ['weeklyReport', 'Weekly report', 'Every Sunday morning, a short email to you: replies, meetings, deals, best and worst segments.'],
  ['replies', 'Spot replies', 'Reads the reply inbox and marks schools that wrote back as Replied (follow-ups stop).'],
  ['noThanks', 'Respect "no thanks"', 'An unsubscribe or "not interested" reply puts the school on the do-not-contact list.'],
  ['meetingDrafts', 'Draft answers to meeting requests', 'Drafts a reply with your demo link. It waits for you; it is never sent on its own.'],
  ['autoFollowUps', 'Follow-ups send themselves', 'For schools whose first email you approved, after the hold, if the check passes.'],
  ['autoFirst', 'Some first emails send themselves', 'Only score 5, a named person and a work email, after the hold, if the check passes.'],
  ['learn', 'Aim where replies come from', 'Each week, shift research toward the countries, types and languages with the best reply rates.'],
];
function renderAutonomy() {
  const a = autonomy || {};
  $('#autoList').innerHTML = AUTO.map(([k, t, d]) => `<div class="switch"><input type="checkbox" role="switch" id="as-${k}" data-auto="${k}"${a[k] ? ' checked' : ''}${!loaded ? ' disabled' : ''}><label for="as-${k}">${esc(t)}<small>${esc(d)}</small></label></div>`).join('')
    + (a.learn ? `<div class="switch"><input type="checkbox" role="switch" id="as-lock" data-auto="learnLocked"${a.learnLocked ? ' checked' : ''}><label for="as-lock">Keep the current targeting<small>The agent reports what it would change but doesn't change research.</small></label></div>` : '');
  const f = $('#autoLimits'); if (!f.contains(document.activeElement)) { $('#al-hold').value = a.holdHours ?? 12; $('#al-fu').value = a.followUpsPerDay ?? 15; $('#al-first').value = a.firstPerDay ?? 5; }
  $('#autoCheckNote').textContent = control.checkReady ? 'Before any automatic send, a second model (DeepSeek) checks the draft against the claims rules. If it is unsure, the draft waits for you.' : 'Automatic sends stay off until the DeepSeek key (DEEPSEEK_API_KEY) is added in Cloudflare: every draft must pass that check first.';
  const ib = inbox && typeof inbox.forwardTo === 'string' ? inbox : null;
  $('#autoInbox').innerHTML = (a.replies || a.noThanks || a.meetingDrafts) ? `<p class="note" style="margin:10px 0 0">Reply inbox: ${ib ? `forward replies from your mailbox to <code class="addr">${esc(ib.forwardTo)}</code> (in Roundcube: Settings → Filters → a rule that redirects a copy). The agent reads them at ${esc(ib.inboxAddress || 'the sales inbox')}.` : 'not set up yet.'}</p>` : '';
  $('#autoTarget').innerHTML = targeting && targeting.note ? `<p class="note" style="margin:10px 0 0"><strong>Targeting</strong> (${esc(fmt(targeting.at))}): ${esc(targeting.note)}</p>` : '';
}
$('#autoList').addEventListener('change', async e => {
  const c = e.target.closest('input[data-auto]'); if (!c) return;
  c.disabled = true;
  try { const r = await api('/api/autonomy', {data:{[c.dataset.auto]: c.checked}}); autonomy = r.autonomy || autonomy; toast(c.checked ? 'Switched on' : 'Switched off'); }
  catch { c.checked = !c.checked; toast('Could not change it. Try again.'); }
  c.disabled = false; renderAll();
});
$('#autoLimits').addEventListener('submit', async e => {
  e.preventDefault();
  const n = (id, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number($(id).value) || 0)));
  try { const r = await api('/api/autonomy', {data:{holdHours:n('#al-hold', 1, 72), followUpsPerDay:n('#al-fu', 0, 50), firstPerDay:n('#al-first', 0, 20)}}); autonomy = r.autonomy || autonomy; toast('Limits saved'); document.activeElement?.blur?.(); }
  catch { toast('Could not save the limits.'); }
  renderAll();
});
renderers.push(renderAutonomy);

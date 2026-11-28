// Insights: numbers from /api/insights, charts drawn here as inline SVG (no chart library).
// Each chart has an aria-label summary and a "Show numbers" table.
let range = '30', ins = null, insLoading = false;
const HEAD = [['newLeads','New leads found'],['draftsWaiting','Drafts waiting'],['approved','Approved'],['emailsSent','Emails sent by the agent'],['replies','Replies'],['replyRate','Reply rate'],['meetings','Meetings booked'],['won','Deals won']];
const FUNNEL = {found:'Found',approved:'Approved',emailed:'Emailed',replied:'Replied',meeting:'Meeting',demo:'Demo',proposal:'Proposal',won:'Won'};
const BREAK = {country:'By country',segment:'By type',score:'By fit score',lang:'By language',emailKind:'By email kind',source:'By source'};
const KEYLAB = {country:k => COUNTRIES[k] || k || 'Unknown', segment:k => SEGMENT_ONE[k] || k || 'Unknown', score:k => k && k !== '0' ? k + ' of 5' : 'No score', lang:k => k === 'ar' ? 'Arabic' : k === 'en' ? 'English' : 'Unknown', emailKind:k => ({named:'Named person',office:'Office address',none:'No email'})[k] || k, source:k => k === 'manual' ? 'Added by you' : k === 'daily run' ? 'Daily run' : String(k).replace(/^upload:\s*/, 'File: ')};
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
const nf = n => Number(n || 0).toLocaleString('en-US');

function table(cols, rows) { return `<details class="alt"><summary>Show numbers</summary><div class="tablewrap"><table><thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`; }

// Horizontal bars, label above each bar, value at the end of the bar.
function hbars(rows, w, cls = 'c1') {
  const valW = Math.min(w * 0.55, Math.max(40, ...rows.map(r => String(r.text ?? nf(r.value)).length * 7 + 10)));
  const max = Math.max(1, ...rows.map(r => r.value)), rh = 40, bw = Math.max(40, w - valW);
  const h = rows.length * rh;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${rows.map((r, i) => {
    const y = i * rh, len = r.value ? Math.max(3, bw * r.value / max) : 0;
    return `<text x="0" y="${y + 13}">${esc(r.label)}</text><rect class="track" x="0" y="${y + 19}" width="${bw}" height="12" rx="3"/>${len ? `<rect class="${r.cls || cls}" x="0" y="${y + 19}" width="${len.toFixed(1)}" height="12" rx="3"/>` : ''}<text x="${(len + 6).toFixed(1)}" y="${y + 30}" class="${r.value ? '' : 'm'}">${esc(r.text ?? nf(r.value))}</text>`;
  }).join('')}</svg>`;
}

// Daily columns (stacked series), last 30 Cairo days.
function columns(days, series, w) {
  const h = 170, top = 18, bottom = 24, left = 4, plotH = h - top - bottom, n = days.length, gap = n > 20 ? 2 : 4;
  const cw = (w - left) / n, bw = Math.max(2, cw - gap);
  const tot = d => series.reduce((a, s) => a + (d[s.key] || 0), 0), max = Math.max(1, ...days.map(tot));
  let out = `<line class="axis" x1="0" x2="${w}" y1="${top + plotH + .5}" y2="${top + plotH + .5}"/>`;
  days.forEach((d, i) => {
    let y = top + plotH; const x = left + i * cw;
    for (const s of series) { const v = d[s.key] || 0; if (!v) continue; const hh = plotH * v / max; y -= hh; out += `<rect class="${s.cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5"/>`; }
    const t = tot(d);
    if (t && (cw >= 16 || t === max)) out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle">${t}</text>`;
    if (i % 7 === (n - 1) % 7) out += `<text class="m" x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(fmtDay(d.day))}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${out}</svg>`;
}

function chartBox(id, title, svg, label, alt, extra = '', wide = false) {
  return `<figure class="panel chart${wide ? ' wide' : ''}" id="${id}"><h2>${esc(title)}</h2>${extra}<div role="img" aria-label="${esc(label)}">${svg}</div>${alt}</figure>`;
}

function renderInsights() {
  $$('#rangeChips [data-range]').forEach(b => b.setAttribute('aria-pressed', b.dataset.range === range));
  const box = $('#insights');
  if (!ins) { box.innerHTML = `<div class="empty">${insLoading ? 'Loading…' : 'Insights couldn’t load. Check your connection.'}</div>`; return; }
  const bw0 = box.clientWidth || 340, w = Math.max(240, (bw0 >= 900 ? (bw0 - 14) / 2 : bw0) - 34);
  const wWide = Math.max(260, (box.clientWidth || 340) - 34);
  const h = ins.headline;
  $('#insSince').textContent = ins.since ? `From ${fmtDay(ins.since)} to today. Days are counted in Cairo time.` : 'All time. Days are counted in Cairo time.';
  const tile = ([k, lab]) => `<div class="tile"><b>${k === 'replyRate' ? (h.replyRate === null ? '–' : h.replyRate + '%') : nf(h[k])}</b><span>${esc(lab)}${k === 'emailsSent' && h.emailsSentByYou ? ` (+${nf(h.emailsSentByYou)} by you)` : ''}${k === 'replyRate' && h.leadsEmailed ? ` (${nf(h.leadsReplied)} of ${nf(h.leadsEmailed)})` : ''}${k === 'draftsWaiting' ? ' (now)' : ''}</span></div>`;

  const f = ins.funnel, found = f[0].n;
  const fRows = f.map((s, i) => ({label: FUNNEL[s.key], value: s.n, text: i ? `${nf(s.n)} · ${pct(s.n, found)}` : nf(s.n), cls: i < 3 ? 'c1' : i < 4 ? 'c2' : 'c3'}));
  const funnel = chartBox('ch-funnel', 'Funnel', hbars(fRows, w), 'Funnel of schools found in this range: ' + f.map(s => `${FUNNEL[s.key]} ${s.n}`).join(', '), table(['Step', 'Schools', 'Of found'], f.map(s => [FUNNEL[s.key], s.n, pct(s.n, found)])), '<p class="note" style="margin:0 0 8px">Schools the agent found in this range, by the furthest step each reached.</p>');

  const days = ins.perDay, sumOf = k => days.reduce((a, d) => a + d[k], 0);
  const sentChart = chartBox('ch-sent', 'Emails sent per day', columns(days, [{key:'sent', cls:'c1'}, {key:'manual', cls:'c3'}], wWide),
    `Last 30 days: ${sumOf('sent')} emails sent by the agent and ${sumOf('manual')} contacts made by you.`,
    table(['Day', 'By the agent', 'By you'], days.filter(d => d.sent || d.manual).map(d => [fmtDay(d.day), d.sent, d.manual])),
    `<div class="legend"><span><i style="background:var(--chart-1)"></i>By the agent (${sumOf('sent')})</span><span><i style="background:var(--chart-3)"></i>Contacted by you (${sumOf('manual')})</span><span>Last 30 days</span></div>`, true);
  const leadChart = chartBox('ch-leads', 'New leads per day', columns(days, [{key:'leads', cls:'c2'}], wWide),
    `Last 30 days: ${sumOf('leads')} new leads.`, table(['Day', 'New leads'], days.filter(d => d.leads).map(d => [fmtDay(d.day), d.leads])),
    `<div class="legend"><span><i style="background:var(--chart-2)"></i>New leads (${sumOf('leads')})</span><span>Last 30 days</span></div>`, true);

  const st = ins.followUps.steps;
  const fu = chartBox('ch-followups', 'Replies by email', hbars(st.map((s, i) => ({label: `${STEP[s.step]}: ${nf(s.emailed)} emailed`, value: s.replied, text: `${nf(s.replied)} replied · ${pct(s.replied, s.emailed)}`, cls: ['c1', 'c4', 'c5'][i]})), w),
    'Replies by the email they answered: ' + st.map(s => `${STEP[s.step]} ${s.replied} of ${s.emailed}`).join(', '),
    table(['Email', 'Leads emailed', 'Replied', 'Rate'], st.map(s => [STEP[s.step], s.emailed, s.replied, pct(s.replied, s.emailed)])),
    ins.followUps.repliedUnknownStep ? `<p class="note" style="margin:0 0 8px">${nf(ins.followUps.repliedUnknownStep)} earlier repl${ins.followUps.repliedUnknownStep === 1 ? 'y' : 'ies'} without a recorded step are not shown.</p>` : '');

  const breaks = Object.entries(BREAK).map(([k, title], bi) => {
    const rows = ins.breakdowns[k] || [];
    if (!rows.length) return chartBox('ch-' + k, title, '<p class="muted" style="margin:0">No leads in this range.</p>', title + ': no leads', '');
    const lab = KEYLAB[k];
    return chartBox('ch-' + k, title, hbars(rows.map(r => ({label: lab(r.key), value: r.leads, text: `${nf(r.leads)} · ${nf(r.replied)} replied`})), w, 'c' + ((bi % 5) + 1)),
      title + ': ' + rows.map(r => `${lab(r.key)} ${r.leads} leads, ${r.replied} replied`).join('; '),
      table(['', 'Leads', 'Emailed', 'Replied'], rows.map(r => [lab(r.key), r.leads, r.emailed, r.replied])));
  }).join('');

  box.innerHTML = `<div class="tiles">${HEAD.map(tile).join('')}</div><div class="charts">${sentChart}${funnel}${fu}${leadChart}${breaks}</div>`;
}

async function loadInsights() {
  insLoading = true; if (!ins) renderInsights();
  try { ins = await api('/api/insights?range=' + encodeURIComponent(range)); } catch (e) { if (!ins) ins = null; }
  insLoading = false; renderInsights();
}
onTab.insights = loadInsights;
$('#rangeChips').addEventListener('click', e => { const b = e.target.closest('[data-range]'); if (!b) return; range = b.dataset.range; ins = null; loadInsights(); });
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (tab === 'insights' && ins) renderInsights(); }, 200); });

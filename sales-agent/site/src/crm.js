// Simple CRM on top of the docs table: lead stages, deals, the activity log, tasks, manual leads and CSV export.
// Only new fields and collections: the agent ignores fields it doesn't know and never sees 'activity' or 'tasks'.

const STAGES = ['none', 'replied', 'meeting_booked', 'demo_done', 'proposal_sent', 'won', 'lost'];
const STAGE_SET = new Set(STAGES);
const STAGE_RANK = { none: 0, replied: 1, meeting_booked: 2, demo_done: 3, proposal_sent: 4, won: 5, lost: 0 };
const STAGE_LABEL = { none: 'No stage', replied: 'Replied', meeting_booked: 'Meeting booked', demo_done: 'Demo done', proposal_sent: 'Proposal sent', won: 'Won', lost: 'Lost' };
const STATUS_LABEL = { drafted: 'To review', approved: 'Approved', sent: 'Sent', replied: 'Replied', not_interested: 'Not interested', do_not_contact: 'Do not contact', skipped: 'Skipped', manual: 'Added by you' };
const CURRENCIES = new Set(['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'IQD', 'USD']);
const ACTIVITY_KINDS_OWNER = new Set(['note', 'call', 'meeting', 'email_in']);
const FREE_MAIL = /@(gmail|googlemail|hotmail|yahoo|outlook|live|icloud|me|aol|msn|proton|protonmail|ymail|mail)\.[a-z.]+$/i;
const ROLE_MAIL = /^(info|admissions?|office|contact|admin|hello|enquir(y|ies)|inquir(y|ies)|reception|school|registrar|principal\.office|pa)@/i;

const dateOnly = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + 'T00:00:00Z'));
const leadIdOk = id => typeof id === 'string' && /^[A-Za-z0-9_.~:@+-]{1,200}$/.test(id);

// The CRM fields the website may set on a lead (added to cleanLeadPatch). Returns false on a bad value.
function cleanCrmField(k, v, out) {
  if (k === 'stage') { if (!STAGE_SET.has(v)) return false; out.stage = v; return true; }
  if (k === 'dealValue') { if (v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12)) return false; out.dealValue = v; return true; }
  if (k === 'currency') { if (!CURRENCIES.has(v)) return false; out.currency = v; return true; }
  if (k === 'nextStep') { if (!str(v, 300)) return false; out.nextStep = v; return true; }
  if (k === 'nextStepDue') { if (v !== '' && !dateOnly(v)) return false; out.nextStepDue = v; return true; }
  if (k === 'repliedStep') { if (!Number.isInteger(v) || v < 1 || v > 3) return false; out.repliedStep = v; return true; }
  if (k === 'autoHold') { if (typeof v !== 'boolean') return false; out.autoHold = v; return true; }
  if (k === 'replyDraft') { if (!isObj(v) || !str(v.subject, 300) || !str(v.body, 8000)) return false; out.replyDraft = { subject: v.subject, body: v.body }; return true; }
  if (k === 'replyStatus') { if (!['drafted', 'approved', 'discarded'].includes(v)) return false; out.replyStatus = v; return true; }
  return null; // not a CRM field
}

// Server-side rules on a lead change: marking replied also sets the stage and repliedStep; a stage change stamps
// stageAt and keeps stageBest (the furthest stage reached, for the funnel).
function applyLeadRules(old, patch, now) {
  if (patch.status === 'approved' && old.status !== 'approved') patch.approvedBy = 'owner';
  // Editing a waiting draft stops its automatic send (the owner can allow it again).
  if (patch.draft && old.status === 'drafted' && patch.status === undefined && patch.autoHold === undefined && old.draft
    && (patch.draft.subject !== old.draft.subject || patch.draft.body !== old.draft.body)) patch.autoHold = true;
  // Moving an approved email back to review also stops any automatic send of it.
  if (patch.status === 'drafted' && old.status === 'approved') patch.autoHold = true;
  if (patch.replyStatus === 'approved' && old.replyStatus !== 'approved') patch.replyApprovedAt = now;
  if (patch.status === 'replied' && old.status !== 'replied') {
    if (patch.repliedStep === undefined) patch.repliedStep = Math.min(3, Math.max(1, Number.isInteger(old.step) ? old.step : 1));
    if (patch.repliedAt === undefined) patch.repliedAt = now;
    if (patch.stage === undefined && (!old.stage || old.stage === 'none')) patch.stage = 'replied';
  }
  const oldStage = old.stage || 'none';
  if (patch.stage !== undefined && patch.stage !== oldStage) {
    patch.stageAt = now;
    const best = old.stageBest || oldStage;
    if (STAGE_RANK[patch.stage] > (STAGE_RANK[best] || 0)) patch.stageBest = patch.stage;
  }
  return patch;
}

async function addActivity(db, leadId, kind, text, at, extra = {}) {
  const data = JSON.stringify({ leadId, at, kind, text, ...extra });
  const base = leadId + '-' + Date.parse(at);
  for (let i = 0; i < 6; i++) {
    const id = i ? base + '-' + i : base;
    const r = await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('activity', ?1, ?2, 1, ?3) ON CONFLICT (coll, id) DO NOTHING").bind(id, data, at).run();
    if (r.meta && r.meta.changes) return id;
  }
  return null;
}

// Activity entries for what a lead change did (status and stage), written after the change is saved.
async function logLeadChange(db, id, old, patch, now) {
  if (patch.status !== undefined && patch.status !== old.status)
    await addActivity(db, id, 'status', `Status: ${STATUS_LABEL[old.status] || old.status || '–'} → ${STATUS_LABEL[patch.status] || patch.status}`, now, { from: old.status || '', to: patch.status });
  const oldStage = old.stage || 'none';
  if (patch.stage !== undefined && patch.stage !== oldStage)
    await addActivity(db, id, 'stage', `Stage: ${STAGE_LABEL[oldStage]} → ${STAGE_LABEL[patch.stage]}`, now, { from: oldStage, to: patch.stage });
}

async function leadDetail(db, id) {
  const row = await db.prepare("SELECT data, version FROM docs WHERE coll = 'leads' AND id = ?1").bind(id).first();
  if (!row) return null;
  const activity = (await db.prepare("SELECT id, data FROM docs WHERE coll = 'activity' AND json_extract(data, '$.leadId') = ?1 ORDER BY json_extract(data, '$.at') DESC LIMIT 100").bind(id).all()).results
    .map(r => ({ ...JSON.parse(r.data), id: r.id }));
  const tasks = (await db.prepare("SELECT id, data, version FROM docs WHERE coll = 'tasks' AND json_extract(data, '$.leadId') = ?1 ORDER BY json_extract(data, '$.done'), json_extract(data, '$.due') LIMIT 100").bind(id).all()).results
    .map(r => ({ ...JSON.parse(r.data), id: r.id, version: r.version }));
  return { lead: { ...JSON.parse(row.data), id, version: row.version }, activity, tasks };
}

function cleanActivity(b) {
  if (!isObj(b) || !ACTIVITY_KINDS_OWNER.has(b.kind) || !str(b.text, 2000) || !b.text.trim()) return null;
  return { kind: b.kind, text: b.text.trim() };
}

function cleanTask(b) {
  if (!isObj(b) || !leadIdOk(b.leadId) || !str(b.title, 200) || !b.title.trim()) return null;
  if (b.due !== undefined && b.due !== '' && !dateOnly(b.due)) return null;
  return { leadId: b.leadId, title: b.title.trim(), due: b.due || '', done: false, doneAt: null };
}
function cleanTaskPatch(p) {
  if (!isObj(p)) return null;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'done') { if (typeof v !== 'boolean') return null; out.done = v; }
    else if (k === 'title') { if (!str(v, 200) || !v.trim()) return null; out.title = v.trim(); }
    else if (k === 'due') { if (v !== '' && !dateOnly(v)) return null; out.due = v; }
    else return null;
  }
  return Object.keys(out).length ? out : null;
}

// "Add a school": a lead the owner met himself. Status 'manual': the agent never emails it but uses it for duplicates.
function cleanManualLead(b) {
  if (!isObj(b)) return null;
  const allowed = new Set(['org', 'country', 'city', 'segment', 'website', 'contactName', 'contactRole', 'email', 'contactPhone', 'notes', 'lang', 'stage', 'score']);
  for (const k of Object.keys(b)) if (!allowed.has(k)) return null;
  const s = (k, max) => (b[k] === undefined ? '' : b[k]);
  for (const [k, max] of [['org', 200], ['city', 100], ['website', 300], ['contactName', 120], ['contactRole', 120], ['email', 254], ['contactPhone', 40], ['notes', 2000]])
    if (!str(s(k), max)) return null;
  const org = s('org').trim(), email = s('email').trim().toLowerCase(), website = s('website').trim(), phone = s('contactPhone').trim();
  if (!org || !COUNTRY_CODES.has(b.country)) return null;
  if (b.segment !== undefined && b.segment !== '' && !SEGMENT_CODES.has(b.segment)) return null;
  if (website && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(website)) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (phone && !/^[+0-9 ()./-]{5,40}$/.test(phone)) return null;
  if (b.lang !== undefined && b.lang !== 'en' && b.lang !== 'ar') return null;
  if (b.stage !== undefined && !STAGE_SET.has(b.stage)) return null;
  if (b.score !== undefined && !(Number.isInteger(b.score) && b.score >= 1 && b.score <= 5)) return null;
  return {
    org, country: b.country, city: s('city').trim(), segment: b.segment || '', website, contactName: s('contactName').trim(), contactRole: s('contactRole').trim(),
    email, emailKind: !email ? 'none' : ROLE_MAIL.test(email) ? 'role' : 'named', contactPhone: phone, notes: s('notes'),
    lang: b.lang || 'en', stage: b.stage || 'none', score: b.score || 0,
  };
}
function manualLeadId(m) {
  let dom = '';
  try { if (m.website) dom = new URL(m.website).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
  if (!dom && m.email && !FREE_MAIL.test(m.email)) dom = m.email.split('@')[1];
  if (dom) return dom.replace(/\./g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 120);
  const slug = m.org.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'school';
  return 'manual-' + slug + '-' + Math.random().toString(36).slice(2, 6);
}
async function addManualLead(db, m, now) {
  const id = manualLeadId(m);
  if (await db.prepare("SELECT 1 AS x FROM docs WHERE coll = 'leads' AND id = ?1").bind(id).first()) return { error: 'exists', id };
  if (m.email) {
    const dup = await db.prepare("SELECT id FROM docs WHERE coll = 'leads' AND lower(json_extract(data, '$.email')) = ?1").bind(m.email).first();
    if (dup) return { error: 'exists', id: dup.id };
  }
  const data = {
    ...m, sources: m.website ? [m.website] : [], whyFit: '', status: 'manual', step: 1, sentLog: [], foundBy: 'manual',
    stageAt: m.stage !== 'none' ? now : undefined, stageBest: m.stage !== 'none' && m.stage !== 'lost' ? m.stage : undefined,
    createdAt: now, updatedAt: now,
  };
  const r = await db.prepare("INSERT INTO docs (coll, id, data, version, updated_at) VALUES ('leads', ?1, ?2, 1, ?3) ON CONFLICT (coll, id) DO NOTHING").bind(id, JSON.stringify(data), now).run();
  if (!r.meta || !r.meta.changes) return { error: 'exists', id };
  await addActivity(db, id, 'status', 'Added by you', now, { from: '', to: 'manual' });
  if (m.stage !== 'none') await addActivity(db, id, 'stage', `Stage: ${STAGE_LABEL.none} → ${STAGE_LABEL[m.stage]}`, now, { from: 'none', to: m.stage });
  return { id };
}

// CSV of the leads the owner is looking at (work contact fields only). Cells starting with = + - @ (or a tab or CR)
// get a leading apostrophe so a spreadsheet never runs them as formulas.
const CSV_COLS = ['org', 'country', 'city', 'segment', 'website', 'contactName', 'contactRole', 'email', 'contactPhone', 'status', 'stage', 'dealValue', 'currency', 'nextStep', 'nextStepDue', 'score', 'lang', 'createdAt', 'lastSentAt', 'repliedAt', 'stageAt'];
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
async function exportCsv(db, ids) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const res = (await db.prepare(`SELECT id, data FROM docs WHERE coll = 'leads' AND id IN (${part.map((_, k) => '?' + (k + 1)).join(',')})`).bind(...part).all()).results;
    for (const r of res) {
      const d = JSON.parse(r.data);
      d.lastSentAt = Array.isArray(d.sentLog) && d.sentLog.length ? d.sentLog[d.sentLog.length - 1].at : '';
      d.stage = d.stage || 'none';
      rows.push({ d, id: r.id });
    }
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id) - order.get(b.id));
  return '﻿' + [CSV_COLS.join(','), ...rows.map(({ d }) => CSV_COLS.map(c => csvCell(d[c])).join(','))].join('\r\n') + '\r\n';
}

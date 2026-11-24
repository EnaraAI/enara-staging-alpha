import { createHmac } from 'crypto';
import { consentTextHash } from './consentHash';
import { AppError } from '../middleware/errorHandler';
import { getConfig } from '../config/env';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { Student } from '../models/Student';
import { Batch } from '../models/Batch';
import { recordAudit } from '../services/auditTrail';
import { canDo } from '../parents/policy';
import type { LearnerContext } from '../parents/service';
import { ParentNotification, REQUEST_STATUSES, REQUEST_TYPES, SchoolConsent, SchoolConsentForm, SchoolRequest } from './models';
import { newId, schoolSections, sectionOn } from './sections';
import { announcementIsFor, whoIs } from './audience';
import { emailSchoolNotices, type NoticeDoc } from './emails';
import { norm, parseAudience, parseDate } from './importSpec';

// Parents school app, step (d): requests to the school office and consent forms.
//   Requests: a guardian who may act for the child (main or full guardian; not view-only) sends a request; the school answers and
//   changes its status; the parent is notified. The chatbot (step e) creates requests only through createRequest, after the parent confirms.
//   Consent: the school publishes a form (title, text, choices, deadline) to the school, a grade, a class or one child. A guardian taps a
//   choice and "I agree"; the record keeps the time, the device, a hash of the network address and a hash of the exact text, and every
//   answer is kept (the latest one counts). Whether this is enough for trips under Egyptian law is for legal review (plan section 7).
const cairoDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
type Actor = { id: string; role: string; institutionId?: string };
const scope = (actor: Actor, institutionId?: string) => {
  const id = actor.role === 'enara-admin' ? institutionId : actor.institutionId;
  if (!id || (actor.role !== 'enara-admin' && actor.role !== 'admin')) throw new AppError('Access denied', 403, 'FORBIDDEN');
  return id;
};
const schoolOf = (ctx: LearnerContext) => (ctx.link.institutionId ?? ctx.student.institutionId)!;
async function gate(ctx: LearnerContext, s: 'requests' | 'consents') {
  if (!(await schoolSections(schoolOf(ctx)))[s]) throw new AppError('This section is not available for this school', 404, 'SECTION_OFF');
}
const mayAct = (ctx: LearnerContext) => { if (!canDo(ctx.link, 'change_controls')) throw new AppError('A view-only guardian cannot do this', 403, 'PARENT_VIEW_ONLY'); };

async function notify(docs: NoticeDoc[]) {
  if (!docs.length) return;
  try { await ParentNotification.insertMany(docs.map((d) => ({ id: newId('pn'), ...d })), { ordered: false }); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
  await emailSchoolNotices(docs);
}

// ------------------------------------------------------------------ requests
const requestView = (r: { id: string; type: string; details: string; preferredDate?: string; status: string; reply?: string; history?: { at: Date; by: string; status: string; note?: string }[]; createdAt: Date; updatedAt: Date; via?: string }) =>
  ({ id: r.id, type: r.type, details: r.details, preferredDate: r.preferredDate ?? null, status: r.status, reply: r.reply ?? null, history: (r.history ?? []).map((h) => ({ at: h.at, by: h.by, status: h.status, note: h.note ?? null })), createdAt: r.createdAt, updatedAt: r.updatedAt, via: r.via ?? 'screen' });

export async function requestsForParent(ctx: LearnerContext) {
  await gate(ctx, 'requests');
  const rows = await SchoolRequest.find({ institutionId: schoolOf(ctx), studentId: ctx.student.id }).sort({ createdAt: -1 }).limit(100).lean();
  return { requests: rows.map(requestView), canCreate: canDo(ctx.link, 'change_controls'), types: REQUEST_TYPES };
}

/** The only way a request is created (screen or, in step e, the chatbot after the parent confirms). */
export async function createRequest(ctx: LearnerContext, body: Record<string, unknown>, via: 'screen' | 'chat' = 'screen') {
  await gate(ctx, 'requests'); mayAct(ctx);
  const type = REQUEST_TYPES.find((x) => x === body.type);
  if (!type) throw new AppError(`type must be one of ${REQUEST_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (details.length < 3) throw new AppError('Write a few words about the request', 400, 'VALIDATION_ERROR');
  if (details.length > 2000) throw new AppError('The request is longer than 2,000 characters', 400, 'VALIDATION_ERROR');
  let preferredDate: string | undefined;
  if (body.preferredDate) { const d = parseDate(String(body.preferredDate)); if (!d) throw new AppError('preferred date not understood', 400, 'VALIDATION_ERROR'); preferredDate = d; }
  const open = await SchoolRequest.countDocuments({ studentId: ctx.student.id, parentUserId: ctx.link.parentUserId, status: { $in: ['new', 'in_progress'] } });
  if (open >= 10) throw new AppError('You have 10 open requests for this child; wait for the school to answer', 429, 'TOO_MANY_OPEN_REQUESTS');
  const now = new Date();
  const r = await SchoolRequest.create({ id: newId('srq'), institutionId: schoolOf(ctx), studentId: ctx.student.id, parentUserId: ctx.link.parentUserId, type, details, preferredDate, status: 'new', via,
    history: [{ at: now, by: 'parent', status: 'new' }] });
  return requestView(r.toObject());
}

export async function requestsForAdmin(actor: Actor, q: { institutionId?: string; status?: string }) {
  const school = scope(actor, q.institutionId);
  const filter: Record<string, unknown> = { institutionId: school };
  if (q.status && (REQUEST_STATUSES as readonly string[]).includes(q.status)) filter.status = q.status;
  const rows = await SchoolRequest.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  const names = new Map((await Student.find({ id: { $in: [...new Set(rows.map((r) => r.studentId))] } }).select('id name').lean()).map((s) => [s.id, s.name]));
  const counts = Object.fromEntries(await Promise.all(REQUEST_STATUSES.map(async (s) => [s, await SchoolRequest.countDocuments({ institutionId: school, status: s })])));
  return { counts, requests: rows.map((r) => ({ ...requestView(r), studentId: r.studentId, studentName: names.get(r.studentId) ?? '' })) };
}

export async function answerRequest(actor: Actor, id: string, body: Record<string, unknown>) {
  const r = await SchoolRequest.findOne({ id });
  if (!r || r.institutionId !== scope(actor, r?.institutionId)) throw new AppError('Request not found', 404, 'NOT_FOUND');
  const status = REQUEST_STATUSES.find((x) => x === body.status) ?? r.status;
  const reply = typeof body.reply === 'string' ? body.reply.trim().slice(0, 2000) : undefined;
  if (status === r.status && reply === undefined) throw new AppError('Nothing to change', 400, 'VALIDATION_ERROR');
  if (status === 'refused' && !(reply || r.reply)) throw new AppError('Say why the request is refused', 400, 'VALIDATION_ERROR');
  r.status = status; if (reply !== undefined) r.reply = reply || undefined;
  r.history.push({ at: new Date(), by: 'school', status, note: reply || undefined });
  r.markModified('history'); await r.save();
  await recordAudit('school_app_request_answered', actor, { institutionId: r.institutionId, type: 'school_request', id: r.id }, { status });
  if ((await schoolSections(r.institutionId)).notifications) {
    const first = String((await Student.findOne({ id: r.studentId }).select('name').lean())?.name ?? '').split(/\s+/)[0];
    await notify([{ parentUserId: r.parentUserId, studentId: r.studentId, institutionId: r.institutionId, kind: 'request_update', refId: `${r.id}:${r.history.length}`, title: `Request about ${first}: ${status.replace('_', ' ')}`, body: reply ?? '', requestStatus: status, requestType: r.type } as NoticeDoc]);
  }
  return requestView(r.toObject());
}

// ------------------------------------------------------------------ consent
export { consentTextHash };
const ipHash = (ip: string | undefined) => (ip ? createHmac('sha256', getConfig().jwtSecret).update(`consent-ip:${ip}`).digest('hex').slice(0, 32) : undefined);
const formView = (f: { id: string; title: string; body: string; titleAr?: string; bodyAr?: string; options: { key: string; label: string; labelAr?: string }[]; deadline: string; createdAt: Date; withdrawnAt?: Date; textHash: string }) =>
  ({ id: f.id, textHash: f.textHash, title: f.title, body: f.body, titleAr: f.titleAr ?? null, bodyAr: f.bodyAr ?? null, options: f.options.map((o) => ({ key: o.key, label: o.label, labelAr: o.labelAr ?? null })), deadline: f.deadline, createdAt: f.createdAt, withdrawn: !!f.withdrawnAt });

export async function consentsForParent(ctx: LearnerContext, now = new Date()) {
  await gate(ctx, 'consents');
  const who = await whoIs(ctx.student.id);
  const forms = (await SchoolConsentForm.find({ institutionId: schoolOf(ctx), withdrawnAt: { $exists: false } }).sort({ createdAt: -1 }).limit(100).lean()).filter((f) => who && announcementIsFor(f, who));
  const answers = await SchoolConsent.find({ formId: { $in: forms.map((f) => f.id) }, studentId: ctx.student.id }).sort({ at: -1 }).lean();
  const today = cairoDate(now);
  return {
    canSign: canDo(ctx.link, 'change_controls'),
    forms: forms.map((f) => {
      const latest = answers.find((a) => a.formId === f.id);
      return { ...formView(f), open: f.deadline >= today, answer: latest ? { choice: latest.choice, at: latest.at, byYou: latest.parentUserId === ctx.link.parentUserId, sameText: latest.textHash === f.textHash } : null,
        history: answers.filter((a) => a.formId === f.id).map((a) => ({ choice: a.choice, at: a.at, byYou: a.parentUserId === ctx.link.parentUserId })) };
    }),
  };
}

export async function signConsent(ctx: LearnerContext, formId: string, body: Record<string, unknown>, meta: { ip?: string; userAgent?: string }, now = new Date()) {
  await gate(ctx, 'consents'); mayAct(ctx);
  const f = await SchoolConsentForm.findOne({ id: formId, institutionId: schoolOf(ctx), withdrawnAt: { $exists: false } }).lean();
  const who = await whoIs(ctx.student.id);
  if (!f || !who || !announcementIsFor(f, who)) throw new AppError('Form not found', 404, 'NOT_FOUND');
  if (f.deadline < cairoDate(now)) throw new AppError('The deadline for this form has passed', 409, 'CONSENT_CLOSED');
  if (body.agree !== true) throw new AppError('Tick "I confirm" to sign', 400, 'VALIDATION_ERROR');
  const choice = f.options.find((o) => o.key === body.choice)?.key;
  if (!choice) throw new AppError('Choose one of the options', 400, 'VALIDATION_ERROR');
  if (body.textHash !== f.textHash) throw new AppError('The form changed; reload it and read it again', 409, 'CONSENT_TEXT_CHANGED');
  const rec = await SchoolConsent.create({ id: newId('scs'), formId: f.id, institutionId: f.institutionId, studentId: ctx.student.id, parentUserId: ctx.link.parentUserId, choice, textHash: f.textHash,
    device: (meta.userAgent ?? '').slice(0, 200) || undefined, ipHash: ipHash(meta.ip), at: now });
  return { formId: f.id, choice, at: rec.at, textHash: rec.textHash };
}

export async function createConsentForm(actor: Actor, body: Record<string, unknown>, now = new Date()) {
  const school = scope(actor, typeof body.institutionId === 'string' ? body.institutionId : undefined);
  if (!(await sectionOn(school, 'consents'))) throw new AppError('The consent section is off for this school', 409, 'SECTION_OFF');
  const str = (k: string, max: number, required = false) => { const v = typeof body[k] === 'string' ? (body[k] as string).trim() : ''; if (required && !v) throw new AppError(`${k} is required`, 400, 'VALIDATION_ERROR'); if (v.length > max) throw new AppError(`${k} is too long`, 400, 'VALIDATION_ERROR'); return v || undefined; };
  const title = str('title', 160, true)!, text = str('body', 6000, true)!, titleAr = str('titleAr', 160), bodyAr = str('bodyAr', 6000);
  const audience = parseAudience(String(body.audience ?? 'school'));
  if (!audience) throw new AppError('audience must be school, grade, class or student', 400, 'VALIDATION_ERROR');
  let audienceValue = typeof body.audienceValue === 'string' ? body.audienceValue.trim() : '';
  if (audience === 'group') { const g = await Batch.findOne({ institutionId: school, archivedAt: { $exists: false } }).where('name').equals(audienceValue).lean() ?? (await Batch.find({ institutionId: school }).lean()).find((x) => norm(x.name) === norm(audienceValue)); if (!g) throw new AppError(`class "${audienceValue}" is not a class of this school`, 400, 'VALIDATION_ERROR'); audienceValue = g.name; }
  if (audience === 'student' && !(await Student.exists({ id: audienceValue, institutionId: school }))) throw new AppError('student not found in this school', 400, 'VALIDATION_ERROR');
  if (audience === 'grade' && !audienceValue) throw new AppError('which grade?', 400, 'VALIDATION_ERROR');
  const deadline = parseDate(String(body.deadline ?? ''));
  if (!deadline || deadline < cairoDate(now)) throw new AppError('deadline must be today or later (YYYY-MM-DD)', 400, 'VALIDATION_ERROR');
  const rawOptions = Array.isArray(body.options) && body.options.length ? body.options : [{ key: 'agree', label: 'I agree', labelAr: 'أوافق' }, { key: 'decline', label: 'I do not agree', labelAr: 'لا أوافق' }];
  const options = rawOptions.slice(0, 6).map((o, i) => { const x = o as Record<string, unknown>; const label = String(x.label ?? '').trim().slice(0, 80); if (!label) throw new AppError('every option needs a label', 400, 'VALIDATION_ERROR'); return { key: String(x.key ?? `o${i + 1}`).replace(/[^a-z0-9_]/gi, '').slice(0, 20) || `o${i + 1}`, label, labelAr: typeof x.labelAr === 'string' ? x.labelAr.trim().slice(0, 80) || undefined : undefined }; });
  if (options.length < 2 || new Set(options.map((o) => o.key)).size !== options.length) throw new AppError('at least two different options are needed', 400, 'VALIDATION_ERROR');
  const doc = { id: newId('scf'), institutionId: school, title, body: text, titleAr, bodyAr, audience, audienceValue: audience === 'school' ? undefined : audienceValue, audienceKey: audience === 'school' || audience === 'student' ? undefined : norm(audienceValue), options, deadline, createdBy: actor.id };
  const form = await SchoolConsentForm.create({ ...doc, textHash: consentTextHash(doc) });
  await recordAudit('school_app_consent_form_created', actor, { institutionId: school, type: 'school_consent_form', id: form.id }, { audience, deadline });
  // Notify the guardians of the children it is for.
  if ((await schoolSections(school)).notifications) {
    const students = await Student.find({ institutionId: school, archivedAt: { $exists: false } }).select('id name grade batchId').lean();
    const groups = new Map((await Batch.find({ institutionId: school }).select('id name').lean()).map((g) => [g.id, norm(g.name)]));
    const targets = students.filter((s) => announcementIsFor(form, { id: s.id, grade: s.grade || undefined, groupKey: s.batchId ? groups.get(s.batchId) : undefined }));
    const links = await ParentLearnerLink.find({ studentId: { $in: targets.map((s) => s.id) }, status: 'active', role: { $in: ['owner', 'full'] } }).select('parentUserId studentId').lean();
    await notify(links.map((l) => ({ parentUserId: l.parentUserId, studentId: l.studentId, institutionId: school, kind: 'consent', refId: `${form.id}:${l.studentId}`, date: deadline, title: `Consent needed: ${title}`.slice(0, 200), body: text.slice(0, 280) }) as NoticeDoc));
  }
  return formView(form.toObject());
}

/** Who signed, who refused, who has not answered (for the children the form is for). */
export async function consentDashboard(actor: Actor, formId: string) {
  const f = await SchoolConsentForm.findOne({ id: formId }).lean();
  if (!f || f.institutionId !== scope(actor, f?.institutionId)) throw new AppError('Form not found', 404, 'NOT_FOUND');
  const students = await Student.find({ institutionId: f.institutionId, archivedAt: { $exists: false } }).select('id name grade batchId').lean();
  const groups = new Map((await Batch.find({ institutionId: f.institutionId }).select('id name').lean()).map((g) => [g.id, { key: norm(g.name), name: g.name }]));
  const targets = students.filter((s) => announcementIsFor(f, { id: s.id, grade: s.grade || undefined, groupKey: s.batchId ? groups.get(s.batchId)?.key : undefined }));
  const answers = await SchoolConsent.find({ formId: f.id }).sort({ at: -1 }).lean();
  const rows = targets.map((s) => { const a = answers.find((x) => x.studentId === s.id); return { studentId: s.id, studentName: s.name, className: s.batchId ? groups.get(s.batchId)?.name ?? '' : '', choice: a?.choice ?? null, at: a?.at ?? null, sameText: a ? a.textHash === f.textHash : null }; });
  const counts: Record<string, number> = { pending: rows.filter((r) => !r.choice).length };
  for (const o of f.options) counts[o.key] = rows.filter((r) => r.choice === o.key).length;
  return { form: formView(f), counts, rows };
}
export async function consentCsv(actor: Actor, formId: string) {
  const d = await consentDashboard(actor, formId);
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const label = (k: string | null) => (k ? d.form.options.find((o) => o.key === k)?.label ?? k : 'Not answered');
  return ['﻿Student ID,Student,Class,Answer,Answered at (UTC)', ...d.rows.map((r) => [r.studentId, r.studentName, r.className, label(r.choice), r.at ? new Date(r.at).toISOString() : ''].map(q).join(','))].join('\n');
}
export async function consentForms(actor: Actor, institutionId?: string) {
  const school = scope(actor, institutionId);
  const forms = await SchoolConsentForm.find({ institutionId: school }).sort({ createdAt: -1 }).limit(100).lean();
  return { forms: forms.map((f) => ({ ...formView(f), audience: f.audience, audienceValue: f.audienceValue ?? null })) };
}
export async function withdrawConsentForm(actor: Actor, formId: string) {
  const f = await SchoolConsentForm.findOne({ id: formId });
  if (!f || f.institutionId !== scope(actor, f?.institutionId)) throw new AppError('Form not found', 404, 'NOT_FOUND');
  f.withdrawnAt = new Date(); await f.save();
  await recordAudit('school_app_consent_form_withdrawn', actor, { institutionId: f.institutionId, type: 'school_consent_form', id: f.id }, {});
  return { id: f.id, withdrawn: true };
}

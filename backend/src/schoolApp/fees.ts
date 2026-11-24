import { AppError } from '../middleware/errorHandler';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { Student } from '../models/Student';
import { recordAudit } from '../services/auditTrail';
import { logger, serializeError } from '../utils/logging';
import type { LearnerContext } from '../parents/service';
import { ParentNotification, SchoolInstalment, type InstalmentStatus } from './models';
import { feesVisibleTo, newId, schoolSections, sectionOn } from './sections';
import { emailSchoolNotices, type NoticeDoc } from './emails';
import { randomBytes } from 'crypto';
import { deleteUpload, readUpload, saveUpload } from '../services/uploadStorage';

// Parents school app, step (b): fees and instalments. ENARA only SHOWS what the school recorded; it never takes or moves money and never
// decides that something is paid: the school imports its fee sheet or marks an instalment paid (or waived) on the admin screen.
// Overdue = a due instalment whose due date (Cairo) has passed. Reminders: 7 days and 1 day before a due date (in-app; email when the
// parent allows it), once each. Who sees fees in a family: every linked guardian, or only the main guardian (school setting).
const cairoDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const round2 = (n: number) => Math.round(n * 100) / 100;
export type ShownStatus = InstalmentStatus | 'overdue';
export const shownStatus = (i: { status: InstalmentStatus; dueDate: string }, today = cairoDate()): ShownStatus => (i.status === 'due' && i.dueDate < today ? 'overdue' : i.status);

/** Totals for a list of instalments (waived ones count in neither paid nor remaining). */
export function feeTotals(rows: { amount: number; status: InstalmentStatus; dueDate: string }[], today = cairoDate()) {
  let total = 0, paid = 0, waived = 0, overdue = 0;
  for (const r of rows) { total += r.amount; if (r.status === 'paid') paid += r.amount; else if (r.status === 'waived') waived += r.amount; else if (r.dueDate < today) overdue += r.amount; }
  return { total: round2(total), paid: round2(paid), waived: round2(waived), remaining: round2(total - paid - waived), overdue: round2(overdue) };
}

async function gateFees(ctx: LearnerContext) {
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  if (!(await schoolSections(school)).fees) throw new AppError('This section is not available for this school', 404, 'SECTION_OFF');
  if ((await feesVisibleTo(school)) === 'owner' && ctx.link.role !== 'owner') throw new AppError('The school shows fees to the main guardian only', 403, 'FEES_MAIN_GUARDIAN_ONLY');
  return school!;
}

export async function feesForParent(ctx: LearnerContext, now = new Date()) {
  const school = await gateFees(ctx);
  const today = cairoDate(now);
  const rows = await SchoolInstalment.find({ institutionId: school, studentId: ctx.student.id }).sort({ dueDate: 1, number: 1 }).lean();
  const plans = new Map<string, typeof rows>();
  for (const r of rows) plans.set(r.planKey, [...(plans.get(r.planKey) ?? []), r]);
  const next = rows.find((r) => r.status === 'due') ?? null;
  const at = rows.reduce<Date | null>((m, r) => { const t = r.markedAt && r.markedAt > (r.source?.at ?? 0) ? r.markedAt : r.source?.at; return t && (!m || t > m) ? t : m; }, null);
  return {
    currency: 'EGP',
    totals: feeTotals(rows, today),
    next: next ? { id: next.id, planName: next.planName, number: next.number, amount: next.amount, dueDate: next.dueDate, status: shownStatus(next, today) } : null,
    plans: [...plans.values()].map((list) => ({
      name: list[0].planName, academicYear: list[0].academicYear ?? null, totals: feeTotals(list, today),
      instalments: list.map((i) => ({ id: i.id, number: i.number, amount: i.amount, dueDate: i.dueDate, status: shownStatus(i, today), paidDate: i.paidDate ?? null, receiptRef: i.receiptRef ?? null, hasReceipt: !!i.receiptKey, note: i.note ?? null })),
    })),
    source: { label: 'fees', updatedAt: at ? at.toISOString() : null, kind: rows[0]?.source?.kind ?? null },
  };
}

/** Home card: the next instalment and anything overdue. Null when the section is off or the parent may not see fees. */
export async function feesSummary(ctx: LearnerContext, now = new Date()) {
  try { await gateFees(ctx); } catch { return null; }
  const today = cairoDate(now);
  const school = ctx.link.institutionId ?? ctx.student.institutionId;
  const open = await SchoolInstalment.find({ institutionId: school, studentId: ctx.student.id, status: 'due' }).sort({ dueDate: 1 }).lean();
  const next = open[0];
  return { next: next ? { amount: next.amount, dueDate: next.dueDate, status: shownStatus(next, today) } : null, overdueCount: open.filter((r) => r.dueDate < today).length, currency: 'EGP' };
}

// ------------------------------------------------------------------ school admin
type Actor = { id: string; role: string; institutionId?: string };
const scope = (actor: Actor, institutionId?: string) => {
  const id = actor.role === 'enara-admin' ? institutionId : actor.institutionId;
  if (!id || (actor.role !== 'enara-admin' && actor.role !== 'admin')) throw new AppError('Access denied', 403, 'FORBIDDEN');
  return id;
};

export async function feesForAdmin(actor: Actor, q: { institutionId?: string; studentId?: string; status?: string }, now = new Date()) {
  const school = scope(actor, q.institutionId);
  const today = cairoDate(now);
  const filter: Record<string, unknown> = { institutionId: school };
  if (q.studentId) filter.studentId = q.studentId;
  if (q.status === 'overdue') Object.assign(filter, { status: 'due', dueDate: { $lt: today } });
  else if (q.status === 'due' || q.status === 'paid' || q.status === 'waived') filter.status = q.status;
  const rows = await SchoolInstalment.find(filter).sort({ dueDate: 1 }).limit(500).lean();
  const names = new Map((await Student.find({ id: { $in: [...new Set(rows.map((r) => r.studentId))] } }).select('id name').lean()).map((s) => [s.id, s.name]));
  return {
    totals: feeTotals(rows, today),
    instalments: rows.map((i) => ({ id: i.id, studentId: i.studentId, studentName: names.get(i.studentId) ?? '', planName: i.planName, number: i.number, amount: i.amount, dueDate: i.dueDate, status: shownStatus(i, today), paidDate: i.paidDate ?? null, receiptRef: i.receiptRef ?? null, hasReceipt: !!i.receiptKey })),
  };
}

/** The school marks an instalment paid (with the paid date and receipt reference), waived, or due again. Audited. */
export async function markInstalment(actor: Actor, id: string, body: Record<string, unknown>, now = new Date()) {
  const inst = await SchoolInstalment.findOne({ id });
  if (!inst || inst.institutionId !== scope(actor, inst?.institutionId)) throw new AppError('Instalment not found', 404, 'NOT_FOUND');
  if (!(await sectionOn(inst.institutionId, 'fees'))) throw new AppError('The fees section is off for this school', 409, 'SECTION_OFF');
  const status = body.status;
  if (status !== 'paid' && status !== 'waived' && status !== 'due') throw new AppError("status must be 'paid', 'waived' or 'due'", 400, 'VALIDATION_ERROR');
  const paidDate = typeof body.paidDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paidDate) ? body.paidDate : cairoDate(now);
  if (status === 'paid' && paidDate > cairoDate(now)) throw new AppError('The paid date cannot be in the future', 400, 'VALIDATION_ERROR');
  const receiptRef = typeof body.receiptRef === 'string' ? body.receiptRef.trim().slice(0, 80) : undefined;
  const before = { status: inst.status, paidDate: inst.paidDate, receiptRef: inst.receiptRef };
  inst.status = status;
  inst.paidDate = status === 'paid' ? paidDate : undefined;
  if (receiptRef !== undefined) inst.receiptRef = receiptRef || undefined;
  inst.markedBy = actor.id; inst.markedAt = now;
  await inst.save();
  await recordAudit('school_app_instalment_marked', actor, { institutionId: inst.institutionId, type: 'school_instalment', id: inst.id }, { from: before, to: { status, paidDate: inst.paidDate, receiptRef: inst.receiptRef } });
  return { id: inst.id, status: shownStatus(inst, cairoDate(now)), paidDate: inst.paidDate ?? null, receiptRef: inst.receiptRef ?? null };
}

// ------------------------------------------------------------------ reminders (daily job)
/** In-app (and email) reminders 7 days and 1 day before a due date, once each, for parents allowed to see fees. */
export async function runFeeReminders(now = new Date()): Promise<{ instalments: number; notifications: number }> {
  const today = cairoDate(now);
  const targets = [{ kind: 'd7', day: addDays(today, 7) }, { kind: 'd1', day: addDays(today, 1) }];
  let instalments = 0, notifications = 0;
  for (const t of targets) {
    const rows = await SchoolInstalment.find({ status: 'due', dueDate: t.day, reminders: { $ne: t.kind } }).limit(2000).lean();
    for (const i of rows) {
      try {
        const sections = await schoolSections(i.institutionId);
        if (!sections.fees || !sections.notifications) continue;
        const ownerOnly = (await feesVisibleTo(i.institutionId)) === 'owner';
        const links = await ParentLearnerLink.find({ studentId: i.studentId, status: 'active', ...(ownerOnly ? { role: 'owner' } : {}) }).select('parentUserId').lean();
        const title = `Fee instalment ${i.number} (${i.planName}): ${i.amount} EGP due on ${i.dueDate}`;
        const body = 'Payment is made at the school. ENARA only shows the school fee record.';
        const docs: NoticeDoc[] = links.map((l) => ({ parentUserId: l.parentUserId, studentId: i.studentId, institutionId: i.institutionId, kind: 'fee_due', refId: `${i.id}:${t.kind}`, date: i.dueDate, title, body, amount: i.amount, planName: i.planName, daysBefore: t.kind === 'd7' ? 7 : 1 }));
        if (docs.length) {
          try { await ParentNotification.insertMany(docs.map((d) => ({ id: newId('pn'), ...d })), { ordered: false }); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
          await emailSchoolNotices(docs);
          notifications += docs.length;
        }
        await SchoolInstalment.updateOne({ id: i.id }, { $addToSet: { reminders: t.kind } });
        instalments++;
      } catch (error) { logger.error('school_app_fee_reminder_failed', { error: serializeError(error) }); }
    }
  }
  return { instalments, notifications };
}

// ------------------------------------------------------------------ receipts (step b3)
// The school attaches the receipt it issued (PDF, PNG or JPEG, at most 700 KB). Stored under an unguessable name in the upload store;
// never served by the public /uploads route (that needs a signed link for a registered file). Read only through the two routes below,
// after the same checks as the fee screens.
const RECEIPT_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};
export const RECEIPT_MAX_BYTES = 700 * 1024;

export async function attachReceipt(actor: Actor, id: string, body: Record<string, unknown>) {
  const inst = await SchoolInstalment.findOne({ id });
  if (!inst || inst.institutionId !== scope(actor, inst?.institutionId)) throw new AppError('Instalment not found', 404, 'NOT_FOUND');
  if (!(await sectionOn(inst.institutionId, 'fees'))) throw new AppError('The fees section is off for this school', 409, 'SECTION_OFF');
  const type = RECEIPT_TYPES[String(body.contentType ?? '')];
  if (!type) throw new AppError('A receipt must be a PDF, PNG or JPEG file', 400, 'VALIDATION_ERROR');
  const data = typeof body.dataBase64 === 'string' ? Buffer.from(body.dataBase64, 'base64') : Buffer.alloc(0);
  if (!data.length) throw new AppError('The file is empty', 400, 'VALIDATION_ERROR');
  if (data.length > RECEIPT_MAX_BYTES) throw new AppError('The receipt is larger than 700 KB', 413, 'TOO_LARGE');
  if (!type.magic(data)) throw new AppError('The file content does not match its type', 400, 'VALIDATION_ERROR');
  const name = `receipt-${inst.id}-${randomBytes(12).toString('hex')}.${type.ext}`;
  await saveUpload(name, data, String(body.contentType));
  const old = inst.receiptKey;
  inst.receiptKey = name; inst.markedBy = actor.id; inst.markedAt = new Date();
  await inst.save();
  if (old) await deleteUpload(old).catch(() => undefined);
  await recordAudit('school_app_receipt_attached', actor, { institutionId: inst.institutionId, type: 'school_instalment', id: inst.id }, { bytes: data.length, contentType: body.contentType });
  return { id: inst.id, hasReceipt: true };
}

async function receiptFile(inst: { id: string; receiptKey?: string }) {
  if (!inst.receiptKey) throw new AppError('No receipt for this instalment', 404, 'NOT_FOUND');
  const f = await readUpload(inst.receiptKey);
  if (!f) throw new AppError('No receipt for this instalment', 404, 'NOT_FOUND');
  const ext = inst.receiptKey.split('.').pop() ?? 'pdf';
  return { body: f.body, contentType: ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg', fileName: `receipt-${inst.id}.${ext}` };
}
export async function receiptForParent(ctx: LearnerContext, instalmentId: string) {
  const school = await gateFees(ctx);
  const inst = await SchoolInstalment.findOne({ id: instalmentId, institutionId: school, studentId: ctx.student.id }).lean();
  if (!inst) throw new AppError('Instalment not found', 404, 'NOT_FOUND');
  return receiptFile(inst);
}
export async function receiptForAdmin(actor: Actor, instalmentId: string) {
  const inst = await SchoolInstalment.findOne({ id: instalmentId }).lean();
  if (!inst || inst.institutionId !== scope(actor, inst?.institutionId)) throw new AppError('Instalment not found', 404, 'NOT_FOUND');
  return receiptFile(inst);
}

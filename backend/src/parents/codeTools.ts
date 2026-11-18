import { randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { CourseInstance } from '../models/CourseInstance';
import { Institution } from '../models/Institution';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { Student } from '../models/Student';
import { recordAudit } from '../services/auditTrail';
import { classStudentIds } from '../services/learningAccess';
import { CODE_TTL_MS, generateCode, hashCode } from './codes';
import { parentCodeToolsEnabled, parentGradesAfterReviewEnabled } from './flags';
import { parentEmailsEnabled } from '../email/sendParentTemplate';
import { SCHOOL_EMAIL_DEFAULTS, type ParentEmailKind } from './parentEmails';
import { parentAccessOf, schoolAccessOffError } from './schoolAccess';

// Parents P2 (PARENT_CODE_TOOLS_ENABLED): class code sheets and the school's code settings.
//   - "Print parent codes" on a class: one new code per active student (archived
//     students skipped, P0), shown ONCE on a printable sheet (student, class,
//     code, expiry) with a CSV download. Codes are stored as hashes only, so a
//     reprint makes new codes and revokes that class's unused codes from earlier
//     prints (owner decision 4; the UI warns first: "Codes already printed for
//     this class will stop working."). One audit row per batch, IDs and counts.
//   - Revoke one code, or every unused code of the class.
//   - Who: a school admin (own school), an ENARA admin (any), and a teacher for
//     their own classes only when the school allows it (D3, default no).
//   - The school's code expiry: 1-60 days (default 7), for every code it issues.
// No code is ever put in a URL or a log; the sheet repeats the secret-code
// warning and "Never enrol parents in Moodle courses with ENARA activities."
type Actor = { id: string; role: string; institutionId?: string };
const DAY = 86_400_000;
export const DEFAULT_CODE_TTL_DAYS = 7;

export interface SchoolParentSettings { codeTtlDays: number; teachersMayIssueCodes: boolean; showResults: 'immediately' | 'after_release'; emails: Record<ParentEmailKind, boolean> }

export async function schoolParentSettings(institutionId: string | undefined): Promise<SchoolParentSettings> {
  const s = institutionId ? await Institution.findOne({ id: institutionId }).select('parentPortal').lean() : null;
  const days = s?.parentPortal?.codeTtlDays;
  return {
    codeTtlDays: Number.isInteger(days) && days! >= 1 && days! <= 60 ? days! : DEFAULT_CODE_TTL_DAYS,
    teachersMayIssueCodes: s?.parentPortal?.teachersMayIssueCodes === true,
    // Parents P3: unset = after release (D7); read for scores through parents/resultVisibility.ts.
    showResults: s?.parentPortal?.showResults === 'immediately' ? 'immediately' : 'after_release',
    // Parents P4: which parent emails the school sends (D11 defaults for unset values).
    emails: Object.fromEntries(Object.entries(SCHOOL_EMAIL_DEFAULTS).map(([k, d]) => [k, typeof s?.parentPortal?.emails?.[k as ParentEmailKind] === 'boolean' ? s!.parentPortal!.emails![k as ParentEmailKind]! : d])) as Record<ParentEmailKind, boolean>,
  };
}

/** How long a new code of this school lasts (7 days with the switch off, as before). */
export async function codeTtlMsFor(institutionId: string | undefined): Promise<number> {
  if (!parentCodeToolsEnabled()) return CODE_TTL_MS;
  return (await schoolParentSettings(institutionId)).codeTtlDays * DAY;
}

/** School admin (own school) or ENARA admin. Audited when something changes. */
export async function setSchoolParentSettings(actor: Actor, institutionId: string, body: Record<string, unknown>) {
  if (actor.role !== 'enara-admin' && (actor.role !== 'admin' || actor.institutionId !== institutionId)) throw new AppError('Access denied', 403, 'FORBIDDEN');
  const set: Record<string, unknown> = {};
  const tools = parentCodeToolsEnabled();
  const grades = parentGradesAfterReviewEnabled();
  if (body.showResults !== undefined) {
    if (!grades) throw new AppError('showResults is not available', 400, 'VALIDATION_ERROR');
    if (body.showResults !== 'immediately' && body.showResults !== 'after_release') throw new AppError('showResults must be immediately or after_release', 400, 'VALIDATION_ERROR');
    set['parentPortal.showResults'] = body.showResults;
  }
  if (body.emails !== undefined) {
    if (!parentEmailsEnabled()) throw new AppError('Parent email settings are not available', 400, 'VALIDATION_ERROR');
    if (!body.emails || typeof body.emails !== 'object' || Array.isArray(body.emails)) throw new AppError('emails must be an object', 400, 'VALIDATION_ERROR');
    for (const [k, v] of Object.entries(body.emails as Record<string, unknown>)) {
      if (!(k in SCHOOL_EMAIL_DEFAULTS) || typeof v !== 'boolean') throw new AppError(`emails.${k} must be true or false`, 400, 'VALIDATION_ERROR');
      set[`parentPortal.emails.${k}`] = v;
    }
  }
  if ((body.codeTtlDays !== undefined || body.teachersMayIssueCodes !== undefined) && !tools) throw new AppError('Code settings are not available', 400, 'VALIDATION_ERROR');
  if (body.codeTtlDays !== undefined) {
    const d = Number(body.codeTtlDays);
    if (!Number.isInteger(d) || d < 1 || d > 60) throw new AppError('codeTtlDays must be a whole number of days from 1 to 60', 400, 'VALIDATION_ERROR');
    set['parentPortal.codeTtlDays'] = d;
  }
  if (body.teachersMayIssueCodes !== undefined) {
    if (typeof body.teachersMayIssueCodes !== 'boolean') throw new AppError('teachersMayIssueCodes must be true or false', 400, 'VALIDATION_ERROR');
    set['parentPortal.teachersMayIssueCodes'] = body.teachersMayIssueCodes;
  }
  if (!Object.keys(set).length) throw new AppError('Nothing to change', 400, 'VALIDATION_ERROR');
  const before = await schoolParentSettings(institutionId);
  const r = await Institution.updateOne({ id: institutionId }, { $set: set });
  if (!r.matchedCount) throw new AppError('Institution not found', 404, 'NOT_FOUND');
  const after = await schoolParentSettings(institutionId);
  await recordAudit('parent_settings_changed', actor, { institutionId, type: 'institution', id: institutionId }, { before, after });
  return { institutionId, ...after };
}

/** May this person issue codes at all (the Parents page shows the class sheets)? */
export async function canIssueCodes(actor: Actor): Promise<boolean> {
  if (!parentCodeToolsEnabled()) return false;
  if (actor.role === 'admin' || actor.role === 'enara-admin') return true;
  return actor.role === 'teacher' && (await schoolParentSettings(actor.institutionId)).teachersMayIssueCodes;
}

/** The class, if this person may issue codes for it: 403 otherwise (another school, not the teacher's class, teachers not allowed). */
async function classFor(actor: Actor, classId: string) {
  const cls = await CourseInstance.findOne({ id: classId }).select('id courseName institutionId batchId studentIds instructorIds visibility archivedAt').lean();
  if (!cls) throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
  if (actor.role === 'enara-admin') return cls;
  if (!actor.institutionId || cls.institutionId !== actor.institutionId) throw new AppError('Access denied', 403, 'FORBIDDEN');
  if (actor.role === 'admin') return cls;
  if (actor.role === 'teacher') {
    if (!(cls.instructorIds || []).includes(actor.id)) throw new AppError('Access denied', 403, 'FORBIDDEN');
    if (!(await schoolParentSettings(cls.institutionId)).teachersMayIssueCodes) throw new AppError('Your school has not allowed teachers to issue parent codes', 403, 'TEACHER_CODES_OFF');
    return cls;
  }
  throw new AppError('Access denied', 403, 'FORBIDDEN');
}

/** The classes this person may print codes for, with how many active students each has. */
export async function classesForCodes(actor: Actor, institutionId?: string) {
  if (!(await canIssueCodes(actor))) throw new AppError('Access denied', 403, 'FORBIDDEN');
  const school = actor.role === 'enara-admin' ? institutionId : actor.institutionId;
  if (!school) return { classes: [] };
  const filter: Record<string, unknown> = { institutionId: school, archivedAt: { $exists: false }, ...(actor.role === 'teacher' ? { instructorIds: actor.id } : {}) };
  const classes = await CourseInstance.find(filter).select('id courseName institutionId batchId studentIds').sort({ courseName: 1 }).limit(300).lean();
  const out = [];
  for (const c of classes) {
    const ids = await classStudentIds(c);
    const active = await Student.countDocuments({ id: { $in: ids }, institutionId: school, archivedAt: null });
    const unused = await ParentLinkCode.countDocuments({ classId: c.id, status: 'active', expiresAt: { $gt: new Date() } });
    out.push({ id: c.id, name: c.courseName, students: active, activeCodes: unused });
  }
  return { classes: out };
}

/** "Print parent codes": new codes for every active student of the class; the class's earlier unused codes are revoked. */
export async function issueClassSheet(actor: Actor, classId: string, now = new Date()) {
  const cls = await classFor(actor, classId);
  if (!cls.institutionId) throw new AppError('The class has no school', 400, 'VALIDATION_ERROR');
  if ((await parentAccessOf(cls.institutionId)) === 'off') throw schoolAccessOffError();
  const ids = await classStudentIds(cls);
  const students = await Student.find({ id: { $in: ids }, institutionId: cls.institutionId }).select('id name archivedAt').lean();
  const active = students.filter((s) => !s.archivedAt).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const revoked = await ParentLinkCode.updateMany({ classId: cls.id, status: 'active' }, { $set: { status: 'revoked', revokedAt: now, revokedBy: actor.id } });
  const batchId = `pcb_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + (await codeTtlMsFor(cls.institutionId)));
  const rows: { studentId: string; studentName: string; code: string; codeId: string }[] = [];
  for (const s of active) {
    let code = generateCode();
    for (let i = 0; i < 5 && (await ParentLinkCode.exists({ codeHash: hashCode(code.normalized) })); i++) code = generateCode();
    const row = await ParentLinkCode.create({
      id: `plc_${randomUUID()}`, codeHash: hashCode(code.normalized), hint: code.normalized.slice(-2), studentId: s.id, institutionId: cls.institutionId,
      createdBy: actor.id, status: 'active', expiresAt, createdAt: now, classId: cls.id, batchId,
    });
    rows.push({ studentId: s.id, studentName: s.name, code: code.display, codeId: row.id });
  }
  await recordAudit('parent_codes_batch_created', actor, { institutionId: cls.institutionId, type: 'class', id: cls.id }, { batchId, count: rows.length, revoked: revoked.modifiedCount, skippedArchived: students.length - active.length });
  const school = await Institution.findOne({ id: cls.institutionId }).select('name').lean();
  return { class: { id: cls.id, name: cls.courseName }, school: school?.name ?? null, batchId, expiresAt, revoked: revoked.modifiedCount, rows };
}

/** The class's unused codes (no code shown: the last 2 characters only). */
export async function listClassCodes(actor: Actor, classId: string) {
  const cls = await classFor(actor, classId);
  const codes = await ParentLinkCode.find({ classId: cls.id, status: 'active', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
  const names = new Map((await Student.find({ id: { $in: codes.map((c) => c.studentId) } }).select('id name').lean()).map((s) => [s.id, s.name]));
  return { codes: codes.map((c) => ({ id: c.id, studentId: c.studentId, studentName: names.get(c.studentId) ?? null, display: `ENR-••••-••${c.hint.slice(-2)}`, expiresAt: c.expiresAt })) };
}

/** Revoke one of the class's codes, or (codeId omitted) every unused code of the class. */
export async function revokeClassCodes(actor: Actor, classId: string, codeId?: string, now = new Date()) {
  const cls = await classFor(actor, classId);
  const r = await ParentLinkCode.updateMany({ classId: cls.id, status: 'active', ...(codeId ? { id: codeId } : {}) }, { $set: { status: 'revoked', revokedAt: now, revokedBy: actor.id } });
  if (codeId && !r.modifiedCount) throw new AppError('Code not found', 404, 'NOT_FOUND');
  await recordAudit(codeId ? 'parent_code_revoked' : 'parent_codes_batch_revoked', actor, { institutionId: cls.institutionId, type: 'class', id: cls.id }, { ...(codeId ? { codeId } : {}), count: r.modifiedCount });
  return { revoked: r.modifiedCount };
}

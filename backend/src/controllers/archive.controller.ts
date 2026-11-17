import type { NextFunction, Request, Response } from 'express';
import { isGlobalAdmin, requireInstitutionId, scopedFilter } from '../auth/authorization';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { Batch } from '../models/Batch';
import { ClassEnrollment } from '../models/ClassEnrollment';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import {
  activeClassMembers,
  activeGroupMembers,
  archiveClass,
  archiveGroup,
  archiveStudent,
  groupArchiveOn,
  NOT_ARCHIVED,
  restoreClass,
  restoreGroup,
  restoreStudent,
  seatCount,
  studentArchiveOn,
  studentsWithoutActiveGroup,
} from '../services/archive';
import { confirmationFor, permanentlyDeleteStudent } from '../services/studentErasure';
import { ensurePlainObject } from '../utils/validation';

// Multi-class step 6 archiving endpoints (docs/multi-class/ARCHIVE_NOTES.md).
// Every route here is mounted behind `onlyWhen(switch)`: with the switch off
// the request falls through to the route that matched before (usually a 404),
// so the API is exactly as it was.

const actorOf = (req: AuthRequest) => (req.user ? { id: req.user.id, role: req.user.role } : undefined);

/** Route guard: with the switch off, skip to the next matching route (today's behaviour). */
export function onlyWhen(on: () => boolean) {
  return (_req: Request, _res: Response, next: NextFunction) => (on() ? next() : next('route'));
}

function refuse(req: AuthRequest, res: Response, status: number, code: string, message: string, details?: Record<string, unknown>) {
  res.status(status).json({ error: { code, message, requestId: req.requestId, ...(details ? { details } : {}) }, message });
}

export const MOVE_STUDENTS_FIRST = 'Move or remove the students first.';

// --- settings -------------------------------------------------------------

export const getArchiveSettings = (req: AuthRequest, res: Response) => {
  res.json({ groupArchive: groupArchiveOn(), studentArchive: studentArchiveOn(), permanentDeleteConfirmation: 'DELETE <studentId>' });
};
export const anyArchiveOn = () => groupArchiveOn() || studentArchiveOn();

// --- lists (additive filters used by the existing list controllers) --------

const wantArchived = (q: unknown) => (q === 'only' ? 'only' : q === 'true' || q === 'include' ? 'include' : 'none');

/**
 * Extra filter for a normal list: archived rows are hidden unless the caller
 * asks for them (`?includeArchived=true`, or `?archived=only` for the history
 * view). Empty (no change) while the switch is off.
 */
export function archivedListFilter(req: AuthRequest, on: () => boolean): Record<string, unknown> {
  if (!on()) return {};
  const mode = req.query.archived === 'only' ? 'only' : wantArchived(req.query.includeArchived);
  if (mode === 'include') return {};
  if (mode === 'only') return { archivedAt: { $ne: null } };
  return { ...NOT_ARCHIVED };
}

// --- guards on existing write routes (no-ops while the switch is off) -----

/** DELETE /api/batches/:id: refuse while the group still has active students. */
export const guardGroupDelete = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!groupArchiveOn()) return next();
  const group = await Batch.findOne(scopedFilter(req, { id: req.params.id })).lean();
  if (!group) return next(); // the delete handler answers 404 as today
  const m = await activeGroupMembers(group);
  if (!m.all.length) return next();
  refuse(req, res, 409, 'GROUP_HAS_STUDENTS', MOVE_STUDENTS_FIRST, { activeStudents: m.all.length, byGroupField: m.byField.length, byEnrollment: m.byEnrollment.length, canArchive: !group.archivedAt });
});

/** DELETE /api/course-instances/:id: refuse while the class still has active students. */
export const guardClassDelete = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!groupArchiveOn()) return next();
  const cls = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id })).lean();
  if (!cls) return next();
  const m = await activeClassMembers(cls);
  if (!m.all.length) return next();
  refuse(req, res, 409, 'CLASS_HAS_STUDENTS', MOVE_STUDENTS_FIRST, { activeStudents: m.all.length, explicit: m.explicit.length, viaGroup: m.viaGroup.length, byEnrollment: m.byEnrollment.length, canArchive: !cls.archivedAt });
});

/** POST/PATCH students: no placing a student in an archived group, no group change for an archived student. */
export const guardStudentGroupWrite = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const batchId = typeof body.batchId === 'string' ? body.batchId : undefined;
  if (studentArchiveOn() && req.params.id && body.batchId !== undefined) {
    const s = await Student.findOne(scopedFilter(req, { id: req.params.id })).select('archivedAt').lean();
    if (s?.archivedAt) return refuse(req, res, 409, 'STUDENT_ARCHIVED', 'This student is archived. Restore the student first.');
  }
  if (groupArchiveOn() && batchId) {
    const g = await Batch.findOne(scopedFilter(req, { id: batchId })).select('archivedAt').lean();
    if (g?.archivedAt) return refuse(req, res, 409, 'GROUP_ARCHIVED', 'This group is archived. Restore it first or choose another group.');
  }
  next();
});

/** POST /api/course-instances/:id/students: not into an archived class, not an archived student. */
export const guardClassAssign = asyncHandler(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (groupArchiveOn()) {
    const c = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id })).select('archivedAt').lean();
    if (c?.archivedAt) return refuse(req, res, 409, 'CLASS_ARCHIVED', 'This class is archived. Restore it first.');
  }
  const studentId = (req.body as Record<string, unknown> | undefined)?.studentId;
  if (studentArchiveOn() && typeof studentId === 'string') {
    const s = await Student.findOne(scopedFilter(req, { id: studentId })).select('archivedAt').lean();
    if (s?.archivedAt) return refuse(req, res, 409, 'STUDENT_ARCHIVED', 'This student is archived. Restore the student first.');
  }
  next();
});

// --- groups and classes ---------------------------------------------------

async function loadGroup(req: AuthRequest) {
  const g = await Batch.findOne(scopedFilter(req, { id: req.params.id })).lean();
  if (!g) throw new AppError('Batch not found', 404);
  return g;
}
async function loadClass(req: AuthRequest) {
  const c = await CourseInstance.findOne(scopedFilter(req, { id: req.params.id })).lean();
  if (!c) throw new AppError('Course instance not found', 404);
  return c;
}

export const archiveGroupHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await archiveGroup(await loadGroup(req), actorOf(req)));
});
export const restoreGroupHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await restoreGroup(await loadGroup(req), actorOf(req)));
});
export const archiveClassHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await archiveClass(await loadClass(req), actorOf(req)));
});
export const restoreClassHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await restoreClass(await loadClass(req), actorOf(req)));
});

/** History view of a group (archived or not): every membership row, with dates. */
export const groupHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const g = await loadGroup(req);
  const rows = await ClassEnrollment.find({ ...(g.institutionId ? { institutionId: g.institutionId } : {}), scope: 'group', targetId: g.id })
    .select('studentId status startedAt endedAt')
    .sort({ startedAt: 1 })
    .lean();
  const names = new Map((await Student.find({ id: { $in: [...new Set([...rows.map((r) => r.studentId), ...(g.archive?.memberIds ?? [])])] } }).select('id name archivedAt').lean()).map((s) => [s.id, s]));
  const { _id, __v, ...group } = g as Record<string, unknown>;
  void _id; void __v;
  res.json({
    group,
    memberships: rows.map((r) => ({ studentId: r.studentId, name: names.get(r.studentId)?.name ?? null, studentArchived: !!names.get(r.studentId)?.archivedAt, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt ?? null })),
    membersAtArchive: (g.archive?.memberIds ?? []).map((id) => ({ studentId: id, name: names.get(id)?.name ?? null })),
  });
});

// --- students without an active group -------------------------------------

export const listStudentsWithoutActiveGroup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = isGlobalAdmin(req)
    ? (typeof req.query.institutionId === 'string' && req.query.institutionId ? req.query.institutionId : undefined)
    : requireInstitutionId(req);
  const items = await studentsWithoutActiveGroup({ institutionId });
  const byReason: Record<string, number> = {};
  for (const i of items) byReason[i.reason] = (byReason[i.reason] ?? 0) + 1;
  res.json({ count: items.length, byReason, students: items.slice(0, 1000) });
});

// --- students -------------------------------------------------------------

async function loadStudent(req: AuthRequest) {
  const s = await Student.findOne(scopedFilter(req, { id: req.params.id })).lean();
  if (!s) throw new AppError('Student not found', 404);
  return s;
}

export const archiveStudentHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await archiveStudent(await loadStudent(req), actorOf(req)));
});
export const restoreStudentHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(await restoreStudent(await loadStudent(req), actorOf(req)));
});

/**
 * DELETE /api/students/:id with ENROLLMENT_STUDENT_ARCHIVE on: permanent
 * delete only, for school admins and ENARA admins, with the typed
 * confirmation `{ "confirm": "DELETE <studentId>" }`. Without it the request
 * is refused (the normal action is "Archive").
 */
export const deleteStudentPermanently = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user || !['admin', 'enara-admin'].includes(req.user.role)) throw new AppError('Admin access required', 403, 'ADMIN_REQUIRED');
  const s = await loadStudent(req);
  const body = req.body && typeof req.body === 'object' ? ensurePlainObject(req.body) : {};
  if (body.confirm !== confirmationFor(s.id)) {
    return refuse(req, res, 400, 'CONFIRMATION_REQUIRED', `Permanent delete removes this student's records for good. To confirm, send "${confirmationFor(s.id)}". To keep the history, archive the student instead.`, { confirm: confirmationFor(s.id) });
  }
  const result = await permanentlyDeleteStudent(s, actorOf(req));
  res.json({ message: 'Student deleted permanently', ...result });
});

// --- seats ------------------------------------------------------------------

export const getSeats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const requested = typeof req.query.institutionId === 'string' ? req.query.institutionId : '';
  res.json(await seatCount(isGlobalAdmin(req) && requested ? requested : requireInstitutionId(req)));
});

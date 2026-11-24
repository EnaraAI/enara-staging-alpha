import { Router, type Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';
import { requireLearner } from '../parents/service';
import { anySiteSectionOn, SECTIONS, siteSectionOn } from './flags';
import { schoolSections, setSchoolSections } from './sections';
import { confirmImport, listImports, previewImport, undoImport } from './importer';
import { COLUMNS } from './importSpec';
import * as views from './parentViews';
import { SchoolAnnouncement } from './models';
import { Batch } from '../models/Batch';
import { Student } from '../models/Student';

// Parents school app, step (a). Every route 404s while all SCHOOL_APP_*_ENABLED switches are off.
//   /api/parents/school/...      parents: one child's sections (through requireLearner) and the parent's notifications
//   /api/school-app/...          school admin (own school) and ENARA admin: sections, imports (preview / confirm / undo), announcements
const h = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => asyncHandler(fn as never);
const anyOn = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => (anySiteSectionOn() ? next() : next(new AppError('Route not found', 404, 'NOT_FOUND')));
const actor = (req: AuthRequest) => ({ id: req.user!.id, role: req.user!.role, institutionId: req.user!.institutionId });

export const parentSchoolRoutes = Router();
parentSchoolRoutes.use(anyOn, authMiddleware, requireRole('parent'));
const child = (req: AuthRequest) => requireLearner(req.user!.id, String(req.params.studentId), 'read');
parentSchoolRoutes.get('/learners/:studentId', h(async (req, res) => { res.json(await views.schoolOverview(await child(req))); }));
parentSchoolRoutes.get('/learners/:studentId/timetable', h(async (req, res) => { res.json(await views.timetable(await child(req))); }));
parentSchoolRoutes.get('/learners/:studentId/attendance', h(async (req, res) => { res.json(await views.attendance(await child(req), req.query.month)); }));
parentSchoolRoutes.get('/learners/:studentId/announcements', h(async (req, res) => { res.json(await views.announcements(await child(req))); }));
parentSchoolRoutes.get('/notifications', h(async (req, res) => { res.json(await views.notifications(req.user!.id)); }));
parentSchoolRoutes.post('/notifications/read', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await views.markRead(req.user!.id, b.ids)); }));

export const schoolAppAdminRoutes = Router();
schoolAppAdminRoutes.use(anyOn, authMiddleware, requireRole('admin', 'enara-admin'));
const schoolId = (req: AuthRequest, q?: unknown) => (req.user!.role === 'enara-admin' && typeof q === 'string' ? q : req.user!.institutionId);
schoolAppAdminRoutes.get('/status', h(async (req, res) => {
  const id = schoolId(req, req.query.institutionId);
  res.json({ institutionId: id ?? null, available: Object.fromEntries(SECTIONS.map((s) => [s, siteSectionOn(s)])), sections: await schoolSections(id),
    templates: Object.fromEntries(Object.entries(COLUMNS).map(([k, cols]) => [k, cols.map((c) => ({ key: c.key, required: c.required, header: c.aliases[0], headerAr: c.aliases.find((a) => /[؀-ۿ]/.test(a)) ?? null }))])) });
}));
// The school's classes (ENARA groups) with their students' IDs and names: what the templates' "class" and "student" columns accept.
schoolAppAdminRoutes.get('/roster', h(async (req, res) => {
  const id = schoolId(req, req.query.institutionId); if (!id) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  const groups = await Batch.find({ institutionId: id, archivedAt: { $exists: false } }).select('id name').lean();
  const students = await Student.find({ institutionId: id, archivedAt: { $exists: false } }).select('id name grade batchId').lean();
  res.json({ groups: groups.map((g) => ({ name: g.name, students: students.filter((s) => s.batchId === g.id).map((s) => ({ id: s.id, name: s.name, grade: s.grade || null })) })),
    withoutGroup: students.filter((s) => !s.batchId || !groups.some((g) => g.id === s.batchId)).map((s) => ({ id: s.id, name: s.name, grade: s.grade || null })) });
}));
schoolAppAdminRoutes.put('/sections', h(async (req, res) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const id = schoolId(req, b.institutionId); if (!id) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  const { institutionId: _i, ...sections } = b; void _i;
  res.json(await setSchoolSections(actor(req), id, sections));
}));
schoolAppAdminRoutes.post('/imports/preview', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await previewImport(actor(req), b)); }));
schoolAppAdminRoutes.post('/imports/:id/confirm', h(async (req, res) => { res.json(await confirmImport(actor(req), String(req.params.id))); }));
schoolAppAdminRoutes.post('/imports/:id/undo', h(async (req, res) => { res.json(await undoImport(actor(req), String(req.params.id))); }));
schoolAppAdminRoutes.get('/imports', h(async (req, res) => { res.json(await listImports(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));

// Announcements written on the screen (no file). Audience: school, grade, group (class) or student.
schoolAppAdminRoutes.get('/announcements', h(async (req, res) => {
  const id = schoolId(req, req.query.institutionId);
  const rows = await SchoolAnnouncement.find({ institutionId: id }).sort({ publishAt: -1 }).limit(100).lean();
  res.json({ announcements: rows.map((a) => ({ id: a.id, audience: a.audience, audienceValue: a.audienceValue ?? null, title: a.title, body: a.body, publishAt: a.publishAt, expiresAt: a.expiresAt ?? null, withdrawn: !!a.withdrawnAt, source: a.source?.kind })) });
}));
schoolAppAdminRoutes.post('/announcements', h(async (req, res) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const id = schoolId(req, b.institutionId); if (!id) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  const csv = `audience,audience value,title,body,publish,expires\n${[b.audience, b.audienceValue, b.title, b.body, b.publish, b.expires].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')}`;
  // Same checks as an import row (one path for every source); then published at once.
  const p = await previewImport(actor(req), { section: 'announcements', csv, institutionId: id });
  if (p.problems.length) throw new AppError(p.problems[0].message, 400, 'VALIDATION_ERROR');
  const c = await confirmImport(actor(req), p.importId);
  res.status(201).json({ created: c.written.inserted });
}));
schoolAppAdminRoutes.post('/announcements/:id/withdraw', h(async (req, res) => {
  const id = schoolId(req, req.query.institutionId);
  const r = await SchoolAnnouncement.updateOne({ id: String(req.params.id), institutionId: id, withdrawnAt: { $exists: false } }, { $set: { withdrawnAt: new Date() } });
  if (!r.matchedCount) throw new AppError('Announcement not found', 404, 'NOT_FOUND');
  res.json({ withdrawn: true });
}));

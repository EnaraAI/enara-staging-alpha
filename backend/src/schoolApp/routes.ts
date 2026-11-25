import { Router, type Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';
import { requireLearner } from '../parents/service';
import { anySiteSectionOn, SECTIONS, siteSectionOn } from './flags';
import { feesVisibleTo, schoolSections, setFeesVisibleTo, setSchoolSections } from './sections';
import { clearMapping, confirmImport, listImports, listMappings, previewImport, undoImport } from './importer';
import { COLUMNS } from './importSpec';
import * as views from './parentViews';
import { moodleConnections, runMoodleSyncNow, saveMoodleToken, setMoodleEnabled } from './moodleSync';
import { ask, confirmRequest } from './chat';
import { answerRequest, consentCsv, consentDashboard, consentForms, consentsForParent, createConsentForm, createRequest, requestsForAdmin, requestsForParent, signConsent, withdrawConsentForm } from './requests';
import { busForParent, busesForAdmin, sendBusNotice, setBusPhonesShared, withdrawBusNotice } from './buses';
import { attachReceipt, feesForAdmin, feesForParent, markInstalment, receiptForAdmin, receiptForParent } from './fees';
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
parentSchoolRoutes.get('/learners/:studentId/fees', h(async (req, res) => { res.json(await feesForParent(await child(req))); }));
const sendFile = (res: Response, f: { body: Buffer; contentType: string; fileName: string }) => { res.setHeader('Content-Type', f.contentType); res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`); res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.send(f.body); };
parentSchoolRoutes.get('/learners/:studentId/fees/:instalmentId/receipt', h(async (req, res) => { sendFile(res, await receiptForParent(await child(req), String(req.params.instalmentId))); }));
parentSchoolRoutes.get('/learners/:studentId/bus', h(async (req, res) => { res.json(await busForParent(await child(req))); }));
parentSchoolRoutes.get('/learners/:studentId/requests', h(async (req, res) => { res.json(await requestsForParent(await child(req))); }));
parentSchoolRoutes.post('/learners/:studentId/requests', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.status(201).json(await createRequest(await child(req), b)); }));
parentSchoolRoutes.get('/learners/:studentId/consents', h(async (req, res) => { res.json(await consentsForParent(await child(req))); }));
parentSchoolRoutes.post('/learners/:studentId/consents/:formId', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.status(201).json(await signConsent(await child(req), String(req.params.formId), b, { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') })); }));
parentSchoolRoutes.post('/learners/:studentId/chat', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await ask(await child(req), b)); }));
parentSchoolRoutes.post('/learners/:studentId/chat/request', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.status(201).json(await confirmRequest(await child(req), b)); }));
parentSchoolRoutes.get('/learners/:studentId/announcements', h(async (req, res) => { res.json(await views.announcements(await child(req))); }));
parentSchoolRoutes.get('/notifications', h(async (req, res) => { res.json(await views.notifications(req.user!.id)); }));
parentSchoolRoutes.post('/notifications/read', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await views.markRead(req.user!.id, b.ids)); }));

export const schoolAppAdminRoutes = Router();
schoolAppAdminRoutes.use(anyOn, authMiddleware, requireRole('admin', 'enara-admin'));
const schoolId = (req: AuthRequest, q?: unknown) => (req.user!.role === 'enara-admin' && typeof q === 'string' ? q : req.user!.institutionId);
schoolAppAdminRoutes.get('/status', h(async (req, res) => {
  const id = schoolId(req, req.query.institutionId);
  res.json({ institutionId: id ?? null, available: Object.fromEntries(SECTIONS.map((s) => [s, siteSectionOn(s)])), sections: await schoolSections(id), feesVisibleTo: await feesVisibleTo(id), retentionDays: (await import('./retention')).retentionDays(),
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
schoolAppAdminRoutes.get('/imports/mappings', h(async (req, res) => { res.json(await listMappings(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));
schoolAppAdminRoutes.delete('/imports/mappings/:section', h(async (req, res) => { res.json(await clearMapping(actor(req), String(req.params.section), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));
schoolAppAdminRoutes.get('/imports', h(async (req, res) => { res.json(await listImports(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));

// Step (b): fees. The school sees its instalments (filter by student or status), marks one paid / waived / due, and chooses who in a
// family sees fees. ENARA never takes payments.
schoolAppAdminRoutes.get('/fees', h(async (req, res) => {
  res.json(await feesForAdmin(actor(req), { institutionId: typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined, studentId: typeof req.query.studentId === 'string' ? req.query.studentId : undefined, status: typeof req.query.status === 'string' ? req.query.status : undefined }));
}));
schoolAppAdminRoutes.post('/fees/instalments/:id/mark', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await markInstalment(actor(req), String(req.params.id), b)); }));
schoolAppAdminRoutes.post('/fees/instalments/:id/receipt', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await attachReceipt(actor(req), String(req.params.id), b)); }));
schoolAppAdminRoutes.get('/fees/instalments/:id/receipt', h(async (req, res) => { sendFile(res, await receiptForAdmin(actor(req), String(req.params.id))); }));
schoolAppAdminRoutes.put('/fees/visibility', h(async (req, res) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const id = schoolId(req, b.institutionId); if (!id) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  res.json(await setFeesVisibleTo(actor(req), id, b.feesVisibleTo));
}));

// Step (c): buses. Routes and children come from the two bus sheets (imports); the school sends delay / cancel notices for today.
schoolAppAdminRoutes.get('/buses', h(async (req, res) => { res.json(await busesForAdmin(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));
schoolAppAdminRoutes.post('/buses/notices', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.status(201).json(await sendBusNotice(actor(req), b)); }));
schoolAppAdminRoutes.post('/buses/notices/:id/withdraw', h(async (req, res) => { res.json(await withdrawBusNotice(actor(req), String(req.params.id))); }));
schoolAppAdminRoutes.put('/buses/phones', h(async (req, res) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const id = schoolId(req, b.institutionId); if (!id) throw new AppError('A school is required', 400, 'VALIDATION_ERROR');
  res.json(await setBusPhonesShared(actor(req), id, b.busPhonesShared));
}));

// Step (d): requests inbox and consent forms.
schoolAppAdminRoutes.get('/requests', h(async (req, res) => { res.json(await requestsForAdmin(actor(req), { institutionId: typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined, status: typeof req.query.status === 'string' ? req.query.status : undefined })); }));
schoolAppAdminRoutes.post('/requests/:id', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await answerRequest(actor(req), String(req.params.id), b)); }));
schoolAppAdminRoutes.get('/consents', h(async (req, res) => { res.json(await consentForms(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));
schoolAppAdminRoutes.post('/consents', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.status(201).json(await createConsentForm(actor(req), b)); }));
schoolAppAdminRoutes.get('/consents/:id', h(async (req, res) => { res.json(await consentDashboard(actor(req), String(req.params.id))); }));
schoolAppAdminRoutes.get('/consents/:id/export', h(async (req, res) => { const csv = await consentCsv(actor(req), String(req.params.id)); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="consent-${String(req.params.id)}.csv"`); res.setHeader('Cache-Control', 'private, no-store'); res.send(csv); }));
schoolAppAdminRoutes.post('/consents/:id/withdraw', h(async (req, res) => { res.json(await withdrawConsentForm(actor(req), String(req.params.id))); }));

// The Moodle connector: per LMS connection, a read-only token (write-only here), the school's on/off, and "Sync now".
schoolAppAdminRoutes.get('/moodle', h(async (req, res) => { res.json(await moodleConnections(actor(req), typeof req.query.institutionId === 'string' ? req.query.institutionId : undefined)); }));
schoolAppAdminRoutes.put('/moodle/:platformId/token', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await saveMoodleToken(actor(req), String(req.params.platformId), b.token)); }));
schoolAppAdminRoutes.put('/moodle/:platformId', h(async (req, res) => { const b = ensurePlainObject(req.body); rejectMongoOperators(b); res.json(await setMoodleEnabled(actor(req), String(req.params.platformId), b.enabled)); }));
schoolAppAdminRoutes.post('/moodle/:platformId/run', h(async (req, res) => { res.json(await runMoodleSyncNow(actor(req), String(req.params.platformId))); }));

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
  const p = await previewImport(actor(req), { section: 'announcements', csv, institutionId: id }, { savedMapping: false });
  if ('needsMapping' in p) throw new AppError('Unexpected columns', 500, 'INTERNAL');
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

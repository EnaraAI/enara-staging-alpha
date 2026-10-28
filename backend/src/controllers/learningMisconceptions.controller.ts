import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningObjective } from '../models/LearningObjective';
import { StudentMisconception } from '../models/StudentMisconception';
import { resolveStudentForRead } from '../services/learningAccess';
import { ensurePlainObject, getOptionalString } from '../utils/validation';

// GET /api/learning/students/:studentId/misconceptions?status=
// Students see their own as "possible" (suspected) or confirmed; dismissed ones
// are hidden from them.
export const listStudentMisconceptions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const isStudent = req.user!.role === 'student';
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const filter: Record<string, unknown> = { studentId: student.id };
  if (status && ['suspected', 'confirmed', 'resolved', 'dismissed'].includes(status)) filter.status = status;
  if (isStudent) filter.status = status && status !== 'dismissed' ? status : { $ne: 'dismissed' };
  const items = await StudentMisconception.find(filter).sort({ detectedAt: -1 }).limit(200).lean();
  const objectives = new Map(
    (await LearningObjective.find({ id: { $in: items.map((i) => i.objectiveId) } }).select('id code title').lean()).map((o) => [o.id, o]),
  );
  const evidence = isStudent
    ? new Map()
    : new Map(
        (await LearningEvidence.find({ id: { $in: items.flatMap((i) => i.supportingEvidenceIds) } })
          .select('id evidenceType result occurredAt itemKey invalidatedAt')
          .lean()).map((e) => [e.id, e]),
      );
  res.json({
    misconceptions: items.map((m) => ({
      id: m.id,
      objective: objectives.get(m.objectiveId) ? { id: m.objectiveId, code: objectives.get(m.objectiveId)!.code, title: objectives.get(m.objectiveId)!.title } : { id: m.objectiveId },
      category: m.category,
      description: m.description,
      status: m.status,
      label: m.status === 'suspected' ? 'Possible misconception (not confirmed)' : m.status === 'confirmed' ? 'Confirmed by a teacher' : m.status,
      confidence: m.confidence,
      confidenceIsHeuristic: true,
      source: m.source,
      detectedAt: m.detectedAt,
      resolvedAt: m.resolvedAt ?? null,
      detectionVersion: m.detectionVersion,
      supportingEvidence: isStudent ? undefined : m.supportingEvidenceIds.map((id) => evidence.get(id)).filter(Boolean).map(({ _id, ...e }: any) => e),
      statusHistory: isStudent ? undefined : m.statusHistory,
    })),
  });
});

// PATCH /api/learning/misconceptions/:id { status, note? } — the student's
// teacher or school admin confirms, dismisses, resolves or reopens a finding.
export const updateMisconception = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN');
  const body = ensurePlainObject(req.body);
  const to = body.status;
  if (typeof to !== 'string' || !['suspected', 'confirmed', 'resolved', 'dismissed'].includes(to)) {
    throw new AppError('status must be suspected, confirmed, resolved or dismissed', 400, 'VALIDATION_ERROR');
  }
  const note = getOptionalString(body, 'note', { max: 500 });
  const m = await StudentMisconception.findOne({ id: String(req.params.id) });
  if (!m) throw new AppError('Misconception not found', 404, 'MISCONCEPTION_NOT_FOUND');
  await resolveStudentForRead(req, m.studentId);
  if (m.status !== to) {
    m.statusHistory.push({ at: new Date(), by: req.user!.id, from: m.status, to, note });
    m.status = to as typeof m.status;
    m.resolvedAt = to === 'resolved' ? new Date() : undefined;
    await m.save();
  }
  res.json({ id: m.id, status: m.status, statusHistory: m.statusHistory });
});

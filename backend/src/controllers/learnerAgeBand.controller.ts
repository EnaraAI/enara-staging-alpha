import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Batch } from '../models/Batch';
import { Institution } from '../models/Institution';
import { Student } from '../models/Student';
import { isLearnerAgeBand, LEARNER_AGE_BANDS, type LearnerAgeBand } from '../models/learnerAgeBand';
import { recordAudit } from '../services/auditTrail';
import { resolveTrustedAgeBand } from '../services/languageTeachingContext';

// Trusted learner age band (Option B). Writes: Workspace Admin ('admin') only.
// Reads: Workspace Admin and Academic Manager. The tenant always comes from the
// authenticated account, never from the request; records of another school
// are reported as not found. Values are a staff-provided coarse category, not
// an exact age; no age boundaries are defined here.

const tenantOf = (req: AuthRequest): string => {
  const id = req.user?.institutionId;
  if (!id) throw new AppError('This account is not attached to a school', 403, 'NO_INSTITUTION');
  return id;
};

// Body: { ageBand: 'child' | 'teen' | 'adult' | null } (null clears). Exact values only.
function bandFromBody(body: unknown): LearnerAgeBand | null {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('ageBand' in body)) {
    throw new AppError(`ageBand is required: one of ${LEARNER_AGE_BANDS.join(', ')}, or null to clear`, 400, 'VALIDATION_ERROR');
  }
  const v = (body as { ageBand: unknown }).ageBand;
  if (v === null) return null;
  if (!isLearnerAgeBand(v)) throw new AppError(`ageBand must be exactly one of ${LEARNER_AGE_BANDS.join(', ')}, or null`, 400, 'VALIDATION_ERROR');
  return v;
}

export const getAgeBands = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = tenantOf(req);
  const [school, batches, students] = await Promise.all([
    Institution.findOne({ id: institutionId }).select('learningSettings').lean(),
    Batch.find({ institutionId }).select('+learnerAgeBand id name').sort({ name: 1 }).limit(500).lean(),
    Student.find({ institutionId }).select('+learnerAgeBand id name batchId').sort({ name: 1 }).limit(5000).lean(),
  ]);
  const settings = (school as { learningSettings?: unknown } | null)?.learningSettings;
  const classBand = new Map(batches.map((b) => [b.id, b.learnerAgeBand]));
  res.json({
    values: LEARNER_AGE_BANDS,
    adultSchool: (settings as { adultLearners?: unknown } | undefined)?.adultLearners === true,
    canEdit: req.user?.role === 'admin',
    classes: batches.map((b) => ({ id: b.id, name: b.name, ageBand: isLearnerAgeBand(b.learnerAgeBand) ? b.learnerAgeBand : null })),
    students: students.map((s) => {
      const cls = s.batchId ? classBand.get(s.batchId) : undefined;
      const effective = resolveTrustedAgeBand(settings, s.learnerAgeBand, cls);
      return {
        id: s.id,
        name: s.name,
        classId: s.batchId ?? null,
        ageBand: isLearnerAgeBand(s.learnerAgeBand) ? s.learnerAgeBand : null,
        classAgeBand: isLearnerAgeBand(cls) ? cls : null,
        effective: { ageBand: effective.band, source: effective.source, status: effective.status },
      };
    }),
  });
});

export const setStudentAgeBand = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = tenantOf(req);
  const band = bandFromBody(req.body);
  const student = await Student.findOne({ id: String(req.params.id), institutionId }).select('+learnerAgeBand id institutionId');
  if (!student) throw new AppError('Student not found', 404, 'NOT_FOUND');
  const from = student.learnerAgeBand ?? null;
  student.learnerAgeBand = band ?? undefined;
  await student.save();
  await recordAudit('learner_age_band_changed', req.user, { institutionId, type: 'student', id: student.id }, { scope: 'student', from, to: band });
  res.json({ id: student.id, ageBand: band });
});

export const setClassAgeBand = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = tenantOf(req);
  const band = bandFromBody(req.body);
  const batch = await Batch.findOne({ id: String(req.params.id), institutionId }).select('+learnerAgeBand id institutionId');
  if (!batch) throw new AppError('Class not found', 404, 'NOT_FOUND');
  const from = batch.learnerAgeBand ?? null;
  batch.learnerAgeBand = band ?? undefined;
  await batch.save();
  await recordAudit('learner_age_band_changed', req.user, { institutionId, type: 'batch', id: batch.id }, { scope: 'class', from, to: band });
  res.json({ id: batch.id, ageBand: band });
});

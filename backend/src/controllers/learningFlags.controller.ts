import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, requireInstitutionId } from '../auth/authorization';
import { Institution } from '../models/Institution';
import { ALL_FLAGS, forgetFeatureFlags, getFeatureFlags, type LearningFlag } from '../services/featureFlags';
import { ensurePlainObject, getOptionalNumber, getRequiredId } from '../utils/validation';
import { logger } from '../utils/logging';

// GET /api/learning/flags — the caller's school (Enara admins: ?institutionId=).
export const getFlags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId =
    isGlobalAdmin(req) && typeof req.query.institutionId === 'string' ? req.query.institutionId : requireInstitutionId(req);
  res.json({ institutionId, flags: await getFeatureFlags(institutionId) });
});

// PUT /api/learning/flags { institutionId, flags: { name: boolean } } — Enara admins only.
// Turning a flag off stops new processing and hides the feature; data is kept.
export const setFlags = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isGlobalAdmin(req)) throw new AppError('Only Enara admins can change feature flags', 403, 'FORBIDDEN');
  const body = ensurePlainObject(req.body);
  const institutionId = getRequiredId(body, 'institutionId');
  const flags = ensurePlainObject(body.flags, 'flags');
  const set: Record<string, boolean> = {};
  for (const [name, value] of Object.entries(flags)) {
    if (!(ALL_FLAGS as readonly string[]).includes(name as LearningFlag) || typeof value !== 'boolean') {
      throw new AppError(`Unknown flag or value: ${name}`, 400, 'VALIDATION_ERROR');
    }
    set[`features.${name}`] = value;
  }
  const updated = await Institution.updateOne({ id: institutionId }, { $set: set });
  if (!updated.matchedCount) throw new AppError('Institution not found', 404, 'INSTITUTION_NOT_FOUND');
  forgetFeatureFlags(institutionId);
  logger.info('feature_flags_changed', { institutionId, changedBy: req.user!.id, flags });
  res.json({ institutionId, flags: await getFeatureFlags(institutionId) });
});

// GET/PUT /api/learning/settings — school limits (school admins for their school).
export const getLearningSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId =
    isGlobalAdmin(req) && typeof req.query.institutionId === 'string' ? req.query.institutionId : requireInstitutionId(req);
  const school = await Institution.findOne({ id: institutionId }).select('learningSettings').lean();
  res.json({ institutionId, settings: { diagnosticMaxQuestions: 12, diagnosticMaxMinutes: 30, pathwayMode: 'teacher_controlled', shadowMode: false, ...(school?.learningSettings || {}) } });
});

export const setLearningSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  const institutionId = isGlobalAdmin(req) ? getRequiredId(body, 'institutionId') : requireInstitutionId(req);
  const set: Record<string, number> = {};
  const q = getOptionalNumber(body, 'diagnosticMaxQuestions', { min: 3, max: 30 });
  const m = getOptionalNumber(body, 'diagnosticMaxMinutes', { min: 5, max: 120 });
  if (q !== undefined) set['learningSettings.diagnosticMaxQuestions'] = Math.floor(q);
  if (m !== undefined) set['learningSettings.diagnosticMaxMinutes'] = Math.floor(m);
  const modes = ['strict_sequence', 'teacher_controlled', 'adaptive'];
  if (body.pathwayMode !== undefined) {
    if (!modes.includes(body.pathwayMode as string)) throw new AppError('pathwayMode must be strict_sequence, teacher_controlled or adaptive', 400, 'VALIDATION_ERROR');
    (set as Record<string, unknown>)['learningSettings.pathwayMode'] = body.pathwayMode;
  }
  if (body.shadowMode !== undefined) {
    // A rollout decision, so Enara admins only.
    if (!isGlobalAdmin(req)) throw new AppError('Only Enara administrators can change shadow mode', 403, 'FORBIDDEN');
    if (typeof body.shadowMode !== 'boolean') throw new AppError('shadowMode must be true or false', 400, 'VALIDATION_ERROR');
    (set as Record<string, unknown>)['learningSettings.shadowMode'] = body.shadowMode;
  }
  if (Object.keys(set).length) await Institution.updateOne({ id: institutionId }, { $set: set });
  forgetFeatureFlags(institutionId);
  logger.info('learning_settings_changed', { institutionId, changedBy: req.user!.id, set });
  const school = await Institution.findOne({ id: institutionId }).select('learningSettings').lean();
  res.json({ institutionId, settings: { diagnosticMaxQuestions: 12, diagnosticMaxMinutes: 30, pathwayMode: 'teacher_controlled', shadowMode: false, ...(school?.learningSettings || {}) } });
});

import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Institution } from '../models/Institution';

// School-level feature flags for the Learning Intelligence Engine. Every flag
// is off unless set for the school; sub-features also need the master flag.
// Turning a flag off hides the feature and stops new processing; it never
// deletes data.
export const LEARNING_FLAGS = [
  'learning_intelligence_enabled',
  'diagnostics_enabled',
  'mastery_tracking_enabled',
  'misconception_detection_enabled',
  'adaptive_pedagogy_enabled',
  'learning_pathways_enabled',
  'teacher_learning_insights_enabled',
  'retention_intelligence_enabled',
] as const;
export const MASTER_FLAG = 'learning_intelligence_enabled';

// Phase 3 (teaching workflow): its own master flag, independent of the
// learning intelligence flags.
export const TEACHING_FLAGS = [
  'teaching_workflow_enabled',
  'ai_assessment_authoring_enabled',
  'ai_grading_enabled',
  'ai_lesson_planning_enabled',
  'study_plans_enabled',
] as const;
export const TEACHING_MASTER_FLAG = 'teaching_workflow_enabled';

// P2 documents workspace: its own master flag. On, the documents safety gate
// applies to the school (rights attestation and a clean malware scan before
// any extraction or AI use); off, uploads behave as before P2.
export const DOCUMENT_FLAGS = ['documents_workspace_enabled'] as const;
// P3 grounded educator chat: its own master flag, default off. It never
// turns document processing on; it only answers from eligible documents.
export const EDUCATOR_CHAT_FLAGS = ['educator_chat_enabled'] as const;

// P4, each its own master flag, default off: the connected workflow
// (source-linked generation, outcomes), teacher-controlled English speaking
// exams (voice only), and the optional avatar layer for those exams.
export const P4_FLAGS = ['connected_workflow_enabled', 'speaking_exams_enabled', 'speaking_exam_avatar_enabled'] as const;

export const ALL_FLAGS = [...LEARNING_FLAGS, ...TEACHING_FLAGS, ...DOCUMENT_FLAGS, ...EDUCATOR_CHAT_FLAGS, ...P4_FLAGS] as const;
export type LearningFlag = (typeof ALL_FLAGS)[number];

const masterOf = (flag: LearningFlag) =>
  [...DOCUMENT_FLAGS, ...EDUCATOR_CHAT_FLAGS, ...P4_FLAGS].includes(flag as never) ? flag : (TEACHING_FLAGS as readonly string[]).includes(flag) ? TEACHING_MASTER_FLAG : MASTER_FLAG;

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; flags: Record<string, boolean>; shadow: boolean }>();

export function forgetFeatureFlags(institutionId?: string) {
  if (institutionId) cache.delete(institutionId);
  else cache.clear();
}

export async function loadSchool(institutionId: string) {
  const cached = cache.get(institutionId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  const institution = await Institution.findOne({ id: institutionId }).select('features learningSettings.shadowMode').lean();
  const stored = (institution?.features ?? {}) as Record<string, boolean> | Map<string, boolean>;
  const entry = {
    at: Date.now(),
    flags: stored instanceof Map ? Object.fromEntries(stored) : { ...stored },
    shadow: institution?.learningSettings?.shadowMode === true,
  };
  cache.set(institutionId, entry);
  return entry;
}

export async function getFeatureFlags(institutionId: string): Promise<Record<LearningFlag, boolean>> {
  const raw = (await loadSchool(institutionId)).flags;
  return Object.fromEntries(
    ALL_FLAGS.map((f) => {
      const master = masterOf(f);
      return [f, raw[master] === true && (f === master || raw[f] === true)];
    }),
  ) as Record<LearningFlag, boolean>;
}

export async function isFeatureEnabled(institutionId: string | undefined, flag: LearningFlag): Promise<boolean> {
  if (!institutionId) return false;
  return (await getFeatureFlags(institutionId))[flag];
}

// Route guard: the caller's school must have the flag on. Enara admins (no
// school of their own) pass, since they configure and review schools.
export function requireFeature(flag: LearningFlag) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === 'enara-admin') return next();
      if (await isFeatureEnabled(req.user?.institutionId, flag)) return next();
      res.status(404).json({
        error: { code: 'FEATURE_DISABLED', message: 'This feature is not enabled for your school', requestId: req.requestId },
        message: 'This feature is not enabled for your school',
      });
    } catch (error) {
      next(error);
    }
  };
}

// Shadow mode (rollout stage C): everything is computed, but only staff see
// it. Students get the same answer as if the feature were off.
export async function isShadowMode(institutionId: string | undefined): Promise<boolean> {
  if (!institutionId) return false;
  return (await loadSchool(institutionId)).shadow;
}

export async function blockStudentsInShadowMode(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'student' || !(await isShadowMode(req.user.institutionId))) return next();
    res.status(404).json({
      error: { code: 'FEATURE_DISABLED', message: 'This feature is not enabled for your school', requestId: req.requestId },
      message: 'This feature is not enabled for your school',
    });
  } catch (error) {
    next(error);
  }
}

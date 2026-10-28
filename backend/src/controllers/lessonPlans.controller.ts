import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireInstitutionId } from '../auth/authorization';
import { LessonPlan, type ILessonPlanSection } from '../models/LessonPlan';
import { CurriculumChunk } from '../models/CurriculumChunk';
import { isFeatureEnabled } from '../services/featureFlags';
import { loadCurriculumForStaff } from '../services/learningAccess';
import { SECTION_KINDS, generateLessonPlan, regenerateSection } from '../services/educatorAi';
import { ensurePlainObject, getOptionalNumber, getOptionalString, getOptionalStringArray, getRequiredString, rejectMongoOperators } from '../utils/validation';
import { logger } from '../utils/logging';

async function requireLessonAi(institutionId?: string) {
  if (!(await isFeatureEnabled(institutionId, 'ai_lesson_planning_enabled'))) {
    throw new AppError('AI lesson planning is not enabled for your school', 404, 'FEATURE_DISABLED');
  }
}

// Plans are private to their author; school admins can read their school's.
async function loadPlan(req: AuthRequest, id: string, write = false) {
  const user = req.user!;
  const plan = await LessonPlan.findOne(user.role === 'enara-admin' ? { id } : { id, institutionId: requireInstitutionId(req) });
  if (!plan) throw new AppError('Lesson plan not found', 404, 'LESSON_PLAN_NOT_FOUND');
  const own = plan.createdBy === user.id;
  if (!own && (write || user.role === 'teacher')) throw new AppError('Lesson plan not found', 404, 'LESSON_PLAN_NOT_FOUND');
  return plan;
}

// Sections from the editor: kinds checked, sources only real passages.
async function parseSections(raw: unknown, institutionId?: string, previous: ILessonPlanSection[] = []): Promise<ILessonPlanSection[]> {
  if (!Array.isArray(raw) || raw.length > 20) throw new AppError('sections must be a list of at most 20', 400, 'VALIDATION_ERROR');
  const before = new Map(previous.map((s) => [s.id, s]));
  const sections = raw.map((r, i) => {
    const s = ensurePlainObject(r, `sections[${i}]`);
    const kind = String(s.kind);
    if (!(SECTION_KINDS as readonly string[]).includes(kind)) throw new AppError(`sections[${i}].kind is invalid`, 400, 'VALIDATION_ERROR');
    const id = getOptionalString(s, 'id', { max: 80 }) || `s${randomUUID().slice(0, 8)}`;
    const title = getRequiredString(s, 'title', { max: 200 });
    const content = getRequiredString(s, 'content', { max: 6000 });
    const old = before.get(id);
    // A section the teacher changed is theirs from then on.
    const origin = old && (old.title !== title || old.content !== content) ? 'teacher' : old?.origin ?? (s.origin === 'ai' ? 'ai' : 'teacher');
    return {
      id,
      kind,
      title,
      content,
      durationMinutes: getOptionalNumber(s, 'durationMinutes', { min: 0, max: 240 }),
      sources: Array.isArray(s.sources) ? s.sources.slice(0, 6).map((x) => ({ chunkId: String((x as { chunkId?: unknown })?.chunkId ?? ''), fileName: '', page: null })) : undefined,
      origin: origin as 'ai' | 'teacher',
    };
  });
  const ids = [...new Set(sections.flatMap((s) => (s.sources || []).map((x) => x.chunkId)))];
  const found = new Map(ids.length ? (await CurriculumChunk.find({ id: { $in: ids }, institutionId }).select('id fileName page').lean()).map((c) => [c.id, c]) : []);
  return sections.map((s) => {
    const sources = (s.sources || []).filter((x) => found.has(x.chunkId)).map((x) => ({ chunkId: x.chunkId, fileName: found.get(x.chunkId)!.fileName, page: found.get(x.chunkId)!.page ?? null }));
    return { ...s, sources: sources.length ? sources : undefined };
  });
}

// POST /api/lesson-plans/generate
export const generatePlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const curriculum = await loadCurriculumForStaff(req, getRequiredString(body, 'curriculumId', { max: 128 }));
  await requireLessonAi(curriculum.institutionId);
  const lessonId = getOptionalString(body, 'lessonId', { max: 128 });
  const lesson = lessonId ? curriculum.chapters.find((c) => c.id === lessonId) : undefined;
  if (lessonId && !lesson) throw new AppError('Lesson not found in this curriculum', 404, 'LESSON_NOT_FOUND');
  const params = {
    objectiveIds: getOptionalStringArray(body, 'objectiveIds', { maxItems: 10, maxLength: 128 }) || [],
    durationMinutes: Math.floor(getOptionalNumber(body, 'durationMinutes', { min: 10, max: 240 }) ?? 45),
    learnerLevel: getOptionalString(body, 'learnerLevel', { max: 200 }) || '',
    goals: getOptionalString(body, 'goals', { max: 1500 }) || '',
    preferences: getOptionalString(body, 'preferences', { max: 1000 }) || '',
    language: (body.language === 'ar' ? 'ar' : 'en') as 'en' | 'ar',
  };
  const { resolveGenerationSources } = await import('../services/sourceSelection');
  const uploadIds = await resolveGenerationSources(req, curriculum, body.uploadIds);
  const draft = await generateLessonPlan({ institutionId: curriculum.institutionId, curriculumId: curriculum.id, lessonId, lessonTitle: lesson?.title, ...params, uploadIds });
  const plan = await LessonPlan.create({
    id: `lp-${randomUUID()}`,
    institutionId: curriculum.institutionId,
    curriculumId: curriculum.id,
    lessonId,
    ...params,
    title: draft.title,
    sections: draft.sections.map((s) => ({ ...s, origin: 'ai' })),
    status: 'draft',
    generatedBy: draft.version,
    createdBy: req.user!.id,
  });
  logger.info('lesson_plan_generated', { planId: plan.id, by: req.user!.id });
  res.status(201).json({ plan: plan.toObject(), sources: draft.sources, note: 'AI draft: edit it before using it with students.' });
});

// GET /api/lesson-plans — the caller's plans (admins: ?all=true for the school's).
export const listPlans = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = req.user!.role === 'enara-admin' ? {} : { institutionId: requireInstitutionId(req) };
  if (!(req.user!.role === 'admin' && req.query.all === 'true')) filter.createdBy = req.user!.id;
  filter.status = { $ne: 'archived' };
  const plans = await LessonPlan.find(filter).select('id title curriculumId lessonId status version durationMinutes updatedAt createdBy').sort({ updatedAt: -1 }).limit(100).lean();
  res.json({ plans });
});

export const getPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json((await loadPlan(req, String(req.params.id))).toObject());
});

// PUT /api/lesson-plans/:id { title?, sections?, ... } — edit the working copy.
export const updatePlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const plan = await loadPlan(req, String(req.params.id), true);
  if (plan.status === 'archived') throw new AppError('This plan is archived', 409, 'LESSON_PLAN_ARCHIVED');
  if (body.title !== undefined) plan.title = getRequiredString(body, 'title', { max: 200 });
  if (body.sections !== undefined) plan.sections = await parseSections(body.sections, plan.institutionId, plan.sections);
  if (body.durationMinutes !== undefined) plan.durationMinutes = Math.floor(getOptionalNumber(body, 'durationMinutes', { min: 10, max: 240 }) ?? plan.durationMinutes);
  if (plan.status === 'saved') plan.status = 'draft';
  await plan.save();
  res.json(plan.toObject());
});

// POST /api/lesson-plans/:id/sections/:sectionId/regenerate { instruction?, sections? }
// Returns a replacement section only; the editor decides whether to use it.
export const regeneratePlanSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const plan = await loadPlan(req, String(req.params.id), true);
  await requireLessonAi(plan.institutionId);
  const sections = body.sections !== undefined ? await parseSections(body.sections, plan.institutionId, plan.sections) : plan.sections;
  if (!sections.some((s) => s.id === req.params.sectionId)) throw new AppError('Section not found', 404);
  const section = await regenerateSection({
    institutionId: plan.institutionId,
    curriculumId: plan.curriculumId,
    plan: { title: plan.title, durationMinutes: plan.durationMinutes, learnerLevel: plan.learnerLevel, language: plan.language, objectiveIds: plan.objectiveIds, sections },
    sectionId: String(req.params.sectionId),
    instruction: getOptionalString(body, 'instruction', { max: 1000 }),
  });
  res.json({ section: { ...section, origin: 'ai' } });
});

// POST /api/lesson-plans/:id/save — keep this state as a numbered version.
export const savePlanVersion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = await loadPlan(req, String(req.params.id), true);
  if (!plan.sections.length) throw new AppError('A plan needs at least one section', 400, 'VALIDATION_ERROR');
  plan.version += 1;
  plan.versions.push({ version: plan.version, title: plan.title, sections: plan.sections.map((s) => (typeof (s as any).toObject === 'function' ? (s as any).toObject() : s)), savedAt: new Date(), savedBy: req.user!.id });
  plan.status = 'saved';
  await plan.save();
  logger.info('lesson_plan_saved', { planId: plan.id, version: plan.version, by: req.user!.id });
  res.json(plan.toObject());
});

export const archivePlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = await loadPlan(req, String(req.params.id), true);
  plan.status = 'archived';
  await plan.save();
  res.json({ id: plan.id, status: plan.status });
});

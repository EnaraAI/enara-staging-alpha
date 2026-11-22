// Assessment engine P4: the item bank and the question generator (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6). Switch assessGen. Teachers
// (when their school has the teaching workflow) and admins, within their school; shared items (school null) are read-only.
import { Router, type Response } from 'express';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.middleware';
import { requireFeature } from '../services/featureFlags';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { engineV2 } from '../services/engineV2';
import { isAiConfigured } from '../services/aiJson';
import { ensurePlainObject, rejectMongoOperators } from '../utils/validation';

const router = Router();
const teacherFlag = requireFeature('teaching_workflow_enabled');
router.use(authMiddleware, requireRole('teacher', 'admin', 'enara-admin'), (req, res, next) =>
  (req as AuthRequest).user?.role === 'teacher' ? teacherFlag(req as AuthRequest, res, next) : next(),
);
router.use((_req, _res, next) => (engineV2('assessGen') ? next() : next(new AppError('The question bank is not switched on', 404, 'NOT_FOUND'))));

const school = (req: AuthRequest): string | null => req.user!.institutionId ?? null;
const modelReady = () => isAiConfigured();

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { listBank } = await import('../assessment/generate/bank');
  const q = req.query;
  res.json({ items: await listBank({ schoolId: school(req), status: typeof q.status === 'string' ? q.status : undefined, subject: typeof q.subject === 'string' ? q.subject : undefined, language: typeof q.language === 'string' ? q.language : undefined }) });
}));

router.post('/generate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const { GEN_DOMAINS, GEN_TYPES } = await import('../assessment/generate/generator');
  const domain = String(b.domain) as (typeof GEN_DOMAINS)[number];
  if (!(GEN_DOMAINS as readonly string[]).includes(domain)) throw new AppError(`domain must be one of ${GEN_DOMAINS.join(', ')}`, 400, 'VALIDATION_ERROR');
  const types = (Array.isArray(b.types) ? b.types : [b.types]).map(String).filter((t) => GEN_TYPES[domain].includes(t));
  if (!types.length) throw new AppError(`types for ${domain}: ${GEN_TYPES[domain].join(', ')}`, 400, 'VALIDATION_ERROR');
  if (!['ar', 'en'].includes(String(b.language))) throw new AppError('language must be ar or en', 400, 'VALIDATION_ERROR');
  const objective = String(b.objective_code ?? '').trim();
  if (!objective) throw new AppError('objective_code is required', 400, 'VALIDATION_ERROR');
  if (domain === 'humanities' && types.some((t) => t === 'short_answer' || t === 'essay') && !(typeof b.source_text === 'string' && b.source_text.trim().length >= 40)) throw new AppError('Humanities written answers need a source text', 400, 'VALIDATION_ERROR');
  if (!modelReady()) throw new AppError('The question generator is not available right now', 503, 'AI_UNAVAILABLE');
  const { runGeneration } = await import('../assessment/generate/pipeline');
  const lo = Math.min(5, Math.max(1, Number(b.difficulty_min) || 2)); const hi = Math.min(5, Math.max(lo, Number(b.difficulty_max) || lo + 1));
  const out = await runGeneration({
    domain, language: b.language as 'ar' | 'en', level: String(b.level ?? 'grade 6').slice(0, 40), objective_code: objective.slice(0, 80),
    objective_title: typeof b.objective_title === 'string' ? b.objective_title.slice(0, 200) : undefined, types, count: Math.min(5, Math.max(1, Number(b.count) || 3)),
    difficulty: [lo, hi], source_text: typeof b.source_text === 'string' ? b.source_text.slice(0, 6000) : undefined, kids: b.kids === true,
  }, { institutionId: school(req) ?? undefined, teacherId: req.user!.id, schoolId: school(req) }).catch((e: { code?: string }) => {
    // The model could not be reached (paused, unavailable, over budget, a bad reply twice): nothing was stored.
    if (String(e?.code ?? '').startsWith('AI_')) throw new AppError('The question generator is not available right now', 503, 'AI_UNAVAILABLE');
    throw e;
  });
  res.json({
    created: out.filter((o) => o.stored).map((o) => ({ id: o.stored!.id, version: o.stored!.version, type: o.item.type, stem: o.item.stem, judge: o.judge, regenerated: o.regenerated })),
    refused: out.filter((o) => !o.stored).map((o) => ({ type: o.item.type, stem: o.item.stem, problems: o.problems })),
  });
}));

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const { createTeacherItem } = await import('../assessment/generate/bank');
  const it = ensurePlainObject(b.item ?? b);
  res.status(201).json(await createTeacherItem({
    item: { type: String(it.type), subject: String(it.subject ?? 'language'), language: String(it.language), level: String(it.level ?? 'grade 6'), stem: String(it.stem ?? ''), options: it.options, answer_key: it.answer_key, difficulty: Number(it.difficulty) || 2, objective_code: String(it.objective_code ?? ''), ...(typeof it.source === 'string' ? { source: it.source } : {}), ...(it.flags && typeof it.flags === 'object' ? { flags: it.flags as Record<string, boolean> } : {}) },
    teacherId: req.user!.id, schoolId: school(req), judge: modelReady(),
  }));
}));

router.post('/:id/review', asyncHandler(async (req: AuthRequest, res: Response) => {
  const b = ensurePlainObject(req.body); rejectMongoOperators(b);
  const { reviewItem } = await import('../assessment/generate/bank');
  res.json(await reviewItem({ id: String(req.params.id), decision: String(b.decision), reasonCode: typeof b.reasonCode === 'string' ? b.reasonCode : undefined, edits: b.edits && typeof b.edits === 'object' ? (b.edits as never) : undefined, teacherId: req.user!.id, schoolId: school(req), judge: modelReady() }));
}));

router.get('/:id/question', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { questionFor } = await import('../assessment/generate/bank');
  res.json({ question: await questionFor(String(req.params.id), school(req)) });
}));

export default router;

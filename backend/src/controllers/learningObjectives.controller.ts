import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, scopedFilter } from '../auth/authorization';
import { LearningObjective, type ILearningObjective } from '../models/LearningObjective';
import { findCycle, prerequisiteClosure } from '../services/objectiveGraph';
import { loadCurriculumForStaff, loadObjectiveForStaff, teacherCurriculumIds } from '../services/learningAccess';
import { extractObjectiveDrafts } from '../services/objectiveExtraction';
import {
  ensurePlainObject,
  getOptionalNumber,
  getOptionalString,
  getOptionalStringArray,
  getRequiredId,
  getRequiredString,
  rejectMongoOperators,
} from '../utils/validation';

type Curriculum = Awaited<ReturnType<typeof loadCurriculumForStaff>>;

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const CONTENT_FIELDS = [
  'code',
  'title',
  'description',
  'language',
  'translations',
  'lessonIds',
  'difficultyLevel',
  'prerequisiteObjectiveIds',
  'estimatedLearningMinutes',
  'courseId',
  'subjectId',
] as const;

function toResponse(o: ILearningObjective | Record<string, any>) {
  const plain = typeof (o as any).toObject === 'function' ? (o as any).toObject() : o;
  const { _id, ...rest } = plain;
  return rest;
}

function parseTranslations(raw: unknown) {
  if (raw === undefined) return undefined;
  const t = ensurePlainObject(raw, 'translations');
  const out: Record<string, { title?: string; description?: string }> = {};
  for (const lang of ['en', 'ar'] as const) {
    if (t[lang] === undefined) continue;
    const v = ensurePlainObject(t[lang], `translations.${lang}`);
    out[lang] = {
      title: getOptionalString(v, 'title', { max: 200 }),
      description: getOptionalString(v, 'description', { max: 2000 }),
    };
  }
  return out;
}

// Reads the editable fields present in `body`; checks lessons belong to the curriculum.
function parseFields(body: Record<string, unknown>, curriculum: Curriculum) {
  const out: Partial<Record<(typeof CONTENT_FIELDS)[number], unknown>> = {};
  if (body.code !== undefined) {
    const code = getRequiredString(body, 'code', { max: 40 });
    if (!CODE_PATTERN.test(code)) throw new AppError('code may use letters, digits, ".", "_" and "-"', 400, 'VALIDATION_ERROR');
    out.code = code;
  }
  if (body.title !== undefined) out.title = getRequiredString(body, 'title', { max: 200 });
  if (body.description !== undefined) out.description = getOptionalString(body, 'description', { max: 2000 }) || '';
  if (body.language !== undefined) {
    if (body.language !== 'en' && body.language !== 'ar') throw new AppError('language must be en or ar', 400, 'VALIDATION_ERROR');
    out.language = body.language;
  }
  if (body.translations !== undefined) out.translations = parseTranslations(body.translations);
  if (body.lessonIds !== undefined) {
    const lessonIds = getOptionalStringArray(body, 'lessonIds', { maxItems: 100, maxLength: 128 }) || [];
    const known = new Set(curriculum.chapters.map((c) => c.id));
    if (lessonIds.some((l) => !known.has(l))) throw new AppError('lessonIds must be lessons of this curriculum', 400, 'VALIDATION_ERROR');
    out.lessonIds = [...new Set(lessonIds)];
  }
  if (body.difficultyLevel !== undefined) out.difficultyLevel = getOptionalNumber(body, 'difficultyLevel', { min: 1, max: 5 });
  if (body.estimatedLearningMinutes !== undefined) {
    out.estimatedLearningMinutes = getOptionalNumber(body, 'estimatedLearningMinutes', { min: 1, max: 6000 });
  }
  if (body.prerequisiteObjectiveIds !== undefined) {
    out.prerequisiteObjectiveIds = [
      ...new Set(getOptionalStringArray(body, 'prerequisiteObjectiveIds', { maxItems: 50, maxLength: 128 }) || []),
    ];
  }
  if (body.courseId !== undefined) out.courseId = getOptionalString(body, 'courseId', { max: 128 });
  if (body.subjectId !== undefined) out.subjectId = getOptionalString(body, 'subjectId', { max: 128 });
  return out;
}

// Prerequisites must be live objectives of the same curriculum, and the graph
// must stay acyclic after the change.
async function assertValidPrerequisites(objectiveId: string, curriculum: Curriculum, prerequisiteIds: string[]) {
  if (prerequisiteIds.includes(objectiveId)) throw new AppError('An objective cannot be its own prerequisite', 400, 'VALIDATION_ERROR');
  const siblings = await LearningObjective.find({ institutionId: curriculum.institutionId, curriculumId: curriculum.id })
    .select('id prerequisiteObjectiveIds status')
    .lean();
  const byId = new Map(siblings.map((s) => [s.id, s]));
  for (const pre of prerequisiteIds) {
    const target = byId.get(pre);
    if (!target) throw new AppError('Prerequisites must be objectives of the same curriculum', 400, 'VALIDATION_ERROR');
    if (target.status === 'archived') throw new AppError('An archived objective cannot be a prerequisite', 400, 'VALIDATION_ERROR');
  }
  const nodes = [...byId.values()].map((s) => ({
    id: s.id,
    status: s.status,
    prerequisiteObjectiveIds: s.id === objectiveId ? prerequisiteIds : s.prerequisiteObjectiveIds,
  }));
  if (!byId.has(objectiveId)) nodes.push({ id: objectiveId, status: 'draft', prerequisiteObjectiveIds: prerequisiteIds });
  const cycle = findCycle(nodes);
  if (cycle) {
    const codes = new Map(siblings.map((s) => [s.id, (s as any).code as string]));
    throw new AppError(`Prerequisites would form a cycle: ${cycle.map((id) => codes.get(id) || 'this objective').join(' → ')}`, 400, 'PREREQUISITE_CYCLE');
  }
}

async function assertCodeFree(curriculum: Curriculum, code: string, exceptId?: string) {
  const clash = await LearningObjective.exists({
    institutionId: curriculum.institutionId,
    curriculumId: curriculum.id,
    code,
    ...(exceptId ? { id: { $ne: exceptId } } : {}),
  });
  if (clash) throw new AppError(`Code ${code} is already used in this curriculum`, 409, 'OBJECTIVE_CODE_TAKEN');
}

// GET /api/learning/objectives?curriculumId=&status=
export const listObjectives = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = scopedFilter(req, {});
  const curriculumId = typeof req.query.curriculumId === 'string' ? req.query.curriculumId : undefined;
  if (curriculumId) {
    await loadCurriculumForStaff(req, curriculumId);
    filter.curriculumId = curriculumId;
  } else if (req.user!.role === 'teacher') {
    filter.curriculumId = { $in: await teacherCurriculumIds(req) };
  } else if (!['admin', 'enara-admin'].includes(req.user!.role)) {
    throw new AppError('Staff access required', 403, 'FORBIDDEN');
  }
  if (isGlobalAdmin(req) && typeof req.query.institutionId === 'string') filter.institutionId = req.query.institutionId;
  const status = req.query.status;
  if (status === 'draft' || status === 'approved' || status === 'archived') filter.status = status;
  else filter.status = { $ne: 'archived' };
  const objectives = await LearningObjective.find(filter).sort({ curriculumId: 1, code: 1 }).limit(1000).lean();
  res.json({ objectives: objectives.map(toResponse) });
});

// POST /api/learning/objectives — creates a draft.
export const createObjective = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const curriculum = await loadCurriculumForStaff(req, getRequiredId(body, 'curriculumId'));
  if (body.code === undefined || body.title === undefined) throw new AppError('code and title are required', 400, 'VALIDATION_ERROR');
  const fields = parseFields(body, curriculum);
  await assertCodeFree(curriculum, fields.code as string);
  const id = `obj-${randomUUID()}`;
  await assertValidPrerequisites(id, curriculum, (fields.prerequisiteObjectiveIds as string[]) || []);
  const objective = await LearningObjective.create({
    ...fields,
    id,
    institutionId: curriculum.institutionId,
    curriculumId: curriculum.id,
    status: 'draft',
    origin: 'teacher',
    version: 1,
    createdBy: req.user!.id,
    history: [{ version: 1, changedBy: req.user!.id, changedAt: new Date(), fields: ['created'] }],
  });
  res.status(201).json(toResponse(objective));
});

// GET /api/learning/objectives/:id
export const getObjective = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { objective } = await loadObjectiveForStaff(req, String(req.params.id));
  res.json(toResponse(objective));
});

// PATCH /api/learning/objectives/:id — edit fields, archive, or restore to draft.
// Content changes bump the version and are recorded in history. Approval is a
// separate step (POST .../approve).
export const updateObjective = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { objective, curriculum } = await loadObjectiveForStaff(req, String(req.params.id));
  const fields = parseFields(body, curriculum);
  if (fields.code && fields.code !== objective.code) await assertCodeFree(curriculum, fields.code as string, objective.id);
  if (fields.prerequisiteObjectiveIds) {
    await assertValidPrerequisites(objective.id, curriculum, fields.prerequisiteObjectiveIds as string[]);
  }

  const changed = Object.keys(fields).filter(
    (k) => JSON.stringify((objective as any)[k] ?? null) !== JSON.stringify((fields as any)[k] ?? null),
  );
  let note: string | undefined;
  if (body.status !== undefined) {
    if (body.status === 'archived' && objective.status !== 'archived') {
      // Others depending on it must drop it first, so the graph never points at an archived node.
      const dependants = await LearningObjective.find({
        institutionId: objective.institutionId,
        prerequisiteObjectiveIds: objective.id,
        status: { $ne: 'archived' },
      }).select('code').lean();
      if (dependants.length) {
        throw new AppError(`Remove it as a prerequisite of ${dependants.map((d) => d.code).join(', ')} first`, 409, 'OBJECTIVE_IN_USE');
      }
      objective.status = 'archived';
      changed.push('status');
      note = 'archived';
    } else if (body.status === 'draft' && objective.status === 'archived') {
      objective.status = 'draft';
      changed.push('status');
      note = 'restored';
    } else if (body.status !== objective.status) {
      throw new AppError('Use the approve action to approve; status may be set to archived or back to draft', 400, 'VALIDATION_ERROR');
    }
  }
  if (!changed.length) {
    res.json(toResponse(objective));
    return;
  }

  Object.assign(objective, fields);
  if (changed.some((f) => f !== 'status')) objective.version += 1;
  objective.history.push({ version: objective.version, changedBy: req.user!.id, changedAt: new Date(), fields: changed, note });
  await objective.save();
  res.json(toResponse(objective));
});

// POST /api/learning/objectives/:id/approve — a person confirms the objective.
// Its prerequisites must already be approved.
export const approveObjective = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { objective } = await loadObjectiveForStaff(req, String(req.params.id));
  if (objective.status === 'archived') throw new AppError('Restore the objective before approving it', 409, 'OBJECTIVE_ARCHIVED');
  if (objective.status === 'approved') {
    res.json(toResponse(objective));
    return;
  }
  const pending = await LearningObjective.find({
    id: { $in: objective.prerequisiteObjectiveIds },
    status: { $ne: 'approved' },
  }).select('code').lean();
  if (pending.length) {
    throw new AppError(`Approve its prerequisites first: ${pending.map((p) => p.code).join(', ')}`, 409, 'PREREQUISITES_NOT_APPROVED');
  }
  objective.status = 'approved';
  objective.approvedBy = req.user!.id;
  objective.approvedAt = new Date();
  objective.history.push({ version: objective.version, changedBy: req.user!.id, changedAt: new Date(), fields: ['status'], note: 'approved' });
  await objective.save();
  res.json(toResponse(objective));
});

// GET /api/learning/objectives/:id/prerequisites — all prerequisites, nearest first.
export const getObjectivePrerequisites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { objective } = await loadObjectiveForStaff(req, String(req.params.id));
  const siblings = await LearningObjective.find({
    institutionId: objective.institutionId,
    curriculumId: objective.curriculumId,
    status: { $ne: 'archived' },
  }).lean();
  const byId = new Map(siblings.map((s) => [s.id, s]));
  const closure = prerequisiteClosure(siblings, objective.id);
  res.json({
    objectiveId: objective.id,
    prerequisites: closure.map((p) => ({ depth: p.depth, objective: toResponse(byId.get(p.id)!) })),
  });
});

// POST /api/learning/objectives/extract { curriculumId, lessonIds?, language? }
// AI proposes objectives and prerequisites as drafts for a person to review.
// Codes already used in the curriculum are skipped, so approved objectives are
// never overwritten.
export const extractObjectives = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const curriculum = await loadCurriculumForStaff(req, getRequiredId(body, 'curriculumId'));
  const lessonIds = getOptionalStringArray(body, 'lessonIds', { maxItems: 100, maxLength: 128 });
  const language = body.language === 'ar' ? 'ar' : 'en';
  const result = await extractObjectiveDrafts({ curriculum, lessonIds, language, userId: req.user!.id });
  res.status(201).json(result);
});

// Questions that can be linked to an objective: those in assessments of the
// objective's curriculum (or untagged-curriculum assessments of the school).
async function candidateAssessments(objective: ILearningObjective) {
  const { Assessment } = await import('../models/Assessment');
  return Assessment.find({
    institutionId: objective.institutionId,
    $or: [{ curriculumId: objective.curriculumId }, { curriculumId: { $in: [null, ''] } }],
  })
    .select('id title subject curriculumId questions.id questions.text questions.topic questions.objectiveIds questions.difficulty')
    .sort({ createdAt: -1 })
    .limit(200);
}

// GET /api/learning/objectives/:id/questions
export const listObjectiveQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { objective } = await loadObjectiveForStaff(req, String(req.params.id));
  const assessments = await candidateAssessments(objective);
  res.json({
    objectiveId: objective.id,
    assessments: assessments.map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      questions: a.questions.map((q) => ({
        id: q.id,
        text: q.text.slice(0, 300),
        topic: q.topic,
        difficulty: q.difficulty,
        linked: (q.objectiveIds || []).includes(objective.id),
      })),
    })),
  });
});

// PUT /api/learning/objectives/:id/questions { links: [{ assessmentId, questionId }] }
// Sets exactly which questions give evidence for this objective. The link also
// applies to answers already given to those questions (same question, so the
// source record supports it); unlinking invalidates the evidence it produced.
export const setObjectiveQuestions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { objective } = await loadObjectiveForStaff(req, String(req.params.id));
  if (objective.status === 'archived') throw new AppError('Restore the objective before linking questions', 409, 'OBJECTIVE_ARCHIVED');
  if (!Array.isArray(body.links) || body.links.length > 500) throw new AppError('links must be an array (max 500)', 400, 'VALIDATION_ERROR');
  const wanted = new Set(
    body.links.map((l: unknown) => {
      const link = ensurePlainObject(l, 'link');
      return `${getRequiredString(link, 'assessmentId', { max: 128 })}::${getRequiredString(link, 'questionId', { max: 128 })}`;
    }),
  );
  const assessments = await candidateAssessments(objective);
  const known = new Set(assessments.flatMap((a) => a.questions.map((q) => `${a.id}::${q.id}`)));
  for (const w of wanted) if (!known.has(w)) throw new AppError(`Unknown question ${w.replace('::', '/')}`, 400, 'VALIDATION_ERROR');

  const added: [string, string][] = [];
  const removed: [string, string][] = [];
  for (const a of assessments) {
    for (const q of a.questions) {
      const key = `${a.id}::${q.id}`;
      const has = (q.objectiveIds || []).includes(objective.id);
      if (wanted.has(key) && !has) added.push([a.id, q.id]);
      else if (!wanted.has(key) && has) removed.push([a.id, q.id]);
    }
  }
  // Update only the tag on each question: the assessments above were loaded
  // with a projection, so they must never be saved whole.
  const { Assessment } = await import('../models/Assessment');
  for (const [assessmentId, questionId] of added) {
    await Assessment.updateOne(
      { id: assessmentId, institutionId: objective.institutionId },
      { $addToSet: { 'questions.$[q].objectiveIds': objective.id } },
      { arrayFilters: [{ 'q.id': questionId }] },
    );
  }
  for (const [assessmentId, questionId] of removed) {
    await Assessment.updateOne(
      { id: assessmentId, institutionId: objective.institutionId },
      { $pull: { 'questions.$[q].objectiveIds': objective.id } },
      { arrayFilters: [{ 'q.id': questionId }] },
    );
  }
  const { relinkQuestionEvents } = await import('../services/objectiveLinks');
  const effect = await relinkQuestionEvents(objective.id, added, removed, req.user!.id, objective.institutionId);
  res.json({ objectiveId: objective.id, linked: added.length, unlinked: removed.length, ...effect });
});

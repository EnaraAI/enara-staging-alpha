import { MISCONCEPTION_CATEGORIES } from '../services/misconceptionTaxonomy';
import { assertObjectivesUsable } from '../services/learningAccess';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { Assessment, AssessmentVersion } from '../models/Assessment';
import { Assignment } from '../models/Assignment';
import { teacherCurriculumIds } from '../services/learningAccess';
import { getVersion, publishAssessment, publishProblems, questionPoints } from '../services/assessmentVersions';
import { stripAnswersForStudent } from '../services/assessmentSecurity';
import { logger } from '../utils/logging';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Student } from '../models/Student';
import { generateAssessmentId } from '../utils/idGenerator';
import { resolveWriteInstitutionId, scopedFilter } from '../auth/authorization';
import {
  ensurePlainObject,
  escapeRegex,
  getOptionalId,
  getOptionalNumber,
  getOptionalString,
  getOptionalStringArray,
  getPagination,
  getRequiredString,
  rejectMongoOperators,
} from '../utils/validation';

const ASSESSMENT_STATUSES = ['upcoming', 'active', 'completed', 'pending', 'in-progress'] as const;
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
const ANSWER_REVEAL = ['after-submit', 'after-close', 'never'] as const;
const QUESTION_TYPES = ['multiple-choice', 'true-false', 'short-answer', 'open-response'] as const;
const LIFECYCLES = ['draft', 'published'] as const;

// Teachers see and edit assessments they wrote or that belong to a curriculum
// they teach; admins see their school's; Enara admins all.
async function teacherFilter(req: AuthRequest): Promise<Record<string, unknown>> {
  if (req.user?.role !== 'teacher') return {};
  return { $or: [{ createdBy: req.user.id }, { curriculumId: { $in: await teacherCurriculumIds(req) } }] };
}

async function loadAssessment(req: AuthRequest, id: string) {
  const assessment = await Assessment.findOne({ ...scopedFilter(req, { id }), ...(await teacherFilter(req)) });
  if (!assessment) throw new AppError('Assessment not found', 404);
  return assessment;
}

// Source references by passage id only; names and pages are filled in from
// the stored passages (verifyQuestionSources), so they can't be made up.
function parseSourceRefs(raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return raw.slice(0, 6).map((r) => ({ chunkId: String((r as { chunkId?: unknown })?.chunkId ?? '').slice(0, 80), fileName: '', page: null as number | null }));
}

async function verifyQuestionSources<T extends { sources?: { chunkId: string; fileName: string; page?: number | null }[] }>(questions: T[], institutionId?: string) {
  const ids = [...new Set(questions.flatMap((q) => (q.sources || []).map((s) => s.chunkId)))];
  if (!ids.length) return questions;
  const { CurriculumChunk } = await import('../models/CurriculumChunk');
  const found = new Map((await CurriculumChunk.find({ id: { $in: ids }, institutionId }).select('id fileName page uploadId sectionLabel').lean()).map((c) => [c.id, c]));
  return questions.map((q) => {
    const sources = (q.sources || []).filter((s) => found.has(s.chunkId)).map((s) => { const c = found.get(s.chunkId)!; return { chunkId: s.chunkId, fileName: c.fileName, page: c.page ?? null, ...(c.uploadId ? { uploadId: c.uploadId } : {}), ...(c.sectionLabel ? { section: c.sectionLabel } : {}) }; });
    return { ...q, sources: sources.length ? sources : undefined };
  });
}

function parseRubric(raw: unknown, label: string) {
  const rubric = ensurePlainObject(raw, `${label}.rubric`);
  if (!Array.isArray(rubric.criteria) || !rubric.criteria.length || rubric.criteria.length > 12) {
    throw new AppError(`${label}: a rubric needs 1 to 12 criteria`, 400, 'VALIDATION_ERROR');
  }
  return {
    criteria: rubric.criteria.map((c, ci) => {
      const item = ensurePlainObject(c, `${label}.rubric.criteria[${ci}]`);
      if (!Array.isArray(item.levels) || !item.levels.length || item.levels.length > 8) {
        throw new AppError(`${label}: each criterion needs 1 to 8 levels`, 400, 'VALIDATION_ERROR');
      }
      const levels = item.levels.map((l, li) => {
        const level = ensurePlainObject(l, `${label}.levels[${li}]`);
        const points = getOptionalNumber(level, 'points', { min: 0, max: 100 });
        if (points === undefined) throw new AppError(`${label}: every level needs points`, 400, 'VALIDATION_ERROR');
        return {
          id: getRequiredString(level, 'id', { max: 80 }),
          label: getRequiredString(level, 'label', { max: 120 }),
          points,
          description: getOptionalString(level, 'description', { max: 1000 }),
        };
      });
      const maxPoints = Math.max(...levels.map((l) => l.points));
      return {
        id: getRequiredString(item, 'id', { max: 80 }),
        title: getRequiredString(item, 'title', { max: 200 }),
        description: getOptionalString(item, 'description', { max: 1000 }),
        maxPoints,
        levels,
        objectiveIds: item.objectiveIds === undefined ? undefined : [...new Set(getOptionalStringArray(item, 'objectiveIds', { maxItems: 10, maxLength: 128 }) || [])],
      };
    }),
  };
}

function requireEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
  fallback?: T[number]
): T[number] {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new AppError(`${field} is required`, 400, 'VALIDATION_ERROR');
  }
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new AppError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value as T[number];
}

// Wrong options tagged with the misconception they signal.
function parseDistractors(q: Record<string, unknown>, options: string[]) {
  if (q.distractors === undefined) return undefined;
  if (!Array.isArray(q.distractors) || q.distractors.length > 20) throw new AppError('distractors must be an array', 400, 'VALIDATION_ERROR');
  return q.distractors.map((d) => {
    const item = ensurePlainObject(d, 'distractor');
    const option = getRequiredString(item, 'option', { max: 1000 });
    if (!options.includes(option)) throw new AppError('A distractor must be one of the options', 400, 'VALIDATION_ERROR');
    if (String(q.correctAnswer) === option) throw new AppError('The correct answer cannot be a distractor', 400, 'VALIDATION_ERROR');
    const category = requireEnum(item.category, MISCONCEPTION_CATEGORIES, 'distractor.category', 'unknown');
    return { option, category, description: getRequiredString(item, 'description', { max: 500 }) };
  });
}

function normalizeQuestions(raw: unknown) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 200) {
    throw new AppError('questions must be an array with at most 200 items', 400, 'VALIDATION_ERROR');
  }
  return raw.map((item, index) => {
    const q = ensurePlainObject(item, `questions[${index}]`);
    const optionsRaw = q.options;
    if (optionsRaw !== undefined && (!Array.isArray(optionsRaw) || optionsRaw.length > 20)) {
      throw new AppError('Question options are invalid', 400, 'VALIDATION_ERROR');
    }
    const type = requireEnum(q.type, QUESTION_TYPES, 'question.type');
    const correctAnswer = q.correctAnswer;
    if (type === 'open-response') {
      return {
        id: getRequiredString(q, 'id', { max: 80 }),
        type,
        text: getRequiredString(q, 'text', { max: 4000 }),
        topic: getOptionalString(q, 'topic', { max: 160 }),
        explanation: getOptionalString(q, 'explanation', { max: 4000 }) || '',
        modelAnswer: getOptionalString(q, 'modelAnswer', { max: 4000 }),
        rubric: parseRubric(q.rubric, `questions[${index}]`),
        objectiveIds: q.objectiveIds === undefined ? undefined : [...new Set(getOptionalStringArray(q, 'objectiveIds', { maxItems: 10, maxLength: 128 }) || [])],
        difficulty: getOptionalNumber(q, 'difficulty', { min: 1, max: 5 }),
        source: q.source === 'ai' ? ('ai' as const) : ('manual' as const),
        sources: parseSourceRefs(q.sources),
        // Kept until the teacher corrects or accepts the question (P4.1).
        ...(q.sourceStatus === 'no_supporting_source' ? { sourceStatus: 'no_supporting_source' as const } : {}),
      };
    }
    if (
      correctAnswer === undefined ||
      correctAnswer === null ||
      (typeof correctAnswer !== 'string' && typeof correctAnswer !== 'number') ||
      String(correctAnswer).trim().length === 0 ||
      String(correctAnswer).length > 4000
    ) {
      throw new AppError('Question correctAnswer is invalid', 400, 'VALIDATION_ERROR');
    }
    return {
      id: getRequiredString(q, 'id', { max: 80 }),
      type,
      text: getRequiredString(q, 'text', { max: 4000 }),
      topic: getOptionalString(q, 'topic', { max: 160 }),
      options: Array.isArray(optionsRaw)
        ? optionsRaw.map((option) => {
            if (typeof option !== 'string' || option.length > 1000) {
              throw new AppError('Question option is invalid', 400, 'VALIDATION_ERROR');
            }
            return option;
          })
        : undefined,
      correctAnswer,
      explanation: getOptionalString(q, 'explanation', { max: 4000 }) || '',
      modelAnswer: getOptionalString(q, 'modelAnswer', { max: 4000 }),
      objectiveIds: q.objectiveIds === undefined ? undefined : [...new Set(getOptionalStringArray(q, 'objectiveIds', { maxItems: 10, maxLength: 128 }) || [])],
      difficulty: getOptionalNumber(q, 'difficulty', { min: 1, max: 5 }),
      distractors: parseDistractors(q, Array.isArray(optionsRaw) ? (optionsRaw as string[]) : []),
      points: getOptionalNumber(q, 'points', { min: 0, max: 100 }),
      source: q.source === 'ai' ? ('ai' as const) : ('manual' as const),
      sources: parseSourceRefs(q.sources),
      ...(q.sourceStatus === 'no_supporting_source' ? { sourceStatus: 'no_supporting_source' as const } : {}),
    };
  });
}

export const listAssessments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { batchId, status, search, lifecycle } = req.query;
  const filter: Record<string, unknown> = { ...scopedFilter(req, {}), ...(await teacherFilter(req)) };
  if (typeof lifecycle === 'string' && ['draft', 'published', 'archived'].includes(lifecycle)) filter.lifecycle = lifecycle;
  const { limit, skip } = getPagination(req.query);
  if (batchId) filter.batchId = batchId;
  if (status && status !== 'all') filter.status = status;

  if (search) {
    const s = escapeRegex(String(search).slice(0, 80));
    filter.$and = [...((filter.$and as unknown[]) || []), { $or: [
      { title: { $regex: s, $options: 'i' } },
      { subject: { $regex: s, $options: 'i' } },
      { id: { $regex: s, $options: 'i' } },
    ] }];
  }

  const assessments = await Assessment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
  res.json(assessments.map((a) => toPlainObject(a)));
});

/**
 * GET /api/assessments/:id/attempts — who the assessment is assigned to,
 * who has submitted, their latest scores and answers, and per-question correct rates.
 */
export const getAssessmentAttempts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));

  const institutionFilter = assessment.institutionId ? { institutionId: assessment.institutionId } : {};
  const attempts = await AssessmentAttempt.find({ ...institutionFilter, assessmentId: assessment.id })
    .sort({ startedAt: -1 })
    .lean();

  const assignedTo: Record<string, unknown>[] = [];
  if (assessment.batchId) assignedTo.push({ batchId: assessment.batchId });
  if (assessment.studentId) assignedTo.push({ id: assessment.studentId });
  const attemptedIds = [...new Set(attempts.map((a) => a.studentId))];
  if (attemptedIds.length) assignedTo.push({ id: { $in: attemptedIds } });
  const students = assignedTo.length
    ? await Student.find({ ...institutionFilter, $or: assignedTo }).select('id name email batchId').lean()
    : [];

  // Attempts are sorted newest first, so the first match is the latest one.
  const rows = students.map((student) => {
    const own = attempts.filter((a) => a.studentId === student.id);
    const submitted = own.find((a) => a.status === 'submitted');
    const inProgress = own.find((a) => a.status === 'in-progress');
    const latest = submitted || inProgress;
    return {
      studentId: student.id,
      name: student.name,
      email: student.email,
      batchId: student.batchId,
      status: submitted ? 'submitted' : inProgress ? 'in-progress' : 'not-started',
      attemptId: latest?.id,
      score: submitted?.score ?? null,
      startedAt: latest?.startedAt ?? null,
      submittedAt: submitted?.submittedAt ?? null,
      timeSpentSec: submitted?.timeSpentSec ?? null,
      attemptCount: own.length,
      answers: submitted?.answers ?? [],
    };
  });

  const submittedRows = rows.filter((r) => r.status === 'submitted' && typeof r.score === 'number');
  const scores = submittedRows.map((r) => r.score as number);

  // Per-question correct rate across each student's latest submitted attempt.
  const latestSubmitted = submittedRows
    .map((r) => attempts.find((a) => a.id === r.attemptId))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const questions = assessment.questions.map((q) => {
    const answers = latestSubmitted
      .map((a) => a.answers.find((ans) => ans.questionId === q.id))
      .filter((ans): ans is NonNullable<typeof ans> => !!ans);
    const correct = answers.filter((ans) => ans.isCorrect).length;
    return {
      questionId: q.id,
      text: q.text,
      topic: q.topic,
      answered: answers.length,
      correct,
      correctRate: answers.length ? Math.round((correct / answers.length) * 100) : null,
    };
  });

  res.json({
    assessment: {
      id: assessment.id,
      title: assessment.title,
      subject: assessment.subject,
      status: assessment.status,
      dueDate: assessment.dueDate,
      batchId: assessment.batchId,
      studentId: assessment.studentId,
    },
    summary: {
      assigned: rows.length,
      submitted: submittedRows.length,
      inProgress: rows.filter((r) => r.status === 'in-progress').length,
      notStarted: rows.filter((r) => r.status === 'not-started').length,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      highestScore: scores.length ? Math.max(...scores) : null,
      lowestScore: scores.length ? Math.min(...scores) : null,
    },
    students: rows.sort((a, b) => a.name.localeCompare(b.name)),
    questions,
  });
});

export const getAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  res.json({ ...(toPlainObject(assessment) as object), totalPoints: assessment.questions.reduce((n, q) => n + questionPoints(q), 0), publishProblems: publishProblems(assessment) });
});

export const createAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const title = getRequiredString(body, 'title', { max: 160 });
  const subject = getRequiredString(body, 'subject', { max: 120 });
  const duration = getOptionalNumber(body, 'duration', { min: 1, max: 600 }) ?? 30;
  const status = requireEnum(body.status, ASSESSMENT_STATUSES, 'status', 'upcoming');
  const dueDate = getOptionalString(body, 'dueDate', { max: 80 }) || '';
  const difficulty = requireEnum(body.difficulty, DIFFICULTIES, 'difficulty', 'Medium');
  const curriculumId = getOptionalId(body, 'curriculumId');
  const batchId = getOptionalId(body, 'batchId');
  const studentId = getOptionalId(body, 'studentId');
  const instructions = getOptionalString(body, 'instructions', { max: 4000 });
  const maxAttempts = getOptionalNumber(body, 'maxAttempts', { min: 1, max: 10 }) ?? 1;
  const answerReveal = requireEnum(body.answerReveal, ANSWER_REVEAL, 'answerReveal', 'after-submit');
  const institutionId = resolveWriteInstitutionId(
    req,
    getOptionalId(body, 'institutionId') || getOptionalId(body, 'schoolId')
  );
  const lifecycle = requireEnum(body.lifecycle, LIFECYCLES, 'lifecycle', 'published');
  const questions = await verifyQuestionSources(normalizeQuestions(body.questions), institutionId);
  if (req.user!.role === 'teacher') {
    // Teachers write for curricula they teach and give work through assignments.
    if (!curriculumId || !(await teacherCurriculumIds(req)).includes(curriculumId)) {
      throw new AppError('Choose a curriculum you teach', 403, 'FORBIDDEN');
    }
    if (batchId || studentId) throw new AppError('Teachers give assessments to classes through assignments', 403, 'FORBIDDEN');
  }

  await assertObjectivesUsable(questions.flatMap((q) => q.objectiveIds || []), institutionId);
  await assertObjectivesUsable(questions.flatMap((q) => ('rubric' in q && q.rubric ? q.rubric.criteria.flatMap((c) => c.objectiveIds || []) : [])), institutionId);

  const assessment = await Assessment.create({
    id: generateAssessmentId(),
    institutionId,
    title,
    subject,
    duration,
    questions,
    status,
    dueDate,
    difficulty,
    curriculumId,
    batchId,
    studentId,
    instructions,
    maxAttempts: Math.floor(maxAttempts),
    answerReveal,
    lifecycle: 'draft',
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
    language: getOptionalString(body, 'language', { max: 10 }),
  });
  // Created as published (the default, as before): publish version 1 now.
  // If it isn't complete enough to version yet, it behaves as before
  // (students get the document itself) and the problems are returned.
  let problems: string[] = [];
  if (lifecycle === 'published') {
    problems = publishProblems(assessment);
    if (problems.length) {
      assessment.lifecycle = 'published';
      await assessment.save();
    } else {
      await publishAssessment(assessment, req.user!.id);
    }
  }

  res.status(201).json({ ...(toPlainObject(assessment) as object), publishProblems: problems });
});

export const updateAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const assessment = await loadAssessment(req, String(req.params.id));
  if (assessment.lifecycle === 'archived') throw new AppError('Restore the assessment before editing it', 409, 'ASSESSMENT_ARCHIVED');
  if (req.user!.role === 'teacher' && (body.batchId || body.studentId)) {
    throw new AppError('Teachers give assessments to classes through assignments', 403, 'FORBIDDEN');
  }
  const contentFields = ['title', 'subject', 'duration', 'questions', 'instructions'];
  const contentChanged = contentFields.some((f) => body[f] !== undefined);

  if (body.title !== undefined) assessment.title = getRequiredString(body, 'title', { max: 160 });
  if (body.subject !== undefined) assessment.subject = getRequiredString(body, 'subject', { max: 120 });
  if (body.duration !== undefined) assessment.duration = getOptionalNumber(body, 'duration', { min: 1, max: 600 }) ?? assessment.duration;
  if (body.questions !== undefined) {
    const questions = await verifyQuestionSources(normalizeQuestions(body.questions), assessment.institutionId);
    await assertObjectivesUsable(questions.flatMap((q) => q.objectiveIds || []), assessment.institutionId);
    assessment.questions = questions;
  }
  if (body.status !== undefined) assessment.status = requireEnum(body.status, ASSESSMENT_STATUSES, 'status');
  if (body.dueDate !== undefined) assessment.dueDate = getOptionalString(body, 'dueDate', { max: 80 }) || '';
  if (body.difficulty !== undefined) assessment.difficulty = requireEnum(body.difficulty, DIFFICULTIES, 'difficulty');
  if (body.maxAttempts !== undefined) assessment.maxAttempts = Math.floor(getOptionalNumber(body, 'maxAttempts', { min: 1, max: 10 }) ?? assessment.maxAttempts);
  if (body.answerReveal !== undefined) assessment.answerReveal = requireEnum(body.answerReveal, ANSWER_REVEAL, 'answerReveal');
  if (body.curriculumId !== undefined) assessment.curriculumId = getOptionalId(body, 'curriculumId');
  if (body.batchId !== undefined) assessment.batchId = getOptionalId(body, 'batchId');
  if (body.studentId !== undefined) assessment.studentId = getOptionalId(body, 'studentId');
  if (body.instructions !== undefined) assessment.instructions = getOptionalString(body, 'instructions', { max: 4000 });
  if (body.language !== undefined) assessment.language = getOptionalString(body, 'language', { max: 10 });
  assessment.updatedBy = req.user!.id;
  if (contentChanged) assessment.hasUnpublishedChanges = true;
  await assessment.save();

  // Editing a published assessment publishes the edit as a new version
  // (earlier versions and the attempts on them stay as they were). If the
  // edit can't be published yet, it stays unpublished and the problems are returned.
  let problems: string[] = [];
  if (contentChanged && assessment.lifecycle === 'published') {
    problems = publishProblems(assessment);
    if (!problems.length) await publishAssessment(assessment, req.user!.id);
  }
  res.json({ ...(toPlainObject(assessment) as object), publishProblems: problems });
});

export const deleteAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  // Work students have done is kept: an assessment with attempts or
  // assignments can only be archived.
  const [attempts, assignments] = await Promise.all([
    AssessmentAttempt.countDocuments({ assessmentId: assessment.id }),
    Assignment.countDocuments({ assessmentId: assessment.id }),
  ]);
  if (attempts || assignments) throw new AppError('This assessment has student work or assignments; archive it instead', 409, 'ASSESSMENT_IN_USE');
  await Promise.all([Assessment.deleteOne({ id: assessment.id }), AssessmentVersion.deleteMany({ assessmentId: assessment.id })]);
  res.json({ message: 'Assessment deleted' });
});

// POST /api/assessments/:id/publish — validate and publish the next version.
export const publishAssessmentHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  // Source-linked drafts: questions with no supporting source must be
  // corrected (or explicitly accepted) before publishing.
  const unsourced = assessment.questions.filter((q) => q.sourceStatus === 'no_supporting_source');
  if (unsourced.length && req.body?.acknowledgeUnsourced !== true) {
    throw new AppError(`${unsourced.length} question(s) have no supporting source. Correct them, or confirm you accept them without a source.`, 409, 'UNSOURCED_QUESTIONS');
  }
  const version = await publishAssessment(assessment, req.user!.id);
  logger.info('assessment_published', { assessmentId: assessment.id, version: version?.version, by: req.user!.id });
  res.json({ assessment: toPlainObject(assessment), version });
});

// POST /api/assessments/:id/validate — what would stop publishing.
export const validateAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  const problems = publishProblems(assessment);
  res.json({ valid: !problems.length, problems, totalPoints: assessment.questions.reduce((n, q) => n + questionPoints(q), 0) });
});

// GET /api/assessments/:id/preview — the working copy as a student would see it.
export const previewAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  res.json(stripAnswersForStudent(assessment));
});

// POST /api/assessments/:id/archive and /restore.
export const archiveAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  assessment.lifecycle = 'archived';
  assessment.updatedBy = req.user!.id;
  await assessment.save();
  res.json(toPlainObject(assessment));
});
export const restoreAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  if (assessment.lifecycle !== 'archived') throw new AppError('Assessment is not archived', 409, 'NOT_ARCHIVED');
  assessment.lifecycle = assessment.publishedVersion > 0 ? 'published' : 'draft';
  assessment.updatedBy = req.user!.id;
  await assessment.save();
  res.json(toPlainObject(assessment));
});

// POST /api/assessments/:id/duplicate — a new draft copy (no targeting).
export const duplicateAssessment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const source = await loadAssessment(req, String(req.params.id));
  const plain = toPlainObject(source) as Record<string, unknown>;
  const copy = await Assessment.create({
    id: generateAssessmentId(),
    institutionId: source.institutionId,
    title: `${source.title} (copy)`.slice(0, 160),
    subject: source.subject,
    duration: source.duration,
    questions: plain.questions,
    status: 'upcoming',
    difficulty: source.difficulty,
    curriculumId: source.curriculumId,
    instructions: source.instructions,
    maxAttempts: source.maxAttempts,
    answerReveal: source.answerReveal,
    language: source.language,
    lifecycle: 'draft',
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
  });
  res.status(201).json(toPlainObject(copy));
});

// GET /api/assessments/:id/versions and /versions/:version.
export const listAssessmentVersions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  const versions = await AssessmentVersion.find({ assessmentId: assessment.id }).select('-questions').sort({ version: -1 }).lean();
  res.json({ versions });
});
export const getAssessmentVersion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const assessment = await loadAssessment(req, String(req.params.id));
  res.json(await getVersion(assessment.id, Number(req.params.version)));
});


const COUNT_TYPES = ['multiple-choice', 'true-false', 'short-answer', 'open-response'] as const;

async function requireAuthoringAi(req: AuthRequest, institutionId?: string) {
  const { isFeatureEnabled } = await import('../services/featureFlags');
  if (!(await isFeatureEnabled(institutionId, 'ai_assessment_authoring_enabled'))) {
    throw new AppError('AI assessment drafts are not enabled for your school', 404, 'FEATURE_DISABLED');
  }
}

// POST /api/assessments/generate — an AI draft (never published) for a
// curriculum the caller works with.
export const generateAssessmentDraftHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const { loadCurriculumForStaff } = await import('../services/learningAccess');
  const curriculum = await loadCurriculumForStaff(req, getRequiredString(body, 'curriculumId', { max: 128 }));
  await requireAuthoringAi(req, curriculum.institutionId);
  const countsRaw = ensurePlainObject(body.counts ?? { 'multiple-choice': 5 }, 'counts');
  const counts = Object.fromEntries(COUNT_TYPES.map((t) => [t, Math.floor(getOptionalNumber(countsRaw, t, { min: 0, max: 20 }) ?? 0)])) as Record<(typeof COUNT_TYPES)[number], number>;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 1 || total > 20) throw new AppError('Ask for 1 to 20 questions', 400, 'VALIDATION_ERROR');
  // P4.1: chosen documents narrow the sources; checked before any AI call.
  const { resolveGenerationSources } = await import('../services/sourceSelection');
  const uploadIds = await resolveGenerationSources(req, curriculum, body.uploadIds);
  const { generateAssessmentDraft } = await import('../services/educatorAi');
  const draft = await generateAssessmentDraft({
    uploadIds,
    institutionId: curriculum.institutionId,
    curriculumId: curriculum.id,
    courseName: curriculum.courseName,
    lessonId: getOptionalString(body, 'lessonId', { max: 128 }),
    objectiveIds: getOptionalStringArray(body, 'objectiveIds', { maxItems: 10, maxLength: 128 }) || [],
    brief: getOptionalString(body, 'brief', { max: 2000 }) || '',
    language: body.language === 'ar' ? 'ar' : 'en',
    difficulty: requireEnum(body.difficulty, DIFFICULTIES, 'difficulty', 'Medium'),
    counts,
    allowOpen: true,
  });
  const assessment = await Assessment.create({
    id: generateAssessmentId(),
    institutionId: curriculum.institutionId,
    title: getOptionalString(body, 'title', { max: 160 }) || draft.title || 'AI draft',
    subject: curriculum.courseName || 'General',
    questions: draft.questions,
    status: 'upcoming',
    difficulty: requireEnum(body.difficulty, DIFFICULTIES, 'difficulty', 'Medium'),
    curriculumId: curriculum.id,
    lifecycle: 'draft',
    createdBy: req.user!.id,
    updatedBy: req.user!.id,
    language: body.language === 'ar' ? 'ar' : 'en',
  });
  logger.info('assessment_generated', { assessmentId: assessment.id, questions: draft.questions.length, by: req.user!.id, version: draft.version });
  res.status(201).json({ assessment: toPlainObject(assessment), sources: draft.sources, note: 'AI draft: check every question, answer and rubric before publishing.' });
});

// POST /api/assessments/:id/questions/:questionId/regenerate { instruction?, question? }
// Returns a replacement for one question; nothing is saved, so the
// teacher's other edits stay as they are.
export const regenerateQuestionHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const assessment = await loadAssessment(req, String(req.params.id));
  await requireAuthoringAi(req, assessment.institutionId);
  const current = (body.question && typeof body.question === 'object' ? body.question : assessment.questions.find((q) => q.id === req.params.questionId)) as { type?: string; text?: string; objectiveIds?: string[] } | undefined;
  if (!current?.type) throw new AppError('Question not found', 404);
  const { regenerateQuestion } = await import('../services/educatorAi');
  const question = await regenerateQuestion({
    institutionId: assessment.institutionId,
    curriculumId: assessment.curriculumId,
    question: { type: String(current.type), text: String(current.text ?? '').slice(0, 4000), objectiveIds: Array.isArray(current.objectiveIds) ? current.objectiveIds.slice(0, 10) : [] },
    instruction: getOptionalString(body, 'instruction', { max: 1000 }),
    language: assessment.language === 'ar' ? 'ar' : 'en',
    objectiveIds: Array.isArray(current.objectiveIds) ? current.objectiveIds.slice(0, 10) : [],
    allowOpen: true,
  });
  res.json({ question: { ...question, id: String(req.params.questionId) } });
});

import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireInstitutionId } from '../auth/authorization';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { Assignment, type IAssignment } from '../models/Assignment';
import { CourseInstance } from '../models/CourseInstance';
import { Student } from '../models/Student';
import { classStudentIds, loadClassForStaff } from '../services/learningAccess';
import { getVersion } from '../services/assessmentVersions';
import { assignmentStatus, dueFor, studentStatus } from '../services/assignments';
import { notifyAssignmentPublished } from '../services/teachingNotifications';
import { ensurePlainObject, getOptionalNumber, getOptionalString, getOptionalStringArray, getRequiredId, getRequiredString, rejectMongoOperators } from '../utils/validation';
import { logger } from '../utils/logging';
import { CONVERSATION_QUESTION_TYPES } from '../services/conversationExam';
import { isFeatureEnabled } from '../services/featureFlags';
import { checkSpeakingQuestions, parseSpeakingSettings } from '../services/speakingExam';

// Speaking exams (P4) need the school's speaking_exams_enabled flag; the
// avatar-only and student-choice policies also need the avatar option, which
// is not available yet.
async function speakingFor(institutionId: string, raw: unknown, members: string[]) {
  if (!(await isFeatureEnabled(institutionId, 'speaking_exams_enabled'))) throw new AppError('Speaking exams are not enabled for this school', 403, 'FEATURE_DISABLED');
  const settings = parseSpeakingSettings(raw, members);
  if (settings.deliveryPolicy !== 'voice_only') {
    const { avatarExamAvailable } = await import('../services/speakingExam');
    const avatar = await avatarExamAvailable(institutionId);
    if (!avatar.available) throw new AppError(`${avatar.reason} Use voice only.`, 409, 'AVATAR_EXAMS_UNAVAILABLE');
  }
  return settings;
}

const LATE = ['not_accepted', 'accept_late'] as const;
const RELEASE = ['auto', 'manual'] as const;
const REVEAL = ['after-submit', 'after-close', 'never'] as const;
const TUTOR = ['allowed', 'hints_only', 'blocked'] as const;
const FORMAT = ['written', 'conversation', 'english_conversation'] as const;

// A conversation exam can only ask questions that are answered in words.
async function checkFormat(format: (typeof FORMAT)[number], assessmentId: string, version: number) {
  if (format === 'english_conversation') return checkSpeakingQuestions((await getVersion(assessmentId, version)).questions as never);
  if (format !== 'conversation') return;
  const v = await getVersion(assessmentId, version);
  const bad = (v.questions as { type: string }[]).filter((q) => !CONVERSATION_QUESTION_TYPES.includes(q.type));
  if (bad.length) throw new AppError('A conversation exam can only have open-response and short-answer questions', 400, 'VALIDATION_ERROR');
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) throw new AppError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  return value as T[number];
}

function parseDate(value: unknown, field: string, required = false): Date | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`${field} is required`, 400, 'VALIDATION_ERROR');
    return undefined;
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new AppError(`${field} must be a date and time`, 400, 'VALIDATION_ERROR');
  return d;
}

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    throw new AppError('timeZone is not a valid IANA time zone', 400, 'VALIDATION_ERROR');
  }
}

function checkDates(a: Pick<IAssignment, 'opensAt' | 'dueAt' | 'closesAt'>) {
  if (a.dueAt <= a.opensAt) throw new AppError('The due date must be after the opening date', 400, 'VALIDATION_ERROR');
  if (a.closesAt && a.closesAt < a.dueAt) throw new AppError('Late work can only be accepted after the due date', 400, 'VALIDATION_ERROR');
}

// The assignment if the caller may manage it: teachers for classes they
// instruct, admins for their school, Enara admins any.
async function loadAssignmentForStaff(req: AuthRequest, id: string) {
  const user = req.user!;
  const a = await Assignment.findOne(user.role === 'enara-admin' ? { id } : { id, institutionId: user.institutionId });
  if (!a) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  if (user.role === 'teacher') await loadClassForStaff(req, a.classId);
  return a;
}

function view(a: IAssignment) {
  const plain = typeof (a as any).toObject === 'function' ? (a as any).toObject() : a;
  delete plain._id;
  return { ...plain, status: assignmentStatus(a) };
}

// POST /api/assignments
export const createAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const cls = await loadClassForStaff(req, getRequiredId(body, 'classId'));
  const institutionId = cls.institutionId!;
  const assessment = await Assessment.findOne({ id: getRequiredId(body, 'assessmentId'), institutionId });
  if (!assessment) throw new AppError('Assessment not found', 404);
  if (assessment.lifecycle !== 'published' || assessment.publishedVersion < 1) {
    throw new AppError('Publish the assessment before assigning it', 409, 'ASSESSMENT_NOT_PUBLISHED');
  }
  const members = await classStudentIds(cls);
  const studentIds = body.studentIds === undefined ? undefined : [...new Set(getOptionalStringArray(body, 'studentIds', { maxItems: 500, maxLength: 128 }) || [])];
  if (studentIds && (!studentIds.length || studentIds.some((s) => !members.includes(s)))) {
    throw new AppError('Every student must be in the class', 400, 'VALIDATION_ERROR');
  }
  const opensAt = parseDate(body.opensAt, 'opensAt') ?? new Date();
  const dueAt = parseDate(body.dueAt, 'dueAt', true)!;
  const latePolicy = oneOf(body.latePolicy, LATE, 'latePolicy') ?? 'not_accepted';
  const closesAt = latePolicy === 'accept_late' ? parseDate(body.closesAt, 'closesAt') : undefined;
  const draft = body.draft === true;
  const doc = {
    id: `asg-${randomUUID()}`,
    institutionId,
    assessmentId: assessment.id,
    assessmentVersion: assessment.publishedVersion,
    title: getOptionalString(body, 'title', { max: 160 }) || assessment.title,
    instructions: getOptionalString(body, 'instructions', { max: 4000 }),
    classId: cls.id,
    studentIds,
    state: draft ? ('draft' as const) : ('published' as const),
    opensAt,
    dueAt,
    closesAt,
    timeZone: validTimeZone(getOptionalString(body, 'timeZone', { max: 60 }) || 'UTC'),
    latePolicy,
    maxAttempts: Math.floor(getOptionalNumber(body, 'maxAttempts', { min: 1, max: 10 }) ?? 1),
    timeLimitMinutes: getOptionalNumber(body, 'timeLimitMinutes', { min: 1, max: 600 }),
    // Kept for older records; results are released as soon as grading passes validation.
    releasePolicy: oneOf(body.releasePolicy, RELEASE, 'releasePolicy') ?? 'auto',
    answerReveal: oneOf(body.answerReveal, REVEAL, 'answerReveal') ?? 'after-close',
    tutorPolicy: oneOf(body.tutorPolicy, TUTOR, 'tutorPolicy') ?? 'hints_only',
    format: oneOf(body.format, FORMAT, 'format') ?? 'written',
    speaking: undefined as ReturnType<typeof parseSpeakingSettings> | undefined,
    extensions: [],
    createdBy: req.user!.id,
    history: [{ at: new Date(), by: req.user!.id, action: draft ? 'created_draft' : 'published' }],
  };
  if (doc.format === 'english_conversation') {
    doc.speaking = await speakingFor(institutionId, body.speaking, members);
    // The server's exam clock: preparation plus speaking time.
    doc.timeLimitMinutes = Math.ceil(doc.speaking.durationMinutes + doc.speaking.prepSeconds / 60);
  }
  checkDates(doc as never);
  await checkFormat(doc.format, doc.assessmentId, doc.assessmentVersion);
  const created = await Assignment.create(doc);
  logger.info('assignment_created', { assignmentId: created.id, classId: cls.id, assessmentId: assessment.id, version: created.assessmentVersion, by: req.user!.id });
  if (!draft) await notifyAssignmentPublished(created).catch(() => undefined);
  res.status(201).json(view(created));
});

// GET /api/assignments?classId=&status=
export const listAssignments = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const filter: Record<string, unknown> = user.role === 'enara-admin'
    ? (typeof req.query.institutionId === 'string' ? { institutionId: req.query.institutionId } : {})
    : { institutionId: requireInstitutionId(req) };
  if (user.role === 'teacher') {
    const classes = await CourseInstance.find({ institutionId: user.institutionId, instructorIds: user.id }).select('id').lean();
    filter.classId = { $in: classes.map((c) => c.id) };
  }
  if (typeof req.query.classId === 'string') {
    if (user.role === 'teacher' && !(filter.classId as { $in: string[] }).$in.includes(req.query.classId)) {
      throw new AppError('Class not found', 404, 'CLASS_NOT_FOUND');
    }
    filter.classId = req.query.classId;
  }
  if (req.query.includeArchived !== 'true') filter.state = { $ne: 'archived' };
  const items = await Assignment.find(filter).sort({ dueAt: -1 }).limit(200);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const views = items.map(view).filter((a) => !status || a.status === status);
  res.json({ assignments: views });
});

// GET /api/assignments/:id — with each student's real status.
export const getAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const a = await loadAssignmentForStaff(req, String(req.params.id));
  const cls = await CourseInstance.findOne({ id: a.classId }).lean();
  const memberIds = a.studentIds?.length ? a.studentIds : cls ? await classStudentIds(cls) : [];
  const [students, attempts] = await Promise.all([
    Student.find({ id: { $in: memberIds } }).select('id name').sort({ name: 1 }).lean(),
    AssessmentAttempt.find({ assignmentId: a.id }).select('id studentId status gradingStatus submittedAt score totalPoints maxPoints isLate').lean(),
  ]);
  const byStudent = new Map<string, typeof attempts>();
  for (const t of attempts) byStudent.set(t.studentId, [...(byStudent.get(t.studentId) ?? []), t]);
  const roster = students.map((s) => {
    const mine = byStudent.get(s.id) ?? [];
    const latest = mine.filter((t) => t.status === 'submitted').sort((x, y) => new Date(y.submittedAt!).getTime() - new Date(x.submittedAt!).getTime())[0];
    return {
      studentId: s.id,
      name: s.name,
      ...studentStatus(a, s.id, mine as never),
      dueAt: dueFor(a, s.id),
      attemptsUsed: mine.filter((t) => t.status === 'submitted').length,
      latestAttemptId: latest?.id ?? null,
      // Scores are shown to staff once finalized; drafts are marked as such.
      score: latest?.gradingStatus === 'finalized' || latest?.gradingStatus === 'released' ? latest.score ?? null : null,
      gradingStatus: latest?.gradingStatus ?? null,
    };
  });
  const count = (st: string) => roster.filter((r) => r.status === st).length;
  res.json({
    assignment: view(a),
    summary: {
      students: roster.length,
      notStarted: count('not_started'),
      inProgress: count('in_progress'),
      grading: count('grading'),
      gradingDelayed: count('grading_delayed'),
      awaitingReview: count('awaiting_review'),
      graded: count('graded'),
      released: count('released'),
      missing: count('missing'),
      late: roster.filter((r) => r.late).length,
    },
    roster,
  });
});

// PATCH /api/assignments/:id — dates and rules. The assessment version can
// only change before anyone has started.
export const updateAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const a = await loadAssignmentForStaff(req, String(req.params.id));
  if (a.state === 'archived') throw new AppError('Restore the assignment before editing it', 409, 'ASSIGNMENT_ARCHIVED');
  const before = { opensAt: a.opensAt, dueAt: a.dueAt, closesAt: a.closesAt, maxAttempts: a.maxAttempts };
  if (body.title !== undefined) a.title = getRequiredString(body, 'title', { max: 160 });
  if (body.instructions !== undefined) a.instructions = getOptionalString(body, 'instructions', { max: 4000 });
  if (body.opensAt !== undefined) a.opensAt = parseDate(body.opensAt, 'opensAt', true)!;
  if (body.dueAt !== undefined) a.dueAt = parseDate(body.dueAt, 'dueAt', true)!;
  if (body.latePolicy !== undefined) a.latePolicy = oneOf(body.latePolicy, LATE, 'latePolicy')!;
  if (body.closesAt !== undefined) a.closesAt = parseDate(body.closesAt, 'closesAt');
  if (a.latePolicy !== 'accept_late') a.closesAt = undefined;
  if (body.timeZone !== undefined) a.timeZone = validTimeZone(getRequiredString(body, 'timeZone', { max: 60 }));
  if (body.maxAttempts !== undefined) a.maxAttempts = Math.floor(getOptionalNumber(body, 'maxAttempts', { min: 1, max: 10 }) ?? a.maxAttempts);
  if (body.timeLimitMinutes !== undefined) a.timeLimitMinutes = getOptionalNumber(body, 'timeLimitMinutes', { min: 1, max: 600 });
  if (body.releasePolicy !== undefined) a.releasePolicy = oneOf(body.releasePolicy, RELEASE, 'releasePolicy')!;
  if (body.answerReveal !== undefined) a.answerReveal = oneOf(body.answerReveal, REVEAL, 'answerReveal')!;
  if (body.tutorPolicy !== undefined) a.tutorPolicy = oneOf(body.tutorPolicy, TUTOR, 'tutorPolicy')!;
  if (body.speaking !== undefined || (body.format === 'english_conversation' && a.format !== 'english_conversation')) {
    // Speaking settings are frozen once the exam is published or started.
    if (a.state !== 'draft' || (await AssessmentAttempt.exists({ assignmentId: a.id }))) throw new AppError('Published exam settings are frozen; create a new assignment to change them', 409, 'SPEAKING_SETTINGS_FROZEN');
    const cls = await loadClassForStaff(req, a.classId);
    a.speaking = await speakingFor(a.institutionId, body.speaking ?? a.speaking, await classStudentIds(cls));
    a.timeLimitMinutes = Math.ceil(a.speaking.durationMinutes + a.speaking.prepSeconds / 60);
    a.markModified('speaking');
  }
  if (a.format === 'english_conversation' && body.timeLimitMinutes !== undefined && a.speaking) a.timeLimitMinutes = Math.ceil(a.speaking.durationMinutes + a.speaking.prepSeconds / 60);
  if (body.format !== undefined && body.format !== (a.format ?? 'written')) {
    if (await AssessmentAttempt.exists({ assignmentId: a.id })) throw new AppError('Students have started; the format can no longer change', 409, 'ASSIGNMENT_STARTED');
    a.format = oneOf(body.format, FORMAT, 'format')!;
  }
  if (body.assessmentVersion !== undefined) {
    if (await AssessmentAttempt.exists({ assignmentId: a.id })) throw new AppError('Students have started; the version can no longer change', 409, 'ASSIGNMENT_STARTED');
    const version = Math.floor(getOptionalNumber(body, 'assessmentVersion', { min: 1, max: 100000 })!);
    await getVersion(a.assessmentId, version);
    a.assessmentVersion = version;
  }
  if (body.format !== undefined || body.assessmentVersion !== undefined) await checkFormat(a.format ?? 'written', a.assessmentId, a.assessmentVersion);
  checkDates(a);
  a.history.push({ at: new Date(), by: req.user!.id, action: 'updated', detail: { before, changed: Object.keys(body) } });
  await a.save();
  res.json(view(a));
});

async function transition(req: AuthRequest, from: IAssignment['state'][], to: IAssignment['state'], action: string) {
  const a = await loadAssignmentForStaff(req, String(req.params.id));
  if (a.state === to) return a;
  if (!from.includes(a.state)) throw new AppError(`An assignment that is ${a.state} can't be ${action}`, 409, 'INVALID_ASSIGNMENT_STATE');
  a.state = to;
  a.history.push({ at: new Date(), by: req.user!.id, action });
  await a.save();
  return a;
}

export const publishAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const a = await transition(req, ['draft'], 'published', 'published');
  await notifyAssignmentPublished(a).catch(() => undefined);
  res.json(view(a));
});
export const closeAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(view(await transition(req, ['published'], 'closed', 'closed')));
});
export const reopenAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(view(await transition(req, ['closed'], 'published', 'reopened')));
});
export const archiveAssignment = asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json(view(await transition(req, ['draft', 'published', 'closed'], 'archived', 'archived')));
});

// POST /api/assignments/:id/extensions { studentId, dueAt, reason } — the
// original due date stays; the extension is added with who and why.
export const grantExtension = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const a = await loadAssignmentForStaff(req, String(req.params.id));
  const studentId = getRequiredId(body, 'studentId');
  const cls = await CourseInstance.findOne({ id: a.classId }).lean();
  const members = a.studentIds?.length ? a.studentIds : cls ? await classStudentIds(cls) : [];
  if (!members.includes(studentId)) throw new AppError('Student is not in this assignment', 404, 'STUDENT_NOT_FOUND');
  const dueAt = parseDate(body.dueAt, 'dueAt', true)!;
  if (dueAt <= a.dueAt) throw new AppError('An extension must be later than the original due date', 400, 'VALIDATION_ERROR');
  const reason = getRequiredString(body, 'reason', { max: 500 });
  const at = new Date();
  await Assignment.updateOne(
    { id: a.id },
    {
      $push: {
        extensions: { studentId, dueAt, by: req.user!.id, at, reason },
        history: { at, by: req.user!.id, action: 'extension', detail: { studentId, dueAt } },
      },
    },
  );
  logger.info('assignment_extension', { assignmentId: a.id, studentId, by: req.user!.id });
  res.status(201).json(view((await Assignment.findOne({ id: a.id }))!));
});

export { loadAssignmentForStaff };

// GET /api/assignments/classes — classes the caller may assign to, with their
// curriculum (teachers: classes they instruct; admins: the school's).
export const listTeachingClasses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const filter: Record<string, unknown> =
    user.role === 'enara-admin'
      ? typeof req.query.institutionId === 'string' ? { institutionId: req.query.institutionId } : {}
      : { institutionId: requireInstitutionId(req), ...(user.role === 'teacher' ? { instructorIds: user.id } : {}) };
  const classes = await CourseInstance.find(filter).sort({ courseName: 1 }).limit(500).lean();
  const { Curriculum } = await import('../models/Curriculum');
  const curricula = new Map(
    (await Curriculum.find({ id: { $in: classes.map((c) => c.curriculumId).filter(Boolean) } }).select('id name chapters.id chapters.title').lean()).map((c) => [c.id, c]),
  );
  res.json({
    classes: classes.map((c) => {
      const cur = c.curriculumId ? curricula.get(c.curriculumId) : undefined;
      return { id: c.id, courseName: c.courseName, curriculumId: c.curriculumId ?? null, curriculumName: cur?.name ?? null, lessons: (cur?.chapters || []).map((l) => ({ id: l.id, title: l.title })) };
    }),
  });
});

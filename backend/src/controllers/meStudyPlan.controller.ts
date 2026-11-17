import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { TutorSession } from '../models/TutorSession';
import { getStudentOrThrow } from '../services/studentCourseService';
import { replan, setItemStatus } from '../services/studyPlans';
import { buildHandoff } from '../services/tutorHandoff';
import { appendTutorMessages } from '../services/tutorMessages';
import { resolveStudentForRead } from '../services/learningAccess';
import { studyItemsInScope, teacherClassScope } from '../services/multiClass';
import { generateMessageId, generateTutorSessionId } from '../utils/idGenerator';
import { ensurePlainObject, getRequiredString, rejectMongoOperators } from '../utils/validation';

function view(plan: any) {
  if (!plan) return { version: 0, items: [], history: [] };
  return {
    version: plan.version,
    plannedAt: plan.plannedAt,
    algorithmVersion: plan.algorithmVersion,
    note: 'Built from your assignments, your teachers’ requests, your released results and your recorded answers. Marking something done is a note for you; your understanding is measured by checks and assignments.',
    items: plan.items,
    history: (plan.history || []).slice(-10).reverse(),
  };
}

// GET /api/me/study-plan — brought up to date on each view (a new version
// only when something changed).
export const getMyStudyPlan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await getStudentOrThrow(req.user!.studentId!);
  res.json(view(await replan(student, 'viewed')));
});

// PATCH /api/me/study-plan/items { key, status }
export const setMyStudyItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const key = getRequiredString(body, 'key', { max: 200 });
  const status = String(body.status);
  if (!['todo', 'done', 'dismissed'].includes(status)) throw new AppError('status must be todo, done or dismissed', 400, 'VALIDATION_ERROR');
  const plan = await setItemStatus(req.user!.studentId!, key, status as 'todo' | 'done' | 'dismissed');
  if (!plan) throw new AppError('Plan item not found', 404);
  res.json(view(plan));
});

// POST /api/me/tutor/handoff { kind: assignment|result|plan_item, refId } — a
// tutor chat with the minimum context, under the assignment's tutor policy.
export const startTutorHandoff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body);
  rejectMongoOperators(body);
  const kind = String(body.kind);
  if (!['assignment', 'result', 'plan_item'].includes(kind)) throw new AppError('kind must be assignment, result or plan_item', 400, 'VALIDATION_ERROR');
  const refId = getRequiredString(body, 'refId', { max: 200 });
  const student = await getStudentOrThrow(req.user!.studentId!);
  const handoff = await buildHandoff(student, kind as 'assignment' | 'result' | 'plan_item', refId);
  const session = await TutorSession.create({
    id: generateTutorSessionId(),
    studentId: student.id,
    institutionId: req.user!.institutionId,
    title: handoff.title.slice(0, 60),
    // Multi-class S7: an assignment handoff happens in the assignment's class.
    ...('classId' in handoff && handoff.classId ? { classId: handoff.classId } : {}),
    objectiveId: handoff.objectiveId,
    handoff: { kind, refId, prompt: handoff.prompt, createdAt: new Date() },
    teachingMethod: 'socratic',
    messageCount: 1,
    lastMessageAt: new Date(),
  });
  await appendTutorMessages(session, [
    { id: generateMessageId(), role: 'ai', text: kind === 'result' ? "Let's go over your results. Which question would you like to start with?" : "I'm here to help. What would you like to work on?", timestamp: new Date() },
  ]);
  res.status(201).json({ sessionId: session.id, title: session.title });
});

// GET /api/teaching/students/:studentId/study-plan — staff, read-only.
export const getStudentStudyPlanForStaff = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  if (req.user!.role === 'student') throw new AppError('Staff access required', 403, 'FORBIDDEN');
  const out = view(await replan(student, 'staff_view'));
  // Multi-class step 6 (Q4): a teacher sees only their classes' items for a multi-class student.
  const scope = await teacherClassScope(req.user!, student);
  if (!scope) {
    res.json(out);
    return;
  }
  res.json({ ...out, items: await studyItemsInScope(scope, out.items || []), history: [], classScope: { restricted: true, classIds: [...scope.classIds] } });
});

import { assignmentTutorPolicy, policyRule } from '../services/tutorHandoff';
import { isFeatureEnabled, isShadowMode } from '../services/featureFlags';
import { citationsIn, retrieveCurriculumSources, sourcesPrompt, type RetrievedSource } from '../services/curriculumRetrieval';
import { buildObjectiveContext } from '../services/learningContext';
import {
  curriculumFromCourse,
  isDirectTutorModelConfigured,
  queryDirectTutorModel,
  type TutorCurriculum,
} from '../services/directTutorModel';
import { getConfig } from '../config/env';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { toPlainObject } from '../utils/serialize';
import { TutorSession, TeachingMethod } from '../models/TutorSession';
import { generateMessageId, generateTutorSessionId } from '../utils/idGenerator';
import { appendTutorMessages, deleteTutorMessages, loadTutorMessages } from '../services/tutorMessages';
import { buildCourseTree } from '../services/studentCourseService';
import { describeSnapshot, getLearnerSnapshot } from '../services/learnerSnapshot';
import {
  buildFallbackTutorReply,
  queryOrchestratorChat,
  ChatHistoryItem,
} from '../services/enaraOrchestrator';
import { releaseUsage, reserveUsage, settleUsage, UsageReservation } from '../services/creditsService';

type TutorReply = ReturnType<typeof buildFallbackTutorReply>;

async function toSessionResponse(doc: InstanceType<typeof TutorSession>) {
  const messages = await loadTutorMessages(doc);
  return { ...(toPlainObject(doc) as Record<string, unknown>), messages, messageCount: messages.length };
}

export const listTutorSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { courseId, limit } = req.query;
  const filter: Record<string, unknown> = { studentId };
  if (courseId) filter.courseId = courseId;
  const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const sessions = await TutorSession.find(filter)
    .sort({ lastMessageAt: -1 })
    .limit(cappedLimit);

  res.json(
    sessions.map((s) => ({
      id: s.id,
      title: s.title,
      courseId: s.courseId,
      lessonId: s.lessonId,
      lessonTitle: s.lessonTitle,
      teachingMethod: s.teachingMethod,
      mode: s.mode || 'chat',
      messageCount: Math.max(s.messageCount || 0, s.messages?.length || 0),
      lastMessageAt: s.lastMessageAt,
      timestamp: s.lastMessageAt,
    }))
  );
});

export const getTutorSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const session = await TutorSession.findOne({ id: req.params.id, studentId });
  if (!session) throw new AppError('Tutor session not found', 404);
  res.json(await toSessionResponse(session));
});

export const createTutorSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const {
    courseId,
    lessonId,
    title,
    teachingMethod = 'socratic',
  } = req.body as {
    courseId?: string;
    lessonId?: string;
    title?: string;
    teachingMethod?: TeachingMethod;
  };

  let lessonTitle: string | undefined;
  let curriculumId: string | undefined;

  if (courseId) {
    const course = await buildCourseTree(studentId, courseId);
    curriculumId = course.curriculumId;
    if (lessonId) {
      const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
      if (!lesson) throw new AppError('Lesson not found in course', 404);
      lessonTitle = lesson.title;
    }
  }

  const session = await TutorSession.create({
    id: generateTutorSessionId(),
    studentId,
    institutionId: req.user!.institutionId,
    title: title || lessonTitle || 'AI Tutor chat',
    courseId,
    lessonId,
    lessonTitle,
    curriculumId,
    teachingMethod: teachingMethod || 'socratic',
    messageCount: 1,
    lastMessageAt: new Date(),
  });
  await appendTutorMessages(session, [
    {
      id: generateMessageId(),
      role: 'ai',
      text: "Hi! I'm your Enara Learning Assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);

  res.status(201).json(await toSessionResponse(session));
});

export const deleteTutorSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const deleted = await TutorSession.findOneAndDelete({ id: req.params.id, studentId });
  if (!deleted) throw new AppError('Tutor session not found', 404);
  await deleteTutorMessages([deleted.id]);
  res.json({ message: 'Tutor session deleted' });
});

export const clearTutorSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { courseId } = req.query;
  const filter: Record<string, unknown> = { studentId };
  if (courseId) filter.courseId = courseId;

  const ids = (await TutorSession.find(filter).select('id').lean()).map((s) => s.id);
  const result = await TutorSession.deleteMany({ ...filter, id: { $in: ids } });
  await deleteTutorMessages(ids);
  res.json({ message: 'Tutor sessions cleared', deleted: result.deletedCount });
});

export const sendTutorMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const session = await TutorSession.findOne({ id: req.params.id, studentId });
  if (!session) throw new AppError('Tutor session not found', 404);

  const {
    text,
    teachingMethod,
    context,
  } = req.body as {
    text?: string;
    teachingMethod?: TeachingMethod;
    context?: {
      courseId?: string;
      lessonId?: string;
      subject?: string;
      lessonTitle?: string;
      curriculumSummary?: string;
    };
  };

  if (!text?.trim()) throw new AppError('Message text is required');

  const method: TeachingMethod = teachingMethod || session.teachingMethod || 'socratic';
  if (teachingMethod) session.teachingMethod = teachingMethod;

  const userMessage = {
    id: generateMessageId(),
    role: 'user' as const,
    text: text.trim(),
    timestamp: new Date(),
  };
  const earlier = await loadTutorMessages(session);

  const courseId = context?.courseId || session.courseId;
  const lessonId = context?.lessonId || session.lessonId;
  let lessonTitle = context?.lessonTitle || session.lessonTitle;
  let curriculumSummary = context?.curriculumSummary;
  // Enara orchestrator identifiers (real course/section UUIDs from GET /courses),
  // distinct from this platform's internal courseId/lessonId. Without this mapping
  // queryOrchestratorChat() is called with an id the orchestrator doesn't recognize
  // and always falls back to the canned local templates.
  let enaraCourseId: string | undefined;
  let enaraSectionId: string | undefined;
  let curriculum: TutorCurriculum | undefined;

  if (courseId) {
    try {
      const course = await buildCourseTree(studentId, courseId);
      session.courseId = course.id;
      session.curriculumId = course.curriculumId;
      curriculumSummary = curriculumSummary || course.curriculumSummary;
      enaraCourseId = course.enaraCourseId;
      curriculum = curriculumFromCourse(course, lessonId);
      if (lessonId) {
        const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
        if (lesson) {
          session.lessonId = lesson.id;
          lessonTitle = lesson.title;
          session.lessonTitle = lesson.title;
          enaraSectionId = lesson.enaraSectionId;
        }
      }
    } catch {
      // Keep session context if course lookup fails mid-chat
    }
  }

  const history: ChatHistoryItem[] = earlier
    .filter((m) => m.role === 'user' || m.role === 'ai')
    .slice(-12)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

  const enrichedQuery = [
    curriculumSummary ? `Curriculum context: ${curriculumSummary}` : '',
    lessonTitle ? `Current lesson: ${lessonTitle}` : '',
    context?.subject ? `Subject: ${context.subject}` : '',
    `Student question: ${text.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');

  if (!enaraCourseId) {
    enaraCourseId = getConfig().enaraDefaultCourseId;
    enaraSectionId = undefined;
  }

  // Assignment tutor policy: refused while a 'no tutor' assignment is open;
  // 'hints only' adds a rule. Such chats (and handoffs) use the direct model,
  // where the rules are applied.
  const tutorPolicy = await assignmentTutorPolicy(studentId);
  if (tutorPolicy.policy === 'blocked') {
    throw new AppError(`The AI tutor is off while you work on "${tutorPolicy.title}"`, 403, 'TUTOR_BLOCKED');
  }
  const extraRules = [session.handoff?.prompt, policyRule(tutorPolicy.policy)].filter(Boolean) as string[];
  let reservation: UsageReservation | undefined;
  let sources: RetrievedSource[] = [];
  let aiResult: TutorReply | null = null;
  if (enaraCourseId || isDirectTutorModelConfigured()) {
    try {
      reservation = await reserveUsage({
        userId: req.user!.id,
        studentId,
        feature: 'chat',
        sessionId: session.id,
      });
    } catch (err) {
      throw new AppError((err as Error).message, 402, 'CREDIT_LIMIT_EXCEEDED');
    }

    if (enaraCourseId && !extraRules.length) {
      aiResult = await queryOrchestratorChat({
        course_id: enaraCourseId,
        query: enrichedQuery,
        section_ids: enaraSectionId ? [enaraSectionId] : undefined,
        chat_history: history,
        teaching_method: method,
      });
    }
    // Orchestrator down or unconfigured: answer with the direct model instead.
    if (!aiResult) {
      // Course passages for this question (school-scoped), with citations.
      sources = (await isFeatureEnabled(session.institutionId, 'learning_intelligence_enabled')) && !(await isShadowMode(session.institutionId))
        ? await retrieveCurriculumSources({
            institutionId: session.institutionId,
            curriculumId: session.curriculumId,
            query: text.trim(),
            lessonId: session.lessonId,
            objectiveId: session.objectiveId,
          }).catch(() => [])
        : [];
      const focus = session.objectiveId
        ? await buildObjectiveContext({
            institutionId: session.institutionId,
            studentId,
            objectiveId: session.objectiveId,
            interventionId: session.interventionId,
            tutorSessionId: session.id,
            record: true,
          })
        : null;
      aiResult = await queryDirectTutorModel({
        query: enrichedQuery,
        history,
        teachingMethod: method,
        curriculum,
        pedagogy: [focus?.prompt, ...extraRules].filter(Boolean).join('\n\n') || undefined,
        sourcesPrompt: sources.length ? sourcesPrompt(sources) : undefined,
        learner: await getLearnerSnapshot(studentId).then((l) => (l ? describeSnapshot(l) : undefined)),
      });
    }
  }

  if (!aiResult) {
    if (reservation) await releaseUsage(reservation);
    aiResult = buildFallbackTutorReply(text.trim(), method, lessonTitle);
  } else if (reservation) {
    await settleUsage(reservation, { model: aiResult.version });
    reservation = undefined;
  }

  const assistantMessage = {
    id: generateMessageId(),
    role: 'ai' as const,
    text: aiResult.answer,
    timestamp: new Date(),
    meta: {
      intent: aiResult.intent,
      contextFound: aiResult.context_found,
      version: aiResult.version,
      teachingMethod: method,
      ...(citationsIn(aiResult.answer, sources).length ? { citations: citationsIn(aiResult.answer, sources) } : {}),
    },
  };

  await appendTutorMessages(session, [userMessage, assistantMessage], { source: 'tutor_chat' });
  session.messageCount = earlier.length + 2;
  session.lastMessageAt = new Date();

  if (!session.title || session.title === 'AI Tutor chat' || session.title === 'New chat') {
    session.title = text.trim().slice(0, 60);
  }

  await session.save();

  res.json({
    userMessage,
    assistantMessage,
    session: await toSessionResponse(session),
    meta: {
      intent: aiResult.intent,
      contextFound: aiResult.context_found,
      version: aiResult.version,
      teachingMethod: method,
    },
  });
});

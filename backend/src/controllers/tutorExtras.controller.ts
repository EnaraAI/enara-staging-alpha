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
import { TutorSession, TeachingMethod } from '../models/TutorSession';
import { generateMessageId } from '../utils/idGenerator';
import { buildCourseTree } from '../services/studentCourseService';
import { describeSnapshot, getLearnerSnapshot } from '../services/learnerSnapshot';
import {
  buildFallbackTutorReply,
  queryOrchestratorChat,
  ChatHistoryItem,
} from '../services/enaraOrchestrator';
import { appendTutorMessages, loadTutorMessages } from '../services/tutorMessages';
import {
  recordUsage,
  releaseUsage,
  reserveUsage,
  settleUsage,
  UsageReservation,
} from '../services/creditsService';

type TutorReply = ReturnType<typeof buildFallbackTutorReply>;

async function resolveTutorReply(params: {
  studentId: string;
  userId: string;
  session: InstanceType<typeof TutorSession>;
  text: string;
  teachingMethod: TeachingMethod;
  context?: {
    courseId?: string;
    lessonId?: string;
    subject?: string;
    lessonTitle?: string;
    curriculumSummary?: string;
  };
}) {
  const { studentId, userId, session, text, teachingMethod, context } = params;
  let lessonTitle = context?.lessonTitle || session.lessonTitle;
  let curriculumSummary = context?.curriculumSummary;
  const courseId = context?.courseId || session.courseId;
  const lessonId = context?.lessonId || session.lessonId;
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
      // keep existing context
    }
  }

  const history: ChatHistoryItem[] = (await loadTutorMessages(session))
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
        userId,
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
        teaching_method: teachingMethod,
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
        teachingMethod,
        curriculum,
        pedagogy: [focus?.prompt, ...extraRules].filter(Boolean).join('\n\n') || undefined,
        sourcesPrompt: sources.length ? sourcesPrompt(sources) : undefined,
        learner: await getLearnerSnapshot(studentId).then((l) => (l ? describeSnapshot(l) : undefined)),
      });
    }
  }

  if (!aiResult) {
    if (reservation) await releaseUsage(reservation);
    aiResult = buildFallbackTutorReply(text.trim(), teachingMethod, lessonTitle);
  } else if (reservation) {
    await settleUsage(reservation, { model: aiResult.version });
    reservation = undefined;
  }

  return { aiResult, lessonTitle, reservation, citations: citationsIn(aiResult.answer, sources) };
}

export const streamTutorMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const session = await TutorSession.findOne({ id: req.params.id, studentId });
  if (!session) throw new AppError('Tutor session not found', 404);

  const { text, teachingMethod, context } = req.body as {
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

  const userMessage = {
    id: generateMessageId(),
    role: 'user' as const,
    text: text.trim(),
    timestamp: new Date(),
  };

  const { aiResult, reservation, citations } = await resolveTutorReply({
    studentId,
    userId: req.user!.id,
    session,
    text,
    teachingMethod: method,
    context,
  });

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
      ...(citations.length ? { citations } : {}),
    },
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'user', message: userMessage })}\n\n`);

  const words = aiResult.answer.split(/(\s+)/);
  let assembled = '';
  for (const chunk of words) {
    assembled += chunk;
    res.write(
      `data: ${JSON.stringify({ type: 'token', delta: chunk, messageId: assistantMessage.id })}\n\n`
    );
    await new Promise((r) => setTimeout(r, 15));
  }

  await appendTutorMessages(session, [userMessage, assistantMessage], { source: 'tutor_chat' });
  session.messageCount = (session.messageCount || session.messages?.length || 0) + 2;
  session.lastMessageAt = new Date();
  if (!session.title || session.title === 'AI Tutor chat' || session.title === 'New chat') {
    session.title = text.trim().slice(0, 60);
  }
  await session.save();
  if (reservation) {
    await settleUsage(reservation, { model: aiResult.version });
  }

  res.write(
    `data: ${JSON.stringify({
      type: 'done',
      messageId: assistantMessage.id,
      assistantMessage,
      meta: assistantMessage.meta,
    })}\n\n`
  );
  res.end();
});

export const tutorVisualize = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { prompt, courseId, lessonTitle } = req.body as {
    prompt?: string;
    courseId?: string;
    lessonTitle?: string;
  };
  if (!prompt?.trim()) throw new AppError('prompt is required');

  try {
    await recordUsage({
      userId: req.user!.id,
      studentId,
      feature: 'visualize',
      sessionId: courseId,
    });
  } catch (err) {
    throw new AppError((err as Error).message, 402);
  }

  const topic = lessonTitle || 'the current lesson';
  res.json({
    prompt: prompt.trim(),
    imageUrl: null,
    imagePrompt: `Educational diagram for ${topic}: ${prompt.trim()}`,
    description: `Visualization request captured for "${prompt.trim()}" about ${topic}. Connect a vision model or CDN later for rendered image URLs.`,
    status: 'queued',
  });
});

export const tutorTts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.studentId!;
  const { text } = req.body as { text?: string };
  if (!text?.trim()) throw new AppError('text is required');

  try {
    await recordUsage({
      userId: req.user!.id,
      studentId,
      feature: 'tts',
    });
  } catch (err) {
    throw new AppError((err as Error).message, 402);
  }

  // Placeholder TTS payload — frontend can fall back to browser speechSynthesis
  res.json({
    text: text.trim(),
    mimeType: 'audio/pcm',
    audioBase64: null,
    provider: 'browser-fallback',
    message:
      'Server TTS not configured. Use browser speechSynthesis or set a TTS provider key.',
  });
});

import { publicVersion } from '../utils/vendorNeutral';
import { assignmentTutorPolicy, policyRule } from '../services/tutorHandoff';
import { isFeatureEnabled, isShadowMode } from '../services/featureFlags';
import { citationsIn, retrieveCurriculumSources, sourcesPrompt, type RetrievedSource } from '../services/curriculumRetrieval';
import { buildTeachingContext, type ObjectiveContext } from '../services/learningContext';
import {
  curriculumFromCourse,
  isDirectTutorModelConfigured,
  queryDirectTutorModel,
  streamDirectTutorModel,
  type TutorCurriculum,
  type StreamStatus,
  type TutorRequestParams,
} from '../services/directTutorModel';
import { logger, serializeError } from '../utils/logging';
import { getConfig } from '../config/env';
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError, creditReservationError } from '../middleware/errorHandler';
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

type TurnContext = {
  courseId?: string;
  lessonId?: string;
  subject?: string;
  lessonTitle?: string;
  curriculumSummary?: string;
};

// One tutor turn, prepared up to the provider call. Shared by the JSON and the
// streaming endpoints, so both apply the same session, policy and credit checks.
interface TutorTurn {
  studentId: string;
  session: InstanceType<typeof TutorSession>;
  text: string;
  method: TeachingMethod;
  userMessage: { id: string; role: 'user'; text: string; timestamp: Date };
  earlierCount: number;
  lessonTitle?: string;
  reservation?: UsageReservation;
  sources: RetrievedSource[];
  // Set when the orchestrator should be asked first.
  orchestrator?: Parameters<typeof queryOrchestratorChat>[0];
  // The teaching plan (ped-v2) and the metadata stored on the reply.
  plan?: ObjectiveContext | null;
  // Builds the direct-model request (retrieval, objective focus, learner snapshot).
  directParams?: () => Promise<TutorRequestParams>;
}

async function prepareTutorTurn(req: AuthRequest): Promise<TutorTurn> {
  const studentId = req.user!.studentId!;
  const session = await TutorSession.findOne({ id: req.params.id, studentId });
  if (!session) throw new AppError('Tutor session not found', 404);

  const { text, teachingMethod, context } = req.body as { text?: string; teachingMethod?: TeachingMethod; context?: TurnContext };
  if (!text?.trim()) throw new AppError('Message text is required');

  const method: TeachingMethod = teachingMethod || session.teachingMethod || 'socratic';
  if (teachingMethod) session.teachingMethod = teachingMethod;

  const userMessage = { id: generateMessageId(), role: 'user' as const, text: text.trim(), timestamp: new Date() };
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
  const turn: TutorTurn = { studentId, session, text: text.trim(), method, userMessage, earlierCount: earlier.length, lessonTitle, sources: [] };
  if (!(enaraCourseId || isDirectTutorModelConfigured())) return turn;

  try {
    turn.reservation = await reserveUsage({ userId: req.user!.id, studentId, feature: 'chat', sessionId: session.id });
  } catch (err) {
    throw creditReservationError(err);
  }
  // Teaching plan for this turn (adaptive pedagogy on; objective from the session
  // or its lesson). A plan is a rule set like a handoff: the turn then goes to the
  // direct model, where it is applied (the external orchestrator cannot take it).
  turn.plan = await buildTeachingContext({
    institutionId: session.institutionId,
    studentId,
    sessionObjectiveId: session.objectiveId,
    lessonId: session.lessonId,
    interventionId: session.interventionId,
    tutorSessionId: session.id,
    channel: req.path.endsWith('/stream') ? 'stream' : 'chat',
  });
  if (enaraCourseId && !extraRules.length && !turn.plan) {
    turn.orchestrator = {
      course_id: enaraCourseId,
      query: enrichedQuery,
      section_ids: enaraSectionId ? [enaraSectionId] : undefined,
      chat_history: history,
      teaching_method: method,
    };
  }
  turn.directParams = async () => {
    // Course passages for this question (school-scoped), with citations.
    turn.sources = (await isFeatureEnabled(session.institutionId, 'learning_intelligence_enabled')) && !(await isShadowMode(session.institutionId))
      ? await retrieveCurriculumSources({
          institutionId: session.institutionId,
          curriculumId: session.curriculumId,
          query: turn.text,
          lessonId: session.lessonId,
          objectiveId: session.objectiveId,
        }).catch(() => [])
      : [];
    return {
      query: enrichedQuery,
      history,
      teachingMethod: method,
      curriculum,
      pedagogy: [turn.plan?.prompt, ...extraRules].filter(Boolean).join('\n\n') || undefined,
      planActive: Boolean(turn.plan),
      sourcesPrompt: turn.sources.length ? sourcesPrompt(turn.sources) : undefined,
      learner: await getLearnerSnapshot(studentId).then((l) => (l ? describeSnapshot(l) : undefined)),
    };
  };
  return turn;
}

// Settles or releases the credits and saves both messages. A null reply (no
// model answer) gives the credits back and saves the local fallback reply.
async function finishTutorTurn(turn: TutorTurn, reply: TutorReply | null) {
  let aiResult = reply;
  if (!aiResult) {
    if (turn.reservation) await releaseUsage(turn.reservation);
    aiResult = buildFallbackTutorReply(turn.text, turn.method, turn.lessonTitle);
  } else if (turn.reservation) {
    await settleUsage(turn.reservation, { model: aiResult.version });
  }
  turn.reservation = undefined;
  const citations = citationsIn(aiResult.answer, turn.sources);
  const assistantMessage = {
    id: generateMessageId(),
    role: 'ai' as const,
    text: aiResult.answer,
    timestamp: new Date(),
    meta: {
      intent: aiResult.intent,
      contextFound: aiResult.context_found,
      version: publicVersion(aiResult.version),
      teachingMethod: turn.method,
      ...(citations.length ? { citations } : {}),
      // Recorded only when the plan was actually used for this reply (a model reply).
      ...(turn.plan && reply ? { teaching: turn.plan.teaching } : {}),
    },
  };
  const { session } = turn;
  await appendTutorMessages(session, [turn.userMessage, assistantMessage], { source: 'tutor_chat' });
  session.messageCount = turn.earlierCount + 2;
  session.lastMessageAt = new Date();
  if (!session.title || session.title === 'AI Tutor chat' || session.title === 'New chat') {
    session.title = turn.text.slice(0, 60);
  }
  await session.save();
  return { aiResult, assistantMessage };
}

const replyMeta = (aiResult: TutorReply, method: TeachingMethod) => ({
  intent: aiResult.intent,
  contextFound: aiResult.context_found,
  version: publicVersion(aiResult.version),
  teachingMethod: method,
});

export const sendTutorMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const turn = await prepareTutorTurn(req);
  let reply: TutorReply | null = null;
  if (turn.orchestrator) reply = await queryOrchestratorChat(turn.orchestrator);
  // Orchestrator down or unconfigured: answer with the direct model instead.
  if (!reply && turn.directParams) reply = await queryDirectTutorModel(await turn.directParams());
  const { aiResult, assistantMessage } = await finishTutorTurn(turn, reply);
  res.json({
    userMessage: turn.userMessage,
    assistantMessage,
    session: await toSessionResponse(turn.session),
    meta: replyMeta(aiResult, turn.method),
  });
});

// P20: the same turn, streamed as the model writes it (server-sent events), so
// the student sees the first words seconds after the model starts instead of
// waiting for the whole reply. Errors before the stream starts are ordinary
// HTTP errors; after it starts they are an `error` event. Events:
//   user {message} · token {delta} · replace {text} (the model failed or refused
//   mid-reply: show this instead) · done {assistantMessage, meta, session} · error {code, message}
export const streamTutorMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const turn = await prepareTutorTurn(req);
  let open = true;
  res.on('close', () => { open = false; });
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = (event: Record<string, unknown>) => { if (open) res.write(`data: ${JSON.stringify(event)}\n\n`); };
  send({ type: 'user', message: turn.userMessage });
  // Keep the connection visibly alive while the turn is prepared.
  const heartbeat = setInterval(() => { if (open) res.write(': waiting\n\n'); }, 5_000);
  try {
    let reply: TutorReply | null = null;
    if (turn.orchestrator) {
      reply = await queryOrchestratorChat(turn.orchestrator);
      if (reply) send({ type: 'token', delta: reply.answer });
    }
    if (!reply && turn.directParams) {
      const params = await turn.directParams();
      const status: StreamStatus = {};
      let answer = '';
      for await (const delta of streamDirectTutorModel(params, status)) {
        if (!open) break; // the student left: stop generating (metered as cancelled)
        answer += delta;
        send({ type: 'token', delta });
      }
      if (!open) {
        if (turn.reservation) await releaseUsage(turn.reservation);
        return;
      }
      // A refusal or a failure mid-reply makes the streamed text unusable: the
      // fallback replaces it below, as the JSON endpoint would answer.
      const ok = answer.trim() && !status.refused && !status.failed;
      reply = ok ? { answer: answer.trim(), intent: 'direct_model', context_found: status.contextFound ?? 0, version: `anthropic:${status.model ?? 'unknown'}` } : null;
    }
    const { aiResult, assistantMessage } = await finishTutorTurn(turn, reply);
    if (!reply) send({ type: 'replace', text: aiResult.answer });
    send({ type: 'done', messageId: assistantMessage.id, assistantMessage, meta: replyMeta(aiResult, turn.method), session: await toSessionResponse(turn.session) });
  } catch (error) {
    if (turn.reservation) await releaseUsage(turn.reservation).catch(() => undefined);
    const code = (error as { code?: string }).code || 'TUTOR_STREAM_FAILED';
    logger.error('tutor_stream_failed', { requestId: req.requestId, code, error: serializeError(error) });
    send({ type: 'error', code, message: error instanceof AppError ? error.message : 'The tutor could not finish this reply. Please try again.' });
  } finally {
    clearInterval(heartbeat);
    if (open) res.end();
  }
});

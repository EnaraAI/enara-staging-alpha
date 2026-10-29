import { assignmentTutorPolicy, policyRule } from '../services/tutorHandoff';
import { TutorSession } from '../models/TutorSession';
import { appendTutorMessages } from '../services/tutorMessages';
import { generateMessageId } from '../utils/idGenerator';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { getConfig } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AvatarSession, IAvatarSession } from '../models/AvatarSession';
import { finalizeAvatarUsage, sweepAvatarUsage } from '../services/avatarUsage';
import { reserveAttempt } from '../services/aiGateway';
import { releaseAiBudget } from '../services/aiBudget';
import { releaseUsage, reserveUsage, settleUsage } from '../services/creditsService';
import { describeSnapshot, getLearnerSnapshot } from '../services/learnerSnapshot';
import { resolveTutorFace } from '../services/tutorFaceService';
import {
  curriculumFromCourse,
  isDirectTutorModelConfigured,
  SHOW_VISUAL_MARKER,
  streamDirectTutorModel,
  type TutorCurriculum,
} from '../services/directTutorModel';
import type { ChatHistoryItem } from '../services/enaraOrchestrator';
import { buildCourseTree } from '../services/studentCourseService';
import { logger, serializeError } from '../utils/logging';
import { waitUntil } from '@vercel/functions';
import { detectLanguage, detectLanguageSwitch } from '../services/avatarLanguage';
import { generateVisualAid, isVisualRequest } from '../services/avatarVisuals';
import {
  createTranscriptionToken,
  elevenLabsSttModel,
  isElevenLabsVoiceConfigured,
  synthesizeSpeech,
} from '../services/elevenlabsVoice';
import { Readable } from 'stream';

// Live video tutor (replaces the separate avatar adapter service). Anam renders
// the avatar, listens and speaks; the answers come from the curriculum-aware
// Claude tutor, streamed as NDJSON lines the browser feeds to Anam.

type Language = 'english' | 'arabic';
type TurnKind = 'turn' | 'opening' | 'nudge';

function requireAnam() {
  const anam = getConfig().anam;
  if (!anam) throw new AppError('The live tutor is not configured', 503, 'AVATAR_UNAVAILABLE');
  return anam;
}

// With ElevenLabs configured, Anam is only the face: it lip-syncs to audio the
// browser passes through. Otherwise Anam listens and speaks itself, and the
// browser streams our text answers to it.
async function createAnamSessionToken(language: Language, avatarId?: string): Promise<string> {
  const anam = requireAnam();
  avatarId ||= anam.avatarId;
  const personaConfig = isElevenLabsVoiceConfigured()
    ? { name: 'Enara', avatarId, enableAudioPassthrough: true }
    : {
        name: 'Enara',
        avatarId,
        voiceId: language === 'arabic' ? anam.voiceIdAr : anam.voiceIdEn,
        // Anam's own LLM stays off: the browser streams our answers to it.
        llmId: 'CUSTOMER_CLIENT_V1',
        languageCode: language === 'arabic' ? 'ar' : 'en',
      };
  const res = await fetch('https://api.anam.ai/v1/auth/session-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${anam.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ personaConfig }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { sessionToken?: string };
  if (!res.ok || !data.sessionToken) {
    logger.warn('anam_session_token_failed', { status: res.status });
    throw new AppError('Could not start the live tutor', 502, 'AVATAR_UNAVAILABLE');
  }
  return data.sessionToken;
}

async function findOwnSession(req: AuthRequest): Promise<IAvatarSession> {
  const session = await AvatarSession.findOne({ id: req.params.id, userId: req.user!.id, endedAt: null });
  if (!session) throw new AppError('Avatar session not found', 404);
  // Heartbeat for usage metering: the latest request seen for this call.
  await AvatarSession.updateOne({ id: session.id }, { $set: { lastActivityAt: new Date() } });
  return session;
}

function toLanguage(value: unknown): Language {
  return value === 'arabic' ? 'arabic' : 'english';
}

// The course outline for a call is loaded once and reused for each turn while
// the instance stays warm.
const CURRICULUM_TTL_MS = 10 * 60 * 1000;
const curriculumCache = new Map<string, { curriculum?: TutorCurriculum; at: number }>();

async function loadSessionCurriculum(session: IAvatarSession): Promise<TutorCurriculum | undefined> {
  if (!session.courseId || !session.studentId) return undefined;
  const cached = curriculumCache.get(session.id);
  if (cached && Date.now() - cached.at < CURRICULUM_TTL_MS) return cached.curriculum;
  let curriculum: TutorCurriculum | undefined;
  try {
    curriculum = curriculumFromCourse(await buildCourseTree(session.studentId, session.courseId), session.lessonId);
  } catch {
    // Answer without the curriculum if the course can't be loaded.
  }
  if (curriculumCache.size > 200) curriculumCache.delete(curriculumCache.keys().next().value!);
  curriculumCache.set(session.id, { curriculum, at: Date.now() });
  return curriculum;
}

// Calls a user may start per day. Staff only preview the tutor and aren't
// charged credits, so they get fewer.
const DAILY_SESSIONS = { student: 30, staff: 5 };
// ElevenLabs characters per call (roughly 20 minutes of speech).
const MAX_SPOKEN_CHARS_PER_SESSION = 20_000;

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new AppError('Invalid live tutor request', 400, 'VALIDATION_ERROR');
  return value.trim().slice(0, max) || undefined;
}

export const startAvatarSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  requireAnam();
  if (!isDirectTutorModelConfigured()) {
    throw new AppError('The live tutor is not configured', 503, 'AVATAR_UNAVAILABLE');
  }
  const raw = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const body = {
    course_id: optionalText(raw.course_id, 120),
    lesson_id: optionalText(raw.lesson_id, 120),
    lesson_title: optionalText(raw.lesson_title, 200),
    subject: optionalText(raw.subject, 100),
    preferred_language: optionalText(raw.preferred_language, 20),
  };
  const isStudent = req.user!.role === 'student';
  const today = await AvatarSession.countDocuments({
    userId: req.user!.id,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
  if (today >= (isStudent ? DAILY_SESSIONS.student : DAILY_SESSIONS.staff)) {
    throw new AppError('Daily live tutor limit reached. Try again tomorrow.', 429, 'AVATAR_DAILY_LIMIT');
  }
  // No language asked for: open in the one the student ended their last call in.
  const language = body.preferred_language
    ? toLanguage(body.preferred_language)
    : ((await AvatarSession.findOne({ userId: req.user!.id }).sort({ createdAt: -1 }).select('language').lean())?.language ??
      'english');
  // The face the school chose for this course (or its default).
  const face = await resolveTutorFace(req.user!.institutionId, body.course_id, req.user!.studentId);
  // Budget (P0d): Anam time has no catalogue price, so an enforced school
  // needs a configured reservation ceiling; it is kept until the call is
  // metered (unknown cost is never released as free).
  const sessionId = `av-${randomUUID()}`;
  const ticket = await reserveAttempt({ feature: 'avatar_session', provider: 'anam', modelName: face?.avatarId || 'anam-default' }, `avatar:${sessionId}`, 48 * 60 * 60 * 1000);
  let sessionToken: string;
  try {
    sessionToken = await createAnamSessionToken(language, face?.avatarId);
  } catch (error) {
    await releaseAiBudget(ticket);
    throw error;
  }
  // Meter this user's earlier calls that ended or were abandoned unmetered.
  await sweepAvatarUsage({ userId: req.user!.id, limit: 20 }).catch((error) =>
    logger.error('avatar_usage_sweep_failed', { error: serializeError(error) }),
  );

  const now = new Date();
  const session = await AvatarSession.create({
    id: sessionId,
    userId: req.user!.id,
    studentId: req.user!.studentId,
    institutionId: req.user!.institutionId,
    role: req.user!.role,
    lastActivityAt: now,
    courseId: body.course_id,
    lessonId: body.lesson_id,
    lessonTitle: body.lesson_title,
    subject: body.subject,
    language,
    avatarId: face?.avatarId,
    voiceGender: face?.gender,
  });

  // Students' calls are kept as a transcript with their tutor chats.
  if (req.user!.studentId) {
    await TutorSession.create({
      id: session.id,
      studentId: req.user!.studentId,
      institutionId: req.user!.institutionId,
      title: body.lesson_title ? `Live call: ${body.lesson_title}` : 'Live tutor call',
      courseId: body.course_id,
      lessonId: body.lesson_id,
      lessonTitle: body.lesson_title,
      mode: 'voice',
      messageCount: 0,
      lastMessageAt: new Date(),
    });
  }

  res.json({
    session_id: session.id,
    provider: 'anam',
    session_token: sessionToken,
    speech: isElevenLabsVoiceConfigured() ? 'elevenlabs' : 'anam',
    fallback_reason: null,
  });
});

export const switchAvatarLanguage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await findOwnSession(req);
  const language = toLanguage((req.body as { target_language?: string }).target_language);
  // A new Anam session token is new provider time: reserve it before asking
  // (P0d/P14 caps), and give it back if Anam refuses. Kept whole otherwise.
  const ticket = await reserveAttempt({ feature: 'avatar_session', provider: 'anam', modelName: session.avatarId || 'anam-default' }, `avatar:${session.id}:switch:${randomUUID()}`, 48 * 60 * 60 * 1000);
  let sessionToken: string;
  try {
    sessionToken = await createAnamSessionToken(language, session.avatarId);
  } catch (error) {
    await releaseAiBudget(ticket);
    throw error;
  }
  session.language = language;
  await session.save();
  res.json({ session_token: sessionToken, language });
});

// Short-lived token the browser uses to stream the microphone to ElevenLabs
// real-time transcription (end of each sentence and its language detected there).
export const createAvatarSttToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  await findOwnSession(req);
  if (!isElevenLabsVoiceConfigured()) {
    throw new AppError('Voice transcription is not configured', 503, 'AVATAR_UNAVAILABLE');
  }
  res.json({ token: await createTranscriptionToken({ sessionId: String(req.params.id) }), model_id: elevenLabsSttModel() });
});

// One sentence of the tutor's reply as raw 16 kHz PCM for Anam's lip-sync.
export const speakAvatarText = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { session_id?: string; text?: string; language?: string };
  req.params.id = String(body.session_id || '');
  const session = await findOwnSession(req);
  if (!isElevenLabsVoiceConfigured()) {
    throw new AppError('Voice is not configured', 503, 'AVATAR_UNAVAILABLE');
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 1000) throw new AppError('Text must be 1-1000 characters', 400, 'VALIDATION_ERROR');
  // Speech costs per character: cap it per call.
  const counted = await AvatarSession.updateOne(
    { id: session.id, spokenChars: { $lte: MAX_SPOKEN_CHARS_PER_SESSION - text.length } },
    { $inc: { spokenChars: text.length } },
  );
  if (!counted.modifiedCount) throw new AppError('This call has reached its speech limit', 429, 'AVATAR_SPEECH_LIMIT');

  const audio = await synthesizeSpeech(
    text,
    body.language ? toLanguage(body.language) : session.language,
    session.voiceGender,
  );
  res.setHeader('Content-Type', 'audio/L16; rate=16000; channels=1');
  res.setHeader('Cache-Control', 'no-store');
  Readable.fromWeb(audio as Parameters<typeof Readable.fromWeb>[0])
    .on('error', (error) => {
      logger.warn('avatar_speech_failed', { error: serializeError(error) });
      res.destroy(error);
    })
    .pipe(res);
});

export const endAvatarSession = asyncHandler(async (req: AuthRequest, res: Response) => {
  // The first end wins, so a repeated close cannot move the end time.
  await AvatarSession.updateOne({ id: req.params.id, userId: req.user!.id, endedAt: null }, { endedAt: new Date() });
  const owned = await AvatarSession.exists({ id: req.params.id, userId: req.user!.id });
  // Metering never blocks or fails the close; the sweep retries it.
  if (owned) {
    await finalizeAvatarUsage(String(req.params.id)).catch((error) =>
      logger.error('avatar_usage_finalize_failed', { sessionId: String(req.params.id), error: serializeError(error) }),
    );
  }
  res.status(204).end();
});

// The browser reports, about once a minute while Anam's stream is connected,
// that the call is live, with Anam's session id for reconciliation. Evidence
// of a live connection for metering, not Anam's billing record.
export const avatarHeartbeat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await findOwnSession(req);
  const raw = (req.body as { provider_session_id?: unknown })?.provider_session_id;
  const providerId = typeof raw === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : undefined;
  const update: Record<string, unknown> = { $set: { lastHeartbeatAt: new Date() } };
  if (providerId && (session.providerSessionIds?.length ?? 0) < 20) update.$addToSet = { providerSessionIds: providerId };
  await AvatarSession.updateOne({ id: session.id }, update);
  res.status(204).end();
});

// No second avatar provider is configured, so there is nothing to fall back to.
export const avatarFallback = asyncHandler(async (_req: AuthRequest, _res: Response) => {
  throw new AppError('No fallback avatar is configured', 503, 'AVATAR_FALLBACK_UNAVAILABLE');
});

// The browser polls this for the side panel's visual aid.
export const getAvatarArtifact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await findOwnSession(req);
  res.json({ html: session.artifactHtml || null });
});

export const streamAvatarAnswer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    session_id?: string;
    messages?: { role?: string; content?: string }[];
    // Set when the browser's transcription already detected the spoken language.
    language?: string;
    // 'opening': the tutor starts the call. 'nudge': the student has gone quiet
    // after a question. Both are started by the tutor, so they aren't charged.
    kind?: string;
  };
  const kind: TurnKind = body.kind === 'opening' || body.kind === 'nudge' ? body.kind : 'turn';
  req.params.id = String(body.session_id || '');
  const session = await findOwnSession(req);
  const heardLanguage = body.language ? toLanguage(body.language) : undefined;

  let messages: ChatHistoryItem[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => typeof m?.content === 'string' && m.content.trim())
    .slice(-13)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 4000) }));
  // Tutor-started turns aren't charged, so the server decides when they may happen,
  // and they can't carry a new student question.
  if (kind === 'opening') {
    const claimed = await AvatarSession.updateOne(
      { id: session.id, openingUsed: { $ne: true } },
      { $set: { openingUsed: true, freeNudgesLeft: 2 } },
    );
    if (!claimed.modifiedCount) throw new AppError('The call has already started', 409, 'AVATAR_TURN_REJECTED');
    messages = [];
  } else if (kind === 'nudge') {
    const claimed = await AvatarSession.updateOne(
      { id: session.id, freeNudgesLeft: { $gt: 0 } },
      { $inc: { freeNudgesLeft: -1 } },
    );
    if (!claimed.modifiedCount) throw new AppError('No hint is due', 409, 'AVATAR_TURN_REJECTED');
    // A nudge follows the tutor's question: drop anything the student "said" after it.
    while (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
    messages = messages.slice(-6).map((m) => ({ ...m, content: m.content.slice(0, 600) }));
  }
  const last = kind === 'turn' ? messages.pop() : undefined;
  if (kind === 'turn' && (!last || last.role !== 'user')) {
    throw new AppError('A student message is required', 400, 'VALIDATION_ERROR');
  }

  // Reply language: an explicit request ("speak Arabic") pins it; otherwise the
  // pin, otherwise the language the transcription heard.
  let spokenLanguage: Language | undefined;
  let pinned = session.pinnedLanguage;
  if (last) {
    const detected = detectLanguage(last.content);
    if (detected.source === 'explicit') pinned = detected.language;
    spokenLanguage = heardLanguage ? pinned || heardLanguage : undefined;
    logger.info('avatar_turn_language', {
      session: session.id,
      heard: heardLanguage ?? null,
      text: detected.language,
      textSource: detected.source,
      pinned: pinned ?? null,
      reply: spokenLanguage ?? null,
    });
  } else {
    spokenLanguage = pinned || session.language;
  }

  // Assignment tutor policy applies to calls too.
  const tutorPolicy = session.studentId ? await assignmentTutorPolicy(session.studentId) : { policy: null };
  if (tutorPolicy.policy === 'blocked') throw new AppError('The AI tutor is off while an assignment is open', 403, 'TUTOR_BLOCKED');

  // Independent setup runs in parallel: every millisecond here is silence on the call.
  const [curriculum, learner, reservation] = await Promise.all([
    loadSessionCurriculum(session),
    session.studentId ? getLearnerSnapshot(session.studentId) : Promise.resolve(undefined),
    session.studentId && kind === 'turn'
      ? reserveUsage({ userId: req.user!.id, studentId: session.studentId, feature: 'voice', sessionId: session.id }).catch(
          (err) => {
            throw new AppError((err as Error).message, 402, 'CREDIT_LIMIT_EXCEEDED');
          },
        )
      : Promise.resolve(undefined),
    (spokenLanguage && spokenLanguage !== session.language) || pinned !== session.pinnedLanguage
      ? AvatarSession.updateOne(
          { id: session.id },
          { language: spokenLanguage ?? session.language, ...(pinned ? { pinnedLanguage: pinned } : {}) },
        )
      : Promise.resolve(),
  ]);
  if (spokenLanguage) session.language = spokenLanguage;

  const lessonTitle =
    curriculum?.chapters.find((c) => c.id === curriculum.currentLessonId)?.title || session.lessonTitle;
  // A visual on screen, either asked for or chosen by the tutor: start drawing
  // right away, alongside the spoken answer.
  let visualStarted = false;
  const startVisual = async (question: string) => {
    if (visualStarted) return;
    visualStarted = true;
    await AvatarSession.updateOne({ id: session.id }, { $unset: { artifactHtml: 1 } });
    // The recent conversation says what "this" refers to (e.g. the equation asked about).
    const recent = messages
      .slice(-4)
      .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n');
    const context = [lessonTitle ? `Lesson: ${lessonTitle}` : '', recent].filter(Boolean).join('\n');
    waitUntil(
      generateVisualAid({ question, context, requested: true })
        .then((html) => (html ? AvatarSession.updateOne({ id: session.id }, { artifactHtml: html }) : undefined))
        .catch((error) => logger.warn('avatar_visual_save_failed', { error: serializeError(error) })),
    );
  };
  const visualRequested = Boolean(last && isVisualRequest(last.content));
  if (visualRequested) await startVisual(last!.content);

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (visualRequested) res.write(JSON.stringify({ visual: 'drawing' }) + '\n');

  const languageLine = spokenLanguage
    ? `(Reply only in ${spokenLanguage === 'arabic' ? 'Egyptian Arabic' : 'English'}, whatever language earlier turns used.)`
    : '';
  const query = [
    !curriculum && lessonTitle ? `Current lesson: ${lessonTitle}` : '',
    !curriculum && session.subject ? `Subject: ${session.subject}` : '',
    languageLine,
    kind === 'opening'
      ? `(The call has just started and the student hasn't spoken yet. Open it yourself: greet ${learner?.firstName || 'the student'} by name in one short sentence, then make one specific offer that fits where they stand - pick up the current or next lesson, practise a weak topic from their recent quiz, or do their review questions due today - and end with a question. Under 40 words. Don't list everything you know.)`
      : kind === 'nudge'
        ? "(The student has been quiet for a while after your last question. Help them get unstuck: give one short hint or a simpler version of the question, or offer two answers to choose from. One or two sentences, warm, and don't repeat the question word for word.)"
        : last!.content,
  ]
    .filter(Boolean)
    .join('\n');

  let spoken = '';
  // The reply may open with the hidden marker: hold the first characters until
  // it's clear whether it does.
  let head = '';
  let headDone = false;
  const emit = (text: string) => {
    if (!text) return;
    spoken += text;
    res.write(JSON.stringify({ content: text }) + '\n');
  };
  try {
    for await (const chunk of streamDirectTutorModel({
      query,
      history: messages,
      teachingMethod: 'socratic',
      curriculum,
      mode: 'voice',
      learner: learner ? describeSnapshot(learner) : undefined,
      pedagogy: policyRule(tutorPolicy.policy),
    })) {
      if (headDone) {
        emit(chunk);
        continue;
      }
      head += chunk;
      const trimmed = head.trimStart();
      if (trimmed.startsWith(SHOW_VISUAL_MARKER)) {
        headDone = true;
        if (!visualStarted) {
          await startVisual(last?.content || lessonTitle || 'this lesson');
          res.write(JSON.stringify({ visual: 'drawing' }) + '\n');
        }
        emit(trimmed.slice(SHOW_VISUAL_MARKER.length).trimStart());
      } else if (trimmed.length >= SHOW_VISUAL_MARKER.length || !SHOW_VISUAL_MARKER.startsWith(trimmed)) {
        headDone = true;
        emit(head);
      }
    }
    if (!headDone) emit(head);
  } catch (error) {
    logger.warn('avatar_stream_failed', { error: serializeError(error) });
  }

  if (!spoken) {
    if (reservation) await releaseUsage(reservation);
    if (kind === 'turn') {
      res.write(JSON.stringify({ content: "Sorry, I couldn't answer that just now. Please ask again." }) + '\n');
    }
  } else if (reservation) {
    await settleUsage(reservation, { model: getConfig().anthropicVoiceModel });
  }
  if (spoken && session.studentId) {
    const now = Date.now();
    const turn = [
      ...(last ? [{ id: generateMessageId(), role: 'user' as const, text: last.content, timestamp: new Date(now - 1) }] : []),
      { id: generateMessageId(), role: 'ai' as const, text: spoken.trim(), timestamp: new Date(now) },
    ];
    await appendTutorMessages(
      { id: session.id, studentId: session.studentId, institutionId: req.user!.institutionId, courseId: session.courseId, lessonId: session.lessonId },
      turn,
      { source: 'tutor_voice' },
    ).catch((error) => logger.warn('voice_transcript_save_failed', { error: serializeError(error) }));
    await TutorSession.updateOne(
      { id: session.id },
      { $inc: { messageCount: turn.length }, $set: { lastMessageAt: new Date(now) } },
    );
  }
  // An answered student turn allows up to two hints if they then go quiet.
  if (spoken && kind === 'turn') await AvatarSession.updateOne({ id: session.id }, { $set: { freeNudgesLeft: 2 } });

  // With browser transcription the language is already known for every turn.
  const target = last && !heardLanguage ? detectLanguageSwitch(last.content, session.language) : null;
  if (target) res.write(JSON.stringify({ language_switch: target }) + '\n');
  res.end();
});

import { DEMO_LIMITS, isDemoSessionInstitution } from '../config/demo';
import { cachedAssignmentTutorPolicy, policyRule } from '../services/tutorHandoff';
import { SentenceSplitter } from '../services/sentenceSplitter';
import { TutorSession } from '../models/TutorSession';
import { appendTutorMessages } from '../services/tutorMessages';
import { generateMessageId } from '../utils/idGenerator';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { getConfig } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError, creditReservationError } from '../middleware/errorHandler';
import { AvatarSession, IAvatarSession } from '../models/AvatarSession';
import { finalizeAvatarUsage, sweepAvatarUsage } from '../services/avatarUsage';
import { reserveAttempt } from '../services/aiGateway';
import { releaseAiBudget } from '../services/aiBudget';
import { releaseUsage, reserveUsage, settleUsage } from '../services/creditsService';
import { describeSnapshot, getLearnerSnapshot } from '../services/learnerSnapshot';
import { buildTeachingContext } from '../services/learningContext';
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
  isElevenLabsVoiceUsable,
  isVoiceRefusal,
  synthesizeSpeech,
} from '../services/elevenlabsVoice';
import { Readable } from 'stream';

// Live video tutor (replaces the separate avatar adapter service). Anam renders
// the avatar, listens and speaks; the answers come from the curriculum-aware
// Claude tutor, streamed as NDJSON lines the browser feeds to Anam.

type Language = 'english' | 'arabic';
type TurnKind = 'turn' | 'opening' | 'nudge';

function requireAnam() {
  const { anam, unpricedLimits } = getConfig();
  if (!anam) throw new AppError('The live tutor is not configured', 503, 'AVATAR_UNAVAILABLE');
  // Owner decision 2026-11-01 (OD-1): live calls are not capped per session.
  // Optional ANAM_SESSION_RESERVE_USD / ANAM_MAX_SESSION_SECONDS still apply
  // when set; otherwise the school's per-call ceiling (if any) and the
  // environment-wide test-spend cap bound the reservation.
  return { ...anam, reserveUsd: unpricedLimits.anamSessionReserveUsd, maxSeconds: unpricedLimits.anamMaxSessionSeconds };
}

// With ENARA's own voice working, Anam is only the face: it lip-syncs to audio
// the browser passes through. Otherwise Anam listens and speaks itself, and the
// browser streams our text answers to it.
//
// Anam's own listening and voice are set up for Egyptian learners:
// - Arabic calls expect Arabic ('ar'; Anam has no regional codes) through
//   Anam's own recogniser, the one that supports Arabic;
// - learners pause mid-sentence while finding words, so the end of a turn is
//   detected later than the default (0.35 instead of 0.5);
// - a quiet student is never hung up on by Anam (ENARA's call limits apply);
// - the voice is the configured Arabic (Egyptian) or English voice, a woman's
//   voice for faces that are women when one is configured.
export function anamPersonaConfig(opts: {
  serverVoice: boolean;
  language: Language;
  avatarId: string;
  gender?: 'woman' | 'man';
  anam: { voiceIdEn: string; voiceIdAr: string; voiceIdEnFemale?: string; voiceIdArFemale?: string };
  listeningOptions?: boolean;
}): Record<string, unknown> {
  const { serverVoice, language, avatarId, gender, anam } = opts;
  if (serverVoice) return { name: 'Enara', avatarId, enableAudioPassthrough: true };
  const arabic = language === 'arabic';
  const voiceId = arabic
    ? (gender === 'woman' && anam.voiceIdArFemale) || anam.voiceIdAr
    : (gender === 'woman' && anam.voiceIdEnFemale) || anam.voiceIdEn;
  return {
    name: 'Enara',
    avatarId,
    voiceId,
    // Anam's own LLM stays off: the browser streams our answers to it.
    llmId: 'CUSTOMER_CLIENT_V1',
    languageCode: arabic ? 'ar' : 'en',
    ...(opts.listeningOptions === false
      ? {}
      : {
          voiceDetectionOptions: {
            sttProvider: 'anam',
            endOfSpeechSensitivity: 0.35,
            silenceBeforeSessionEndSeconds: 0,
          },
        }),
  };
}

async function createAnamSessionToken(language: Language, avatarId?: string, opts: { serverVoice: boolean; gender?: 'woman' | 'man' } = { serverVoice: false }): Promise<string> {
  const anam = requireAnam();
  avatarId ||= anam.avatarId;
  const request = (listeningOptions: boolean) =>
    fetch('https://api.anam.ai/v1/auth/session-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${anam.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ personaConfig: anamPersonaConfig({ ...opts, language, avatarId: avatarId!, anam, listeningOptions }) }),
      signal: AbortSignal.timeout(15_000),
    });
  let res = await request(true);
  // Should Anam reject the listening settings, start the call without them.
  if (res.status === 400 && !opts.serverVoice) {
    logger.warn('anam_listening_options_rejected', { status: res.status });
    res = await request(false);
  }
  const data = (await res.json().catch(() => ({}))) as { sessionToken?: string };
  if (!res.ok || !data.sessionToken) {
    logger.warn('anam_session_token_failed', { status: res.status });
    throw new AppError('Could not start the live tutor', 502, 'AVATAR_UNAVAILABLE');
  }
  return data.sessionToken;
}

// One database round trip on the common path: the lookup also records the
// request for usage metering (lastActivityAt). `extra` lets a caller fold its
// own guarded update into the same write (the speech character count); when
// that guard fails the call returns null instead of throwing.
async function findOwnSession(req: AuthRequest): Promise<IAvatarSession>;
async function findOwnSession(
  req: AuthRequest,
  extra: { filter: Record<string, unknown>; inc: Record<string, number> },
): Promise<IAvatarSession | null>;
async function findOwnSession(
  req: AuthRequest,
  extra?: { filter: Record<string, unknown>; inc: Record<string, number> },
): Promise<IAvatarSession | null> {
  // Hard stop (P22): past the approved maximum length the call is ended on
  // the server and metered; the browser must start a new, newly reserved one.
  // (New calls cannot start without the limit: see requireAnam.)
  // Read without failing the heartbeat when the full config is not loadable
  // (unit callers); a running server always has it.
  let maxSeconds: number | undefined;
  try { maxSeconds = getConfig().unpricedLimits.anamMaxSessionSeconds; } catch { maxSeconds = undefined; }
  // Demo sessions: short calls.
  if (isDemoSessionInstitution(req.user!.institutionId)) maxSeconds = Math.min(maxSeconds ?? DEMO_LIMITS.avatarCallSeconds, DEMO_LIMITS.avatarCallSeconds);
  const own = { id: req.params.id, userId: req.user!.id, endedAt: null };
  const live = maxSeconds ? { createdAt: { $gte: new Date(Date.now() - maxSeconds * 1000) } } : {};
  const session = await AvatarSession.findOneAndUpdate(
    { ...own, ...live, ...(extra?.filter ?? {}) },
    { $set: { lastActivityAt: new Date() }, ...(extra ? { $inc: extra.inc } : {}) },
    { new: true },
  );
  if (session) return session;
  // Not updated: find out why (rare paths only).
  const existing = await AvatarSession.findOne(own);
  if (!existing) throw new AppError('Avatar session not found', 404);
  if (maxSeconds && Date.now() - existing.createdAt.getTime() > maxSeconds * 1000) {
    await AvatarSession.updateOne({ id: existing.id, endedAt: null }, { $set: { endedAt: new Date() } });
    void finalizeAvatarUsage(existing.id).catch(() => undefined);
    throw new AppError('This live call reached its maximum length. Start a new call to continue.', 410, 'AVATAR_SESSION_LIMIT');
  }
  if (extra) {
    await AvatarSession.updateOne({ id: existing.id }, { $set: { lastActivityAt: new Date() } });
    return null;
  }
  // Ended between the two reads.
  throw new AppError('Avatar session not found', 404);
}

// The voice follows the sentence's own script (Arabic letters -> Arabic), as
// in the browser (frontend/services/voiceText.ts languageOfText).
export function languageOfSentence(text: string): Language {
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return arabic > 0 && arabic >= latin / 3 ? 'arabic' : 'english';
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
// A tutor-chosen visual at most every this many student turns (asked-for ones always draw).
const VISUAL_GAP_TURNS = 3;
// Starts allowed per day, connected or not, as a multiple of the limit above.
const DAILY_START_FACTOR = 3;
// ElevenLabs characters per call (roughly 20 minutes of speech).
const MAX_SPOKEN_CHARS_PER_SESSION = 20_000;
const speechCharsGuard = (chars: number) => ({
  filter: { spokenChars: { $lte: MAX_SPOKEN_CHARS_PER_SESSION - chars } },
  inc: { spokenChars: chars },
});

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
  // The daily limit counts calls that actually got going (the video connected,
  // or the tutor opened the call): attempts that failed to start must not use
  // up a student's day (seen live: retries locked an account out). A wider
  // cap on every start keeps failed attempts bounded too.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const limit = isStudent ? DAILY_SESSIONS.student : DAILY_SESSIONS.staff;
  const [connected, started] = await Promise.all([
    AvatarSession.countDocuments({ userId: req.user!.id, createdAt: { $gte: since }, $or: [{ lastHeartbeatAt: { $ne: null } }, { openingUsed: true }] }),
    AvatarSession.countDocuments({ userId: req.user!.id, createdAt: { $gte: since } }),
  ]);
  if (connected >= limit || started >= limit * DAILY_START_FACTOR) {
    throw new AppError('Daily live tutor limit reached. Try again tomorrow.', 429, 'AVATAR_DAILY_LIMIT');
  }
  // A demo session includes a few short calls, whichever role makes them.
  if (isDemoSessionInstitution(req.user!.institutionId)) {
    const demoCalls = await AvatarSession.countDocuments({ institutionId: req.user!.institutionId, $or: [{ lastHeartbeatAt: { $ne: null } }, { openingUsed: true }] });
    if (demoCalls >= DEMO_LIMITS.avatarCallsPerSession) {
      throw new AppError(`The demo includes ${DEMO_LIMITS.avatarCallsPerSession} live tutor calls, and they've been used. The chat tutor is still available.`, 429, 'AVATAR_DAILY_LIMIT');
    }
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
  const ticket = await reserveAttempt({ feature: 'avatar_session', provider: 'anam', modelName: face?.avatarId || 'anam-default', ...(requireAnam().reserveUsd ? { boundUsd: requireAnam().reserveUsd } : {}) }, `avatar:${sessionId}`, 48 * 60 * 60 * 1000);
  // ENARA's own voice when it works, else the video tutor's voice and listening.
  const serverVoice = await isElevenLabsVoiceUsable();
  let sessionToken: string;
  try {
    sessionToken = await createAnamSessionToken(language, face?.avatarId, { serverVoice, gender: face?.gender });
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
    speech: serverVoice ? 'server' : 'avatar',
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
    // Neutral names: the browser sees no provider names ('video' is the
    // lip-synced face; speech 'server' is ENARA's own voice pipeline).
    provider: 'video',
    session_token: sessionToken,
    speech: serverVoice ? 'server' : 'avatar',
    fallback_reason: null,
  });
});

// Enara admins only (route): the video tutor's voice catalogue, filtered by a
// search (name, description or tags) and/or accent country (country=EG for
// Egyptian voices), plus the voices and listening settings in use now.
export const listAvatarVoices = asyncHandler(async (req: AuthRequest, res: Response) => {
  const anam = requireAnam();
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 60) : '';
  const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase().slice(0, 2) : '';
  const { voiceIdEn, voiceIdAr, voiceIdEnFemale, voiceIdArFemale } = anam;
  const configured = new Map<string, string>(
    ([['english', voiceIdEn], ['arabic', voiceIdAr], ['english_woman', voiceIdEnFemale], ['arabic_woman', voiceIdArFemale]] as Array<[string, string | undefined]>)
      .filter((e): e is [string, string] => Boolean(e[1]))
      .map(([use, id]) => [id, use]),
  );
  const summary = (v: Record<string, unknown>) => ({ id: v.id, name: v.displayName, gender: v.gender, country: v.country, description: v.description, tags: v.displayTags, sample: v.sampleUrl });
  const inUse: Array<Record<string, unknown>> = [];
  const voices: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= 10; page++) {
    const qs = new URLSearchParams({ page: String(page), perPage: '100' });
    const r = await fetch(`https://api.anam.ai/v1/voices?${qs}`, { headers: { Authorization: `Bearer ${anam.apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new AppError('Could not list voices', 502, 'AVATAR_UNAVAILABLE');
    const data = (await r.json()) as { data?: Array<Record<string, unknown>>; meta?: { lastPage?: number } };
    for (const v of data.data ?? []) {
      // The voices the tutor uses now, whatever the filter.
      const use = configured.get(String(v.id));
      if (use) inUse.push({ use, ...summary(v) });
      if (country && String(v.country ?? '').toUpperCase() !== country) continue;
      const text = `${v.displayName ?? ''} ${v.description ?? ''} ${(v.displayTags as string[] | undefined)?.join(' ') ?? ''}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) continue;
      voices.push(summary(v));
    }
    if (!data.meta?.lastPage || page >= data.meta.lastPage) break;
  }
  res.json({
    current: { voiceIdEn, voiceIdAr, voiceIdEnFemale: voiceIdEnFemale ?? null, voiceIdArFemale: voiceIdArFemale ?? null },
    inUse,
    listening: { arabic: anamPersonaConfig({ serverVoice: false, language: 'arabic', avatarId: anam.avatarId, anam }), english: anamPersonaConfig({ serverVoice: false, language: 'english', avatarId: anam.avatarId, anam }) },
    voices,
  });
});

export const switchAvatarLanguage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await findOwnSession(req);
  const language = toLanguage((req.body as { target_language?: string }).target_language);
  // A new Anam session token is new provider time: reserve it before asking
  // (P0d/P14 caps), and give it back if Anam refuses. Kept whole otherwise.
  const ticket = await reserveAttempt({ feature: 'avatar_session', provider: 'anam', modelName: session.avatarId || 'anam-default', ...(requireAnam().reserveUsd ? { boundUsd: requireAnam().reserveUsd } : {}) }, `avatar:${session.id}:switch:${randomUUID()}`, 48 * 60 * 60 * 1000);
  let sessionToken: string;
  try {
    sessionToken = await createAnamSessionToken(language, session.avatarId, { serverVoice: session.speech === 'server', gender: session.voiceGender });
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
  if (!isElevenLabsVoiceConfigured()) {
    throw new AppError('Voice is not configured', 503, 'AVATAR_UNAVAILABLE');
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 1000) throw new AppError('Text must be 1-1000 characters', 400, 'VALIDATION_ERROR');
  // Speech costs per character: cap it per call. Counted in the same write
  // that finds the call, so speech starts after one database round trip.
  const session = await findOwnSession(req, speechCharsGuard(text.length));
  if (!session) throw new AppError('This call has reached its speech limit', 429, 'AVATAR_SPEECH_LIMIT');

  const audio = await synthesizeSpeech(
    text,
    body.language ? toLanguage(body.language) : session.language,
    session.voiceGender,
  ).catch((error) => {
    // Refused: the browser restarts the call with the video tutor's voice.
    if (isVoiceRefusal(error)) throw new AppError('The tutor voice is unavailable', 503, 'AVATAR_VOICE_UNAVAILABLE');
    throw error;
  });
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

// The tutor announcing a visual in its own words ("I'm putting a table on the screen").
export const SAYS_ON_SCREEN = /\b(on (the|your) screen|on the panel|putting (up )?(a|an|the|some) \w+( \w+)? (up|on)|let me (draw|show you)|i'?ll (draw|show you))\b|على الشاشة|هرسم|هرسملك|هوريك/i;

// A student turn worth a picture: a question or request of four words or more,
// not a greeting or a one-word answer.
export function wantsAutoVisual(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  return !/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|goodbye|اهلا|أهلا|مرحبا|شكرا|ماشي|تمام|اه|لا)(?=$|[\s,.!?،؟])/i.test(text.trim());
}

export const streamAvatarAnswer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    session_id?: string;
    messages?: { role?: string; content?: string }[];
    // Set when the browser's transcription already detected the spoken language.
    language?: string;
    // 'opening': the tutor starts the call. 'nudge': the student has gone quiet
    // after a question. Both are started by the tutor, so they aren't charged.
    kind?: string;
    // The browser wants the reply's speech in this response (ElevenLabs
    // mode): saves a second round trip per sentence.
    speak?: boolean;
  };
  const turnStartedAt = Date.now();
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
      { $set: { openingUsed: true, freeNudgesLeft: 1 } },
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

  // Assignment tutor policy applies to calls too. Checked first and briefly
  // cached (a blocked tutor must not spend anything), while the rest of the
  // setup starts in parallel below.
  const tutorPolicy = session.studentId ? await cachedAssignmentTutorPolicy(session.studentId) : { policy: null };
  if (tutorPolicy.policy === 'blocked') throw new AppError('The AI tutor is off while an assignment is open', 403, 'TUTOR_BLOCKED');

  // Independent setup runs in parallel: every millisecond here is silence on the call.
  // Student turns are counted so the tutor puts up a new visual only every few
  // turns (seen live: one on every answer); asked-for visuals always draw.
  const [curriculum, learner, reservation, , plan, countedTurn] = await Promise.all([
    loadSessionCurriculum(session),
    session.studentId ? getLearnerSnapshot(session.studentId) : Promise.resolve(undefined),
    session.studentId && kind === 'turn'
      ? reserveUsage({ userId: req.user!.id, studentId: session.studentId, feature: 'voice', sessionId: session.id }).catch(
          (err) => {
            throw creditReservationError(err);
          },
        )
      : Promise.resolve(undefined),
    (spokenLanguage && spokenLanguage !== session.language) || pinned !== session.pinnedLanguage
      ? AvatarSession.updateOne(
          { id: session.id },
          { language: spokenLanguage ?? session.language, ...(pinned ? { pinnedLanguage: pinned } : {}) },
        )
      : Promise.resolve(),
    // Teaching plan (ped-v2) for every spoken line, the tutor's own opening and
    // nudges included: same orchestrator as chat, in a compact form, with channel
    // 'voice'. A nudge continues the turn it follows, so it uses the plan without
    // logging another decision. Null when adaptive pedagogy is off or no
    // objective applies (the call then teaches as before).
    session.studentId
      ? buildTeachingContext({
          institutionId: session.institutionId,
          studentId: session.studentId,
          lessonId: session.lessonId,
          tutorSessionId: session.id,
          channel: 'voice',
          compact: true,
          record: kind !== 'nudge',
        })
      : Promise.resolve(null),
    kind === 'turn'
      ? AvatarSession.findOneAndUpdate({ id: session.id }, { $inc: { turnCount: 1 } }, { new: true }).select('turnCount').lean()
      : Promise.resolve(null),
  ]);
  if (spokenLanguage) session.language = spokenLanguage;

  const lessonTitle =
    curriculum?.chapters.find((c) => c.id === curriculum.currentLessonId)?.title || session.lessonTitle;
  // A visual on screen, either asked for or chosen by the tutor: start drawing
  // right away, alongside the spoken answer.
  const turnNo = kind === 'turn' ? (countedTurn?.turnCount ?? 1) : (session.turnCount ?? 0);
  const tutorMayShow = turnNo - (session.lastVisualTurn ?? -VISUAL_GAP_TURNS) >= VISUAL_GAP_TURNS;
  let visualStarted = false;
  // Doesn't hold up the spoken answer: the drawing and its bookkeeping run
  // alongside it.
  const startVisual = (question: string) => {
    if (visualStarted) return;
    visualStarted = true;
    // The recent conversation says what "this" refers to (e.g. the equation asked about).
    const recent = messages
      .slice(-4)
      .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n');
    const context = [lessonTitle ? `Lesson: ${lessonTitle}` : '', recent].filter(Boolean).join('\n');
    const started = AvatarSession.findOneAndUpdate(
      { id: session.id },
      { $unset: { artifactHtml: 1 }, $inc: { visualsShown: 1, visualSeq: 1 }, $set: { lastVisualTurn: turnNo } },
      { new: true },
    ).select('visualSeq').lean();
    const drawn = generateVisualAid({ question, context, requested: true });
    waitUntil(
      Promise.all([started, drawn])
        .then(([row, html]) => (html ? AvatarSession.updateOne({ id: session.id, visualSeq: row?.visualSeq ?? 0 }, { artifactHtml: html }) : undefined))
        .catch((error) => logger.warn('avatar_visual_save_failed', { error: serializeError(error) })),
    );
  };
  const visualRequested = Boolean(last && isVisualRequest(last.content));
  // Every call gets a visual: the first real question (not a greeting) draws one
  // even if nobody asked. Not while an assignment limits the tutor to hints.
  const autoVisual =
    !visualRequested && kind === 'turn' && !session.visualsShown && tutorPolicy.policy !== 'hints_only' && wantsAutoVisual(last!.content);
  if (visualRequested || autoVisual) startVisual(last!.content);

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  const inlineSpeech = body.speak === true && isElevenLabsVoiceConfigured();
  if (inlineSpeech) res.setHeader('X-Enara-Speech', 'inline');
  res.flushHeaders();
  const setupMs = Date.now() - turnStartedAt;
  // The browser stops reading when the student talks over the tutor: stop
  // generating and speaking for this turn.
  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  // Inline speech: each sentence is counted against the call's speech cap and
  // its audio requested as soon as the sentence is complete; sentences are
  // sent in order as {say}, then its audio as base64 {audio} lines, then {said}.
  const splitter = new SentenceSplitter();
  let speechChain: Promise<void> = Promise.resolve();
  let sentenceNo = 0;
  let firstTextAt: number | undefined;
  let firstAudioAt: number | undefined;
  let voiceRefused = false;
  let voiceRefusalSent = false;
  const sayInline = (sentence: string) => {
    const n = sentenceNo++;
    const audio = (async () => {
      if (closed) return null;
      const counted = await AvatarSession.updateOne({ id: session.id, ...speechCharsGuard(sentence.length).filter }, { $inc: speechCharsGuard(sentence.length).inc });
      if (!counted.modifiedCount) return null;
      return synthesizeSpeech(sentence, languageOfSentence(sentence), session.voiceGender);
    })().catch((error) => {
      logger.warn('avatar_speech_failed', { error: serializeError(error) });
      if (isVoiceRefusal(error)) voiceRefused = true;
      return null;
    });
    speechChain = speechChain.then(async () => {
      if (closed) return;
      res.write(JSON.stringify({ say: sentence, s: n }) + '\n');
      const stream = await audio;
      if (stream) {
        const reader = stream.getReader();
        try {
          while (!closed) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value?.length) continue;
            firstAudioAt ??= Date.now();
            res.write(JSON.stringify({ audio: Buffer.from(value).toString('base64'), s: n }) + '\n');
          }
        } catch (error) {
          logger.warn('avatar_speech_failed', { error: serializeError(error) });
        } finally {
          if (closed) void reader.cancel().catch(() => undefined);
        }
      }
      if (!closed) res.write(JSON.stringify({ said: n }) + '\n');
      // Told once: the browser switches the call to the video tutor's voice.
      if (voiceRefused && !voiceRefusalSent && !closed) {
        voiceRefusalSent = true;
        res.write(JSON.stringify({ voice: 'unavailable' }) + '\n');
      }
    });
  };
  if (visualRequested || autoVisual) res.write(JSON.stringify({ visual: 'drawing' }) + '\n');

  const languageLine = spokenLanguage
    ? `(Reply only in ${spokenLanguage === 'arabic' ? 'Egyptian Arabic' : 'English'}, whatever language earlier turns used.)`
    : '';
  const query = [
    !curriculum && lessonTitle ? `Current lesson: ${lessonTitle}` : '',
    !curriculum && session.subject ? `Subject: ${session.subject}` : '',
    languageLine,
    autoVisual ? '(A visual about this is being drawn on the screen next to you right now: mention it in a few words and refer to it.)' : '',
    kind === 'turn' && !visualRequested && !autoVisual && !tutorMayShow
      ? "(A visual you put up a moment ago is still on the screen: don't put up a new one this turn and don't say you are; refer to the one showing if it helps.)"
      : '',
    kind === 'opening'
      ? plan
        ? `(The call has just started and the student hasn't spoken yet. Open it yourself: greet the student warmly in one short sentence (their name is not given to you; don't ask for it), then begin the way your teaching plan says - a plan that explains or models first starts with a short explanation of the first step; a plan that questions starts with one question. Under 40 words. Don't list everything you know.)`
        : `(The call has just started and the student hasn't spoken yet. Open it yourself: greet the student warmly in one short sentence (their name is not given to you; don't ask for it), then make one specific offer that fits where they stand - pick up the current or next lesson, practise a weak topic from their recent quiz, or do their review questions due today - and end with a question. Under 40 words. Don't list everything you know.)`
      : kind === 'nudge'
        ? plan
          ? "(The student has been quiet for a while after your last question. Help them get unstuck the way your teaching plan says: if the plan explains or models, show the next step yourself with a short example instead of asking again; if it questions, give one hint or a simpler question. One or two sentences, warm, and don't repeat the question word for word.)"
          : "(The student has been quiet for a while after your last question. Help them get unstuck: give one short hint or a simpler version of the question, or offer two answers to choose from. One or two sentences, warm, and don't repeat the question word for word.)"
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
    firstTextAt ??= Date.now();
    spoken += text;
    res.write(JSON.stringify({ content: text }) + '\n');
    if (inlineSpeech) for (const sentence of splitter.push(text)) sayInline(sentence);
  };
  try {
    for await (const chunk of streamDirectTutorModel({
      query,
      history: messages,
      teachingMethod: 'socratic',
      curriculum,
      mode: 'voice',
      learner: learner ? describeSnapshot(learner) : undefined,
      pedagogy: [plan?.prompt, policyRule(tutorPolicy.policy)].filter(Boolean).join('\n\n') || undefined,
      planActive: Boolean(plan),
    })) {
      if (closed) break;
      if (headDone) {
        emit(chunk);
        continue;
      }
      head += chunk;
      const trimmed = head.trimStart();
      if (trimmed.startsWith(SHOW_VISUAL_MARKER)) {
        headDone = true;
        if (!visualStarted && tutorMayShow) {
          startVisual(last?.content || lessonTitle || 'this lesson');
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
  if (inlineSpeech && spoken) for (const sentence of splitter.flush()) sayInline(sentence);

  // The tutor said it is putting something on the screen without the marker:
  // draw it, so its words and the panel agree.
  if (spoken && !visualStarted && tutorMayShow && tutorPolicy.policy !== 'hints_only' && SAYS_ON_SCREEN.test(spoken)) {
    startVisual(spoken.trim());
    res.write(JSON.stringify({ visual: 'drawing' }) + '\n');
  }

  if (!spoken) {
    if (reservation) await releaseUsage(reservation);
    if (kind === 'turn') {
      const sorry = "Sorry, I couldn't answer that just now. Please ask again.";
      res.write(JSON.stringify({ content: sorry }) + '\n');
      if (inlineSpeech) sayInline(sorry);
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
  if (spoken && kind === 'turn') await AvatarSession.updateOne({ id: session.id }, { $set: { freeNudgesLeft: 1 } });

  // With browser transcription the language is already known for every turn.
  const target = last && !heardLanguage ? detectLanguageSwitch(last.content, session.language) : null;
  if (target) res.write(JSON.stringify({ language_switch: target }) + '\n');
  await speechChain;
  logger.info('avatar_turn_timing', {
    session: session.id,
    kind,
    inlineSpeech,
    setupMs,
    firstTextMs: firstTextAt ? firstTextAt - turnStartedAt : null,
    firstAudioMs: firstAudioAt ? firstAudioAt - turnStartedAt : null,
    totalMs: Date.now() - turnStartedAt,
    sentences: sentenceNo,
    closedEarly: closed,
  });
  res.end();
});

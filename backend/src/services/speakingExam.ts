import { randomUUID } from 'crypto';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { AppError } from '../middleware/errorHandler';
import { getConfig } from '../config/env';
import type { IQuestion } from '../models/Assessment';
import type { IConversationTurn, ISpeakingAttempt } from '../models/AssessmentAttempt';
import { CEFR_LEVELS, DELIVERY_POLICIES, PLAN_MODES, type IAssignment, type ISpeakingSettings } from '../models/Assignment';
import { meteredCall, meteredSpeech } from './aiGateway';
import { isFeatureEnabled } from './featureFlags';
import { logger } from '../utils/logging';

// Teacher-controlled English speaking exams (P4). One exam definition (the
// assessment version plus the assignment's frozen speaking settings), two
// delivery modes:
//   voice_only   the student speaks into the microphone; the server
//                transcribes each recorded reply and speaks the examiner's
//                turns back. No avatar is contacted.
//   voice_avatar the same exam with a visual avatar. Not available yet: the
//                avatar layer for exams is not built or verified, so this mode
//                is refused (or falls back to voice_only where allowed).
// Audio goes through the server (not a browser-issued STT token), so the
// server enforces tenant, timing, turn limits and spend, and every STT/TTS
// call is metered by the AI gateway. Audio is transcribed and not stored.
// Transcripts are kept for the teacher's retention period, then removed.
// Pronunciation and other acoustic measures are never scored: ENARA has no
// audio-derived evidence for them, only the transcript.

export const SETTINGS_VERSION = 1;
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 90;
// A reply shorter than this is not evidence of speaking ability.
export const MIN_WORDS_PER_QUESTION = 3;
export const NOT_ASSESSED_FROM_TRANSCRIPT = ['pronunciation', 'intonation', 'acoustic fluency'];
const PRONUNCIATION = /pronunc|accent|intonation|phonolog|stress pattern/i;

export const CONSENT_TEXT =
  'This is a spoken exam. Your microphone recordings are sent to ENARA and transcribed by our speech provider (ElevenLabs) ' +
  'to grade your answers. ENARA does not keep the audio. Your teacher can see the transcript until it is removed under ' +
  "your school's retention period. Scores are based on what you say; pronunciation is not scored.";

const str = (v: unknown, max: number, field: string) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new AppError(`speaking.${field} must be text`, 400, 'VALIDATION_ERROR');
  return v.trim().slice(0, max) || undefined;
};
const list = (v: unknown, field: string, maxItems = 12, maxLen = 200) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > maxItems || v.some((x) => typeof x !== 'string')) throw new AppError(`speaking.${field} must be a list of up to ${maxItems} items`, 400, 'VALIDATION_ERROR');
  return [...new Set((v as string[]).map((x) => x.trim().slice(0, maxLen)).filter(Boolean))];
};
const int = (v: unknown, field: string, min: number, max: number, dflt: number) => {
  if (v === undefined || v === null) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(`speaking.${field} must be a whole number from ${min} to ${max}`, 400, 'VALIDATION_ERROR');
  return n;
};
function pick<T extends readonly string[]>(v: unknown, allowed: T, field: string, dflt?: T[number]): T[number] | undefined {
  if (v === undefined || v === null || v === '') return dflt;
  if (typeof v !== 'string' || !allowed.includes(v)) throw new AppError(`speaking.${field} is invalid`, 400, 'VALIDATION_ERROR');
  return v as T[number];
}

// Teacher input → stored settings. Everything is validated here; nothing is
// taken from the student.
export function parseSpeakingSettings(raw: unknown, classStudentIds: string[]): ISpeakingSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError('speaking settings are required for a speaking exam', 400, 'VALIDATION_ERROR');
  const r = raw as Record<string, unknown>;
  if (r.language !== undefined && r.language !== 'en') throw new AppError('Speaking exams are in English', 400, 'VALIDATION_ERROR');
  const accommodationStudentIds = list(r.accommodationStudentIds, 'accommodationStudentIds', 500, 128);
  if (accommodationStudentIds.some((s) => !classStudentIds.includes(s))) throw new AppError('Accommodations can only be given to students in the class', 400, 'VALIDATION_ERROR');
  const threshold = r.passThreshold === undefined || r.passThreshold === null ? undefined : int(r.passThreshold, 'passThreshold', 0, 100, 0);
  return {
    settingsVersion: SETTINGS_VERSION,
    language: 'en',
    cefrLevel: pick(r.cefrLevel, CEFR_LEVELS, 'cefrLevel'),
    topic: str(r.topic, 200, 'topic'),
    context: str(r.context, 1000, 'context'),
    persona: str(r.persona, 300, 'persona'),
    instructions: str(r.instructions, 2000, 'instructions'),
    planMode: pick(r.planMode, PLAN_MODES, 'planMode', 'scripted')!,
    openingPrompt: str(r.openingPrompt, 500, 'openingPrompt'),
    requiredTopics: list(r.requiredTopics, 'requiredTopics'),
    disallowedTopics: list(r.disallowedTopics, 'disallowedTopics'),
    followUpsPerQuestion: int(r.followUpsPerQuestion, 'followUpsPerQuestion', 0, 1, 1),
    maxStudentTurns: int(r.maxStudentTurns, 'maxStudentTurns', 1, 60, 20),
    durationMinutes: int(r.durationMinutes, 'durationMinutes', 1, 60, 10),
    prepSeconds: int(r.prepSeconds, 'prepSeconds', 0, 300, 0),
    deliveryPolicy: pick(r.deliveryPolicy, DELIVERY_POLICIES, 'deliveryPolicy', 'voice_only')!,
    examinerVoice: pick(r.examinerVoice, ['default', 'female'] as const, 'examinerVoice', 'default')!,
    accommodationStudentIds,
    ...(threshold === undefined ? {} : { passThreshold: threshold }),
    transcriptRetentionDays: int(r.transcriptRetentionDays, 'transcriptRetentionDays', 7, 365, 90),
  };
}

// The avatar layer for exams: not built or verified for exams, so never
// available. Tests can simulate availability to check the fallback rules.
let avatarOverride: boolean | null = null;
export function setAvatarExamAvailabilityForTests(v: boolean | null) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  avatarOverride = v;
}
export async function avatarExamAvailable(institutionId: string): Promise<{ available: boolean; reason?: string }> {
  if (!(await isFeatureEnabled(institutionId, 'speaking_exam_avatar_enabled'))) return { available: false, reason: 'The avatar option is not enabled for this school.' };
  if (avatarOverride !== null) return avatarOverride ? { available: true } : { available: false, reason: 'The avatar service is unavailable.' };
  return { available: false, reason: 'Avatar speaking exams are not available yet.' };
}

export function voiceConfigured() {
  return Boolean(getConfig().elevenlabs);
}

// The assessment behind a speaking exam: open-response questions with a
// teacher rubric, and no criterion that would need audio-derived evidence.
export function checkSpeakingQuestions(questions: { type: string; rubric?: { criteria?: { title?: string; description?: string }[] } }[]) {
  if (!questions.length) throw new AppError('A speaking exam needs at least one question', 400, 'VALIDATION_ERROR');
  if (questions.some((q) => q.type !== 'open-response')) throw new AppError('A speaking exam can only have open-response questions', 400, 'VALIDATION_ERROR');
  if (questions.some((q) => !q.rubric?.criteria?.length)) throw new AppError('Every speaking exam question needs a rubric', 400, 'VALIDATION_ERROR');
  const bad = questions.flatMap((q) => q.rubric!.criteria!).find((c) => PRONUNCIATION.test(`${c.title ?? ''} ${c.description ?? ''}`));
  if (bad) {
    throw new AppError(
      `"${bad.title}" needs audio-based evidence (pronunciation, accent or intonation), which ENARA does not measure. Grade it in person, or remove it from the rubric.`,
      400,
      'AUDIO_EVIDENCE_UNSUPPORTED',
    );
  }
}

// Teacher policy → the mode a student gets. Student input only chooses
// between modes the teacher allowed.
export async function resolveDeliveryMode(a: Pick<IAssignment, 'institutionId' | 'speaking'>, studentId: string, requested: unknown) {
  const s = a.speaking!;
  if (requested === 'text_accommodation') {
    if (!s.accommodationStudentIds.includes(studentId)) throw new AppError('A typed accommodation has not been arranged for you', 403, 'ACCOMMODATION_NOT_ALLOWED');
    return { mode: 'text_accommodation' as const };
  }
  const want = requested === 'voice_avatar' ? 'voice_avatar' : requested === 'voice_only' || requested === undefined ? 'voice_only' : null;
  if (!want) throw new AppError('mode is invalid', 400, 'VALIDATION_ERROR');
  const allowed = s.deliveryPolicy === 'student_choice' ? ['voice_only', 'voice_avatar'] : [s.deliveryPolicy];
  if (!allowed.includes(want)) throw new AppError('Your teacher has not allowed this mode for this exam', 403, 'MODE_NOT_ALLOWED');
  if (want === 'voice_avatar') {
    const avatar = await avatarExamAvailable(a.institutionId);
    if (avatar.available) return { mode: 'voice_avatar' as const };
    if (allowed.includes('voice_only')) return { mode: 'voice_only' as const, fallback: { from: 'voice_avatar', to: 'voice_only', at: new Date(), reason: avatar.reason ?? 'avatar unavailable' } };
    throw new AppError(`${avatar.reason} Your teacher requires the avatar for this exam.`, 503, 'AVATAR_UNAVAILABLE');
  }
  return { mode: 'voice_only' as const };
}

// What a student may see of the settings (no persona prompts or rubric).
export function publicSettings(s: ISpeakingSettings, studentId: string) {
  return {
    language: s.language,
    cefrLevel: s.cefrLevel ?? null,
    topic: s.topic ?? null,
    instructions: s.instructions ?? null,
    durationMinutes: s.durationMinutes,
    prepSeconds: s.prepSeconds,
    maxStudentTurns: s.maxStudentTurns,
    deliveryPolicy: s.deliveryPolicy,
    accommodationAllowed: s.accommodationStudentIds.includes(studentId),
    consentText: CONSENT_TEXT,
    notAssessed: NOT_ASSESSED_FROM_TRANSCRIPT,
  };
}

export function newSpeakingAttempt(mode: ISpeakingAttempt['mode'], s: ISpeakingSettings, requested: unknown, fallback?: ISpeakingAttempt['fallback']): ISpeakingAttempt {
  return {
    mode,
    requestedMode: typeof requested === 'string' ? requested.slice(0, 40) : undefined,
    settingsVersion: s.settingsVersion,
    consentAt: new Date(),
    voiceSessionId: `vs-${randomUUID()}`,
    ...(fallback ? { fallback } : {}),
    studentTurns: 0,
    noSpeechCount: 0,
    audioSeconds: 0,
    notAssessed: NOT_ASSESSED_FROM_TRANSCRIPT,
    assessedAs: mode === 'text_accommodation' ? 'written_accommodation' : 'spoken',
  };
}

// The examiner's opening, from the teacher's settings.
export function speakingOpening(s: ISpeakingSettings, count: number, first: IQuestion) {
  const intro = s.openingPrompt ?? `Hello. This is your English speaking exam${s.topic ? ` about ${s.topic}` : ''}.`;
  return `${intro} I will ask you ${count} question${count === 1 ? '' : 's'}. Please answer in English, in your own words. ` +
    `I can't help you or tell you if you are right. Question 1 of ${count}. ${first.text}`;
}

// No coaching: a follow-up is dropped if it would hand the student words from
// the model answer or rubric, or touches a topic the teacher ruled out.
export function safeFollowUp(followUp: string | null, q: IQuestion, s: ISpeakingSettings, studentSoFar: string): string | null {
  if (!followUp) return null;
  const said = new Set(studentSoFar.toLowerCase().match(/[a-z']{4,}/g) ?? []);
  // Content words only (6+ letters), so ordinary words like "about" don't count.
  const words = (t?: string) => new Set((t ?? '').toLowerCase().match(/[a-z']{6,}/g) ?? []);
  const secret = new Set([...words(q.modelAnswer), ...((q.rubric?.criteria ?? []) as { levels?: { description?: string }[] }[]).flatMap((c) => (c.levels ?? []).flatMap((l) => [...words(l.description)]))]);
  for (const w of words(q.text)) secret.delete(w);
  const leaked = [...words(followUp)].filter((w) => secret.has(w) && !said.has(w));
  if (leaked.length) return null;
  const lower = followUp.toLowerCase();
  if (s.disallowedTopics.some((t) => t && lower.includes(t.toLowerCase()))) return null;
  if (/\b(correct|right answer|wrong|good job|well done|try saying|you should say|the answer is)\b/i.test(followUp)) return null;
  return followUp;
}

// Each question needs the student's own spoken (or accommodated) reply of a
// minimum length; otherwise the attempt has insufficient evidence and is not
// scored as a speaking result.
export function evidenceFor(questions: IQuestion[], turns: IConversationTurn[]): 'sufficient' | 'insufficient' {
  for (const q of questions) {
    const words = turns
      .filter((t) => t.role === 'student' && t.questionId === q.id && (t.source === 'speech' || t.source === 'typed_accommodation'))
      .map((t) => t.text)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean).length;
    if (words < MIN_WORDS_PER_QUESTION) return 'insufficient';
  }
  return 'sufficient';
}

let client: ElevenLabsClient | undefined;
function eleven() {
  const config = getConfig().elevenlabs;
  if (!config) throw new AppError('Spoken exams are not available: no speech service is configured', 503, 'VOICE_UNAVAILABLE');
  client ??= new ElevenLabsClient({ apiKey: config.apiKey, timeoutInSeconds: 30, maxRetries: 0 });
  return { client, config };
}

// One recorded reply → text, through the gateway (budget, pause, metering).
// Duration comes from the provider's word timings when it reports them;
// otherwise usage is recorded as unknown, never as free.
export async function transcribeReply(audio: Buffer, mime: string, refs: { attemptId: string; assessmentId: string; sessionId: string }) {
  const { client: el, config } = eleven();
  const res = await meteredCall(
    { feature: 'speaking_exam_stt', provider: 'elevenlabs', modelName: config.examSttModel, refs },
    () => el.speechToText.convert({ file: new Blob([audio], { type: mime }), modelId: config.examSttModel, languageCode: 'en', tagAudioEvents: false }),
    { units: (r) => audioSecondsOf(r) },
  );
  const text = String((res as { text?: unknown }).text ?? '').replace(/\s+/g, ' ').trim();
  return { text, audioSeconds: audioSecondsOf(res)?.audioSeconds };
}

function audioSecondsOf(r: unknown) {
  const words = (r as { words?: { end?: number }[] })?.words;
  const end = Array.isArray(words) && words.length ? Number(words[words.length - 1]?.end) : NaN;
  return Number.isFinite(end) && end > 0 ? { audioSeconds: Math.round(end * 10) / 10 } : undefined;
}

// The examiner's words as 16 kHz PCM. A failure leaves the exam running with
// the text on screen.
export async function speakExaminer(text: string, s: ISpeakingSettings, refs: { attemptId?: string; assessmentId: string; sessionId: string }) {
  const { client: el, config } = eleven();
  const voiceId = s.examinerVoice === 'female' ? config.femaleVoiceId : config.voiceIdEn;
  try {
    const stream = await meteredSpeech({ feature: 'speaking_exam_tts', modelName: config.ttsModel, maxAttempts: 2, refs }, text.length, () =>
      el.textToSpeech.stream(voiceId, { text, modelId: config.ttsModel, outputFormat: 'pcm_16000', languageCode: 'en' }),
    );
    const chunks: Buffer[] = [];
    for await (const c of stream as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
    return { format: 'pcm_16000' as const, base64: Buffer.concat(chunks).toString('base64') };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code && /^AI_|RATE_LIMITED|USAGE_METERING_FAILED/.test(code)) throw error;
    logger.warn('speaking_exam_tts_failed', { error: String((error as Error).message).slice(0, 200) });
    return null;
  }
}

// Removes transcripts past the teacher's retention period. Scores, criteria
// and feedback stay; the transcript text and the answer text are replaced.
export async function sweepSpeakingTranscripts(now = new Date()) {
  const { Assignment } = await import('../models/Assignment');
  const { AssessmentAttempt } = await import('../models/AssessmentAttempt');
  const exams = await Assignment.find({ format: 'english_conversation' }).select('id speaking').lean();
  let purged = 0;
  for (const a of exams) {
    const days = (a.speaking as ISpeakingSettings | undefined)?.transcriptRetentionDays ?? 90;
    const before = new Date(now.getTime() - days * 86_400_000);
    const due = await AssessmentAttempt.find({ assignmentId: a.id, status: 'submitted', submittedAt: { $lt: before }, 'speaking.transcriptPurgedAt': { $exists: false } }).select('id').lean();
    for (const t of due) purged += (await purgeTranscript(t.id, 'system:retention', now)) ? 1 : 0;
  }
  return { purged };
}

export async function purgeTranscript(attemptId: string, by: string, now = new Date()) {
  const { AssessmentAttempt } = await import('../models/AssessmentAttempt');
  const attempt = await AssessmentAttempt.findOne({ id: attemptId, 'speaking.transcriptPurgedAt': { $exists: false } });
  if (!attempt) return false;
  attempt.conversation = (attempt.conversation ?? []).map((t) => ({ ...t, text: t.role === 'student' ? '[transcript removed]' : t.text }));
  for (const x of attempt.answers) x.studentAnswer = '[transcript removed]';
  attempt.speaking = { ...(attempt.speaking as ISpeakingAttempt), transcriptPurgedAt: now };
  attempt.markModified('speaking');
  attempt.history.push({ at: now, by, action: 'transcript_removed' } as never);
  await attempt.save();
  return true;
}

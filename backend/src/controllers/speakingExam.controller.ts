import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Assessment, type IQuestion } from '../models/Assessment';
import { AssessmentAttempt, type IConversationTurn, type ISpeakingAttempt } from '../models/AssessmentAttempt';
import { Assignment, type IAssignment } from '../models/Assignment';
import { getVersion } from '../services/assessmentVersions';
import { answerFor, decideFollowUp, MAX_REPLY_CHARS, nextTurns, CLOSING_TURN } from '../services/conversationExam';
import { isFeatureEnabled } from '../services/featureFlags';
import { classStudentIds, loadClassForStaff } from '../services/learningAccess';
import {
  MAX_AUDIO_BYTES,
  checkSpeakingQuestions,
  newSpeakingAttempt,
  parseSpeakingSettings,
  publicSettings,
  purgeTranscript,
  resolveDeliveryMode,
  safeFollowUp,
  speakExaminer,
  speakingOpening,
  transcribeReply,
  voiceConfigured,
} from '../services/speakingExam';
import { ensurePlainObject, getRequiredId, rejectMongoOperators } from '../utils/validation';
import { GRACE_MS, loadMine } from './meAssignments.controller';

// P4 speaking exams. The server owns the exam: mode, consent, clock, turns,
// follow-ups and what counts as the student's answer.

const AUDIO_TYPES = /^(audio\/(webm|ogg|wav|x-wav|mpeg|mp4|aac|m4a)|video\/webm)(;.*)?$/;

async function requireSpeakingSchool(institutionId: string) {
  if (!(await isFeatureEnabled(institutionId, 'speaking_exams_enabled'))) throw new AppError('Speaking exams are not enabled for this school', 404, 'FEATURE_DISABLED');
}

async function openSpeakingAttempt(req: AuthRequest) {
  const studentId = req.user!.studentId!;
  const a = await loadMine(studentId, String(req.params.id));
  if (a.format !== 'english_conversation' || !a.speaking) throw new AppError('This assignment is not a speaking exam', 409, 'NOT_SPEAKING_EXAM');
  await requireSpeakingSchool(a.institutionId);
  const now = new Date();
  const attempt = await AssessmentAttempt.findOne({
    id: String(req.params.attemptId),
    studentId,
    assignmentId: a.id,
    status: 'in-progress',
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: new Date(now.getTime() - GRACE_MS) } }],
  });
  if (!attempt) throw new AppError('This attempt is no longer open', 409, 'ATTEMPT_CLOSED');
  const version = await getVersion(a.assessmentId, a.assessmentVersion);
  const questions = (version.questions as IQuestion[]).filter((q) => q.type === 'open-response');
  if (!questions.length) throw new AppError('This exam has no questions', 409, 'NO_QUESTIONS');
  return { a, attempt, questions, studentId, now };
}

const voiceMode = (sp?: ISpeakingAttempt) => sp && sp.mode !== 'text_accommodation';
const examinerText = (turns: IConversationTurn[]) => turns.filter((t) => t.role === 'examiner').map((t) => t.text).join(' ');

// POST /api/me/assignments/:id/attempts/:attemptId/speaking/begin { mode, consent }
// Starts the spoken exam in a mode the teacher allowed, after consent. On a
// reload it returns the exam as it is (no second opening).
export const beginSpeaking = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = ensurePlainObject(req.body ?? {});
  rejectMongoOperators(body);
  const { a, attempt, questions, studentId, now } = await openSpeakingAttempt(req);
  const s = a.speaking!;
  if (attempt.speaking) {
    res.json({ resumed: true, mode: attempt.speaking.mode, fallback: attempt.speaking.fallback ?? null, turns: attempt.conversation ?? [], state: attempt.conversationState ?? null, expiresAt: attempt.expiresAt ?? null, audio: null, settings: publicSettings(s, studentId) });
    return;
  }
  if (body.consent !== true) throw new AppError('Please confirm the recording notice to start', 400, 'CONSENT_REQUIRED');
  const resolved = await resolveDeliveryMode(a, studentId, body.mode);
  if (resolved.mode !== 'text_accommodation' && !voiceConfigured()) throw new AppError('Spoken exams are not available: no speech service is configured', 503, 'VOICE_UNAVAILABLE');
  const speaking = newSpeakingAttempt(resolved.mode, s, body.mode, 'fallback' in resolved ? resolved.fallback : undefined);
  const opening: IConversationTurn = { questionId: questions[0].id, role: 'examiner', kind: 'question', text: speakingOpening(s, questions.length, questions[0]), at: now };
  const examEnd = new Date(now.getTime() + (s.prepSeconds + s.durationMinutes * 60) * 1000);
  const expiresAt = attempt.expiresAt && attempt.expiresAt < examEnd ? attempt.expiresAt : examEnd;
  const saved = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, status: 'in-progress', speaking: { $exists: false } },
    {
      $set: { speaking, conversation: [opening], conversationState: { index: 0, probed: false, done: false }, expiresAt },
      $push: { history: { at: now, by: req.user!.id, action: 'speaking_started', from: speaking.requestedMode ?? null, to: speaking.mode, ...(speaking.fallback ? { reason: `fallback: ${speaking.fallback.reason}` } : {}) } },
    },
    { new: true },
  );
  if (!saved) throw new AppError('The exam was already started; reload to continue', 409, 'CONVERSATION_CONFLICT');
  const audio = voiceMode(speaking) ? await speakExaminer(opening.text, s, { attemptId: attempt.id, assessmentId: a.assessmentId, sessionId: speaking.voiceSessionId }) : null;
  res.status(201).json({ resumed: false, mode: speaking.mode, fallback: speaking.fallback ?? null, turns: [opening], state: saved.conversationState, expiresAt, audio, settings: publicSettings(s, studentId) });
});

// POST /api/me/assignments/:id/attempts/:attemptId/speaking/turn
// Voice modes: multipart `audio` (the student's recorded reply). Typed
// accommodation: { text }. `turnCount` (turns the client has) guards against
// duplicate sends.
export const speakingTurn = asyncHandler(async (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  rejectMongoOperators(body);
  const { a, attempt, questions, now } = await openSpeakingAttempt(req);
  const s = a.speaking!;
  const sp = attempt.speaking;
  if (!sp) throw new AppError('Start the exam first', 409, 'SPEAKING_NOT_STARTED');
  const state = attempt.conversationState;
  const history = attempt.conversation ?? [];
  if (!state || state.done) throw new AppError('The exam conversation is finished; submit it now', 409, 'CONVERSATION_DONE');
  if (body.turnCount !== undefined && Number(body.turnCount) !== history.length) throw new AppError('This reply was already received; reload to continue', 409, 'CONVERSATION_CONFLICT');
  // Preparation time: no replies until it is over.
  if (s.prepSeconds && now.getTime() < new Date(sp.consentAt).getTime() + s.prepSeconds * 1000) throw new AppError('Preparation time is not over yet', 409, 'PREPARATION_TIME');

  let reply: string;
  let audioSeconds: number | undefined;
  const source: IConversationTurn['source'] = sp.mode === 'text_accommodation' ? 'typed_accommodation' : 'speech';
  if (source === 'typed_accommodation') {
    reply = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_REPLY_CHARS) : '';
    if (!reply) throw new AppError('Type your answer', 400, 'VALIDATION_ERROR');
  } else {
    // Spoken modes accept audio only: typed text never stands in for speech.
    if (!req.file) throw new AppError('Record your answer with the microphone', 400, 'AUDIO_REQUIRED');
    if (req.file.size > MAX_AUDIO_BYTES || !AUDIO_TYPES.test(req.file.mimetype)) throw new AppError('The recording could not be used; try again', 400, 'INVALID_AUDIO');
    const heard = await transcribeReply(req.file.buffer, req.file.mimetype.split(';')[0], { attemptId: attempt.id, assessmentId: a.assessmentId, sessionId: sp.voiceSessionId }).catch((error) => {
      const code = (error as { code?: string }).code ?? '';
      if (/^AI_|RATE_LIMITED|USAGE_METERING_FAILED|VOICE_UNAVAILABLE/.test(code)) throw error;
      throw new AppError('Your recording could not be transcribed; please say it again', 502, 'STT_FAILED');
    });
    if (heard.text.split(/\s+/).filter(Boolean).length < 1) {
      await AssessmentAttempt.updateOne({ id: attempt.id }, { $inc: { 'speaking.noSpeechCount': 1 } });
      throw new AppError("We couldn't hear any speech. Check your microphone and try again.", 422, 'NO_SPEECH_DETECTED');
    }
    reply = heard.text.slice(0, MAX_REPLY_CHARS);
    audioSeconds = heard.audioSeconds;
  }

  const q = questions[state.index];
  const limitReached = sp.studentTurns + 1 >= s.maxStudentTurns;
  let followUp: string | null = null;
  if (!limitReached && s.followUpsPerQuestion > 0 && !state.probed) {
    const soFar = [answerFor(history, q.id), reply].filter(Boolean).join('\n');
    followUp = safeFollowUp(await decideFollowUp({ question: q, answer: soFar, institutionId: a.institutionId }), q, s, soFar);
  }
  let step = nextTurns({ questions, state, reply, followUp, now });
  if (limitReached && !step.state.done) {
    // The teacher's turn limit: the exam ends here.
    step = { turns: [step.turns[0], { questionId: q.id, role: 'examiner', kind: 'closing', text: CLOSING_TURN, at: now }], state: { ...step.state, done: true } };
  }
  step.turns[0] = { ...step.turns[0], source, ...(audioSeconds ? { audioSeconds } : {}) };
  const saved = await AssessmentAttempt.findOneAndUpdate(
    { id: attempt.id, status: 'in-progress', $expr: { $eq: [{ $size: { $ifNull: ['$conversation', []] } }, history.length] } },
    { $push: { conversation: { $each: step.turns } }, $set: { conversationState: step.state }, $inc: { 'speaking.studentTurns': 1, 'speaking.audioSeconds': audioSeconds ?? 0 } },
    { new: true },
  );
  if (!saved) throw new AppError('The conversation changed; reload to continue', 409, 'CONVERSATION_CONFLICT');
  const audio = voiceMode(sp) ? await speakExaminer(examinerText(step.turns), s, { attemptId: attempt.id, assessmentId: a.assessmentId, sessionId: sp.voiceSessionId }) : null;
  res.json({ transcript: reply, turns: step.turns, state: step.state, audio, turnsLeft: Math.max(0, s.maxStudentTurns - (sp.studentTurns + 1)) });
});

// POST /api/speaking/preview { assessmentId, speaking, history?, message? } or
// multipart with `audio`. A teacher tries their exam: nothing is saved, no
// attempt is created and no mastery is touched.
export const previewSpeaking = asyncHandler(async (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  rejectMongoOperators(body);
  const user = req.user!;
  await requireSpeakingSchool(user.institutionId!);
  const assessment = await Assessment.findOne({ id: getRequiredId(body, 'assessmentId'), institutionId: user.institutionId }).lean();
  if (!assessment || (user.role === 'teacher' && assessment.createdBy !== user.id)) throw new AppError('Assessment not found', 404);
  const questions = (assessment.questions as IQuestion[]).filter((q) => q.type === 'open-response');
  checkSpeakingQuestions(assessment.questions as never);
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
  const settings = parseSpeakingSettings(parse(body.speaking) ?? {}, []);
  const history = (Array.isArray(parse(body.history)) ? parse(body.history) : []) as { role?: string; questionId?: string; text?: string; kind?: string }[];
  if (history.length > 120) throw new AppError('Preview is too long', 400, 'VALIDATION_ERROR');
  const turns: IConversationTurn[] = history.map((t) => ({ role: t.role === 'student' ? 'student' : 'examiner', questionId: String(t.questionId ?? ''), kind: t.kind as never, text: String(t.text ?? '').slice(0, MAX_REPLY_CHARS), at: new Date() }));
  const refs = { assessmentId: assessment.id, sessionId: `preview-${user.id}` };
  if (!turns.length) {
    const text = speakingOpening(settings, questions.length, questions[0]);
    res.json({ preview: true, turns: [{ questionId: questions[0].id, role: 'examiner', kind: 'question', text }], state: { index: 0, probed: false, done: false }, audio: body.withAudio === 'true' || body.withAudio === true ? await speakExaminer(text, settings, refs) : null });
    return;
  }
  // Rebuild the state from the preview turns (preview only; nothing persists).
  const asked = turns.filter((t) => t.role === 'examiner');
  const last = asked[asked.length - 1];
  const index = Math.max(0, questions.findIndex((q) => q.id === last?.questionId));
  const state = { index, probed: last?.kind === 'follow_up', done: last?.kind === 'closing' };
  if (state.done) throw new AppError('The preview is finished', 409, 'CONVERSATION_DONE');
  let reply = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_REPLY_CHARS) : '';
  if (req.file) reply = (await transcribeReply(req.file.buffer, req.file.mimetype.split(';')[0], { attemptId: 'preview', ...refs })).text;
  if (!reply) throw new AppError('Say or type a reply', 400, 'VALIDATION_ERROR');
  const q = questions[state.index];
  let followUp: string | null = null;
  if (settings.followUpsPerQuestion > 0 && !state.probed) {
    const soFar = [answerFor(turns, q.id), reply].join('\n');
    followUp = safeFollowUp(await decideFollowUp({ question: q, answer: soFar, institutionId: assessment.institutionId }), q, settings, soFar);
  }
  const step = nextTurns({ questions, state, reply, followUp });
  res.json({ preview: true, transcript: reply, turns: step.turns, state: step.state, audio: body.withAudio === 'true' || body.withAudio === true ? await speakExaminer(examinerText(step.turns), settings, refs) : null });
});

async function loadExamForStaff(req: AuthRequest): Promise<IAssignment> {
  const user = req.user!;
  const a = await Assignment.findOne({ id: String(req.params.id), institutionId: user.institutionId }).lean();
  if (!a) throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
  if (user.role === 'teacher') await loadClassForStaff(req, a.classId);
  if (a.format !== 'english_conversation') throw new AppError('This assignment is not a speaking exam', 409, 'NOT_SPEAKING_EXAM');
  return a as unknown as IAssignment;
}

// GET /api/assignments/:id/speaking-attempts — the teacher's view: status,
// mode, evidence, scores and (until removed) the transcript.
export const listSpeakingAttempts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const a = await loadExamForStaff(req);
  const cls = await loadClassForStaff(req, a.classId);
  const members = new Set(await classStudentIds(cls));
  const attempts = await AssessmentAttempt.find({ assignmentId: a.id, institutionId: a.institutionId }).sort({ startedAt: -1 }).limit(500).lean();
  res.json({
    settings: a.speaking,
    attempts: attempts
      .filter((t) => members.has(t.studentId))
      .map((t) => ({
        attemptId: t.id,
        studentId: t.studentId,
        status: t.status,
        gradingStatus: t.gradingStatus ?? null,
        exceptionReason: t.exceptionReason ?? null,
        mode: t.speaking?.mode ?? null,
        fallback: t.speaking?.fallback ?? null,
        assessedAs: t.speaking?.assessedAs ?? null,
        evidence: t.speaking?.evidence ?? null,
        notAssessed: t.speaking?.notAssessed ?? [],
        studentTurns: t.speaking?.studentTurns ?? 0,
        score: t.gradingStatus === 'released' ? t.score ?? null : null,
        criteria: (t.answers ?? []).map((x) => ({ questionId: x.questionId, points: x.points ?? null, maxPoints: x.maxPoints ?? null, feedback: x.feedback ?? null, criterionScores: x.criterionScores ?? [] })),
        transcriptRemoved: Boolean(t.speaking?.transcriptPurgedAt),
        transcript: t.conversation ?? [],
      })),
  });
});

// POST /api/assignments/:id/attempts/:attemptId/speaking/remove-transcript
export const removeSpeakingTranscript = asyncHandler(async (req: AuthRequest, res: Response) => {
  const a = await loadExamForStaff(req);
  const attempt = await AssessmentAttempt.findOne({ id: String(req.params.attemptId), assignmentId: a.id, institutionId: a.institutionId }).select('id status').lean();
  if (!attempt) throw new AppError('Attempt not found', 404);
  if (attempt.status !== 'submitted') throw new AppError('Remove the transcript after the attempt is submitted', 409, 'ATTEMPT_OPEN');
  const done = await purgeTranscript(attempt.id, req.user!.id);
  res.json({ removed: done });
});

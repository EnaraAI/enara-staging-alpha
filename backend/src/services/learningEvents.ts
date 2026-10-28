import { randomUUID } from 'crypto';
import { CURRENT_EVENT_SCHEMA_VERSION, LearningEvent, type ILearningEvent, type LearningEventType } from '../models/LearningEvent';
import { getCallContext } from '../utils/callContext';
import { logger, serializeError } from '../utils/logging';

export type NewLearningEvent = Pick<ILearningEvent, 'studentId' | 'type' | 'source' | 'verified'> &
  Partial<
    Pick<
      ILearningEvent,
      'institutionId' | 'actorId' | 'gradedBy' | 'topic' | 'subject' | 'refs' | 'outcome' | 'durationMs' | 'at' | 'objectiveIds' | 'idempotencyKey'
    >
  >;

// What each event type must carry (schema v2). Events that fail are not stored.
const REQUIRED: Record<LearningEventType, { refs: string[]; outcome?: 'correct' | 'score' }> = {
  lesson_viewed: { refs: ['courseId', 'lessonId'] },
  lesson_completed: { refs: ['courseId', 'lessonId'] },
  assessment_started: { refs: ['assessmentId', 'attemptId'] },
  question_answered: { refs: ['assessmentId', 'questionId'], outcome: 'correct' },
  assessment_submitted: { refs: ['assessmentId', 'attemptId'], outcome: 'score' },
  review_answered: { refs: ['reviewItemId'], outcome: 'correct' },
  tutor_question: { refs: ['sessionId', 'messageId'] },
  tutor_reply: { refs: ['sessionId', 'messageId'] },
  diagnostic_started: { refs: ['diagnosticId'] },
  diagnostic_completed: { refs: ['diagnosticId'] },
};

// Events whose source can make them verified. Browser reports and AI replies
// never can, whatever a caller passes.
const CAN_BE_VERIFIED = new Set(['lesson', 'assessment', 'diagnostic', 'review', 'tutor_chat']);
// Events that can become evidence of understanding (graded by a rule).
const EVIDENCE_TYPES = new Set<LearningEventType>(['question_answered', 'review_answered']);

export function validateLearningEvent(e: NewLearningEvent): string | null {
  const rule = REQUIRED[e.type];
  if (!rule) return `unknown type ${e.type}`;
  if (!e.studentId) return 'studentId is required';
  for (const ref of rule.refs) if (!(e.refs as Record<string, unknown> | undefined)?.[ref]) return `refs.${ref} is required`;
  if (rule.outcome === 'correct' && typeof e.outcome?.correct !== 'boolean') return 'outcome.correct is required';
  if (rule.outcome === 'score' && typeof e.outcome?.score !== 'number') return 'outcome.score is required';
  if (e.verified && (!CAN_BE_VERIFIED.has(e.source) || e.type === 'tutor_reply')) return `${e.source} ${e.type} cannot be verified`;
  return null;
}

// Appends learning events. Recording evidence must never break the action the
// student took, so failures are logged, not thrown. Events with an idempotency
// key that already exists are skipped (the same action is never stored twice).
// Failures are logged and swallowed (a missing event must not break the
// action that caused it), unless the caller asks to hear about them with
// throwOnError, to retry on its own.
export async function recordLearningEvents(events: NewLearningEvent[], opts: { throwOnError?: boolean } = {}): Promise<void> {
  if (!events.length) return;
  const context = getCallContext();
  const now = new Date();
  const valid = events.filter((e) => {
    const problem = validateLearningEvent(e);
    if (problem) logger.warn('learning_event_invalid', { type: e.type, problem });
    return !problem;
  });
  if (!valid.length) return;
  try {
    await LearningEvent.insertMany(
      valid.map((e) => {
        const verifiedEvidence = e.verified && EVIDENCE_TYPES.has(e.type);
        return {
          id: `le-${randomUUID()}`,
          conceptIds: [],
          objectiveIds: [],
          at: now,
          actorId: context.userId,
          institutionId: context.institutionId,
          ...e,
          recordedAt: now,
          schemaVersion: CURRENT_EVENT_SCHEMA_VERSION,
          processing: { evidence: verifiedEvidence ? 'pending' : 'not_applicable', attempts: 0 },
        };
      }),
      { ordered: false },
    );
  } catch (error) {
    const writeErrors = (error as { writeErrors?: { code?: number; err?: { code?: number } }[] }).writeErrors;
    const onlyDuplicates =
      (error as { code?: number }).code === 11000 ||
      (Array.isArray(writeErrors) && writeErrors.length > 0 && writeErrors.every((w) => (w.code ?? w.err?.code) === 11000));
    if (onlyDuplicates) {
      logger.info('learning_event_duplicates_skipped', { count: writeErrors?.length ?? 1 });
      return;
    }
    logger.warn('learning_event_record_failed', { count: valid.length, error: serializeError(error) });
    if (opts.throwOnError) throw error;
  }
}

export function recordLearningEvent(event: NewLearningEvent): Promise<void> {
  return recordLearningEvents([event]);
}

// Shape returned by the API: no internal fields.
export function toEventResponse(e: ILearningEvent | Record<string, any>) {
  return {
    id: e.id,
    studentId: e.studentId,
    institutionId: e.institutionId,
    type: e.type,
    source: e.source,
    verified: e.verified,
    gradedBy: e.gradedBy,
    objectiveIds: e.objectiveIds || [],
    topic: e.topic,
    subject: e.subject,
    refs: e.refs || {},
    outcome: e.outcome,
    durationMs: e.durationMs,
    at: e.at,
    schemaVersion: e.schemaVersion ?? 1,
  };
}

// The idempotency key an event of this kind gets, derived from its source
// record. Used by live writers and by migrations re-keying older events.
export function deriveIdempotencyKey(e: Pick<ILearningEvent, 'type' | 'studentId' | 'refs' | 'at'>): string | undefined {
  const r = e.refs || {};
  switch (e.type) {
    case 'assessment_started':
      return r.attemptId ? `attempt:${r.attemptId}:started` : undefined;
    case 'question_answered':
      return r.attemptId && r.questionId ? `attempt:${r.attemptId}:q:${r.questionId}` : undefined;
    case 'assessment_submitted':
      return r.attemptId ? `attempt:${r.attemptId}:submitted` : undefined;
    case 'lesson_completed':
      return r.courseId && r.lessonId ? `lesson:${e.studentId}:${r.courseId}:${r.lessonId}:completed` : undefined;
    case 'review_answered':
      return r.reviewItemId && e.at ? `review:${r.reviewItemId}:${new Date(e.at).toISOString()}` : undefined;
    case 'tutor_question':
    case 'tutor_reply':
      return r.sessionId && r.messageId ? `msg:${r.sessionId}:${r.messageId}` : undefined;
    default:
      return undefined;
  }
}

import { Schema, model, Document } from 'mongoose';

// Append-only log of learning actions: the evidence later phases (mastery,
// time to understand, impact) are computed from. Never updated in place.
export const LEARNING_EVENT_TYPES = [
  'lesson_viewed',
  'lesson_completed',
  'assessment_started',
  'question_answered',
  'assessment_submitted',
  'review_answered',
  'tutor_question',
  'tutor_reply',
  'diagnostic_started',
  'diagnostic_completed',
] as const;
export type LearningEventType = (typeof LEARNING_EVENT_TYPES)[number];

// Where the event came from. 'client' events are reported by the browser.
export const LEARNING_EVENT_SOURCES = ['lesson', 'assessment', 'diagnostic', 'review', 'tutor_chat', 'tutor_voice', 'client'] as const;
export type LearningEventSource = (typeof LEARNING_EVENT_SOURCES)[number];

export interface ILearningEvent extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  // The user who caused it (the student, or a teacher/admin acting for them).
  actorId?: string;
  type: LearningEventType;
  source: LearningEventSource;
  // true: observed or graded by the server with a fixed rule (an answer checked
  // against the key, a lesson marked complete). false: AI output, or anything the
  // browser reported. AI-derived evidence must never count as verified.
  verified: boolean;
  // How an outcome was judged: 'rule' (answer key), 'ai', 'teacher', or none.
  gradedBy?: 'rule' | 'ai' | 'teacher';
  // Filled in Phase 2 when concepts exist; topic/subject until then.
  conceptIds: string[];
  topic?: string;
  subject?: string;
  refs: {
    courseId?: string;
    lessonId?: string;
    assessmentId?: string;
    attemptId?: string;
    questionId?: string;
    reviewItemId?: string;
    sessionId?: string;
    messageId?: string;
    diagnosticId?: string;
    assignmentId?: string;
  };
  outcome?: {
    correct?: boolean;
    // The option or short answer given (max 200 chars), for misconception rules.
    answer?: string;
    score?: number;
    hintsUsed?: number;
  };
  durationMs?: number;
  // When it happened (occurredAt) and when it was stored.
  at: Date;
  recordedAt?: Date;
  // Learning objectives this event is about (from the question or lesson tags).
  objectiveIds: string[];
  // Event format version and a key derived from the source record, so the same
  // action can never be stored twice (and can be re-derived safely).
  schemaVersion: number;
  idempotencyKey?: string;
  // Set when a later record duplicates this one (kept, not deleted).
  supersededBy?: string;
  // Downstream processing (evidence). 'not_applicable' for activity-only events.
  processing?: {
    evidence: 'pending' | 'done' | 'failed' | 'not_applicable';
    attempts: number;
    lastError?: string;
    processedAt?: Date;
  };
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
}

export const CURRENT_EVENT_SCHEMA_VERSION = 2;

const learningEventSchema = new Schema<ILearningEvent>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    actorId: String,
    type: { type: String, enum: LEARNING_EVENT_TYPES, required: true },
    source: { type: String, enum: LEARNING_EVENT_SOURCES, required: true },
    verified: { type: Boolean, required: true },
    gradedBy: { type: String, enum: ['rule', 'ai', 'teacher'] },
    conceptIds: { type: [String], default: [] },
    topic: String,
    subject: String,
    refs: {
      courseId: String,
      lessonId: String,
      assessmentId: String,
      attemptId: String,
      questionId: String,
      reviewItemId: String,
      sessionId: String,
      messageId: String,
      diagnosticId: String,
      assignmentId: String,
    },
    outcome: {
      correct: Boolean,
      answer: String,
      score: Number,
      hintsUsed: Number,
    },
    durationMs: Number,
    at: { type: Date, required: true, default: Date.now },
    recordedAt: Date,
    objectiveIds: { type: [String], default: [] },
    schemaVersion: { type: Number, default: 1 },
    idempotencyKey: String,
    supersededBy: String,
    processing: {
      evidence: { type: String, enum: ['pending', 'done', 'failed', 'not_applicable'] },
      attempts: { type: Number, default: 0 },
      lastError: String,
      processedAt: Date,
    },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { collection: 'learning_events', versionKey: false },
);

learningEventSchema.index({ institutionId: 1, at: -1 });
learningEventSchema.index({ studentId: 1, at: -1 });
learningEventSchema.index({ studentId: 1, conceptIds: 1, at: -1 });
learningEventSchema.index({ institutionId: 1, type: 1, at: -1 });
learningEventSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
learningEventSchema.index({ 'processing.evidence': 1, recordedAt: 1 });
learningEventSchema.index({ studentId: 1, objectiveIds: 1, at: -1 });

export const LearningEvent = model<ILearningEvent>('LearningEvent', learningEventSchema);

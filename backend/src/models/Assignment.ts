import { Schema, model, Document } from 'mongoose';

// An assessment version given to a class (or some of its students) with its
// own dates and rules. The assessment is the reusable definition.
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export const DELIVERY_POLICIES = ['voice_only', 'voice_avatar', 'student_choice'] as const;
export const PLAN_MODES = ['scripted', 'guided_adaptive', 'bounded_free'] as const;
export type DeliveryMode = 'voice_only' | 'voice_avatar';

// Teacher-set rules for a speaking exam. Students cannot change any of them.
export interface ISpeakingSettings {
  settingsVersion: number;
  language: 'en';
  cefrLevel?: (typeof CEFR_LEVELS)[number];
  topic?: string;
  context?: string;
  persona?: string;
  instructions?: string;
  planMode: (typeof PLAN_MODES)[number];
  openingPrompt?: string;
  requiredTopics: string[];
  disallowedTopics: string[];
  // Neutral follow-ups the examiner may ask per question (0 or 1).
  followUpsPerQuestion: number;
  maxStudentTurns: number;
  durationMinutes: number;
  prepSeconds: number;
  deliveryPolicy: (typeof DELIVERY_POLICIES)[number];
  examinerVoice: 'default' | 'female';
  // Students the teacher allows a typed accommodation; never an oral score.
  accommodationStudentIds: string[];
  passThreshold?: number;
  // Transcripts are removed after this many days (scores stay).
  transcriptRetentionDays: number;
}

export interface IAssignment extends Document {
  id: string;
  institutionId: string;
  assessmentId: string;
  assessmentVersion: number;
  title: string;
  instructions?: string;
  // The class (CourseInstance) it is for; studentIds narrows it to some students.
  classId: string;
  studentIds?: string[];
  // Stored state; the displayed status also depends on the dates.
  state: 'draft' | 'published' | 'closed' | 'archived';
  opensAt: Date;
  dueAt: Date;
  // Late work accepted until this time (only with latePolicy 'accept_late').
  closesAt?: Date;
  timeZone: string;
  latePolicy: 'not_accepted' | 'accept_late';
  maxAttempts: number;
  timeLimitMinutes?: number;
  // Legacy. Since autograde-v1 results are released as soon as grading
  // passes validation, whatever this says; kept so older records load.
  releasePolicy: 'auto' | 'manual';
  answerReveal: 'after-submit' | 'after-close' | 'never';
  // Tutor help while the assignment is open.
  tutorPolicy: 'allowed' | 'hints_only' | 'blocked';
  // 'conversation': an AI examiner asks the questions in a conversation; the
  // student's replies are the answers, graded like written ones.
  // 'english_conversation' (P4): a teacher-controlled spoken English exam;
  // `speaking` holds its settings, frozen once the assignment is published.
  format?: 'written' | 'conversation' | 'english_conversation';
  speaking?: ISpeakingSettings;
  extensions: { studentId: string; dueAt: Date; by: string; at: Date; reason: string }[];
  createdBy: string;
  history: { at: Date; by: string; action: string; detail?: unknown }[];
  createdAt: Date;
  updatedAt: Date;
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
}

const assignmentSchema = new Schema<IAssignment>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    assessmentId: { type: String, required: true },
    assessmentVersion: { type: Number, required: true },
    title: { type: String, required: true },
    instructions: String,
    classId: { type: String, required: true },
    studentIds: { type: [String], default: undefined },
    state: { type: String, enum: ['draft', 'published', 'closed', 'archived'], default: 'published' },
    opensAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    closesAt: Date,
    timeZone: { type: String, default: 'UTC' },
    latePolicy: { type: String, enum: ['not_accepted', 'accept_late'], default: 'not_accepted' },
    maxAttempts: { type: Number, default: 1, min: 1, max: 10 },
    timeLimitMinutes: { type: Number, min: 1, max: 600 },
    releasePolicy: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    answerReveal: { type: String, enum: ['after-submit', 'after-close', 'never'], default: 'after-close' },
    tutorPolicy: { type: String, enum: ['allowed', 'hints_only', 'blocked'], default: 'hints_only' },
    format: { type: String, enum: ['written', 'conversation', 'english_conversation'], default: 'written' },
    speaking: { type: Schema.Types.Mixed, default: undefined },
    extensions: { type: [{ studentId: String, dueAt: Date, by: String, at: Date, reason: String, _id: false }], default: [] },
    createdBy: { type: String, required: true },
    history: { type: [{ at: Date, by: String, action: String, detail: Schema.Types.Mixed, _id: false }], default: [] },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { collection: 'assignments', timestamps: true, versionKey: false },
);
assignmentSchema.index({ institutionId: 1, classId: 1, state: 1, dueAt: 1 });
assignmentSchema.index({ institutionId: 1, assessmentId: 1 });

export const Assignment = model<IAssignment>('Assignment', assignmentSchema);

import { Schema, model, Document } from 'mongoose';

// Learner memory phases 2-3 (docs/tutor/LEARNER_MEMORY_PLAN.md, owner "go for all phases", 20 Nov 2026). All rows are written by code from stored,
// graded evidence or by school / parent / learner screens; never free text from the model. Ids, codes, counts and dates only.
// Deleted with the learner (studentErasure). Session summaries and habit rows expire after 13 months (TTL), like parent usage events.
const THIRTEEN_MONTHS = 395 * 24 * 3600;

// Phase 2: one short summary per tutor session, built by code from the session's stored turns once it has gone quiet.
export interface ISessionSummary extends Document {
  sessionId: string;
  studentId: string;
  institutionId?: string;
  courseId?: string;
  lessonId?: string;
  objectiveId?: string;
  startedAt: Date;
  endedAt: Date;
  learnerTurns: number;
  right: number;
  wrong: number;
  /** Lesson item ids answered in this session (any verdict): never offered again as "next" in a later session on the same lesson. */
  answeredItemIds: string[];
  /** The error code seen most often in this session's wrong answers, if any. */
  stuckOn?: string;
  /** Where it stopped: an exercise left open, or none. */
  stoppedWithOpenItem: boolean;
  nextStep: 'reteach' | 'finish_item' | 'next_point';
  version: string;
}
const summarySchema = new Schema<ISessionSummary>({
  sessionId: { type: String, required: true, unique: true },
  studentId: { type: String, required: true },
  institutionId: String,
  courseId: String,
  lessonId: String,
  objectiveId: String,
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, required: true },
  learnerTurns: { type: Number, default: 0 },
  right: { type: Number, default: 0 },
  wrong: { type: Number, default: 0 },
  answeredItemIds: { type: [String], default: [] },
  stuckOn: String,
  stoppedWithOpenItem: { type: Boolean, default: false },
  nextStep: { type: String, enum: ['reteach', 'finish_item', 'next_point'], required: true },
  version: { type: String, required: true },
}, { timestamps: true });
summarySchema.index({ studentId: 1, endedAt: -1 });
summarySchema.index({ endedAt: 1 }, { expireAfterSeconds: THIRTEEN_MONTHS });

// Phase 3: profile extras (shared across subjects). Fixed codes only, never free text.
export const FIRST_LANGUAGES = ['ar', 'en', 'fr', 'ur', 'hi', 'tl', 'bn', 'fa', 'tr', 'other'] as const;
export const INTERESTS = ['animals', 'football', 'sports', 'music', 'art', 'cooking', 'games', 'science', 'space', 'cars', 'travel', 'reading', 'films', 'nature', 'technology', 'fashion'] as const;
export const ACCOMMODATIONS = ['extra_time', 'typed_instead_of_voice', 'read_aloud', 'fewer_items', 'larger_text'] as const;
export interface ILearnerProfile extends Document {
  studentId: string;
  institutionId?: string;
  firstLanguage?: (typeof FIRST_LANGUAGES)[number];
  interests: (typeof INTERESTS)[number][];
  accommodations: (typeof ACCOMMODATIONS)[number][];
  history: { at: Date; by: string; role: string; field: string }[];
}
const profileSchema = new Schema<ILearnerProfile>({
  studentId: { type: String, required: true, unique: true },
  institutionId: String,
  firstLanguage: { type: String, enum: FIRST_LANGUAGES },
  interests: { type: [{ type: String, enum: INTERESTS }], default: [] },
  accommodations: { type: [{ type: String, enum: ACCOMMODATIONS }], default: [] },
  history: { type: [{ at: Date, by: String, role: String, field: String }], default: [] },
}, { timestamps: true });

// Phase 3: study habits, one row per learner per day (tutor activity), rolled up nightly.
export interface IStudyHabitDaily extends Document {
  studentId: string;
  institutionId?: string;
  day: Date; // 00:00 UTC of the day
  sessions: number;
  minutes: number;
  firstHourUtc: number;
  lastHourUtc: number;
}
const habitSchema = new Schema<IStudyHabitDaily>({
  studentId: { type: String, required: true },
  institutionId: String,
  day: { type: Date, required: true },
  sessions: { type: Number, default: 0 },
  minutes: { type: Number, default: 0 },
  firstHourUtc: Number,
  lastHourUtc: Number,
}, { timestamps: true });
habitSchema.index({ studentId: 1, day: 1 }, { unique: true });
habitSchema.index({ day: 1 }, { expireAfterSeconds: THIRTEEN_MONTHS });

export const SessionSummary = model<ISessionSummary>('SessionSummary', summarySchema, 'session_summaries');
export const LearnerProfile = model<ILearnerProfile>('LearnerProfile', profileSchema, 'learner_profiles');
export const StudyHabitDaily = model<IStudyHabitDaily>('StudyHabitDaily', habitSchema, 'study_habit_daily');

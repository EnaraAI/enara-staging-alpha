import { Schema, model, Document } from 'mongoose';

// r4.4 #2: cross-session record of a learner's language error TYPES (never their text or answers).
// New collection; one document per (tenant, learner).
export interface ILanguageErrorEntry {
  code: string;
  occurrences: number;
  lastSeenAt: Date;
  independentStreak: number;
  lastIndependentSuccessAt?: Date;
  nextReviewAt?: Date;
}

// v2 (memory): the learner's mistaken IDEAS (a few words, never their text or answers), with spaced review, and which explanation styles preceded independent success.
export interface IBeliefEntry {
  tag: string;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lessonId?: string;
  lessonTitle?: string;
  resolvedAt?: Date;
  resolvedCount?: number;
  nextReviewAt?: Date;
}
export interface IWorkedEntry { style: string; count: number }

export interface ILearnerLanguageProfile extends Document {
  institutionId: string;
  studentId: string;
  entries: ILanguageErrorEntry[];
  beliefs?: IBeliefEntry[];
  worked?: IWorkedEntry[];
  // Optimistic concurrency token: chat and voice turns can overlap.
  version?: number;
  createdAt: Date;
  updatedAt: Date;
}

const EntrySchema = new Schema<ILanguageErrorEntry>({
  code: { type: String, required: true },
  occurrences: { type: Number, default: 0 },
  lastSeenAt: { type: Date, required: true },
  independentStreak: { type: Number, default: 0 },
  lastIndependentSuccessAt: Date,
  nextReviewAt: Date,
}, { _id: false });

const BeliefSchema = new Schema<IBeliefEntry>({
  tag: { type: String, required: true, maxlength: 80 },
  occurrences: { type: Number, default: 1 },
  firstSeenAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  lessonId: String,
  lessonTitle: { type: String, maxlength: 120 },
  resolvedAt: Date,
  resolvedCount: { type: Number, default: 0 },
  nextReviewAt: Date,
}, { _id: false });
const WorkedSchema = new Schema<IWorkedEntry>({ style: { type: String, required: true }, count: { type: Number, default: 0 } }, { _id: false });

const LearnerLanguageProfileSchema = new Schema<ILearnerLanguageProfile>({
  institutionId: { type: String, required: true },
  studentId: { type: String, required: true },
  entries: { type: [EntrySchema], default: [] },
  beliefs: { type: [BeliefSchema], default: [] },
  worked: { type: [WorkedSchema], default: [] },
  version: { type: Number, default: 0 },
}, { timestamps: true, collection: 'learner_language_profiles' });
LearnerLanguageProfileSchema.index({ institutionId: 1, studentId: 1 }, { unique: true });

export const LearnerLanguageProfile = model<ILearnerLanguageProfile>('LearnerLanguageProfile', LearnerLanguageProfileSchema);

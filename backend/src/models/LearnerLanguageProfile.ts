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

export interface ILearnerLanguageProfile extends Document {
  institutionId: string;
  studentId: string;
  entries: ILanguageErrorEntry[];
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

const LearnerLanguageProfileSchema = new Schema<ILearnerLanguageProfile>({
  institutionId: { type: String, required: true },
  studentId: { type: String, required: true },
  entries: { type: [EntrySchema], default: [] },
}, { timestamps: true, collection: 'learner_language_profiles' });
LearnerLanguageProfileSchema.index({ institutionId: 1, studentId: 1 }, { unique: true });

export const LearnerLanguageProfile = model<ILearnerLanguageProfile>('LearnerLanguageProfile', LearnerLanguageProfileSchema);

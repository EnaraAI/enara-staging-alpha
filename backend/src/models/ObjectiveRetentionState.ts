import { Schema, model, Document } from 'mongoose';

// Objective-level review schedule (separate from the per-question review items).
// Rebuilt from evidence, so it can be recomputed at any time.
export interface IObjectiveRetentionState extends Document {
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  lastSuccessfulRetrievalAt?: Date;
  nextReviewAt?: Date;
  consecutiveSuccessfulReviews: number;
  lastFailedRetrievalAt?: Date;
  scheduled: boolean;
  schedulingVersion: string;
  updatedAt: Date;
}

const schema = new Schema<IObjectiveRetentionState>(
  {
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    lastSuccessfulRetrievalAt: Date,
    nextReviewAt: Date,
    consecutiveSuccessfulReviews: { type: Number, default: 0 },
    lastFailedRetrievalAt: Date,
    scheduled: { type: Boolean, default: false },
    schedulingVersion: { type: String, required: true },
  },
  { collection: 'objective_retention_states', versionKey: false, timestamps: true },
);
schema.index({ studentId: 1, objectiveId: 1 }, { unique: true });
schema.index({ institutionId: 1, nextReviewAt: 1 });

export const ObjectiveRetentionState = model<IObjectiveRetentionState>('ObjectiveRetentionState', schema);

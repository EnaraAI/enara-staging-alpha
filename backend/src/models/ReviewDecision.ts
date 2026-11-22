import { Schema, model, Document } from 'mongoose';

// A teacher's decision on a generated bank item (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6). No learner data.
export const REVIEW_REASON_CODES = ['wrong_key', 'too_hard', 'too_easy', 'unclear', 'off_curriculum', 'inappropriate', 'wrong_language', 'other'] as const;

export interface IReviewDecision extends Document {
  item_id: string;
  item_version: number;
  teacher_id: string;
  school_id: string | null;
  decision: 'approve' | 'edit' | 'reject';
  reason_code?: (typeof REVIEW_REASON_CODES)[number];
  at: Date;
}

const schema = new Schema<IReviewDecision>(
  {
    item_id: { type: String, required: true },
    item_version: { type: Number, required: true },
    teacher_id: { type: String, required: true },
    school_id: { type: String, default: null },
    decision: { type: String, required: true, enum: ['approve', 'edit', 'reject'] },
    reason_code: { type: String, enum: REVIEW_REASON_CODES },
    at: { type: Date, default: Date.now },
  },
  { collection: 'review_decisions', versionKey: false },
);
schema.index({ item_id: 1, item_version: 1, at: -1 });

export const ReviewDecision = model<IReviewDecision>('ReviewDecision', schema);

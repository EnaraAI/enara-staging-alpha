import { Schema, model, Document } from 'mongoose';

// A question the student got wrong, brought back on a widening schedule
// (spaced review) until they answer it right a few times in a row.
export interface IReviewItem extends Document {
  id: string;
  studentId: string;
  institutionId?: string;
  // Where it came from, so the same quiz question isn't queued twice.
  sourceKey: string;
  topic: string;
  question: string;
  options?: string[];
  answer: string;
  explanation?: string;
  // Days until it comes back after the next right answer.
  intervalDays: number;
  streak: number;
  dueAt: Date;
  lastReviewedAt?: Date;
  retiredAt?: Date;
}

const reviewItemSchema = new Schema<IReviewItem>(
  {
    id: { type: String, required: true, unique: true },
    studentId: { type: String, required: true, index: true },
    institutionId: String,
    sourceKey: { type: String, required: true },
    topic: { type: String, default: '' },
    question: { type: String, required: true },
    options: [String],
    answer: { type: String, required: true },
    explanation: String,
    intervalDays: { type: Number, default: 1 },
    streak: { type: Number, default: 0 },
    dueAt: { type: Date, required: true, index: true },
    lastReviewedAt: Date,
    retiredAt: Date,
  },
  { timestamps: true }
);

reviewItemSchema.index({ studentId: 1, sourceKey: 1 }, { unique: true });

export const ReviewItem = model<IReviewItem>('ReviewItem', reviewItemSchema);

import { Schema, model, type Document } from 'mongoose';

// Parents: the "How you can help this week" suggestions of one child in one subject, written once per week (and again only when what
// they are built from changes: `inputHash`). docs/parents/ALL_SUBJECTS_PLAN.md
export interface IParentRecommendation extends Document {
  studentId: string;
  subjectKey: string;
  weekStart: string;
  inputHash: string;
  source: 'ai' | 'rules' | 'mixed';
  items: { kind: string; do: { en: string; ar: string }; why: { en: string; ar: string }; say: { en: string; ar: string }; ai: boolean }[];
  createdAt: Date;
}

const Bi = { en: { type: String, default: '' }, ar: { type: String, default: '' } };
const schema = new Schema<IParentRecommendation>(
  {
    studentId: { type: String, required: true },
    subjectKey: { type: String, required: true },
    weekStart: { type: String, required: true },
    inputHash: { type: String, required: true },
    source: { type: String, enum: ['ai', 'rules', 'mixed'], required: true },
    items: { type: [{ _id: false, kind: String, do: Bi, why: Bi, say: Bi, ai: Boolean }], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ studentId: 1, subjectKey: 1, weekStart: 1 }, { unique: true });

export const ParentRecommendation = model<IParentRecommendation>('ParentRecommendation', schema, 'parent_recommendations');

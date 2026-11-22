import { Schema, model, Document } from 'mongoose';

// Assessment engine rubrics (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §4): versioned, bilingual descriptors. Copied into the
// question's rubric (today's shape) when a bank item enters an assessment. Immutable: an edit makes a new version.
export interface IBankRubric extends Document {
  id: string;
  version: number;
  domain: string;
  type: string;
  criteria: { code: string; title_ar: string; title_en: string; max_points: number; descriptors_ar: Record<string, string>; descriptors_en: Record<string, string> }[];
  total_points: number;
  created_at: Date;
}

const schema = new Schema<IBankRubric>(
  {
    id: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    domain: { type: String, required: true },
    type: { type: String, required: true },
    criteria: {
      type: [{ code: String, title_ar: String, title_en: String, max_points: Number, descriptors_ar: Schema.Types.Mixed, descriptors_en: Schema.Types.Mixed, _id: false }],
      required: true,
    },
    total_points: { type: Number, required: true },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'bank_rubrics', versionKey: false },
);
schema.index({ id: 1, version: 1 }, { unique: true });

export const BankRubric = model<IBankRubric>('BankRubric', schema);

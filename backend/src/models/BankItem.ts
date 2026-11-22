import { Schema, model, Document } from 'mongoose';

// Assessment engine item bank (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §4). A bank item is immutable: an edit makes a new version
// (same id, version + 1). The content follows src/assessment/schema.ts (checked there before saving); answer_key.solution is never
// sent to a learner. school_id null = the shared bank.
export interface IBankItem extends Document {
  id: string;
  version: number;
  subject: string;
  language: string;
  curriculum: string;
  level: string;
  objective_code: string;
  type: string;
  difficulty: number;
  stem: string;
  media?: { kind: 'image' | 'audio' | 'table'; url: string; alt_ar: string; alt_en: string } | null;
  options?: unknown;
  answer_key: unknown;
  rubric_id?: string | null;
  points?: number;
  skill_codes: string[];
  error_codes: string[];
  flags: { lenient_spelling?: boolean; ta_marbuta_fold?: boolean; kids?: boolean; exam_style?: boolean };
  source: 'generated' | 'teacher' | 'imported';
  review_status: 'draft' | 'judged' | 'approved' | 'rejected';
  judge_report?: unknown;
  stats: { attempts: number; correct: number; p_value: number | null; discrimination: number | null; avg_time_ms: number | null; flagged: number; computed_at?: Date };
  created_by: string;
  created_at: Date;
  school_id: string | null;
}

const schema = new Schema<IBankItem>(
  {
    id: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    subject: { type: String, required: true, enum: ['language', 'math', 'science', 'humanities', 'code', 'other'] },
    language: { type: String, required: true },
    curriculum: { type: String, required: true },
    level: { type: String, required: true },
    objective_code: { type: String, required: true },
    type: { type: String, required: true },
    difficulty: { type: Number, required: true, min: 1, max: 5 },
    stem: { type: String, required: true, maxlength: 4000 },
    media: { type: { kind: String, url: String, alt_ar: String, alt_en: String, _id: false }, default: null },
    options: { type: Schema.Types.Mixed, default: null },
    answer_key: { type: Schema.Types.Mixed, required: true },
    rubric_id: { type: String, default: null },
    points: { type: Number, min: 0, max: 100 },
    skill_codes: { type: [String], default: [] },
    error_codes: { type: [String], default: [] },
    flags: { type: new Schema({ lenient_spelling: Boolean, ta_marbuta_fold: Boolean, kids: Boolean, exam_style: Boolean }, { _id: false }), default: {} },
    source: { type: String, required: true, enum: ['generated', 'teacher', 'imported'] },
    review_status: { type: String, required: true, enum: ['draft', 'judged', 'approved', 'rejected'], default: 'draft' },
    judge_report: { type: Schema.Types.Mixed, default: null },
    stats: {
      type: new Schema({ attempts: Number, correct: Number, p_value: Number, discrimination: Number, avg_time_ms: Number, flagged: Number, computed_at: Date }, { _id: false }),
      default: { attempts: 0, correct: 0, p_value: null, discrimination: null, avg_time_ms: null, flagged: 0 },
    },
    created_by: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    school_id: { type: String, default: null },
  },
  { collection: 'bank_items', versionKey: false },
);
schema.index({ id: 1, version: 1 }, { unique: true });
schema.index({ school_id: 1, subject: 1, language: 1, review_status: 1 });
schema.index({ objective_code: 1, type: 1 });

export const BankItem = model<IBankItem>('BankItem', schema);

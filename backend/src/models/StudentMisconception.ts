import { Schema, model, Document } from 'mongoose';

// A possible misconception for a student on an objective. Detected ones start
// as 'suspected' and are shown as possibilities, never as facts; a teacher can
// confirm, dismiss or resolve them. `confidence` is a heuristic, not calibrated.
export interface IStudentMisconception extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  // Stable rule key so re-running detection updates rather than duplicates.
  ruleKey: string;
  category: string;
  description: string;
  confidence: number;
  supportingEvidenceIds: string[];
  status: 'suspected' | 'confirmed' | 'resolved' | 'dismissed';
  source: 'rule' | 'ai' | 'teacher';
  detectedAt: Date;
  resolvedAt?: Date;
  detectionVersion: string;
  statusHistory: { at: Date; by?: string; from?: string; to: string; note?: string }[];
}

const schema = new Schema<IStudentMisconception>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    ruleKey: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    supportingEvidenceIds: { type: [String], default: [] },
    status: { type: String, enum: ['suspected', 'confirmed', 'resolved', 'dismissed'], default: 'suspected' },
    source: { type: String, enum: ['rule', 'ai', 'teacher'], default: 'rule' },
    detectedAt: { type: Date, required: true },
    resolvedAt: Date,
    detectionVersion: { type: String, required: true },
    statusHistory: { type: [{ at: Date, by: String, from: String, to: String, note: String, _id: false }], default: [] },
  },
  { collection: 'student_misconceptions', versionKey: false, timestamps: true },
);

schema.index({ studentId: 1, ruleKey: 1 }, { unique: true });
schema.index({ institutionId: 1, objectiveId: 1, status: 1 });
schema.index({ studentId: 1, status: 1 });

export const StudentMisconception = model<IStudentMisconception>('StudentMisconception', schema);

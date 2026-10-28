import { Schema, model, Document } from 'mongoose';

// One episode from a documented gap to an independent demonstration of
// understanding (see docs/phase2/TTU_SPECIFICATION.md). Unsuccessful and open
// episodes are kept.
export interface ITimeToUnderstand extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  gapDetectedAt: Date;
  gapEvidenceId?: string;
  understandingVerifiedAt?: Date;
  reassessmentEvidenceId?: string;
  activeInstructionSeconds: number;
  elapsedSeconds?: number;
  interventionIds: string[];
  strategiesUsed: string[];
  status: 'in_progress' | 'verified' | 'abandoned' | 'censored';
  measurementVersion: string;
  lastComputedAt: Date;
}

const schema = new Schema<ITimeToUnderstand>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    gapDetectedAt: { type: Date, required: true },
    gapEvidenceId: String,
    understandingVerifiedAt: Date,
    reassessmentEvidenceId: String,
    activeInstructionSeconds: { type: Number, default: 0 },
    elapsedSeconds: Number,
    interventionIds: { type: [String], default: [] },
    strategiesUsed: { type: [String], default: [] },
    status: { type: String, enum: ['in_progress', 'verified', 'abandoned', 'censored'], default: 'in_progress' },
    measurementVersion: { type: String, required: true },
    lastComputedAt: { type: Date, required: true },
  },
  { collection: 'time_to_understand', versionKey: false, timestamps: true },
);
schema.index({ studentId: 1, objectiveId: 1 }, { unique: true, partialFilterExpression: { status: 'in_progress' }, name: 'one_open_episode' });
schema.index({ institutionId: 1, objectiveId: 1, status: 1 });

export const TimeToUnderstand = model<ITimeToUnderstand>('TimeToUnderstand', schema);

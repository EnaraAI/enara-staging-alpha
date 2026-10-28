import { Schema, model, Document } from 'mongoose';
import type { EvidenceStrength, MasteryStatus } from '../services/masteryModel';

// Current mastery state per student and objective, recomputed from evidence.
// `masteryEstimate` is a heuristic 0-1 score, not a probability.
export interface IStudentObjectiveMastery extends Document {
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  masteryEstimate: number | null;
  evidenceStrength: EvidenceStrength;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  independentEvidenceCount: number;
  distinctIndependentItems: number;
  needsVerification: boolean;
  lastEvidenceAt?: Date;
  lastMasteryUpdateAt: Date;
  modelVersion: string;
}

const masterySchema = new Schema<IStudentObjectiveMastery>(
  {
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    masteryEstimate: { type: Number, default: null },
    evidenceStrength: { type: String, enum: ['none', 'limited', 'moderate', 'substantial'], default: 'none' },
    masteryStatus: { type: String, enum: ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered'], default: 'not_assessed' },
    evidenceCount: { type: Number, default: 0 },
    independentEvidenceCount: { type: Number, default: 0 },
    distinctIndependentItems: { type: Number, default: 0 },
    needsVerification: { type: Boolean, default: false },
    lastEvidenceAt: Date,
    lastMasteryUpdateAt: { type: Date, required: true },
    modelVersion: { type: String, required: true },
  },
  { collection: 'student_objective_mastery', versionKey: false, timestamps: true },
);

masterySchema.index({ studentId: 1, objectiveId: 1 }, { unique: true });
masterySchema.index({ institutionId: 1, objectiveId: 1, masteryStatus: 1 });

export const StudentObjectiveMastery = model<IStudentObjectiveMastery>('StudentObjectiveMastery', masterySchema);

// One row per change of a student's mastery state: what changed, why, and
// on which evidence. Never edited.
export interface IMasteryHistory extends Document {
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  masteryEstimate: number | null;
  evidenceStrength: EvidenceStrength;
  masteryStatus: MasteryStatus;
  previousStatus?: MasteryStatus;
  previousEstimate?: number | null;
  evidenceCount: number;
  // What caused the recomputation, e.g. 'evidence:<eventId>', 'invalidation:<evidenceId>', 'recompute'.
  trigger: string;
  modelVersion: string;
  at: Date;
}

const historySchema = new Schema<IMasteryHistory>(
  {
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    masteryEstimate: { type: Number, default: null },
    evidenceStrength: String,
    masteryStatus: String,
    previousStatus: String,
    previousEstimate: { type: Number, default: undefined },
    evidenceCount: Number,
    trigger: String,
    modelVersion: String,
    at: { type: Date, required: true },
  },
  { collection: 'student_mastery_history', versionKey: false },
);
historySchema.index({ studentId: 1, objectiveId: 1, at: -1 });
historySchema.index({ institutionId: 1, at: -1 });

export const MasteryHistory = model<IMasteryHistory>('MasteryHistory', historySchema);

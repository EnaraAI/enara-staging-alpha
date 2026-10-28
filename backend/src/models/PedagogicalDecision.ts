import { Schema, model, Document } from 'mongoose';

// Each strategy choice the engine made for a student, with its reasons and the
// evidence it used. Observational record only: not proof the strategy worked.
export interface IPedagogicalDecision extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  targetObjectiveId: string;
  strategyId: string;
  strategyVersion: number;
  previousStrategyId?: string;
  reasonCodes: string[];
  supportingEvidenceIds: string[];
  misconceptionIds: string[];
  requiresReassessment: boolean;
  decisionVersion: string;
  interventionId?: string;
  tutorSessionId?: string;
  at: Date;
}

const schema = new Schema<IPedagogicalDecision>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    targetObjectiveId: { type: String, required: true },
    strategyId: { type: String, required: true },
    strategyVersion: Number,
    previousStrategyId: String,
    reasonCodes: [String],
    supportingEvidenceIds: [String],
    misconceptionIds: [String],
    requiresReassessment: Boolean,
    decisionVersion: String,
    interventionId: String,
    tutorSessionId: String,
    at: { type: Date, required: true },
  },
  { collection: 'pedagogical_decisions', versionKey: false },
);
schema.index({ studentId: 1, objectiveId: 1, at: -1 });
schema.index({ institutionId: 1, strategyId: 1, at: -1 });

export const PedagogicalDecision = model<IPedagogicalDecision>('PedagogicalDecision', schema);

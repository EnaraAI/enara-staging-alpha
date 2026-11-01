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
  // ped-v2 / registry v2 (P21), all optional: older decisions stay valid.
  supportingStrategyIds?: string[];
  reinforcementStrategyId?: string;
  modifierIds?: string[];
  registryVersion?: string;
  gap?: string;
  expectedOutcome?: string;
  switchWhen?: string;
  confidence?: string;
  limitations?: string[];
  // How the objective was chosen: session | lesson | lesson_multiple.
  objectiveResolution?: string;
  // chat | stream | voice
  channel?: string;
  // The student's mastery estimate when the plan was chosen (to see later
  // whether evidence moved after it).
  masteryAtDecision?: number | null;
  masteryStatusAtDecision?: string;
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
    supportingStrategyIds: { type: [String], default: undefined },
    reinforcementStrategyId: String,
    modifierIds: { type: [String], default: undefined },
    registryVersion: String,
    gap: String,
    expectedOutcome: String,
    switchWhen: String,
    confidence: String,
    limitations: { type: [String], default: undefined },
    objectiveResolution: String,
    channel: String,
    masteryAtDecision: Number,
    masteryStatusAtDecision: String,
  },
  { collection: 'pedagogical_decisions', versionKey: false },
);
schema.index({ studentId: 1, objectiveId: 1, at: -1 });
schema.index({ institutionId: 1, strategyId: 1, at: -1 });

export const PedagogicalDecision = model<IPedagogicalDecision>('PedagogicalDecision', schema);

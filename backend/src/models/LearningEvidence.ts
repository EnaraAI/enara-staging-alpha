import { Schema, model, Document } from 'mongoose';

// Evidence of understanding for one objective, derived on the server from a
// learning event (never sent by a client). Separate from raw activity: a lesson
// view or a tutor question is not evidence. Invalidated evidence is kept with
// the reason, never deleted.
export const EVIDENCE_TYPES = ['independent_assessment', 'guided_practice', 'diagnostic', 'retention_review', 'teacher_verified'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EVIDENCE_RESULTS = ['correct', 'partially_correct', 'incorrect', 'inconclusive'] as const;
export type EvidenceResult = (typeof EVIDENCE_RESULTS)[number];
export const ASSISTANCE_LEVELS = ['none', 'hint', 'guided', 'worked_solution'] as const;
export type AssistanceLevel = (typeof ASSISTANCE_LEVELS)[number];

export interface ILearningEvidence extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  objectiveId: string;
  sourceEventId: string;
  evidenceType: EvidenceType;
  result: EvidenceResult;
  normalizedScore?: number;
  assistanceLevel: AssistanceLevel;
  difficulty?: number;
  // How many times this student had seen the same question before (0 = first time).
  priorExposures: number;
  // Weight from the versioned evidence policy (services/evidencePolicy.ts).
  reliabilityWeight: number;
  evidenceVersion: string;
  // The question or review item, so repeated exposure can be tracked.
  itemKey?: string;
  occurredAt: Date;
  recordedAt: Date;
  invalidatedAt?: Date;
  invalidatedBy?: string;
  invalidationReason?: string;
  // Set when a teacher verifies or overrides; audited in history.
  verifiedBy?: string;
  history: { at: Date; by?: string; action: string; note?: string }[];
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
}

const evidenceSchema = new Schema<ILearningEvidence>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    objectiveId: { type: String, required: true },
    sourceEventId: { type: String, required: true },
    evidenceType: { type: String, enum: EVIDENCE_TYPES, required: true },
    result: { type: String, enum: EVIDENCE_RESULTS, required: true },
    normalizedScore: { type: Number, min: 0, max: 1 },
    assistanceLevel: { type: String, enum: ASSISTANCE_LEVELS, default: 'none' },
    difficulty: { type: Number, min: 1, max: 5 },
    priorExposures: { type: Number, default: 0 },
    reliabilityWeight: { type: Number, required: true, min: 0, max: 1 },
    evidenceVersion: { type: String, required: true },
    itemKey: String,
    occurredAt: { type: Date, required: true },
    recordedAt: { type: Date, required: true },
    invalidatedAt: Date,
    invalidatedBy: String,
    invalidationReason: String,
    verifiedBy: String,
    history: { type: [{ at: Date, by: String, action: String, note: String, _id: false }], default: [] },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { collection: 'learning_evidence', versionKey: false },
);

// One evidence row per event and objective: reprocessing never duplicates.
evidenceSchema.index({ sourceEventId: 1, objectiveId: 1 }, { unique: true });
evidenceSchema.index({ studentId: 1, objectiveId: 1, occurredAt: 1 });
evidenceSchema.index({ institutionId: 1, objectiveId: 1, occurredAt: -1 });
evidenceSchema.index({ studentId: 1, itemKey: 1, occurredAt: 1 });

export const LearningEvidence = model<ILearningEvidence>('LearningEvidence', evidenceSchema);

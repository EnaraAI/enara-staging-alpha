import { Schema, model, Document } from 'mongoose';

// Experimental Hybrid V1 shadow output (ENARA-HYBRID-experimental@v1). Isolated
// from official grades: nothing here is ever copied to an attempt, a gradebook
// or a student. One record per (attempt, question, grader version); the unique
// index makes shadow grading idempotent. No answer text, prompts or reference
// scores are stored.
export interface IHybridShadowResult extends Document {
  key: string;
  institutionId: string;
  attemptId: string;
  assessmentId?: string;
  assessmentVersion?: number;
  questionId: string;
  graderVersion: string;
  status: 'running' | 'done' | 'not_eligible' | 'error';
  claimedAt: Date;
  eligibility?: string;
  answerSha256?: string;
  evalv2?: { score: number | null; proposalId?: string; modelName?: string; status: string };
  v6?: { score: number | null; status: string; reasonCode?: string | null; repairs: number; calls: number; model?: string; anchorSetId?: string; groundingDiagnostics?: object[] };
  hybrid?: { score: number | null; status: string; label: string };
  disagreement?: number | null;
  cost?: { reservedUsd: number; estimatedUsd: number; confirmedRequests: number };
  latencyMs?: number;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IHybridShadowResult>(
  {
    key: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true },
    assessmentId: String,
    assessmentVersion: Number,
    questionId: { type: String, required: true },
    graderVersion: { type: String, required: true },
    status: { type: String, enum: ['running', 'done', 'not_eligible', 'error'], required: true },
    claimedAt: { type: Date, required: true },
    eligibility: String,
    answerSha256: String,
    evalv2: { type: Schema.Types.Mixed },
    v6: { type: Schema.Types.Mixed },
    hybrid: { type: Schema.Types.Mixed },
    disagreement: Number,
    cost: { type: Schema.Types.Mixed },
    latencyMs: Number,
    correlationId: { type: String, required: true },
  },
  { timestamps: true },
);

export const HybridShadowResult = model<IHybridShadowResult>('HybridShadowResult', schema);

// Frozen anchor snapshot per question: chosen once (pickAnchors, frozen seed) and
// reused, so every shadow grade of a question sees the same 4 anchors.
export interface IHybridAnchorSet extends Document {
  id: string;
  institutionId: string;
  assessmentId: string;
  assessmentVersion: number;
  questionId: string;
  graderVersion: string;
  anchors: { attemptId: string; questionId: string; score: number; answerSha256: string }[];
  seed: string;
  createdAt: Date;
}

const anchorSchema = new Schema<IHybridAnchorSet>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    assessmentId: { type: String, required: true },
    assessmentVersion: { type: Number, required: true },
    questionId: { type: String, required: true },
    graderVersion: { type: String, required: true },
    anchors: { type: [{ attemptId: String, questionId: String, score: Number, answerSha256: String, _id: false }], required: true },
    seed: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const HybridAnchorSet = model<IHybridAnchorSet>('HybridAnchorSet', anchorSchema);

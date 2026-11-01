import { Schema, model, Document } from 'mongoose';

// One teaching episode (P21): a teaching plan used for one student and learning
// objective, from the decision until the plan changed, with the assessment
// evidence before and after it. DERIVED and recomputable from decisions and
// evidence (teachingImpact.ts); it never feeds grading or mastery. Labels are
// observational: an episode can show an observed change or a change associated
// with the plan, never that the plan caused it.

export type EpisodeLabel = 'insufficient_evidence' | 'observed_change' | 'associated_with_intervention';
export type EvidenceQuality = 'none' | 'weak' | 'moderate' | 'strong';

export interface EvidenceWindow {
  n: number;
  score: number | null; // mean normalised score 0-1 (independent assessment evidence)
  evidenceIds: string[];
  items: number; // distinct items (questions)
  from?: Date;
  to?: Date;
  assessmentKinds: string[];
  gradedBy: string[];
  meanDifficulty?: number | null;
}

export interface ITeachingEpisode extends Document {
  id: string;
  institutionId?: string;
  studentId: string;
  batchId?: string;
  origin: 'live' | 'demo_seed';
  objectiveId: string;
  // Grouping dimensions for effectiveness reporting (P21 C5).
  subject?: string;
  gradeBand?: string;
  misconceptionCategories: string[];
  decisionIds: string[];
  primary: string;
  supporting: string[];
  reinforcement?: string;
  primaryVersion?: number;
  registryVersion?: string;
  decisionVersion?: string;
  channel?: string;
  interventionId?: string;
  startAt: Date;
  endAt?: Date; // when the next, different plan started (open if absent)
  baseline: EvidenceWindow;
  post: EvidenceWindow;
  retention: EvidenceWindow & { delayDays?: number | null };
  transfer: EvidenceWindow;
  // Assessment-level results in the post window (overall exam performance, kept
  // apart from the objective-level score above).
  exams: { attemptId: string; assessmentId?: string; assessmentKind: string; overallScore: number | null; objectiveScore: number | null; at: Date }[];
  mastery: { statusBefore?: string; estimateBefore?: number | null; statusAfter?: string; estimateAfter?: number | null };
  observedChange: number | null; // post.score - baseline.score
  retentionChange: number | null; // retention.score - baseline.score
  comparability: string[];
  evidenceQuality: EvidenceQuality;
  label: EpisodeLabel;
  limitations: string[];
  computeVersion: string;
  computedAt: Date;
}

const windowSchema = {
  n: Number,
  score: Number,
  evidenceIds: { type: [String], default: [] },
  items: Number,
  from: Date,
  to: Date,
  assessmentKinds: { type: [String], default: [] },
  gradedBy: { type: [String], default: [] },
  meanDifficulty: Number,
};

const schema = new Schema<ITeachingEpisode>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    studentId: { type: String, required: true },
    batchId: String,
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
    objectiveId: { type: String, required: true },
    subject: String,
    gradeBand: String,
    misconceptionCategories: { type: [String], default: [] },
    decisionIds: { type: [String], default: [] },
    primary: { type: String, required: true },
    supporting: { type: [String], default: [] },
    reinforcement: String,
    primaryVersion: Number,
    registryVersion: String,
    decisionVersion: String,
    channel: String,
    interventionId: String,
    startAt: { type: Date, required: true },
    endAt: Date,
    baseline: windowSchema,
    post: windowSchema,
    retention: { ...windowSchema, delayDays: Number },
    transfer: windowSchema,
    exams: { type: [{ attemptId: String, assessmentId: String, assessmentKind: String, overallScore: Number, objectiveScore: Number, at: Date, _id: false }], default: [] },
    mastery: { statusBefore: String, estimateBefore: Number, statusAfter: String, estimateAfter: Number },
    observedChange: Number,
    retentionChange: Number,
    comparability: { type: [String], default: [] },
    evidenceQuality: { type: String, enum: ['none', 'weak', 'moderate', 'strong'], required: true },
    label: { type: String, enum: ['insufficient_evidence', 'observed_change', 'associated_with_intervention'], required: true },
    limitations: { type: [String], default: [] },
    computeVersion: { type: String, required: true },
    computedAt: { type: Date, required: true },
  },
  { collection: 'teaching_episodes', versionKey: false },
);
schema.index({ studentId: 1, objectiveId: 1, startAt: -1 });
schema.index({ institutionId: 1, primary: 1, label: 1 });
schema.index({ institutionId: 1, batchId: 1, startAt: -1 });

export const TeachingEpisode = model<ITeachingEpisode>('TeachingEpisode', schema);

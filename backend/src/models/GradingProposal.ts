import { Schema, model, Document } from 'mongoose';

// One AI evaluation of one answer (the record behind an automatic grade, or a
// proposal on older attempts). Immutable. kind 'rubric' for open answers,
// 'short_answer' for a meaning check against the key. run groups the
// independent evaluations made for the consistency check.
export interface IGradingProposal extends Document {
  id: string;
  institutionId?: string;
  attemptId: string;
  assignmentId?: string;
  questionId: string;
  kind?: 'rubric' | 'short_answer';
  run?: number;
  status: 'proposed' | 'invalid' | 'failed';
  criteria: { criterionId: string; levelId: string; points: number; evidence: string[]; rationale: string }[];
  points?: number;
  maxPoints: number;
  feedback?: string;
  scoreExplanation?: string;
  strengths?: string[];
  improvements?: string[];
  objectiveIds?: string[];
  // The model's own rating of how sure it is. Not calibrated.
  confidence?: 'low' | 'medium' | 'high';
  flags: string[];
  error?: string;
  modelName?: string;
  promptVersion: string;
  createdAt: Date;
}

const schema = new Schema<IGradingProposal>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: String,
    attemptId: { type: String, required: true },
    assignmentId: String,
    questionId: { type: String, required: true },
    kind: { type: String, enum: ['rubric', 'short_answer'] },
    run: Number,
    status: { type: String, enum: ['proposed', 'invalid', 'failed'], required: true },
    criteria: { type: [{ criterionId: String, levelId: String, points: Number, evidence: [String], rationale: String, _id: false }], default: [] },
    points: Number,
    maxPoints: { type: Number, required: true },
    feedback: String,
    scoreExplanation: String,
    strengths: { type: [String], default: undefined },
    improvements: { type: [String], default: undefined },
    objectiveIds: { type: [String], default: undefined },
    confidence: { type: String, enum: ['low', 'medium', 'high'] },
    flags: { type: [String], default: [] },
    error: String,
    modelName: String,
    promptVersion: { type: String, required: true },
  },
  { collection: 'grading_proposals', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
schema.index({ attemptId: 1, questionId: 1, createdAt: -1 });
schema.index({ institutionId: 1, createdAt: -1 });

export const GradingProposal = model<IGradingProposal>('GradingProposal', schema);

import { Schema, model, Document } from 'mongoose';

export type AiProvider = 'anthropic' | 'elevenlabs' | 'orchestrator';
export type AiCallStatus = 'ok' | 'error' | 'refusal' | 'empty';

// One record per call to an AI provider: what it was for, who it was for,
// how long it took, tokens and estimated cost. Kept for 180 days.
export interface IAiCall extends Document {
  feature: string;
  provider: AiProvider;
  modelName: string;
  status: AiCallStatus;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  characters?: number;
  costUsd: number;
  // 'unpriced': the model had no catalogue price, so costUsd (0) is not a real
  // cost. Absent on rows written before 2026-10-28.
  costStatus?: 'estimated' | 'unpriced';
  institutionId?: string;
  userId?: string;
  studentId?: string;
  role?: string;
  requestId?: string;
  errorCode?: string;
  createdAt: Date;
}

const aiCallSchema = new Schema<IAiCall>(
  {
    feature: { type: String, required: true },
    provider: { type: String, enum: ['anthropic', 'elevenlabs', 'orchestrator'], required: true },
    modelName: { type: String, required: true },
    status: { type: String, enum: ['ok', 'error', 'refusal', 'empty'], required: true },
    latencyMs: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    characters: Number,
    costUsd: { type: Number, default: 0 },
    costStatus: { type: String, enum: ['estimated', 'unpriced'] },
    institutionId: String,
    userId: String,
    studentId: String,
    role: String,
    requestId: String,
    errorCode: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'ai_calls', versionKey: false },
);

aiCallSchema.index({ institutionId: 1, createdAt: -1 });
aiCallSchema.index({ feature: 1, createdAt: -1 });
aiCallSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const AiCall = model<IAiCall>('AiCall', aiCallSchema);

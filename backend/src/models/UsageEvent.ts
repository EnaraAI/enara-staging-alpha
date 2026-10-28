import { Schema, model, Document } from 'mongoose';

export interface IUsageEvent extends Document {
  id: string;
  userId: string;
  studentId?: string;
  institutionId?: string;
  feature: 'chat' | 'voice' | 'assessment' | 'curriculum' | 'research' | 'visualize' | 'tts';
  modelName: string;
  requestId: string;
  sessionId?: string;
  tokensIn?: number;
  tokensOut?: number;
  creditsUsed: number;
  status: 'reserved' | 'settled' | 'released';
  timestamp: Date;
}

const usageEventSchema = new Schema<IUsageEvent>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    studentId: { type: String, index: true },
    institutionId: { type: String, index: true },
    feature: {
      type: String,
      enum: ['chat', 'voice', 'assessment', 'curriculum', 'research', 'visualize', 'tts'],
      required: true,
    },
    modelName: { type: String, default: 'enara-orchestrator' },
    requestId: { type: String, required: true },
    sessionId: String,
    tokensIn: Number,
    tokensOut: Number,
    creditsUsed: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['reserved', 'settled', 'released'],
      default: 'settled',
      index: true,
    },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

usageEventSchema.index({ institutionId: 1, timestamp: -1 });
usageEventSchema.index({ studentId: 1, feature: 1, timestamp: -1 });

export const UsageEvent = model<IUsageEvent>('UsageEvent', usageEventSchema);

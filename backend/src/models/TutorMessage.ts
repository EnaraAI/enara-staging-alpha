import { Schema, model, Document } from 'mongoose';
import type { ChatRole, TeachingMethod } from './TutorSession';

// One chat message, stored on its own so long conversations don't grow the
// session document without bound. Sessions created before this collection
// existed may still hold older messages embedded in TutorSession.messages;
// services/tutorMessages.ts reads both.
export interface ITutorMessageDoc extends Document {
  id: string;
  sessionId: string;
  studentId: string;
  institutionId?: string;
  role: ChatRole;
  text: string;
  timestamp: Date;
  imageUrl?: string;
  imagePrompt?: string;
  meta?: {
    intent?: string;
    contextFound?: number;
    version?: string;
    teachingMethod?: TeachingMethod;
    citations?: { n: number; fileName: string; page: number | null; lessonId: string; chunkId: string }[];
  };
}

const tutorMessageDocSchema = new Schema<ITutorMessageDoc>(
  {
    id: { type: String, required: true },
    sessionId: { type: String, required: true },
    studentId: { type: String, required: true },
    institutionId: String,
    role: { type: String, enum: ['ai', 'user'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    imageUrl: String,
    imagePrompt: String,
    meta: {
      intent: String,
      contextFound: Number,
      version: String,
      teachingMethod: String,
      citations: { type: [{ n: Number, fileName: String, page: Number, lessonId: String, chunkId: String, _id: false }], default: undefined },
    },
  },
  { collection: 'tutor_messages', versionKey: false },
);

tutorMessageDocSchema.index({ sessionId: 1, id: 1 }, { unique: true });
tutorMessageDocSchema.index({ sessionId: 1, timestamp: 1 });
tutorMessageDocSchema.index({ institutionId: 1, role: 1, timestamp: -1 });
tutorMessageDocSchema.index({ studentId: 1, timestamp: -1 });

export const TutorMessage = model<ITutorMessageDoc>('TutorMessage', tutorMessageDocSchema);

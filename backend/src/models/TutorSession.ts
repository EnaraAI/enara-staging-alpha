import { Schema, model, Document } from 'mongoose';

export type TeachingMethod = 'socratic' | 'gap_filler' | 'error_analysis';
export type ChatRole = 'ai' | 'user';

export interface ITutorMessage {
  id: string;
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

export interface ITutorSession extends Document {
  id: string;
  studentId: string;
  institutionId?: string;
  title: string;
  courseId?: string;
  lessonId?: string;
  lessonTitle?: string;
  curriculumId?: string;
  teachingMethod: TeachingMethod;
  // Legacy: messages from before they moved to the tutor_messages collection.
  // New messages are not written here; read them with services/tutorMessages.
  messages: ITutorMessage[];
  messageCount: number;
  // 'voice': a live tutor call, kept so the student can read it back.
  mode: 'chat' | 'voice';
  // Set when the chat targets one learning objective (e.g. an intervention).
  objectiveId?: string;
  interventionId?: string;
  // Set when the chat was opened from an assignment, a released result or a
  // study-plan item: the minimal context the tutor gets (built server-side).
  handoff?: { kind: 'assignment' | 'result' | 'plan_item'; refId: string; prompt: string; createdAt: Date };
  lastMessageAt: Date;
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
}

const tutorMessageSchema = new Schema<ITutorMessage>(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ['ai', 'user'], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    imageUrl: { type: String },
    imagePrompt: { type: String },
    meta: {
      intent: String,
      contextFound: Number,
      version: String,
      teachingMethod: String,
      citations: { type: [{ n: Number, fileName: String, page: Number, lessonId: String, chunkId: String, _id: false }], default: undefined },
    },
  },
  { _id: false }
);

const tutorSessionSchema = new Schema<ITutorSession>(
  {
    id: { type: String, required: true, unique: true, index: true },
    studentId: { type: String, required: true, index: true },
    institutionId: { type: String, index: true },
    title: { type: String, default: 'New chat' },
    courseId: { type: String, index: true },
    lessonId: { type: String },
    lessonTitle: { type: String },
    curriculumId: { type: String },
    teachingMethod: {
      type: String,
      enum: ['socratic', 'gap_filler', 'error_analysis'],
      default: 'socratic',
    },
    messages: { type: [tutorMessageSchema], default: undefined },
    messageCount: { type: Number, default: 0 },
    mode: { type: String, enum: ['chat', 'voice'], default: 'chat' },
    objectiveId: String,
    interventionId: String,
    handoff: { type: { kind: String, refId: String, prompt: String, createdAt: Date }, default: undefined, _id: false },
    lastMessageAt: { type: Date, default: Date.now },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { timestamps: true }
);

tutorSessionSchema.index({ studentId: 1, lastMessageAt: -1 });
tutorSessionSchema.index({ institutionId: 1, lastMessageAt: -1 });

export const TutorSession = model<ITutorSession>('TutorSession', tutorSessionSchema);

import type { LanguageTurnEvidence } from '../services/languageTeachingContext';
import { Schema, model, Document } from 'mongoose';
import type { ChatRole, TeachingMethod } from './TutorSession';

export interface TeachingMeta {
  decisionId?: string;
  objectiveId?: string;
  objectiveResolution: string;
  primary: string;
  supporting?: string[];
  reinforcement?: string;
  modifiers?: string[];
  reasonCodes?: string[];
  primaryVersion?: number;
  decisionVersion: string;
  registryVersion: string;
}

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
    // The teaching plan this reply followed (P21); absent on older messages.
    teaching?: TeachingMeta;
    // Language courses (ltc-v1): moves used and turn signals. Low-confidence
    // observation, never mastery (services/languageTeachingContext.ts).
    languageTurn?: LanguageTurnEvidence;
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
      teaching: {
        type: {
          decisionId: String,
          objectiveId: String,
          objectiveResolution: String,
          primary: String,
          supporting: { type: [String], default: undefined },
          reinforcement: String,
          modifiers: { type: [String], default: undefined },
          reasonCodes: { type: [String], default: undefined },
          primaryVersion: Number,
          decisionVersion: String,
          registryVersion: String,
          _id: false,
        },
        default: undefined,
      },
      languageTurn: {
        type: {
          version: String,
          lessonId: String,
          objectiveId: String,
          skill: String,
          moves: { type: [String], default: undefined },
          reasonCodes: { type: [String], default: undefined },
          supportRequested: Boolean,
          confusionSignals: Number,
          answeringCheck: Boolean,
          proficiency: { type: { status: String, value: String, source: String, _id: false }, default: undefined },
          nextStep: String,
          provenance: String,
          confidence: String,
          masteryClaim: Boolean,
          // ltc-v1-r1
          policyRevision: String,
          pendingTask: String,
          learnerResponse: String,
          attemptsOnTask: Number,
          offTopic: String,
          lengthTarget: { type: { targetWords: Number, maxWords: Number, basis: String, _id: false }, default: undefined },
          // ltc-v1-r2
          errorRecurrence: String,
          missingContext: { type: [String], default: undefined },
          ageBand: String,
          ageBandSource: String,
          // ltc-v1-r3 / r4: success streak and structured learning state (no migration:
          // optional fields, absent on older messages, which the engine treats as unknown).
          ageBandStatus: String,
          confirmedSuccessStreak: Number,
          hintLevelOffered: Number,
          hintLevel: Number,
          keyVerdict: String,
          presentedLessonItemId: String,
          activeItemBefore: { type: { id: String, source: String, lessonItemId: String, _id: false }, default: undefined },
          activeItem: { type: { id: String, source: String, lessonItemId: String, _id: false }, default: undefined },
          assessment: {
            type: { verdict: String, relevance: String, criteria: { type: [Number], default: undefined }, next: String, item: String, source: String, _id: false },
            default: undefined,
          },
          qualityFlags: { type: [String], default: undefined },
          markerStatus: String,
          // r4.1: opaque state namespace (POST-03) and the learner's intent class (POST-12).
          stateScope: String,
          learnerIntent: String,
          revealedItemId: String,
          preAttemptModelsRemoved: Number,
          diagnosis: String,
          _id: false,
        },
        default: undefined,
      },
    },
  },
  { collection: 'tutor_messages', versionKey: false },
);

tutorMessageDocSchema.index({ sessionId: 1, id: 1 }, { unique: true });
tutorMessageDocSchema.index({ sessionId: 1, timestamp: 1 });
tutorMessageDocSchema.index({ institutionId: 1, role: 1, timestamp: -1 });
tutorMessageDocSchema.index({ studentId: 1, timestamp: -1 });

export const TutorMessage = model<ITutorMessageDoc>('TutorMessage', tutorMessageDocSchema);

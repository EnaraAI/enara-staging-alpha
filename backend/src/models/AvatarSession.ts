import { Schema, model, Document } from 'mongoose';

// A live-avatar call: which lesson it is about and which voice it speaks. Kept
// server-side so the browser only holds the session id.
export interface IAvatarSession extends Document {
  id: string;
  userId: string;
  studentId?: string;
  courseId?: string;
  lessonId?: string;
  lessonTitle?: string;
  subject?: string;
  language: 'english' | 'arabic';
  // Set when the student explicitly asks for a language ("speak Arabic"); replies
  // stay in it whatever language they then speak, until they ask for the other.
  pinnedLanguage?: 'english' | 'arabic';
  // The chosen face's gender; the tutor's voice matches it.
  voiceGender?: 'woman' | 'man';
  avatarId?: string;
  // Latest visual aid for the side panel; replaced after each answer that needs one.
  artifactHtml?: string;
  // Tutor-started turns are free; these bound them. The opening happens once;
  // each opening or paid turn allows up to two nudges.
  openingUsed?: boolean;
  freeNudgesLeft?: number;
  // Characters spoken with ElevenLabs in this call (capped per call).
  spokenChars?: number;
  endedAt?: Date;
  // Usage metering (services/avatarUsage.ts). Tenant and role are copied from
  // the authenticated user at start. lastActivityAt is the latest server-seen
  // request for the call. usageEndAt/usageEndBasis are frozen once by the first
  // finalizer; usageFinalizedAt is set after the ledger row is stored.
  institutionId?: string;
  role?: string;
  lastActivityAt?: Date;
  usageEndAt?: Date;
  usageEndBasis?: 'explicit_end' | 'last_activity' | 'none';
  usageFinalizedAt?: Date;
  // Browser heartbeats while the Anam stream is connected (evidence of a live
  // connection, not Anam's billing record) and Anam's own session ids, kept
  // for reconciling against Anam account usage. Ids only, no content.
  lastHeartbeatAt?: Date;
  providerSessionIds?: string[];
  // Deletion time. Unset until usage is finalized, so a call is never deleted
  // before it is metered (see services/avatarUsage.ts).
  retentionExpiresAt?: Date;
  createdAt: Date;
}

const avatarSessionSchema = new Schema<IAvatarSession>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    studentId: String,
    courseId: String,
    lessonId: String,
    lessonTitle: String,
    subject: String,
    language: { type: String, enum: ['english', 'arabic'], default: 'english' },
    artifactHtml: String,
    pinnedLanguage: { type: String, enum: ['english', 'arabic'] },
    voiceGender: { type: String, enum: ['woman', 'man'] },
    avatarId: String,
    openingUsed: { type: Boolean, default: false },
    freeNudgesLeft: { type: Number, default: 0 },
    spokenChars: { type: Number, default: 0 },
    endedAt: Date,
    institutionId: String,
    role: String,
    lastActivityAt: Date,
    usageEndAt: Date,
    usageEndBasis: { type: String, enum: ['explicit_end', 'last_activity', 'none'] },
    usageFinalizedAt: Date,
    lastHeartbeatAt: Date,
    providerSessionIds: { type: [String], default: undefined },
    retentionExpiresAt: Date,
  },
  { timestamps: true }
);

// Deleted once retentionExpiresAt passes, which is set only after the call's
// usage is metered. (Replaces a 24 h TTL on createdAt that could delete a call
// before it was metered; migration 2026-10-29-avatar-session-retention.)
avatarSessionSchema.index({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const AvatarSession = model<IAvatarSession>('AvatarSession', avatarSessionSchema);

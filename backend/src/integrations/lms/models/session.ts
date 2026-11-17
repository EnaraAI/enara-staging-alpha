import { Schema, model, models, type Model } from 'mongoose';
import { requiredOrg } from './common';

// lms_launch_tokens (Phase 1a): the one-time token that turns a validated LTI
// launch into an ENARA session without any third-party cookie. The token is a
// short-lived signed JWT; this row makes it single use (usedAt is set
// atomically on exchange). Only the SHA-256 of its jti is stored. A TTL index
// removes rows after they expire.
export interface ILmsLaunchToken {
  jtiHash: string;
  institutionId: string;
  enaraUserId: string;
  /** 'launch' = issued by /lti/launch; 'handoff' = "Open in new tab" from a signed-in LMS session. */
  purpose: 'launch' | 'handoff';
  enaraRole: 'student' | 'teacher' | 'admin';
  platformId?: string;
  lmsUserId?: string;
  contextId?: string;
  enaraClassId?: string;
  resourceLinkId?: string;
  presentation?: 'iframe' | 'window';
  cookieless: boolean;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const launchTokenSchema = new Schema<ILmsLaunchToken>(
  {
    jtiHash: { type: String, required: true, unique: true },
    institutionId: requiredOrg,
    enaraUserId: { type: String, required: true },
    purpose: { type: String, enum: ['launch', 'handoff'], required: true },
    enaraRole: { type: String, enum: ['student', 'teacher', 'admin'], required: true },
    platformId: String,
    lmsUserId: String,
    contextId: String,
    enaraClassId: String,
    resourceLinkId: String,
    presentation: { type: String, enum: ['iframe', 'window'] },
    cookieless: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'lms_launch_tokens', versionKey: false },
);
launchTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LmsLaunchToken =
  (models.LmsLaunchToken as Model<ILmsLaunchToken>) || model<ILmsLaunchToken>('LmsLaunchToken', launchTokenSchema);

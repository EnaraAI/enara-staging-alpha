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
  /** Phase 3: the ENARA assignment the activity is bound to; the landing page opens it. */
  targetAssignmentId?: string;
  presentation?: 'iframe' | 'window';
  cookieless: boolean;
  /** Student preview by a staff account (enaraRole is then 'student', the view; the account keeps its own role). */
  preview?: boolean;
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
    targetAssignmentId: String,
    presentation: { type: String, enum: ['iframe', 'window'] },
    cookieless: { type: Boolean, default: false },
    preview: Boolean,
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'lms_launch_tokens', versionKey: false },
);
launchTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LmsLaunchToken =
  (models.LmsLaunchToken as Model<ILmsLaunchToken>) || model<ILmsLaunchToken>('LmsLaunchToken', launchTokenSchema);

// lms_deep_link_sessions (Phase 2): one row per activity-picker request
// (LtiDeepLinkingRequest from a teacher or admin). The picker page holds a
// random secret (only its SHA-256 is stored), lives 10 minutes, and is used
// exactly once to send the picked items back to the LMS. Rows that were used
// keep the picks for the "Already added in this course" badge (IDs only); the
// rest expire through the TTL index.
export interface ILmsDeepLinkSession {
  secretHash: string;
  institutionId: string;
  platformId: string;
  /** The LMS's own deployment id (sent back in the response). */
  externalDeploymentId: string;
  /** The LMS course (LTI context id); may not be linked to ENARA yet. */
  externalContextId: string;
  contextTitle?: string;
  lmsUserSub: string;
  role: 'teacher' | 'admin';
  locale: 'en' | 'ar';
  returnUrl: string;
  /** Echoed back unchanged (LTI DL `data`). */
  data?: string;
  acceptMultiple: boolean;
  acceptLineItem: boolean;
  acceptWindow: boolean;
  acceptIframe: boolean;
  expiresAt: Date;
  /** TTL field: set while unused (= expiresAt), removed when used so the picks stay for the badge. */
  purgeAt?: Date;
  usedAt?: Date;
  picked?: { type: string; id: string }[];
  createdAt: Date;
}

const deepLinkSessionSchema = new Schema<ILmsDeepLinkSession>(
  {
    secretHash: { type: String, required: true, unique: true },
    institutionId: requiredOrg,
    platformId: { type: String, required: true },
    externalDeploymentId: { type: String, required: true },
    externalContextId: { type: String, required: true },
    contextTitle: String,
    lmsUserSub: { type: String, required: true },
    role: { type: String, enum: ['teacher', 'admin'], required: true },
    locale: { type: String, enum: ['en', 'ar'], default: 'en' },
    returnUrl: { type: String, required: true },
    data: String,
    acceptMultiple: { type: Boolean, default: false },
    acceptLineItem: { type: Boolean, default: true },
    acceptWindow: { type: Boolean, default: true },
    acceptIframe: { type: Boolean, default: true },
    expiresAt: { type: Date, required: true },
    purgeAt: Date,
    usedAt: Date,
    picked: { type: [{ type: { type: String }, id: String, _id: false }], default: undefined },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'lms_deep_link_sessions', versionKey: false },
);
// Unused sessions disappear after expiry; used ones are kept (picks for the badge) via a partial TTL.
deepLinkSessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
deepLinkSessionSchema.index({ platformId: 1, externalContextId: 1, usedAt: 1 });

export const LmsDeepLinkSession =
  (models.LmsDeepLinkSession as Model<ILmsDeepLinkSession>) || model<ILmsDeepLinkSession>('LmsDeepLinkSession', deepLinkSessionSchema);

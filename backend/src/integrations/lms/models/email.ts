import { Schema, model, models, type Model } from 'mongoose';
import { newId } from './common';

// LMS emails (core/lmsEmail.ts). Three small collections:
//
// lms_email_log: one row per email (one per recipient; one per event when a
// test inbox redirect is on). `key` is unique, so an email is never sent
// twice (idempotency across retries, instances and cron runs). IDs, codes,
// the template, the language and the subject only: never an address, a name
// or the body.
export type LmsEmailStatus = 'pending' | 'sent' | 'captured' | 'held' | 'failed';

export interface ILmsEmailLog {
  id: string;
  key: string;
  /** Base alias, e.g. lms-connection-active (the language is separate). */
  template: string;
  lang: 'en' | 'ar';
  institutionId?: string;
  platformId?: string;
  /** user:<id>, contact:<institutionId>, ops:<hash> or redirect (never the address). */
  recipientRef: string;
  /** How many people it was for (more than 1 only for a redirected test copy). */
  recipientCount: number;
  /** Sent to the test inbox (REMINDER_TEST_RECIPIENT) instead of the recipients. */
  redirected: boolean;
  status: LmsEmailStatus;
  /** Why it failed or was held (e.g. daily_cap, missing_api_key). */
  code?: string;
  subject?: string;
  /** Calendar day in Cairo (YYYY-MM-DD) the row was made: the daily cap's day. */
  cairoDay: string;
  attempts: number;
  resendId?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const logSchema = new Schema<ILmsEmailLog>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmse') },
    key: { type: String, required: true, unique: true, maxlength: 300 },
    template: { type: String, required: true, maxlength: 80 },
    lang: { type: String, enum: ['en', 'ar'], required: true },
    institutionId: String,
    platformId: String,
    recipientRef: { type: String, required: true, maxlength: 120 },
    recipientCount: { type: Number, default: 1, min: 0 },
    redirected: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'sent', 'captured', 'held', 'failed'], required: true },
    code: { type: String, maxlength: 80 },
    subject: { type: String, maxlength: 300 },
    cairoDay: { type: String, required: true },
    attempts: { type: Number, default: 0, min: 0 },
    resendId: String,
    sentAt: Date,
  },
  { collection: 'lms_email_log', versionKey: false, timestamps: true },
);
logSchema.index({ cairoDay: 1, status: 1 });
logSchema.index({ template: 1, createdAt: -1 });
logSchema.index({ institutionId: 1, createdAt: -1 });

export const LmsEmailLog = (models.LmsEmailLog as Model<ILmsEmailLog>) || model<ILmsEmailLog>('LmsEmailLog', logSchema);

// lms_email_claims: atomic once-per-window claims ("max once per platform per
// 24 h", "same course and code not again for 72 h") and counters (the test
// inbox's daily cap, cap:<cairoDay>). `_id` is the claim key.
export interface ILmsEmailClaim {
  _id: string;
  at: Date;
  count: number;
  /** Small per-claim state (e.g. the last count and streak of a weekly reminder). */
  data?: Record<string, number | string>;
}

const claimSchema = new Schema<ILmsEmailClaim>(
  {
    _id: { type: String, required: true },
    at: { type: Date, required: true },
    count: { type: Number, default: 0 },
    data: { type: Schema.Types.Mixed },
  },
  { collection: 'lms_email_claims', versionKey: false },
);
claimSchema.index({ at: 1 });

export const LmsEmailClaim = (models.LmsEmailClaim as Model<ILmsEmailClaim>) || model<ILmsEmailClaim>('LmsEmailClaim', claimSchema);

// lms_email_optins (owner decision D2): a teacher's answer to "Email me Enara
// updates at ...?" on their first LMS launch. The address (pre-filled from
// Moodle, confirmed or changed by the teacher) is kept only with a yes. No
// row = not asked yet = no teacher email. Never filled in silently.
export interface ILmsEmailOptIn {
  enaraUserId: string;
  institutionId: string;
  state: 'in' | 'out';
  email?: string;
  /** The LMS course of the launch where they answered (the welcome email names it). */
  contextId?: string;
  decidedAt: Date;
  welcomeSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const optInSchema = new Schema<ILmsEmailOptIn>(
  {
    enaraUserId: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    state: { type: String, enum: ['in', 'out'], required: true },
    email: { type: String, lowercase: true, maxlength: 254 },
    contextId: String,
    decidedAt: { type: Date, required: true },
    welcomeSentAt: Date,
  },
  { collection: 'lms_email_optins', versionKey: false, timestamps: true },
);
optInSchema.index({ institutionId: 1, state: 1 });

export const LmsEmailOptIn = (models.LmsEmailOptIn as Model<ILmsEmailOptIn>) || model<ILmsEmailOptIn>('LmsEmailOptIn', optInSchema);

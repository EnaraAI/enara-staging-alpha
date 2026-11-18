import { Schema, model, models, type Model } from 'mongoose';
import { newId, requiredOrg } from './common';

// LMS step 2: self-serve school onboarding (docs/lms/SCHOOL_GUIDE.md).
//
// lms_onboardings: one row per school created with ENARA's "New school" form.
// It ties together the school, the school-admin invitation (the existing
// invitation flow), the current one-URL registration link (Phase 1b) and the
// invite's own times ("invite sent", the email). IDs and times only; the one
// contact address it keeps (the Moodle admin's, optional) is never logged or
// audited.
export interface ILmsOnboarding {
  id: string;
  institutionId: string;
  /** The ENARA admin who made the school (the links they make connect active, R1). */
  createdBy: string;
  /** The school-admin invitation (invitations.id). */
  schoolAdminInvitationId?: string;
  /** The Moodle admin's address when it differs from the school admin's (optional; shown on the invite screen). */
  moodleAdminEmail?: string;
  /** The current registration link (lms_registration_codes.id); "New link" replaces it. */
  registrationLinkId?: string;
  /** First time the invite was copied or emailed: the 15-minute timer starts here. */
  inviteSentAt?: Date;
  inviteSentVia?: 'copy' | 'email';
  inviteSentBy?: string;
  lastEmailAt?: Date;
  emailCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const onboardingSchema = new Schema<ILmsOnboarding>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmso') },
    institutionId: { type: String, required: true, unique: true },
    createdBy: { type: String, required: true },
    schoolAdminInvitationId: String,
    moodleAdminEmail: { type: String, lowercase: true, maxlength: 254 },
    registrationLinkId: String,
    inviteSentAt: Date,
    inviteSentVia: { type: String, enum: ['copy', 'email'] },
    inviteSentBy: String,
    lastEmailAt: Date,
    emailCount: { type: Number, default: 0, min: 0 },
  },
  { collection: 'lms_onboardings', versionKey: false, timestamps: true },
);
onboardingSchema.index({ createdAt: -1 });

// lms_connection_checks: the automatic connection check of one LMS
// connection (core/connectionCheck.ts) and the school admin's hand-ticked
// Moodle settings for it. One row per platform. Codes, statuses, times and
// ENARA user IDs only.
export type CheckStatus = 'ok' | 'fail' | 'waiting';
export const CHECK_STEPS = ['registered', 'reachable', 'services', 'activated', 'roster', 'grades'] as const;
export type CheckStepKey = (typeof CHECK_STEPS)[number];
/** The 4 Moodle settings ENARA cannot see; the school admin ticks each by hand. */
export const MANUAL_SETTINGS = ['acceptGradesAlways', 'activityChooser', 'restrictToCategory', 'activated'] as const;
export type ManualSettingKey = (typeof MANUAL_SETTINGS)[number];

export interface ICheckStep {
  key: CheckStepKey;
  status: CheckStatus;
  code: string;
  at?: Date;
}

export interface IManualTick {
  checked: boolean;
  by: string;
  at: Date;
}

export interface ILmsConnectionCheck {
  id: string;
  platformId: string;
  institutionId: string;
  checkedAt?: Date;
  outcome?: CheckStatus;
  trigger?: 'registration' | 'manual' | 'nightly';
  /** Moodle could not be reached from the internet (keyset or token fetch: network, timeout or a private address). */
  unreachable?: boolean;
  steps: ICheckStep[];
  checkedBy?: string;
  manualSettings?: Partial<Record<ManualSettingKey, IManualTick>>;
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema = new Schema<ICheckStep>(
  {
    key: { type: String, enum: CHECK_STEPS, required: true },
    status: { type: String, enum: ['ok', 'fail', 'waiting'], required: true },
    code: { type: String, required: true, maxlength: 80 },
    at: Date,
  },
  { _id: false },
);
const tickSchema = new Schema<IManualTick>({ checked: { type: Boolean, required: true }, by: { type: String, required: true }, at: { type: Date, required: true } }, { _id: false });

const connectionCheckSchema = new Schema<ILmsConnectionCheck>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmscc') },
    platformId: { type: String, required: true, unique: true },
    institutionId: requiredOrg,
    checkedAt: Date,
    outcome: { type: String, enum: ['ok', 'fail', 'waiting'] },
    trigger: { type: String, enum: ['registration', 'manual', 'nightly'] },
    unreachable: Boolean,
    steps: { type: [stepSchema], default: [] },
    checkedBy: String,
    manualSettings: {
      type: new Schema(Object.fromEntries(MANUAL_SETTINGS.map((k) => [k, { type: tickSchema, default: undefined }])), { _id: false }),
      default: undefined,
    },
  },
  { collection: 'lms_connection_checks', versionKey: false, timestamps: true },
);
// The nightly re-check (S3): failed checks, oldest first.
connectionCheckSchema.index({ outcome: 1, checkedAt: 1 });

export const LmsOnboarding = (models.LmsOnboarding as Model<ILmsOnboarding>) || model<ILmsOnboarding>('LmsOnboarding', onboardingSchema);
export const LmsConnectionCheck =
  (models.LmsConnectionCheck as Model<ILmsConnectionCheck>) || model<ILmsConnectionCheck>('LmsConnectionCheck', connectionCheckSchema);

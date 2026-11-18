import { Schema, model, models, type Model } from 'mongoose';
import { newId, requiredOrg } from './common';

// lms_registration_codes (Phase 1b): the one-URL "Connect Moodle" link
// (LTI Dynamic Registration). An admin makes a link for ONE school; the
// Moodle admin pastes `${toolBase}/lti/register/<code>` into Moodle. The code
// is 32 random bytes (base64url), shown once, stored only as its SHA-256. It
// works once (status 'used', set atomically when the registration succeeds)
// and expires after 7 days (owner decision R2).
//
// A registration takes a few seconds (it calls the LMS twice), so the code is
// first RESERVED for that one attempt (reservedUntil + reservationId, atomic),
// then FINALIZED ('used') on success or RELEASED on failure. Two browsers
// opening the same link at once cannot both register; a failed attempt (the
// LMS refused, a timeout) leaves the code usable for a retry.
export type RegistrationCodeStatus = 'unused' | 'used' | 'revoked';

export interface ILmsRegistrationCode {
  id: string;
  institutionId: string;
  /** ENARA user id of the admin who made the link. */
  createdBy: string;
  /** 'enara-admin' → the connection is active at once; 'admin' (school admin) → pending (R1). */
  createdByRole: 'enara-admin' | 'admin';
  codeHash: string;
  expiresAt: Date;
  status: RegistrationCodeStatus;
  usedAt?: Date;
  /** The connection the registration made (or found, for a same-school re-registration). */
  platformId?: string;
  revokedAt?: Date;
  revokedBy?: string;
  /** One registration attempt at a time. */
  reservedUntil?: Date;
  reservationId?: string;
  /** Failed attempts (the LMS refused, timeout, ...). IDs and codes only. */
  failedAttempts: number;
  lastErrorCode?: string;
  lastErrorAt?: Date;
  /** Step 2: the first time Moodle opened the link (any attempt, even a failed one): "link opened". */
  firstOpenedAt?: Date;
  /** Step 2: the onboarding ("New school") this link belongs to. */
  onboardingId?: string;
  /**
   * Step 2: a school admin's link for a school ENARA onboarded: the ENARA
   * admin who made the school, so the connection is active on registration
   * (R1: ENARA already approved this school's connection).
   */
  preApprovedBy?: string;
  createdAt: Date;
}

const registrationCodeSchema = new Schema<ILmsRegistrationCode>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmsrc') },
    institutionId: requiredOrg,
    createdBy: { type: String, required: true },
    createdByRole: { type: String, enum: ['enara-admin', 'admin'], required: true },
    codeHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['unused', 'used', 'revoked'], default: 'unused' },
    usedAt: Date,
    platformId: String,
    revokedAt: Date,
    revokedBy: String,
    reservedUntil: Date,
    reservationId: String,
    failedAttempts: { type: Number, default: 0, min: 0 },
    lastErrorCode: String,
    lastErrorAt: Date,
    firstOpenedAt: Date,
    onboardingId: String,
    preApprovedBy: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'lms_registration_codes', versionKey: false },
);
registrationCodeSchema.index({ institutionId: 1, createdAt: -1 });

export const LmsRegistrationCode =
  (models.LmsRegistrationCode as Model<ILmsRegistrationCode>) || model<ILmsRegistrationCode>('LmsRegistrationCode', registrationCodeSchema);

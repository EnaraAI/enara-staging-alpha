import { Schema, model, models, type Model } from 'mongoose';
import { newId, requiredOrg } from './common';

// lms_suppressed_identities (Priority 0, PDPL): LMS identities of students who
// were permanently deleted. A roster sync skips them and a launch is refused
// (identity_suppressed), so ENARA never re-creates the person.
//
// No name, email or raw LMS user id is stored: only an HMAC-SHA256 of
// `${platformId}:${externalUserId}` under a key derived from LMS_KEK
// (core/suppression.ts). `keyId` names the LMS_KEK it was made with, so a row
// keeps matching while that key is LMS_KEK_PREVIOUS during a rotation.
// An ENARA admin can lift a row (liftedAt/liftedBy); a lifted row no longer
// blocks. Erasing the same person again re-activates the row.
export interface ILmsSuppressedIdentity {
  id: string;
  institutionId: string;
  platformId: string;
  identityHash: string;
  keyId: string;
  reason: 'pdpl_erasure';
  createdAt: Date;
  createdBy?: string;
  liftedAt?: Date;
  liftedBy?: string;
}

const suppressedIdentitySchema = new Schema<ILmsSuppressedIdentity>(
  {
    id: { type: String, required: true, unique: true, default: newId('lmss') },
    institutionId: requiredOrg,
    platformId: { type: String, required: true },
    identityHash: { type: String, required: true },
    keyId: { type: String, required: true },
    reason: { type: String, enum: ['pdpl_erasure'], required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    createdBy: String,
    liftedAt: Date,
    liftedBy: String,
  },
  { collection: 'lms_suppressed_identities', versionKey: false },
);
suppressedIdentitySchema.index({ platformId: 1, identityHash: 1 }, { unique: true });
suppressedIdentitySchema.index({ institutionId: 1, liftedAt: 1 });

export const LmsSuppressedIdentity =
  (models.LmsSuppressedIdentity as Model<ILmsSuppressedIdentity>) || model<ILmsSuppressedIdentity>('LmsSuppressedIdentity', suppressedIdentitySchema);

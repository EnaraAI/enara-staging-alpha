import { Schema, model, Document } from 'mongoose';

// Parents P5 (PARENT_CSV_INVITES_ENABLED): one row per CSV invitation (one child,
// one parent address). The address is stored hidden (select: false; shown masked
// in the school's list, used only to resend) with a SHA-256 hash for grouping.
// The code itself is never stored (codeId names the ParentLinkCode, hash only).
// No email binding (owner decision e, D6 dropped): any parent account may redeem
// the code; the invited address is only offered as a suggestion when that parent
// adds an email. Kept 13 months; erased with the student (PDPL).
export interface IParentInvite extends Document {
  id: string;
  batchId: string;
  institutionId: string;
  studentId: string;
  emailHash: string;
  email: string;
  parentName?: string;
  language: 'en' | 'ar';
  codeId: string;
  createdBy: string;
  createdAt: Date;
  resentAt?: Date;
  revokedAt?: Date;
  redeemedBy?: string;
  redeemedAt?: Date;
}

const schema = new Schema<IParentInvite>(
  {
    id: { type: String, required: true, unique: true },
    batchId: { type: String, required: true, index: true },
    institutionId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    emailHash: { type: String, required: true },
    email: { type: String, required: true, select: false },
    parentName: { type: String, maxlength: 120 },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    codeId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, required: true },
    resentAt: Date,
    revokedAt: Date,
    redeemedBy: { type: String, index: true },
    redeemedAt: Date,
  },
  { collection: 'parent_invites', versionKey: false },
);
schema.index({ createdAt: 1 }, { expireAfterSeconds: 396 * 86400 });

export const ParentInvite = model<IParentInvite>('ParentInvite', schema);

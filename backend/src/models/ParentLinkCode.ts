import { Schema, model, Document } from 'mongoose';

// Parent link codes (decision 16 Nov 2026): a school admin issues one for a
// learner; a parent redeems it once to link. Shown once as ENR-XXXX-XXXX;
// only the SHA-256 hash is stored (like AccountToken). 7-day expiry.
export interface IParentLinkCode extends Document {
  id: string;
  codeHash: string;
  // Last 2 characters only, so the admin can tell codes apart in the list.
  hint: string;
  studentId: string;
  institutionId: string;
  createdBy: string;
  status: 'active' | 'redeemed' | 'revoked';
  expiresAt: Date;
  redeemedAt?: Date;
  redeemedBy?: string;
  revokedAt?: Date;
  revokedBy?: string;
  createdAt: Date;
  // Parents P2: issued on a class code sheet (one batch per print). A reprint
  // revokes the class's unused codes from earlier prints (owner decision 4).
  classId?: string;
  batchId?: string;
}

const codeSchema = new Schema<IParentLinkCode>(
  {
    id: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true, unique: true, select: false },
    hint: { type: String, required: true },
    studentId: { type: String, required: true, index: true },
    institutionId: { type: String, required: true, index: true },
    createdBy: { type: String, required: true },
    status: { type: String, enum: ['active', 'redeemed', 'revoked'], default: 'active' },
    expiresAt: { type: Date, required: true },
    redeemedAt: Date,
    redeemedBy: String,
    revokedAt: Date,
    revokedBy: String,
    createdAt: { type: Date, default: () => new Date() },
    classId: { type: String, index: true },
    batchId: String,
  },
  { collection: 'parent_link_codes', versionKey: false },
);

export const ParentLinkCode = model<IParentLinkCode>('ParentLinkCode', codeSchema);

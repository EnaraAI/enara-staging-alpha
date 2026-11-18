import { Schema, model, Document } from 'mongoose';

// Parents P2 (PARENT_EMAIL_SIGNIN_ENABLED): 6-digit email codes.
//   purpose verify:  a signed-in parent proves an email they typed ("Add your email")
//   purpose signin:  passwordless sign-in with a verified email
//   purpose merge:   after a verify that found the email on ANOTHER parent account:
//                    a short ticket (its token hash) that allows exactly that merge
// Only hashes are stored (the email as a SHA-256 hash; the code with a salt).
// 10 minutes, at most 5 tries per code; a new request replaces the old code.
// Rows are deleted by the TTL index an hour after they expire.
export const EMAIL_CODE_PURPOSES = ['verify', 'signin', 'merge'] as const;
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];

export interface IParentEmailCode extends Document {
  id: string;
  purpose: EmailCodePurpose;
  emailHash: string;
  /** verify / merge: the signed-in parent account; signin: the account found for the email. */
  userId?: string;
  /** merge: the account that already has the email. */
  targetUserId?: string;
  codeHash: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
}

const schema = new Schema<IParentEmailCode>(
  {
    id: { type: String, required: true, unique: true },
    purpose: { type: String, enum: EMAIL_CODE_PURPOSES, required: true },
    emailHash: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    targetUserId: String,
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { collection: 'parent_email_codes', versionKey: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const ParentEmailCode = model<IParentEmailCode>('ParentEmailCode', schema);

// The Docker E2E stack only (LMS_EMAIL_CAPTURE: emails are recorded, never
// sent): the last code captured for an email hash, so the suite can type it.
// Read only through the token-protected maintenance route on the test cluster.
// Never written unless capture is on (never on lms-test). 15 minutes.
export interface IParentCapturedCode extends Document {
  emailHash: string;
  purpose: EmailCodePurpose;
  code: string;
  at: Date;
}
const captured = new Schema<IParentCapturedCode>(
  {
    emailHash: { type: String, required: true },
    purpose: { type: String, enum: EMAIL_CODE_PURPOSES, required: true },
    code: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { collection: 'parent_captured_codes', versionKey: false },
);
captured.index({ emailHash: 1, purpose: 1 }, { unique: true });
captured.index({ at: 1 }, { expireAfterSeconds: 900 });
export const ParentCapturedCode = model<IParentCapturedCode>('ParentCapturedCode', captured);

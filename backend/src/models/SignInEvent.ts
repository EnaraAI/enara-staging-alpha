import { Schema, model, Document } from 'mongoose';

// Sign-in history (owner decision 2026-11-02): every sign-in attempt, with the
// full client IP and browser. No passwords or tokens. Kept 30 days.
export type SignInResult = 'success' | 'wrong_password' | 'unknown_account' | 'account_disabled' | 'invalid_request';

export interface ISignInEvent extends Document {
  at: Date;
  email?: string;
  userId?: string;
  role?: string;
  institutionId?: string;
  result: SignInResult;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const signInSchema = new Schema<ISignInEvent>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    email: String,
    userId: String,
    role: String,
    institutionId: String,
    result: { type: String, required: true },
    ip: String,
    userAgent: String,
    requestId: String,
  },
  { collection: 'sign_in_events', versionKey: false },
);
export const SIGN_IN_RETENTION_DAYS = 30;
signInSchema.index({ at: 1 }, { expireAfterSeconds: SIGN_IN_RETENTION_DAYS * 86400, name: 'retention_30d' });
signInSchema.index({ institutionId: 1, at: -1 });
signInSchema.index({ email: 1, at: -1 });

export const SignInEvent = model<ISignInEvent>('SignInEvent', signInSchema);

import { Schema, model, Document } from 'mongoose';

// Per-parent preferences for the Parents Portal (one row per parent user).
export interface IParentProfile extends Document {
  userId: string;
  language: 'en' | 'ar';
  alertChannels: ('push' | 'whatsapp' | 'email')[];
  whatsappNumber?: string;
  // Code redemption abuse guard: 5 wrong codes -> 15-minute lockout.
  failedRedeems?: number;
  redeemLockedUntil?: Date;
  // Parents P1: how the account was made. 'code': code only (no email, no
  // password; signed in through a remembered device session).
  signIn?: 'code' | 'password' | 'google';
  // Parents P2: when this account's email was proven with a 6-digit code (or a
  // passwordless sign-in), and, for an account merged into another one on a
  // verified email, which account it was merged into (the row is disabled).
  emailVerifiedAt?: Date;
  mergedInto?: string;
}

const profileSchema = new Schema<IParentProfile>(
  {
    userId: { type: String, required: true, unique: true },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    alertChannels: { type: [String], enum: ['push', 'whatsapp', 'email'], default: ['push', 'whatsapp'] },
    whatsappNumber: { type: String, select: false },
    failedRedeems: { type: Number, default: 0 },
    redeemLockedUntil: Date,
    signIn: { type: String, enum: ['code', 'password', 'google'] },
    emailVerifiedAt: Date,
    mergedInto: String,
  },
  { collection: 'parent_profiles', versionKey: false, timestamps: true },
);

export const ParentProfile = model<IParentProfile>('ParentProfile', profileSchema);

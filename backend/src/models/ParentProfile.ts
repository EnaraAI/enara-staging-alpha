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
}

const profileSchema = new Schema<IParentProfile>(
  {
    userId: { type: String, required: true, unique: true },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    alertChannels: { type: [String], enum: ['push', 'whatsapp', 'email'], default: ['push', 'whatsapp'] },
    whatsappNumber: { type: String, select: false },
    failedRedeems: { type: Number, default: 0 },
    redeemLockedUntil: Date,
  },
  { collection: 'parent_profiles', versionKey: false, timestamps: true },
);

export const ParentProfile = model<IParentProfile>('ParentProfile', profileSchema);

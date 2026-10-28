import { Schema, model, Document } from 'mongoose';

// Single-use account tokens (4Level1 plan, P1): staff invitations and password
// resets. Only a SHA-256 hash of the token is stored; the token itself is
// shown once (in the email or to the inviter) and never logged.

export interface IInvitation extends Document {
  id: string;
  tokenHash: string;
  institutionId: string;
  email: string;
  role: 'teacher' | 'academic_manager' | 'admin' | 'student';
  permissions: string[];
  invitedBy: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date;
  acceptedAt?: Date;
  acceptedUserId?: string;
  origin: 'live' | 'demo_seed';
  createdAt: Date;
}

const invitationSchema = new Schema<IInvitation>(
  {
    id: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: ['teacher', 'academic_manager', 'admin', 'student'], required: true },
    permissions: { type: [String], default: [] },
    invitedBy: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending' },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
    acceptedUserId: String,
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { collection: 'invitations', timestamps: { createdAt: true, updatedAt: false } },
);
invitationSchema.index({ institutionId: 1, email: 1, status: 1 });

export const Invitation = model<IInvitation>('Invitation', invitationSchema);

export interface IPasswordReset extends Document {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const passwordResetSchema = new Schema<IPasswordReset>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { collection: 'password_resets', timestamps: { createdAt: true, updatedAt: false } },
);
// Removed a day after expiry; until then a used or expired token is still known (and refused).
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const PasswordReset = model<IPasswordReset>('PasswordReset', passwordResetSchema);

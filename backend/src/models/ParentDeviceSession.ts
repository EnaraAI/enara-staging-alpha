import { Schema, model, Document } from 'mongoose';

// Parents P1 (code-first sign-up): "this device remembers me". A parent who
// joined with a school code only (no email, no password) gets a long-lived
// device token, kept in that browser's storage. The token itself is shown once
// and only its SHA-256 hash is stored. It is exchanged for a normal short-lived
// session token (POST /api/parents/device/session). It stops working when:
//   - it expires (DEVICE_SESSION_DAYS after its last use, sliding),
//   - the parent signs out (logout bumps User.tokenVersion; a device session is
//     valid only for the tokenVersion it was made with),
//   - it is revoked (revokedAt).
// Rows are deleted by the TTL index on expiresAt. IDs and dates only.
export interface IParentDeviceSession extends Document {
  id: string;
  userId: string;
  tokenHash: string;
  tokenVersion: number;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

const schema = new Schema<IParentDeviceSession>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    tokenVersion: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, default: () => new Date() },
    lastUsedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { collection: 'parent_device_sessions', versionKey: false },
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ParentDeviceSession = model<IParentDeviceSession>('ParentDeviceSession', schema);

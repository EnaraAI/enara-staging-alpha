import { createHash, randomBytes, randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { ParentDeviceSession } from '../models/ParentDeviceSession';
import { User } from '../models/User';
import { recordAudit } from '../services/auditTrail';

// Parents P1: the remembered device session (see models/ParentDeviceSession.ts).
// The device token is random (32 bytes), shown once to the browser that made
// it, and stored only as a hash. It never appears in a URL or a log.
export const DEVICE_SESSION_DAYS = 180;
export const DEVICE_TOKEN_PREFIX = 'pds_';
const DAY = 86_400_000;
export const INVALID_DEVICE_MESSAGE = 'This device is no longer signed in';

export const hashDeviceToken = (token: string) => createHash('sha256').update(`parent-device:${token}`).digest('hex');

export async function createDeviceSession(user: { _id: unknown; tokenVersion?: number }, now = new Date()): Promise<{ deviceToken: string; expiresAt: Date }> {
  const deviceToken = `${DEVICE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(now.getTime() + DEVICE_SESSION_DAYS * DAY);
  const row = await ParentDeviceSession.create({ id: `pds_${randomUUID()}`, userId: String(user._id), tokenHash: hashDeviceToken(deviceToken), tokenVersion: user.tokenVersion ?? 0, createdAt: now, lastUsedAt: now, expiresAt });
  await recordAudit('parent_device_session_created', { id: String(user._id), role: 'parent' }, { type: 'user', id: String(user._id) }, { deviceSessionId: row.id });
  return { deviceToken, expiresAt };
}

/**
 * Exchanges a device token for the account it belongs to (the caller signs a
 * normal session token). Refused (401) when unknown, expired, revoked, the
 * account is not an active parent, or the parent signed out since (tokenVersion).
 * A successful use slides the expiry forward.
 */
export async function useDeviceSession(input: unknown, now = new Date()) {
  const invalid = () => new AppError(INVALID_DEVICE_MESSAGE, 401, 'PARENT_DEVICE_INVALID');
  if (typeof input !== 'string' || !input.startsWith(DEVICE_TOKEN_PREFIX) || input.length > 100) throw invalid();
  const row = await ParentDeviceSession.findOne({ tokenHash: hashDeviceToken(input) });
  if (!row || row.revokedAt || row.expiresAt <= now) throw invalid();
  const user = await User.findById(row.userId);
  if (!user || user.role !== 'parent' || user.status !== 'active' || (user.tokenVersion ?? 0) !== row.tokenVersion) throw invalid();
  row.lastUsedAt = now;
  row.expiresAt = new Date(now.getTime() + DEVICE_SESSION_DAYS * DAY);
  await row.save();
  return user;
}

/** Sign out on this device: the device token stops working (the caller also ends the session token). */
export async function revokeDeviceSession(userId: string, input: unknown, now = new Date()): Promise<boolean> {
  if (typeof input !== 'string' || !input.startsWith(DEVICE_TOKEN_PREFIX) || input.length > 100) return false;
  const r = await ParentDeviceSession.updateOne({ tokenHash: hashDeviceToken(input), userId, revokedAt: { $exists: false } }, { $set: { revokedAt: now } });
  return r.modifiedCount === 1;
}

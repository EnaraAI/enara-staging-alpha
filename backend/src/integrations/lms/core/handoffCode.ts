import { createHash, randomBytes } from 'crypto';
import { LmsHandoffCode, type ILmsHandoffCode } from '../models';

// "Open in new tab" handoff code (mic / new tab, item 2). Replaces the signed
// 2-minute launch token for the new-tab path; the LTI launch keeps its token
// (launchToken.ts). The code is 32 random bytes (base64url, 43 characters),
// carried only in the URL fragment (#hc=...), stored only as its SHA-256,
// valid for 60 seconds and used exactly once: the exchange sets usedAt
// atomically, so two tabs racing with the same code get one session between
// them. Everything the new tab needs (account, school, LMS link, activity,
// target, issuing session) is in the row, never in the URL.

export const HANDOFF_CODE_TTL_SECONDS = 60;
const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export type HandoffCodeErrorCode = 'handoff_code_invalid' | 'handoff_code_expired' | 'handoff_code_used';

export class HandoffCodeError extends Error {
  constructor(public readonly code: HandoffCodeErrorCode) {
    super(code);
    this.name = 'HandoffCodeError';
  }
}

export const hashHandoffCode = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex');

export type HandoffCodeClaims = Omit<ILmsHandoffCode, 'id' | 'codeHash' | 'expiresAt' | 'usedAt' | 'createdAt'>;

/** Stores the code's hash and returns the code itself (shown once, to the caller only). */
export async function mintHandoffCode(claims: HandoffCodeClaims, now = new Date()): Promise<{ code: string; id: string; expiresAt: Date }> {
  const code = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + HANDOFF_CODE_TTL_SECONDS * 1000);
  const row = await LmsHandoffCode.create({ ...claims, codeHash: hashHandoffCode(code), expiresAt, createdAt: now });
  return { code, id: row.id, expiresAt };
}

/**
 * Marks the code used and returns its row. Atomic: only one caller ever gets
 * the row. A code that is unknown, used or past its 60 seconds is refused.
 */
export async function consumeHandoffCode(code: unknown, now = new Date()): Promise<ILmsHandoffCode> {
  if (typeof code !== 'string' || !CODE_SHAPE.test(code)) throw new HandoffCodeError('handoff_code_invalid');
  const codeHash = hashHandoffCode(code);
  const row = await LmsHandoffCode.findOneAndUpdate(
    { codeHash, usedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  ).lean();
  if (row) return row;
  const seen = await LmsHandoffCode.findOne({ codeHash }).select('usedAt expiresAt').lean();
  if (!seen) throw new HandoffCodeError('handoff_code_invalid');
  throw new HandoffCodeError(seen.usedAt ? 'handoff_code_used' : 'handoff_code_expired');
}

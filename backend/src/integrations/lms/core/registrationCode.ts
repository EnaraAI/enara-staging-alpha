import { randomBytes, randomUUID } from 'crypto';
import { LmsRegistrationCode, type ILmsRegistrationCode } from '../models';
import { sha256Hex } from './crypto';

// The one-URL "Connect Moodle" link (Phase 1b, owner decisions R1 and R2).
// 32 random bytes (base64url) shown once in the URL; only the SHA-256 is kept.
// Valid 7 days, used once. A registration attempt reserves the code (atomic),
// then finalizes it on success or releases it on failure (see the model).

export const REGISTRATION_CODE_TTL_MS = 7 * 24 * 3600_000;
/** Longer than one attempt can take (openid fetch 5 s + registration POST 10 s + database). */
export const REGISTRATION_RESERVATION_MS = 2 * 60_000;
const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function registrationUrl(toolBase: string, code: string): string {
  return `${toolBase}/lti/register/${code}`;
}

export async function createRegistrationCode(input: {
  institutionId: string;
  createdBy: string;
  createdByRole: ILmsRegistrationCode['createdByRole'];
  /** Step 2: the onboarding the link belongs to. */
  onboardingId?: string;
  /** Step 2: the ENARA admin whose onboarding pre-approves a school admin's link (connection active). */
  preApprovedBy?: string;
}): Promise<{ code: string; row: ILmsRegistrationCode }> {
  const code = randomBytes(32).toString('base64url');
  const created = await LmsRegistrationCode.create({
    institutionId: input.institutionId,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
    ...(input.onboardingId ? { onboardingId: input.onboardingId } : {}),
    ...(input.preApprovedBy ? { preApprovedBy: input.preApprovedBy } : {}),
    codeHash: sha256Hex(code),
    expiresAt: new Date(Date.now() + REGISTRATION_CODE_TTL_MS),
  });
  return { code, row: created.toObject() };
}

export type RegistrationCodeState = 'unused' | 'used' | 'revoked' | 'expired';

export function codeState(row: Pick<ILmsRegistrationCode, 'status' | 'expiresAt'>, now = Date.now()): RegistrationCodeState {
  if (row.status !== 'unused') return row.status;
  return row.expiresAt.getTime() <= now ? 'expired' : 'unused';
}

/** The admin list: never the code or its hash. */
export function registrationCodeView(row: ILmsRegistrationCode) {
  return {
    id: row.id,
    institutionId: row.institutionId,
    createdBy: row.createdBy,
    createdByRole: row.createdByRole,
    status: codeState(row),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt ?? null,
    platformId: row.platformId ?? null,
    revokedAt: row.revokedAt ?? null,
    failedAttempts: row.failedAttempts ?? 0,
    lastErrorCode: row.lastErrorCode ?? null,
    lastErrorAt: row.lastErrorAt ?? null,
    firstOpenedAt: row.firstOpenedAt ?? null,
    onboardingId: row.onboardingId ?? null,
  };
}

/** Whether a registration with this link makes an active connection (R1, plus a link pre-approved by an ENARA onboarding). */
export function linkMakesActive(row: Pick<ILmsRegistrationCode, 'createdByRole' | 'preApprovedBy'>, requireApproval: boolean): boolean {
  return row.createdByRole === 'enara-admin' || !!row.preApprovedBy || !requireApproval;
}

/** Step 2 ("link opened"): the first time the LMS opened this link, whatever the outcome. Never throws. */
export async function markRegistrationCodeOpened(id: string): Promise<void> {
  await LmsRegistrationCode.updateOne({ id, firstOpenedAt: { $exists: false } }, { $set: { firstOpenedAt: new Date() } }).catch(() => undefined);
}

export type CodeProblem = 'registration_code_invalid' | 'registration_code_used' | 'registration_code_expired' | 'registration_in_progress';

/** Looks a code up without changing it (for the checks before any network call). */
export async function findRegistrationCode(code: unknown): Promise<{ row?: ILmsRegistrationCode; problem?: CodeProblem }> {
  if (typeof code !== 'string' || !CODE_SHAPE.test(code)) return { problem: 'registration_code_invalid' };
  const row = await LmsRegistrationCode.findOne({ codeHash: sha256Hex(code) }).lean();
  if (!row) return { problem: 'registration_code_invalid' };
  const state = codeState(row);
  if (state === 'revoked') return { row, problem: 'registration_code_invalid' };
  if (state === 'used') return { row, problem: 'registration_code_used' };
  if (state === 'expired') return { row, problem: 'registration_code_expired' };
  if (row.reservedUntil && row.reservedUntil.getTime() > Date.now()) return { row, problem: 'registration_in_progress' };
  return { row };
}

/**
 * Reserves an unused, unexpired code for one registration attempt (atomic:
 * only one attempt at a time). Returns the reservation id, or the reason.
 */
export async function reserveRegistrationCode(id: string): Promise<{ reservationId?: string; problem?: CodeProblem }> {
  const now = new Date();
  const reservationId = randomUUID();
  const row = await LmsRegistrationCode.findOneAndUpdate(
    {
      id,
      status: 'unused',
      expiresAt: { $gt: now },
      $or: [{ reservedUntil: { $exists: false } }, { reservedUntil: null }, { reservedUntil: { $lte: now } }],
    },
    { $set: { reservedUntil: new Date(now.getTime() + REGISTRATION_RESERVATION_MS), reservationId } },
    { new: true },
  ).lean();
  if (row) return { reservationId };
  const current = await LmsRegistrationCode.findOne({ id }).lean();
  if (!current) return { problem: 'registration_code_invalid' };
  const state = codeState(current);
  if (state === 'revoked') return { problem: 'registration_code_invalid' };
  if (state === 'used') return { problem: 'registration_code_used' };
  if (state === 'expired') return { problem: 'registration_code_expired' };
  return { problem: 'registration_in_progress' };
}

/**
 * Success: the code is used up (atomic; only the attempt holding the
 * reservation can do it). Done right after the LMS accepted the registration
 * and BEFORE the connection is stored, so a code revoked meanwhile never makes
 * a connection. False if the reservation was lost (revoked, or over 2 minutes).
 */
export async function finalizeRegistrationCode(id: string, reservationId: string): Promise<boolean> {
  const res = await LmsRegistrationCode.updateOne(
    { id, reservationId, status: 'unused' },
    { $set: { status: 'used', usedAt: new Date() }, $unset: { reservedUntil: 1, reservationId: 1 } },
  );
  return res.modifiedCount === 1;
}

/** The connection a used code made (or found). */
export async function attachPlatformToCode(id: string, platformId: string): Promise<void> {
  await LmsRegistrationCode.updateOne({ id, status: 'used' }, { $set: { platformId } });
}

/** Failure: the code stays usable (the admin can try again from the LMS). */
export async function releaseRegistrationCode(id: string, reservationId: string, errorCode: string): Promise<void> {
  await LmsRegistrationCode.updateOne(
    { id, reservationId, status: 'unused' },
    { $unset: { reservedUntil: 1, reservationId: 1 }, $inc: { failedAttempts: 1 }, $set: { lastErrorCode: errorCode.slice(0, 80), lastErrorAt: new Date() } },
  );
}

/** Revoke: only an unused code; false when it was already used, revoked or is unknown. */
export async function revokeRegistrationCode(filter: { id: string; institutionId?: string }, actor: string): Promise<ILmsRegistrationCode | null> {
  return LmsRegistrationCode.findOneAndUpdate(
    { ...filter, status: 'unused' },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedBy: actor }, $unset: { reservedUntil: 1, reservationId: 1 } },
    { new: true },
  ).lean();
}

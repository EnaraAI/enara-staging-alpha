import { createHash, hkdfSync, randomBytes } from 'crypto';
import { getConfig } from '../../../config/env';
import { LmsLaunchToken, type ILmsLaunchToken } from '../models';
import { loadJose } from './jose';

// The signed one-time launch token (Phase 1a). A validated LMS launch, or an
// "Open in new tab" from a signed-in LMS session, gets one of these instead of
// a cookie. It travels in the URL fragment (never sent to a server, never in a
// Referer), lives 2 minutes, and is exchanged exactly once for a normal ENARA
// session (POST /api/lms/launch/exchange). Signed HS256 with a key derived from
// LMS_KEK; single use is enforced server-side (lms_launch_tokens.usedAt).
const AUDIENCE = 'enara-lms-landing';
const TTL_SECONDS = 120;

export class LaunchTokenError extends Error {
  constructor(public readonly code: 'launch_token_invalid' | 'launch_token_expired' | 'launch_token_used') {
    super(code);
    this.name = 'LaunchTokenError';
  }
}

function signingKey(): Uint8Array {
  const { kek } = getConfig().lms;
  if (!kek) throw new Error('LMS_KEK is not set');
  return new Uint8Array(hkdfSync('sha256', kek, Buffer.alloc(0), 'enara-lms-launch-token-v1', 32));
}

function issuer(): string {
  return getConfig().lms.toolBaseUrl ?? 'enara';
}

const hashJti = (jti: string) => createHash('sha256').update(jti, 'utf8').digest('hex');

export type LaunchTokenClaims = Omit<ILmsLaunchToken, 'jtiHash' | 'expiresAt' | 'usedAt' | 'createdAt'>;

export async function issueLaunchToken(claims: LaunchTokenClaims): Promise<string> {
  const { SignJWT } = await loadJose();
  const jti = randomBytes(24).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  await LmsLaunchToken.create({ ...claims, jtiHash: hashJti(jti), expiresAt: new Date((now + TTL_SECONDS) * 1000) });
  return new SignJWT({ purpose: claims.purpose })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setJti(jti)
    .setSubject(claims.enaraUserId)
    .setIssuer(issuer())
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(signingKey());
}

/** Verifies the signature and expiry, then marks the token used. A second exchange fails. */
export async function consumeLaunchToken(token: unknown): Promise<ILmsLaunchToken> {
  if (typeof token !== 'string' || token.length > 2048 || !token) throw new LaunchTokenError('launch_token_invalid');
  const { jwtVerify } = await loadJose();
  let jti: string;
  let sub: string;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], audience: AUDIENCE, issuer: issuer() });
    if (typeof payload.jti !== 'string' || typeof payload.sub !== 'string') throw new LaunchTokenError('launch_token_invalid');
    jti = payload.jti;
    sub = payload.sub;
  } catch (error) {
    if (error instanceof LaunchTokenError) throw error;
    throw new LaunchTokenError((error as { code?: string }).code === 'ERR_JWT_EXPIRED' ? 'launch_token_expired' : 'launch_token_invalid');
  }
  const now = new Date();
  const row = await LmsLaunchToken.findOneAndUpdate(
    { jtiHash: hashJti(jti), usedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  ).lean();
  if (!row) throw new LaunchTokenError('launch_token_used');
  if (row.enaraUserId !== sub) throw new LaunchTokenError('launch_token_invalid');
  return row;
}

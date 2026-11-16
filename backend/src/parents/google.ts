import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../middleware/errorHandler';
import { User } from '../models/User';
import { ParentProfile } from '../models/ParentProfile';
import { getConfig } from '../config/env';
import { normalizeEmail } from '../utils/validation';
import { recordAudit } from '../services/auditTrail';

// Parents Portal "Continue with Google". The browser (Google Identity
// Services) gets a Google ID token and posts it here; the token is verified
// server-side against GOOGLE_CLIENT_ID. Only parent accounts are ever created
// or signed in this way: an email that belongs to a student, teacher or admin
// is refused (never merged, never escalated).

export const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
export const NOT_PARENT_MESSAGE = 'This email belongs to an ENARA school account. Sign in with your email and password on the Student or Staff tab.';

let client: OAuth2Client | undefined;
let clientFor: string | undefined;
function oauthClient(clientId: string) {
  if (!client || clientFor !== clientId) {
    client = new OAuth2Client(clientId);
    clientFor = clientId;
  }
  return client;
}

export function googleClientId(): string | undefined {
  return getConfig().googleClientId || undefined;
}

/** Public auth config for the parents sign-in screens. The client ID is public by design. */
export function authConfig(): { google: boolean; clientId?: string } {
  const clientId = googleClientId();
  return clientId ? { google: true, clientId } : { google: false };
}

type GoogleIdentity = { sub: string; email: string; name?: string };

async function verify(credential: unknown): Promise<GoogleIdentity> {
  const clientId = googleClientId();
  if (!clientId) throw new AppError('Google sign-in is not configured', 503, 'google_not_configured');
  if (typeof credential !== 'string' || !credential || credential.length > 8192) {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_TOKEN_INVALID');
  }
  let payload: Record<string, unknown> | undefined;
  try {
    const ticket = await oauthClient(clientId).verifyIdToken({ idToken: credential, audience: clientId });
    payload = ticket.getPayload() as Record<string, unknown> | undefined;
  } catch {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_TOKEN_INVALID');
  }
  // Belt and braces on top of verifyIdToken.
  if (!payload || payload.aud !== clientId || !GOOGLE_ISSUERS.includes(String(payload.iss)) || typeof payload.sub !== 'string' || !payload.sub) {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_TOKEN_INVALID');
  }
  if (payload.email_verified !== true) throw new AppError('Your Google email is not verified', 401, 'GOOGLE_EMAIL_UNVERIFIED');
  let email: string;
  try {
    email = normalizeEmail(payload.email);
  } catch {
    throw new AppError('Google sign-in failed', 401, 'GOOGLE_TOKEN_INVALID');
  }
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 120) : undefined;
  return { sub: payload.sub.slice(0, 255), email, name: name || undefined };
}

function refuseNonParent(): never {
  throw new AppError(NOT_PARENT_MESSAGE, 403, 'GOOGLE_ACCOUNT_NOT_PARENT');
}

/**
 * Sign in or sign up a parent with a Google ID token.
 * Match order: googleSub, then email. New email -> a new role 'parent' account.
 */
export async function googleParentSignIn(credential: unknown, opts: { language?: unknown } = {}) {
  const g = await verify(credential);

  let user = await User.findOne({ googleSub: g.sub });
  if (!user) user = await User.findOne({ email: g.email });

  if (user) {
    if (user.role !== 'parent') refuseNonParent();
    if (user.status !== 'active') throw new AppError('Invalid credentials', 401);
    if (user.googleSub && user.googleSub !== g.sub) {
      throw new AppError('This parent account is linked to a different Google account', 403, 'GOOGLE_ACCOUNT_MISMATCH');
    }
    if (!user.googleSub) {
      user.googleSub = g.sub;
      await user.save();
    }
    await recordAudit('parent_google_signin', { id: String(user._id), role: 'parent' }, { type: 'user', id: String(user._id) }, { method: 'google' });
    return { user, created: false };
  }

  // New parent. The password is random and never shown: the parent can set one
  // later with "Forgot password".
  const password = await bcrypt.hash(randomBytes(32).toString('hex'), getConfig().bcryptRounds);
  const created = await User.create({ email: g.email, password, role: 'parent', name: g.name || g.email.split('@')[0], googleSub: g.sub });
  await ParentProfile.create({ userId: String(created._id), language: opts.language === 'ar' ? 'ar' : 'en' });
  await recordAudit('parent_registered', { id: String(created._id), role: 'parent' }, { type: 'user', id: String(created._id) }, { method: 'google' });
  return { user: created, created: true };
}

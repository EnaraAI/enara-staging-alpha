import type { Request } from 'express';
import mongoose from 'mongoose';
import { SignInEvent, type SignInResult } from '../models/SignInEvent';
import { getCallContext } from '../utils/callContext';
import { logger, serializeError } from '../utils/logging';

// The visitor's IP. On Vercel the edge sets x-vercel-forwarded-for /
// x-forwarded-for itself (clients cannot spoof the first hop there); elsewhere
// Express's req.ip, which follows the TRUST_PROXY setting.
export function clientIp(req: Request): string | undefined {
  if (process.env.VERCEL) {
    const raw = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '');
    const first = raw.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return req.ip ? req.ip.replace(/^::ffff:/, '').slice(0, 64) : undefined;
}

// Never blocks or fails a sign-in: a write problem is only logged.
export async function recordSignIn(
  req: Request,
  result: SignInResult,
  who: { email?: string; userId?: string; role?: string; institutionId?: string } = {},
): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await SignInEvent.create({
      at: new Date(),
      email: who.email?.slice(0, 254),
      userId: who.userId,
      role: who.role,
      institutionId: who.institutionId,
      result,
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || undefined,
      requestId: getCallContext()?.requestId,
    });
  } catch (error) {
    logger.warn('sign_in_record_failed', { result, error: serializeError(error) });
  }
}

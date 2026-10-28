import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import type { AuthRequest } from './auth.middleware';
import { MongoRateLimitStore } from '../services/mongoRateLimitStore';

// Tutor limits per signed-in user and per school (P0d), applied after
// authentication so the key is the verified identity, not a token or an IP
// address a whole class shares. The IP limit in app.ts stays as an abuse cap.
// If the counter store fails the request is allowed and the failure logged
// (MongoRateLimitStore): these limits are best-effort.
export const TUTOR_PER_USER_PER_MINUTE = 60;
export const TUTOR_PER_INSTITUTION_PER_MINUTE = 1200;

const message = (text: string) => ({ error: { code: 'RATE_LIMITED', message: text }, message: text });
const user = (req: Request) => (req as AuthRequest).user!;

export function tutorUserLimiter(max = TUTOR_PER_USER_PER_MINUTE) {
  return rateLimit({
    windowMs: 60 * 1000,
    max,
    store: new MongoRateLimitStore('tutor-user'),
    passOnStoreError: true,
    // School and user together: ids never collide across schools.
    keyGenerator: (req) => `inst:${user(req).institutionId ?? 'none'}:user:${user(req).id}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: message('Too many AI requests'),
  });
}

export function tutorInstitutionLimiter(max = TUTOR_PER_INSTITUTION_PER_MINUTE) {
  return rateLimit({
    windowMs: 60 * 1000,
    max,
    store: new MongoRateLimitStore('tutor-inst'),
    passOnStoreError: true,
    keyGenerator: (req) => `inst:${user(req).institutionId ?? `user:${user(req).id}`}`,
    standardHeaders: true,
    legacyHeaders: false,
    message: message('Too many AI requests from this school right now'),
  });
}

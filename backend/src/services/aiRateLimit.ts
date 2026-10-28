import { logger, serializeError } from '../utils/logging';
import { GRADING_FEATURES } from './aiBudget';
import { AppError } from '../middleware/errorHandler';
import { MongoRateLimitStore } from './mongoRateLimitStore';

// Per-school limit on AI provider attempts through the gateway (P0d), shared
// by all instances via the rate_limits collection. Grading is exempt (it must
// never be refused). If the counter store fails the attempt is allowed and an
// error is logged: this limiter is best-effort, not a strict cap.
export const AI_ATTEMPTS_PER_INSTITUTION_PER_MINUTE = 600;
const store = new MongoRateLimitStore('ai-gateway-inst');
store.init({ windowMs: 60_000 } as never);

export async function checkInstitutionAiRate(institutionId: string | undefined, feature: string): Promise<void> {
  if (!institutionId || GRADING_FEATURES.has(feature)) return;
  let hits: number;
  try {
    hits = (await store.increment(institutionId)).totalHits;
  } catch (error) {
    logger.error('ai_rate_limit_store_failed', { institutionId, policy: 'allow', error: serializeError(error) });
    return;
  }
  if (hits > AI_ATTEMPTS_PER_INSTITUTION_PER_MINUTE) {
    logger.warn('ai_rate_limited', { institutionId, feature });
    throw new AppError('Too many AI requests for this school right now. Please try again shortly.', 429, 'RATE_LIMITED');
  }
}

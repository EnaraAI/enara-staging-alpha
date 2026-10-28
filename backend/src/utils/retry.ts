import { logger, serializeError } from './logging';

// Retries a fallible async operation with exponential backoff. Written for
// startup-time connection attempts (Postgres/Mongo) that can transiently
// fail with ECONNRESET/ETIMEDOUT during a fresh container's first second or
// two of networking on platforms like Render, rather than for request-time
// retries (which need different semantics: idempotency, caller-visible
// timeouts, etc.).
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 8_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      logger.warn(`${label}_retry`, {
        attempt,
        attempts,
        delayMs,
        error: serializeError(err),
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

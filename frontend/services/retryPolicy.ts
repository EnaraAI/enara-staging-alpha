// P20: when the server answers 503 with Retry-After (database briefly
// unreachable, e.g. a whole class starting at once), read-only requests wait and
// try again, with jitter so a class does not retry in lock-step. Requests that
// change data (POST, PUT, PATCH, DELETE) are never re-sent.
export const MAX_RETRIES = 2;
const MAX_WAIT_MS = 10_000;
const JITTER_MS = 2_000;

export function retryDelayMs(method: string, status: number, retryAfter: string | null, attempt: number, random: () => number = Math.random): number | null {
  if (method.toUpperCase() !== 'GET' || status !== 503 || attempt >= MAX_RETRIES) return null;
  const seconds = Number(retryAfter);
  if (!retryAfter || !Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(MAX_WAIT_MS, seconds * 1000 + Math.floor(random() * JITTER_MS));
}

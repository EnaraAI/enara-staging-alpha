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

// Live-call transcription (ElevenLabs realtime): sessions are time-limited, so
// a closed one is reopened while the call lasts. Each reopen fetches a new token
// (a paid, budget-reserved call), so a session that keeps closing right after it
// opens (quota used up, network refusing it) must not loop: the wait doubles
// with each quick close, and after MAX_QUICK_CLOSES in a row it stops.
// Quota and authentication errors stop it at once (no reconnect at all).
export const QUICK_CLOSE_MS = 10_000;
export const MAX_QUICK_CLOSES = 3;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 8_000;

export function transcriptionReconnectDelayMs(quickCloses: number, fatal: boolean): number | null {
  if (fatal || quickCloses >= MAX_QUICK_CLOSES) return null;
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** quickCloses);
}

// modelFallback (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN item A, from ARCHITECTURE.md §21 "LLM rate-limit & resilience"): on 21 Nov one
// rejected Anthropic key (HTTP 401) stopped every tutor reply on lms-test and /ready still said "configured". With the named-only switch:
// - the gateway's retry waits with exponential backoff + jitter instead of a fixed 500 ms;
// - a tutor or grading call that fails with an auth error (401/403), a rate limit (429) or a server error (5xx/529) after its retries is
//   sent once more with ANTHROPIC_API_KEY_FALLBACK (if set) and/or ANTHROPIC_FALLBACK_MODEL (if set); every attempt is metered as before;
// - keyStatus() checks the keys for real with a free models.list call (cached 10 min), shown on /ready and in the deploy summary.
// Keys are never logged or returned; only 'accepted' / 'rejected' / 'error' / 'not_configured'.
import Anthropic from '@anthropic-ai/sdk';
import { engineV2 } from './engineV2';

export const modelFallbackOn = (): boolean => engineV2('modelFallback');
export const fallbackKey = (): string | undefined => process.env.ANTHROPIC_API_KEY_FALLBACK?.trim() || undefined;
export const fallbackModel = (): string | undefined => process.env.ANTHROPIC_FALLBACK_MODEL?.trim() || undefined;

const statusOf = (e: unknown): number | undefined => {
  const x = e as { status?: unknown; statusCode?: unknown };
  return typeof x?.status === 'number' ? x.status : typeof x?.statusCode === 'number' ? x.statusCode : undefined;
};
/** Errors a second key or model can fix: auth (401/403), rate limit (429), overload and server errors (5xx incl. 529), connection or timeout. */
export function shouldFallBack(error: unknown): boolean {
  const s = statusOf(error);
  if (s !== undefined) return s === 401 || s === 403 || s === 429 || s >= 500;
  return /Connection|Timeout/.test((error as { name?: string })?.name || '');
}
/** Something to fall back to exists (a second key, a second model, or both). */
export const hasFallback = (): boolean => Boolean(fallbackKey() || fallbackModel());

/** Backoff for the gateway's retry i (0-based): base * 2^i plus up to base of jitter. Switch off: the fixed base wait, as before. */
export function retryWaitMs(base: number, i: number, rand: () => number = Math.random): number {
  if (!modelFallbackOn()) return base;
  return Math.min(base * 2 ** i + Math.floor(rand() * base), 8_000);
}

/** Runs the primary call; on a fallback-worthy error, with the switch on and a fallback configured, runs the fallback once. */
export async function withFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>, onFallback?: (status: number | undefined) => void): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!modelFallbackOn() || !hasFallback() || !shouldFallBack(error)) throw error;
    onFallback?.(statusOf(error));
    return fallback();
  }
}

const clients = new Map<string, Anthropic>();
/** One cached client per (key, timeout). The key is a map key only; never logged. */
export function clientFor(apiKey: string, timeout: number): Anthropic {
  const k = `${timeout}:${apiKey}`;
  let c = clients.get(k);
  if (!c) { c = new Anthropic({ apiKey, timeout, maxRetries: 0 }); clients.set(k, c); }
  return c;
}

export type KeyStatus = 'accepted' | 'rejected' | 'error' | 'not_configured';
const cache = new Map<string, { at: number; v: KeyStatus }>();
export const KEY_CHECK_MS = 10 * 60_000;
/** A real, free check of a key (GET /v1/models, limit 1). 401/403 -> rejected; other failures -> error. Cached 10 minutes. */
export async function keyStatus(apiKey: string | undefined, list: (key: string) => Promise<unknown> = (key) => clientFor(key, 8_000).models.list({ limit: 1 })): Promise<KeyStatus> {
  if (!apiKey) return 'not_configured';
  const hit = cache.get(apiKey);
  if (hit && Date.now() - hit.at < KEY_CHECK_MS) return hit.v;
  let v: KeyStatus;
  try { await list(apiKey); v = 'accepted'; } catch (e) { const s = statusOf(e); v = s === 401 || s === 403 ? 'rejected' : 'error'; }
  cache.set(apiKey, { at: Date.now(), v });
  return v;
}
export const clearKeyStatusCache = () => cache.clear();

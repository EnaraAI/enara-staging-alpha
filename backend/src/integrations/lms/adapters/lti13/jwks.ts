import { getConfig } from '../../../../config/env';
import { loadJose } from '../../core/jose';

// Platform public keys, fetched from the platform's JWKS URL through jose's
// remote key set (which caches, and refetches when a token names an unknown
// kid, at most once per cooldown). One cached set per URL per instance.
type RemoteSet = ReturnType<Awaited<ReturnType<typeof loadJose>>['createRemoteJWKSet']>;
const sets = new Map<string, RemoteSet>();
let cooldownMs = 30_000;

export async function platformKeySet(keysetUrl: string): Promise<RemoteSet> {
  const hit = sets.get(keysetUrl);
  if (hit) return hit;
  const { createRemoteJWKSet } = await loadJose();
  const set = createRemoteJWKSet(new URL(keysetUrl), { cooldownDuration: cooldownMs, cacheMaxAge: 10 * 60_000, timeoutDuration: 5_000 });
  sets.set(keysetUrl, set);
  return set;
}

/** A platform's keyset URL must be https (plain http only to this machine, outside production). */
export function isAcceptableKeysetUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.username || u.password) return false;
    if (u.protocol === 'https:') return true;
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return u.protocol === 'http:' && loopback && !getConfig().isProduction;
  } catch {
    return false;
  }
}

/** Tests only. */
export function resetPlatformKeySetsForTests(opts: { cooldownMs?: number } = {}): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  sets.clear();
  if (opts.cooldownMs !== undefined) cooldownMs = opts.cooldownMs;
}

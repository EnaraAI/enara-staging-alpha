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

// ------------------------------------------------ pasted public key (step 2)
//
// For a Moodle the internet cannot reach (on-premise), ENARA cannot fetch its
// keyset URL. Launches still work (they go through the user's browser), as
// long as ENARA knows the platform's public key: an admin pastes it (PEM
// "-----BEGIN PUBLIC KEY-----", one JWK, or a JWKS {"keys":[...]}). It is
// stored as a JWKS JSON string of RSA public keys only (no private part).

export type PublicKeyParse = { ok: true; jwks: string; keyCount: number } | { ok: false; reason: 'empty' | 'too_long' | 'not_a_key' | 'private_key' | 'not_rsa' };

const PUBLIC_JWK_FIELDS = ['kty', 'n', 'e', 'kid', 'alg', 'use'] as const;

export async function parsePlatformPublicKey(input: unknown): Promise<PublicKeyParse> {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, reason: 'empty' };
  const raw = input.trim();
  if (raw.length > 16_000) return { ok: false, reason: 'too_long' };
  const { importSPKI, exportJWK, importJWK } = await loadJose();
  let candidates: Record<string, unknown>[] = [];
  if (/-----BEGIN (RSA )?PRIVATE KEY-----/.test(raw)) return { ok: false, reason: 'private_key' };
  if (raw.startsWith('-----BEGIN PUBLIC KEY-----')) {
    try {
      const key = await importSPKI(raw, 'RS256', { extractable: true });
      candidates = [(await exportJWK(key)) as Record<string, unknown>];
    } catch {
      return { ok: false, reason: 'not_a_key' };
    }
  } else {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'not_a_key' };
    }
    const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : undefined;
    if (!o) return { ok: false, reason: 'not_a_key' };
    candidates = Array.isArray(o.keys) ? (o.keys as unknown[]).filter((k): k is Record<string, unknown> => !!k && typeof k === 'object').slice(0, 10) : [o];
  }
  if (!candidates.length) return { ok: false, reason: 'not_a_key' };
  if (candidates.some((k) => 'd' in k || 'p' in k || 'q' in k)) return { ok: false, reason: 'private_key' };
  if (candidates.some((k) => k.kty !== 'RSA')) return { ok: false, reason: 'not_rsa' };
  const keys: Record<string, unknown>[] = [];
  for (const k of candidates) {
    const clean = Object.fromEntries(PUBLIC_JWK_FIELDS.filter((f) => typeof k[f] === 'string').map((f) => [f, k[f]]));
    try {
      await importJWK({ ...clean, alg: 'RS256' } as never, 'RS256');
    } catch {
      return { ok: false, reason: 'not_a_key' };
    }
    keys.push(clean);
  }
  return { ok: true, jwks: JSON.stringify({ keys }), keyCount: keys.length };
}

type KeyInput = Parameters<Awaited<ReturnType<typeof loadJose>>['jwtVerify']>[1];

/**
 * The key set a launch's id_token is verified with: the pasted key when there
 * is one, else the keyset URL. A pasted key is matched by the token's kid; a
 * key pasted without a kid (a PEM has none) is used when it is the only one
 * without a kid. RS256 only.
 */
export async function platformVerificationKey(platform: { keysetUrl?: string; publicJwks?: string }): Promise<KeyInput> {
  if (platform.publicJwks) {
    const { importJWK, errors } = await loadJose();
    const keys = (JSON.parse(platform.publicJwks) as { keys: Record<string, unknown>[] }).keys ?? [];
    const resolver = async (header: { kid?: string }) => {
      const byKid = header.kid ? keys.find((k) => k.kid === header.kid) : undefined;
      const keyless = keys.filter((k) => !k.kid);
      const pick = byKid ?? (keyless.length === 1 ? keyless[0] : !header.kid && keys.length === 1 ? keys[0] : undefined);
      if (!pick) throw new errors.JWKSNoMatchingKey();
      return importJWK({ ...pick, alg: 'RS256' } as never, 'RS256');
    };
    return resolver as unknown as KeyInput;
  }
  return (await platformKeySet(platform.keysetUrl!)) as unknown as KeyInput;
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

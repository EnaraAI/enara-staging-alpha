import { calculateJwkThumbprint, exportJWK, exportPKCS8, generateKeyPair, importPKCS8, type JWK } from 'jose';
import { LmsToolKey } from '../models';
import { decryptSecret, encryptSecret } from './crypto';

// ENARA's LTI signing keys (Spec §8): RSA-2048, RS256, private key encrypted
// with LMS_KEK. States: active (signs), next (published ahead of a switch),
// retired (no longer published). All key work goes through `jose`.
const ALG = 'RS256';
const aadFor = (kid: string) => `lms_tool_keys:${kid}`;

async function newKeyRow(status: 'active' | 'next') {
  const { publicKey, privateKey } = await generateKeyPair(ALG, { modulusLength: 2048, extractable: true });
  const jwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(jwk, 'sha256');
  const publicJwk: JWK = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: ALG, use: 'sig' };
  const pem = await exportPKCS8(privateKey);
  return {
    kid,
    alg: ALG,
    status,
    publicJwk,
    privateKeyEnc: encryptSecret(pem, aadFor(kid)),
    createdAt: new Date(),
    ...(status === 'active' ? { activatedAt: new Date() } : {}),
  };
}

function isDuplicate(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

/**
 * Makes sure one active key exists and returns its kid. Safe when several
 * instances call it at once: the partial unique index on status 'active'
 * lets exactly one insert win; the others read the winner.
 */
export async function ensureActiveKey(): Promise<string> {
  const existing = await LmsToolKey.findOne({ status: 'active' }, { kid: 1 }).lean();
  if (existing) return existing.kid;
  try {
    const row = await newKeyRow('active');
    await LmsToolKey.create(row);
    return row.kid;
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const winner = await LmsToolKey.findOne({ status: 'active' }, { kid: 1 }).lean();
    if (!winner) throw error;
    return winner.kid;
  }
}

/** Public JWKS: active and next keys only. Never includes private parts. */
export async function getPublicJwks(): Promise<{ keys: JWK[] }> {
  const rows = await LmsToolKey.find({ status: { $in: ['active', 'next'] } }, { publicJwk: 1, status: 1 }).sort({ status: 1 }).lean();
  return {
    keys: rows.map((r) => {
      const j = r.publicJwk as JWK;
      return { kty: j.kty, n: j.n, e: j.e, kid: j.kid, alg: j.alg, use: j.use };
    }),
  };
}

/** The active private key, for signing (Phase 1 onwards). */
export type LmsSigningKey = Awaited<ReturnType<typeof importPKCS8>>;

export async function getSigningKey(): Promise<{ kid: string; key: LmsSigningKey }> {
  await ensureActiveKey();
  const row = await LmsToolKey.findOne({ status: 'active' }).select('+privateKeyEnc').lean();
  if (!row) throw new Error('No active LMS signing key');
  const pem = decryptSecret(row.privateKeyEnc, aadFor(row.kid));
  return { kid: row.kid, key: await importPKCS8(pem, ALG) };
}

/** Rotation step 1: publish a `next` key (platforms cache JWKS; wait before step 2). */
export async function createNextKey(): Promise<string> {
  const existing = await LmsToolKey.findOne({ status: 'next' }, { kid: 1 }).lean();
  if (existing) return existing.kid;
  const row = await newKeyRow('next');
  await LmsToolKey.create(row);
  return row.kid;
}

/** Rotation step 2: next -> active, active -> retired. */
export async function promoteNextKey(): Promise<string> {
  const next = await LmsToolKey.findOne({ status: 'next' }, { kid: 1 }).lean();
  if (!next) throw new Error('No next key to promote; create one first');
  const now = new Date();
  await LmsToolKey.updateMany({ status: 'active' }, { $set: { status: 'retired', retiredAt: now } });
  // A brief gap with no active key is possible; ensureActiveKey() could fill it
  // first, and then this update fails loudly instead of leaving two active keys.
  const res = await LmsToolKey.updateOne({ kid: next.kid, status: 'next' }, { $set: { status: 'active', activatedAt: now } });
  if (res.modifiedCount !== 1) throw new Error('Key promotion did not complete; check lms_tool_keys');
  return next.kid;
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getConfig } from '../../../config/env';

// Encryption at rest for LMS secrets (tool private keys, service tokens,
// Google refresh tokens): AES-256-GCM under LMS_KEK (Node crypto, no custom
// primitives). Format: "lk1.<kekId>.<iv>.<tag>.<ciphertext>" (base64url).
// kekId names which key encrypted it, so LMS_KEK can be rotated with
// LMS_KEK_PREVIOUS. `aad` binds a ciphertext to its record (e.g.
// "lms_tool_keys:<kid>"), so a value copied into another record fails.
const VERSION = 'lk1';

export class LmsCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LmsCryptoError';
  }
}

export function kekId(kek: Buffer): string {
  return createHash('sha256').update(kek).digest('hex').slice(0, 8);
}

function keys(): { current: Buffer; previous?: Buffer } {
  const { kek, kekPrevious, problem } = getConfig().lms;
  if (!kek) throw new LmsCryptoError(problem ? 'LMS key is misconfigured' : 'LMS_KEK is not set');
  return { current: kek, previous: kekPrevious };
}

export function encryptSecret(plaintext: string, aad: string): string {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', current, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, kekId(current), iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(token: string, aad: string): string {
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) throw new LmsCryptoError('Unrecognised ciphertext');
  const [, id, ivB64, tagB64, ctB64] = parts;
  const { current, previous } = keys();
  const key = [current, previous].find((k) => k && kekId(k) === id);
  if (!key) throw new LmsCryptoError('Ciphertext was encrypted with an unknown key');
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new LmsCryptoError('Unrecognised ciphertext');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new LmsCryptoError('Decryption failed');
  }
}

/** True when a ciphertext was made with an older key and should be re-encrypted. */
export function needsReencrypt(token: string): boolean {
  const { current } = keys();
  return token.split('.')[1] !== kekId(current);
}

/** SHA-256 hex, for single-use values stored only as hashes (state, nonce). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

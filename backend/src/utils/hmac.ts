import * as crypto from 'crypto';
import { getConfig } from '../config/env';

const SIGNATURE_PREFIX = 'v1=';
const HEX_SHA256 = /^[a-f0-9]{64}$/i;

export interface HmacInput {
  method: string;
  path: string;
  timestamp: string;
  body: string | Buffer;
}

export type HmacVerificationResult =
  | { ok: true; mode: 'canonical' | 'legacy' }
  | { ok: false; reason: string };

function asBuffer(body: string | Buffer): Buffer {
  return Buffer.isBuffer(body) ? body : Buffer.from(body);
}

function digestBody(body: string | Buffer): string {
  return crypto.createHash('sha256').update(asBuffer(body)).digest('hex');
}

function canonicalPayload(input: HmacInput): string {
  return [
    input.timestamp,
    input.method.toUpperCase(),
    input.path.split('?')[0],
    digestBody(input.body),
  ].join('\n');
}

function sign(value: string | Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function timingSafeEqualsHex(a: string, b: string): boolean {
  if (!HEX_SHA256.test(a) || !HEX_SHA256.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function signCanonicalRequest(input: HmacInput): string {
  return `${SIGNATURE_PREFIX}${sign(canonicalPayload(input), getConfig().ingestHmacSecret)}`;
}

export function createSignedHeaders(
  method: string,
  path: string,
  body: string | Buffer,
  timestampSeconds?: number
): Record<string, string> {
  const timestamp = String(timestampSeconds ?? Math.floor(Date.now() / 1000));
  return {
    'X-Enara-Timestamp': timestamp,
    'X-Enara-Signature': signCanonicalRequest({ method, path, timestamp, body }),
    'X-Enara-Content-SHA256': digestBody(body),
  };
}

export function signLegacyPayload(body: string | Buffer): string {
  return sign(asBuffer(body), getConfig().ingestHmacSecret);
}

export function signEmpty(): string {
  return signLegacyPayload(Buffer.alloc(0));
}

export function verifyHmacSignature(params: {
  method: string;
  path: string;
  body: string | Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  nowSeconds?: number;
  allowLegacy?: boolean;
}): HmacVerificationResult {
  const { method, path, body, signature, timestamp } = params;
  if (!signature) return { ok: false, reason: 'missing signature' };

  const config = getConfig();
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const allowLegacy = params.allowLegacy ?? config.ingestAcceptLegacySignatures;

  if (signature.startsWith(SIGNATURE_PREFIX)) {
    if (!timestamp || !/^\d{10}$/.test(timestamp)) {
      return { ok: false, reason: 'missing or malformed timestamp' };
    }
    const timestampSeconds = Number(timestamp);
    if (Math.abs(nowSeconds - timestampSeconds) > config.ingestHmacToleranceSeconds) {
      return { ok: false, reason: 'stale timestamp' };
    }
    const supplied = signature.slice(SIGNATURE_PREFIX.length);
    const expected = sign(
      canonicalPayload({ method, path, timestamp, body }),
      config.ingestHmacSecret
    );
    return timingSafeEqualsHex(supplied, expected)
      ? { ok: true, mode: 'canonical' }
      : { ok: false, reason: 'invalid signature' };
  }

  if (!allowLegacy) {
    return { ok: false, reason: 'legacy signatures are disabled' };
  }

  const expectedLegacy = signLegacyPayload(body);
  return timingSafeEqualsHex(signature, expectedLegacy)
    ? { ok: true, mode: 'legacy' }
    : { ok: false, reason: 'invalid legacy signature' };
}

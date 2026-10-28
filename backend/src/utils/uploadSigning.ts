import { createHmac, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getConfig } from '../config/env';

// Uploaded files are served at /uploads/<name> only with a valid, expiring
// signature. The API adds signatures to every /uploads/ path it returns, so
// only users who could read the curriculum or course get working links.
// Stored data always keeps the plain /uploads/<name> path.

const LINK_TTL_SECONDS = 6 * 60 * 60;
const PLAIN_UPLOAD_PATH = /^\/uploads\/[^?#\s/]+$/;
const SIGNED_UPLOAD_PATH = /^(\/uploads\/[^?#\s/]+)\?exp=\d+&sig=[a-f0-9]+$/;

function signature(name: string, exp: number): string {
  return createHmac('sha256', `${getConfig().jwtSecret}:uploads`).update(`${name}:${exp}`).digest('hex');
}

export function signUploadPath(uploadPath: string, now = Date.now()): string {
  const name = uploadPath.slice('/uploads/'.length);
  // Round the expiry so repeated responses within a window give the same URL (browser caching).
  const exp = Math.ceil(now / 1000 / 3600) * 3600 + LINK_TTL_SECONDS;
  return `${uploadPath}?exp=${exp}&sig=${signature(name, exp)}`;
}

export function isValidUploadSignature(name: string, exp: unknown, sig: unknown, now = Date.now()): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d+$/.test(exp)) return false;
  const expiry = Number(exp);
  if (expiry * 1000 < now) return false;
  const expected = Buffer.from(signature(name, expiry), 'hex');
  const given = Buffer.from(sig, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsignUploadPath(value: string): string {
  const match = SIGNED_UPLOAD_PATH.exec(value);
  return match ? match[1] : value;
}

function mapStrings(value: unknown, fn: (s: string) => string, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn, depth + 1);
    return out;
  }
  return value;
}

export function signUploadPaths<T>(value: T): T {
  return mapStrings(value, (s) => (PLAIN_UPLOAD_PATH.test(s) ? signUploadPath(s) : s)) as T;
}

export function unsignUploadPaths<T>(value: T): T {
  return mapStrings(value, unsignUploadPath) as T;
}

// Signs /uploads/ paths in JSON responses and strips signatures from JSON
// request bodies, so a client that sends a curriculum back doesn't store them.
export function uploadLinkSigning(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') req.body = unsignUploadPaths(req.body);
  const json = res.json.bind(res);
  res.json = (body?: unknown) =>
    json(body === undefined ? body : signUploadPaths(JSON.parse(JSON.stringify(body))));
  next();
}

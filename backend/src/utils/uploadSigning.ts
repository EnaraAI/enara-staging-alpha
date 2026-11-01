import { createHmac, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getConfig } from '../config/env';
import { logger, serializeError } from './logging';

// Uploaded files are served at /uploads/<name> only with a valid, expiring
// signature bound to the file's owning school (P22). The API signs /uploads/
// paths in its JSON responses only when
//   - the caller is signed in,
//   - the file belongs to the caller's school (ENARA admins: any school), and
//   - the original may be downloaded at all (scanned clean, or lesson media).
// Everything else stays a plain, unusable path. Links are bearer credentials:
// they live about 15 minutes and are never logged (see requestContext.logPath).
// Stored data always keeps the plain /uploads/<name> path.

export const LINK_TTL_SECONDS = 15 * 60;
const PLAIN_UPLOAD_PATH = /^\/uploads\/[^?#\s/]+$/;
const SIGNED_UPLOAD_PATH = /^(\/uploads\/[^?#\s/]+)\?exp=\d+&sig=[a-f0-9]+$/;

function signature(name: string, exp: number, owner: string): string {
  return createHmac('sha256', `${getConfig().jwtSecret}:uploads`).update(`${name}:${exp}:${owner}`).digest('hex');
}

// Signs one path for its owning school. Expiry is rounded up to the minute
// (repeated responses within a minute give the same URL) and never exceeds
// LINK_TTL_SECONDS.
export function signUploadPath(uploadPath: string, owner: string, now = Date.now()): string {
  const name = uploadPath.slice('/uploads/'.length);
  const exp = Math.floor(now / 1000 / 60) * 60 + LINK_TTL_SECONDS;
  return `${uploadPath}?exp=${exp}&sig=${signature(name, exp, owner)}`;
}

export function isValidUploadSignature(name: string, exp: unknown, sig: unknown, owner: string | null, now = Date.now()): boolean {
  if (!owner || typeof exp !== 'string' || typeof sig !== 'string' || !/^\d+$/.test(exp)) return false;
  const expiry = Number(exp);
  if (expiry * 1000 < now || expiry * 1000 > now + (LINK_TTL_SECONDS + 60) * 1000) return false;
  const expected = Buffer.from(signature(name, expiry, owner), 'hex');
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

function collectUploadPaths(value: unknown, into: Set<string>, depth = 0): Set<string> {
  mapStrings(value, (s) => { if (PLAIN_UPLOAD_PATH.test(s)) into.add(s); return s; }, depth);
  return into;
}

export function unsignUploadPaths<T>(value: T): T {
  return mapStrings(value, unsignUploadPath) as T;
}

// Signs the paths of one response body for one caller (see header comment).
export async function signUploadPathsFor<T>(value: T, caller: { institutionId?: string; role?: string } | undefined): Promise<T> {
  const paths = [...collectUploadPaths(value, new Set())];
  if (!paths.length || !caller) return value;
  const { resolveUploads, schoolSlug } = await import('../services/uploadAccess');
  const info = await resolveUploads(paths);
  const global = caller.role === 'enara-admin';
  const mine = caller.institutionId ? schoolSlug(caller.institutionId) : null;
  return mapStrings(value, (s) => {
    if (!PLAIN_UPLOAD_PATH.test(s)) return s;
    const i = info.get(s);
    if (!i?.owner || !i.eligibility.downloadable || (!global && i.owner !== mine)) return s;
    return signUploadPath(s, i.owner);
  }) as T;
}

// Strips signatures from JSON request bodies (a client sending a curriculum
// back doesn't store them) and signs eligible /uploads/ paths in responses.
export function uploadLinkSigning(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') req.body = unsignUploadPaths(req.body);
  const json = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (body === undefined) return json(body);
    const plain = JSON.parse(JSON.stringify(body));
    const caller = (req as Request & { user?: { institutionId?: string; role?: string } }).user;
    signUploadPathsFor(plain, caller)
      .then((signed) => json(signed))
      .catch((error) => {
        // Never fail the response for this; paths stay plain (no download).
        logger.error('upload_link_signing_failed', { error: serializeError(error) });
        json(plain);
      });
    return res;
  }) as Response['json'];
  next();
}

import type { RequestHandler, Response } from 'express';

// P20: when MongoDB cannot be reached (Atlas refusing connections during a
// simultaneous class start), answer at once with 503 and Retry-After instead of
// letting every request wait on the database again until the 60 s function
// limit. One failure marks the database unavailable in this instance for a
// short cool-down; the first request after it tries the database again.

export const DB_RETRY_AFTER_SECONDS = 5;
const COOL_DOWN_MS = DB_RETRY_AFTER_SECONDS * 1000;

const UNAVAILABLE_ERRORS = new Set([
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoPoolClearedError',
  'MongoTopologyClosedError',
  'MongoWaitQueueTimeoutError',
]);

let unavailableUntil = 0;

export function isDbUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, message } = err as { name?: string; message?: string };
  if (name && UNAVAILABLE_ERRORS.has(name)) return true;
  // Mongoose buffering an operation while disconnected ("buffering timed out").
  return name === 'MongooseError' && /buffering timed out/i.test(message ?? '');
}

// A full pool (no free connection within the wait limit) means this instance is
// busy, not that the database is down (P20 rerun: these errors made whole
// instances refuse requests for 5 s). That request still gets a 503; others carry on.
export function isDbDownError(err: unknown): boolean {
  return isDbUnavailableError(err) && (err as { name?: string }).name !== 'MongoWaitQueueTimeoutError';
}

export function markDbUnavailable(now = Date.now()): void {
  unavailableUntil = Math.max(unavailableUntil, now + COOL_DOWN_MS);
}

export function dbUnavailable(now = Date.now()): boolean {
  return now < unavailableUntil;
}

export function resetDbAvailabilityForTests(): void {
  unavailableUntil = 0;
}

export function sendDbUnavailable(res: Response, requestId?: string): void {
  const message = 'The service is busy. Please try again in a few seconds.';
  res.setHeader('Retry-After', String(DB_RETRY_AFTER_SECONDS));
  res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message, requestId }, message });
}

// Paths that use the database; static files and /health never do.
const DB_PATHS = /^\/(api|uploads)(\/|$)|^\/ready$/;

export const dbAvailabilityGate: RequestHandler = (req, res, next) => {
  if (!DB_PATHS.test(req.path) || !dbUnavailable()) return next();
  sendDbUnavailable(res, (req as { requestId?: string }).requestId);
};

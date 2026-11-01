import type { RequestHandler, Response } from 'express';
import { sendDbUnavailable } from '../config/dbAvailability';
import { getCallContext } from '../utils/callContext';
import { logger } from '../utils/logging';

// P20: under a simultaneous class start, page loads (GET) waited on busy
// database connections until the 60 s function limit, and a 504 is not retried.
// After deadlineMs a GET answers 503 + Retry-After, which the frontend retries.
// Only reads: cutting off a write could leave it half done and invite a repeat;
// writes (including tutor messages) keep the platform limit, and so does a GET
// that has started an AI call (e.g. the next-steps note).
export function requestDeadline(deadlineMs: number): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET' || !/^\/api(\/|$)/.test(req.path)) return next();
    const shared = getCallContext().request; // shared with later contexts of this request
    const timer = setTimeout(() => {
      if (res.headersSent || shared?.aiStarted) return;
      logger.warn('request_deadline_exceeded', { requestId: req.requestId, path: req.path, deadlineMs });
      sendDbUnavailable(res, req.requestId);
      muteLaterWrites(res);
    }, deadlineMs);
    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
}

// The handler may still finish after the deadline answer: drop what it sends.
function muteLaterWrites(res: Response) {
  const ignore = () => res;
  Object.assign(res, { status: ignore, json: ignore, send: ignore, set: ignore, setHeader: ignore, header: ignore, end: ignore, write: () => true, writeHead: ignore });
}

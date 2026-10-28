import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logging';
import { runWithCallContext } from '../utils/callContext';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming)?.slice(0, 128) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  runWithCallContext({ requestId }, next);
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id,
      institutionId: req.user?.institutionId,
    });
  });

  next();
}

export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  req.rawBody = Buffer.from(buf);
}

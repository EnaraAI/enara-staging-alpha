import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth.middleware';
import { AppError } from './errorHandler';
import { verifyHmacSignature } from '../utils/hmac';

interface IngestionSignatureOptions {
  // The engine's outbound callbacks use the plain scheme from BACKEND_API.md §2.1
  // (hex HMAC-SHA256 of the raw body, no timestamp), so the callback route must accept it.
  allowLegacy?: boolean;
}

export function requireIngestionSignature(options: IngestionSignatureOptions = {}) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    const signature = Array.isArray(req.headers['x-enara-signature'])
      ? req.headers['x-enara-signature'][0]
      : req.headers['x-enara-signature'];
    const timestamp = Array.isArray(req.headers['x-enara-timestamp'])
      ? req.headers['x-enara-timestamp'][0]
      : req.headers['x-enara-timestamp'];
    const body = req.rawBody || Buffer.alloc(0);
    const path = req.originalUrl.split('?')[0];

    const result = verifyHmacSignature({
      method: req.method,
      path,
      body,
      signature,
      timestamp,
      allowLegacy: options.allowLegacy,
    });

    if (!result.ok) {
      next(new AppError('Invalid ingestion signature', 401, 'INVALID_INGESTION_SIGNATURE'));
      return;
    }

    next();
  };
}

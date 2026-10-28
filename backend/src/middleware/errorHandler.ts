import { Request, Response, NextFunction } from 'express';
import { logger, serializeError } from '../utils/logging';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function statusCodeFromError(err: Error): number {
  if (err instanceof AppError) return err.statusCode;
  if (err.name === 'ValidationError') return 400;
  if (err.name === 'CastError') return 400;
  if (err.name === 'MulterError') return 400;
  return 500;
}

function codeFromError(err: Error): string {
  if (err instanceof AppError) return err.code;
  if (err.name === 'ValidationError' || err.name === 'CastError') return 'VALIDATION_ERROR';
  if (err.name === 'MulterError') return 'UPLOAD_ERROR';
  return 'INTERNAL_ERROR';
}

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'File is too large',
  LIMIT_FILE_COUNT: 'Too many files',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
  LIMIT_PART_COUNT: 'Too many form parts',
  LIMIT_FIELD_KEY: 'Field name too long',
  LIMIT_FIELD_VALUE: 'Field value too long',
  LIMIT_FIELD_COUNT: 'Too many fields',
};

function safeMessage(err: Error, statusCode: number): string {
  if (err instanceof AppError) return err.message;
  if (err.name === 'MulterError') return MULTER_MESSAGES[(err as Error & { code?: string }).code || ''] || 'Upload failed';
  if (err.name === 'ValidationError' || err.name === 'CastError') return 'Invalid request';
  return statusCode >= 500 ? 'Internal server error' : err.message;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = statusCodeFromError(err);
  const code = codeFromError(err);
  const message = safeMessage(err, statusCode);

  if (statusCode >= 500) {
    logger.error('request_error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      error: serializeError(err),
    });
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.requestId,
    },
    message,
  });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

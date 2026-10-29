import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { getConfig } from '../config/env';
import { UserRole, isUserRole } from './roles';
import { AppError } from '../middleware/errorHandler';

export interface AccessTokenSubject {
  id: string;
  email: string;
  role: UserRole;
  studentId?: string;
  institutionId?: string;
  tokenVersion?: number;
}

export interface VerifiedAccessToken {
  subject: string;
  tokenType: 'access';
  tokenVersion: number;
}

export function signAccessToken(user: AccessTokenSubject): string {
  const config = getConfig();
  const payload = {
    typ: 'access',
    id: user.id,
    email: user.email,
    role: user.role,
    studentId: user.studentId,
    institutionId: user.institutionId,
    tv: user.tokenVersion ?? 0,
  };
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    subject: user.id,
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  const config = getConfig();
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
  } catch {
    throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }

  if (!decoded || typeof decoded === 'string') {
    throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN');
  }
  if (decoded.typ !== 'access' || typeof decoded.sub !== 'string') {
    throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN');
  }
  if (decoded.role !== undefined && !isUserRole(decoded.role)) {
    throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN');
  }
  // Tokens from before S-1 have no tv claim and count as version 0.
  const tokenVersion = decoded.tv === undefined ? 0 : decoded.tv;
  if (typeof tokenVersion !== 'number' || !Number.isInteger(tokenVersion) || tokenVersion < 0) {
    throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN');
  }
  return { subject: decoded.sub, tokenType: 'access', tokenVersion };
}

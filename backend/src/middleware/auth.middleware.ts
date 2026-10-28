import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { UserRole } from '../auth/roles';
import { verifyAccessToken } from '../auth/jwt';
import { Institution } from '../models/Institution';
import { ApiKey, ApiKeyPermission } from '../models/ApiKey';
import { getCallContext, runWithCallContext } from '../utils/callContext';
import { findApiKey, isApiKeyExpired, looksLikeApiKey } from '../services/apiKeyService';

export interface AuthPayload {
  id: string;
  email: string;
  role: UserRole;
  studentId?: string;
  institutionId?: string;
  // Explicit grants (auth/permissions.ts); role defaults apply on top.
  permissions?: string[];
  // Set when the request was authenticated with a partner API key instead of a session token.
  apiKeyId?: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        requestId: req.requestId,
      },
      message: 'Authentication required',
    });
    return;
  }

  const token = header.slice(7);
  try {
    const verified = verifyAccessToken(token);
    const user = await User.findById(verified.subject);
    if (!user || user.status !== 'active') {
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
          requestId: req.requestId,
        },
        message: 'Invalid or expired token',
      });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      institutionId: user.institutionId,
      permissions: user.permissions,
    };
    // Who this request is for, for AI call records (re-entered so it holds even
    // if an earlier middleware's callback dropped the request's context).
    runWithCallContext(
      { ...getCallContext(), requestId: req.requestId, userId: req.user.id, role: user.role, institutionId: user.institutionId, studentId: user.studentId },
      next,
    );
  } catch (err) {
    next(err);
  }
}

function rejectApiKey(req: AuthRequest, res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: { code, message, requestId: req.requestId },
    message,
  });
}

/**
 * Accepts either a session token or a partner API key. Only routes that opt in with this
 * middleware accept API keys; everywhere else authMiddleware rejects them as invalid tokens.
 * A key acts as the admin it was issued to, limited to that admin's institution.
 */
export function authenticateUserOrApiKey(permission: ApiKeyPermission) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!looksLikeApiKey(token)) {
      await authMiddleware(req, res, next);
      return;
    }

    try {
      const key = await findApiKey(token);
      if (!key || key.status !== 'active' || isApiKeyExpired(key)) {
        rejectApiKey(req, res, 401, 'INVALID_API_KEY', 'Invalid, revoked or expired API key');
        return;
      }
      if (!key.permissions.includes(permission)) {
        rejectApiKey(req, res, 403, 'API_KEY_PERMISSION_DENIED', `API key lacks the ${permission} permission`);
        return;
      }

      const [user, institution] = await Promise.all([
        User.findById(key.adminUserId),
        Institution.findOne({ id: key.institutionId }),
      ]);
      if (
        !user ||
        user.status !== 'active' ||
        user.institutionId !== key.institutionId ||
        institution?.status === 'suspended'
      ) {
        rejectApiKey(req, res, 401, 'INVALID_API_KEY', 'Invalid, revoked or expired API key');
        return;
      }

      req.user = {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        institutionId: key.institutionId,
        permissions: user.permissions,
        apiKeyId: key.id,
      };
      await ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } });
      runWithCallContext(
        { ...getCallContext(), requestId: req.requestId, userId: req.user.id, role: user.role, institutionId: key.institutionId },
        next,
      );
    } catch (err) {
      next(err);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          requestId: req.requestId,
        },
        message: 'Access denied',
      });
      return;
    }
    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || !['admin', 'enara-admin'].includes(req.user.role)) {
    res.status(403).json({
      error: {
        code: 'ADMIN_REQUIRED',
        message: 'Admin access required',
        requestId: req.requestId,
      },
      message: 'Admin access required',
    });
    return;
  }
  next();
}

export function requireStudent(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'student' || !req.user.studentId) {
    res.status(403).json({
      error: {
        code: 'STUDENT_REQUIRED',
        message: 'Student access required',
        requestId: req.requestId,
      },
      message: 'Student access required',
    });
    return;
  }
  next();
}

export function requireTeacher(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'teacher') {
    res.status(403).json({
      error: {
        code: 'TEACHER_REQUIRED',
        message: 'Teacher access required',
        requestId: req.requestId,
      },
      message: 'Teacher access required',
    });
    return;
  }
  next();
}

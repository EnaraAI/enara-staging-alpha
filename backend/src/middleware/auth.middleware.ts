import { Request, Response, NextFunction } from 'express';
import { User, type IUser } from '../models/User';
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
  // LMS student preview (docs/lms/PHASE_1A_NOTES.md): a staff account viewing
  // the student side from the LMS. Read-only: see refusePreviewWrite below.
  preview?: boolean;
}

// LMS student preview sessions are read-only: no attempt, tutor session,
// progress, setting or any other record is written for them. The only writes
// allowed are signing out and "Open in new tab" (which carries the preview on).
const PREVIEW_WRITE_ALLOWED = new Set(['/api/auth/logout', '/api/lms/launch/handoff']);
export const PREVIEW_READ_ONLY_MESSAGE = 'Preview as student — nothing is saved.';

export function previewWriteRefused(method: string, originalUrl: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const path = originalUrl.split('?')[0].replace(/\/+$/, '');
  return !PREVIEW_WRITE_ALLOWED.has(path);
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
    // lms-speed-5: only the fields used here, as a plain object (no full document per request).
    const user = await User.findById(verified.subject)
      .select('_id email role studentId institutionId status permissions tokenVersion')
      .lean<Pick<IUser, 'email' | 'role' | 'studentId' | 'institutionId' | 'status' | 'permissions' | 'tokenVersion'> & { _id: { toString(): string } }>();
    // A logout or password reset since the token was issued revokes it (S-1). A missing status is the schema default, active.
    if (!user || (user.status ?? 'active') !== 'active' || (user.tokenVersion ?? 0) !== verified.tokenVersion) {
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

    // A suspended school's users are stopped on every request, not only at
    // sign-in (P22). ENARA admins are not bound to one school.
    if (user.role !== 'enara-admin' && user.institutionId && (await isInstitutionSuspended(user.institutionId))) {
      res.status(403).json({
        error: { code: 'INSTITUTION_SUSPENDED', message: "Your school's ENARA access is suspended. Contact your school administrator.", requestId: req.requestId },
        message: "Your school's ENARA access is suspended.",
      });
      return;
    }

    // An LMS preview token never grants anything; it only takes write rights away.
    if (verified.preview && previewWriteRefused(req.method, req.originalUrl || req.url)) {
      res.status(403).json({
        error: { code: 'LMS_PREVIEW_READ_ONLY', message: PREVIEW_READ_ONLY_MESSAGE, requestId: req.requestId },
        message: PREVIEW_READ_ONLY_MESSAGE,
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
      ...(verified.preview ? { preview: true } : {}),
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
  // A staff preview has no student record, so there is no student data to show.
  if (req.user?.preview) {
    res.status(403).json({
      error: { code: 'LMS_PREVIEW_NO_STUDENT_DATA', message: 'Preview as student: there is no student work to show in a preview.', requestId: req.requestId },
      message: 'Preview as student: there is no student work to show in a preview.',
    });
    return;
  }
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

// Institution status, cached briefly per server instance (one lookup per
// school per 15 s, not per request). forgetInstitutionStatus clears it after
// a change on this instance; other instances see it within 15 s.
const STATUS_CACHE_MS = 15_000;
const statusCache = new Map<string, { suspended: boolean; at: number }>();
export async function isInstitutionSuspended(institutionId: string): Promise<boolean> {
  const hit = statusCache.get(institutionId);
  if (hit && Date.now() - hit.at < STATUS_CACHE_MS) return hit.suspended;
  const school = await Institution.findOne({ id: institutionId }).select('status').lean();
  const suspended = school?.status === 'suspended';
  statusCache.set(institutionId, { suspended, at: Date.now() });
  return suspended;
}
export function forgetInstitutionStatus(institutionId?: string): void {
  if (institutionId) statusCache.delete(institutionId);
  else statusCache.clear();
}

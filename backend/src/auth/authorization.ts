import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { isEnaraAdmin } from './roles';

export interface InstitutionScopedResource {
  institutionId?: string;
  schoolId?: string;
}

export function currentUser(req: AuthRequest) {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
  }
  return req.user;
}

export function isGlobalAdmin(req: AuthRequest): boolean {
  return !!req.user && isEnaraAdmin(req.user.role);
}

export function requireInstitutionId(req: AuthRequest): string {
  const user = currentUser(req);
  if (!user.institutionId) {
    throw new AppError('Institution scope required', 403, 'INSTITUTION_SCOPE_REQUIRED');
  }
  return user.institutionId;
}

export function scopedFilter<T extends Record<string, unknown>>(
  req: AuthRequest,
  filter: T
): T & { institutionId?: string } {
  if (isGlobalAdmin(req)) return filter;
  return { ...filter, institutionId: requireInstitutionId(req) };
}

export function resolveWriteInstitutionId(
  req: AuthRequest,
  requestedInstitutionId?: string
): string {
  if (isGlobalAdmin(req)) {
    if (!requestedInstitutionId) {
      throw new AppError('institutionId is required', 400, 'VALIDATION_ERROR');
    }
    return requestedInstitutionId;
  }

  const userInstitutionId = requireInstitutionId(req);
  if (requestedInstitutionId && requestedInstitutionId !== userInstitutionId) {
    throw new AppError('Cannot write outside your institution', 403, 'TENANT_SCOPE_VIOLATION');
  }
  return userInstitutionId;
}

export function assertSameInstitution(
  req: AuthRequest,
  resource: InstitutionScopedResource | null | undefined
): void {
  if (!resource || isGlobalAdmin(req)) return;
  const resourceInstitutionId = resource.institutionId || resource.schoolId;
  if (!resourceInstitutionId || resourceInstitutionId !== requireInstitutionId(req)) {
    throw new AppError('Resource is outside your institution', 403, 'TENANT_SCOPE_VIOLATION');
  }
}

export function hasSameInstitution(
  req: AuthRequest,
  resource: InstitutionScopedResource | null | undefined
): boolean {
  if (!resource) return false;
  if (isGlobalAdmin(req)) return true;
  const resourceInstitutionId = resource.institutionId || resource.schoolId;
  return !!resourceInstitutionId && resourceInstitutionId === req.user?.institutionId;
}

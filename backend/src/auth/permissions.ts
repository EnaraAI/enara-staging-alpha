import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.middleware';
import type { UserRole } from './roles';

// Permission layer (4Level1 plan, P1). Roles keep their legacy meaning on
// existing routes; new and re-scoped routes check permissions. A user's
// permissions are their role's defaults plus any explicit grants on the user
// (User.permissions), which a Workspace Admin may set within their school.
//
//   content:author        create and edit own content (curricula, lessons, drafts)
//   content:publish       publish own content to classes the user teaches
//   content:manage_school school-wide curricula: deploy, delete, assign to batches
//   class:teach           teaching tools for the user's own classes
//   insights:read_school  school-wide analytics
//   workspace:users       invite users and manage their grants in the school
//   workspace:billing     customer-facing workspace/budget settings (no routes yet)
//   cost:internal         ENARA's internal provider costs (ENARA admins only)
export const PERMISSIONS = [
  'content:author',
  'content:publish',
  'content:manage_school',
  'class:teach',
  'insights:read_school',
  'workspace:users',
  'workspace:billing',
  'cost:internal',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Teacher is the pilot's main staff role and includes content creation; there
// is no separate content-creator role.
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  student: [],
  teacher: ['content:author', 'content:publish', 'class:teach'],
  academic_manager: ['insights:read_school'],
  admin: ['content:author', 'content:publish', 'content:manage_school', 'class:teach', 'insights:read_school', 'workspace:users', 'workspace:billing'],
  'enara-admin': PERMISSIONS,
};

// What a Workspace Admin may grant to someone in their school. Never internal
// costs, never workspace administration itself.
export const GRANTABLE_PERMISSIONS: readonly Permission[] = ['content:author', 'content:publish', 'content:manage_school', 'class:teach', 'insights:read_school'];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsFor(user: { role: UserRole; permissions?: readonly string[] } | undefined): Set<Permission> {
  if (!user) return new Set();
  const granted = (user.permissions ?? []).filter(isPermission);
  // Students never hold staff permissions, whatever is stored on the user.
  if (user.role === 'student') return new Set();
  // cost:internal stays with ENARA admins even if granted to someone else.
  return new Set([...ROLE_PERMISSIONS[user.role], ...granted.filter((p) => p !== 'cost:internal' || user.role === 'enara-admin')]);
}

export function hasPermission(req: AuthRequest, permission: Permission): boolean {
  return permissionsFor(req.user).has(permission);
}

export function requirePermission(...needed: Permission[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required', requestId: req.requestId }, message: 'Authentication required' });
      return;
    }
    const held = permissionsFor(req.user);
    if (!needed.every((p) => held.has(p))) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied', requestId: req.requestId }, message: 'Access denied' });
      return;
    }
    next();
  };
}

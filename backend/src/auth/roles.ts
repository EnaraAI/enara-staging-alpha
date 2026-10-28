// academic_manager (4Level1 P1): read-mostly school insights only; it is not
// in any legacy requireRole list, so it gets nothing beyond its permissions.
export const USER_ROLES = ['student', 'teacher', 'academic_manager', 'admin', 'enara-admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PUBLIC_REGISTRATION_ROLE: UserRole = 'student';
export const PRIVILEGED_ROLES: UserRole[] = ['teacher', 'academic_manager', 'admin', 'enara-admin'];
export const ADMIN_ROLES: UserRole[] = ['admin', 'enara-admin'];
export const COURSE_UPLOAD_ROLES: UserRole[] = ['teacher', 'admin', 'enara-admin'];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

export function isEnaraAdmin(role: UserRole): boolean {
  return role === 'enara-admin';
}

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isPrivilegedRole(role: UserRole): boolean {
  return PRIVILEGED_ROLES.includes(role);
}

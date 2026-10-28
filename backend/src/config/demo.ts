// Shared between the demo-login controller and the seedDemo script so the
// two can never drift apart on which accounts/institution "demo mode" means.
export const DEMO_INSTITUTION_ID = 'DEMO-ORG';

export type DemoRole = 'student' | 'teacher' | 'admin';

export const DEMO_USER_EMAILS: Record<DemoRole, string> = {
  student: 'demo-student@enara.demo',
  teacher: 'demo-teacher@enara.demo',
  admin: 'demo-admin@enara.demo',
};

export function isDemoRole(value: unknown): value is DemoRole {
  return value === 'student' || value === 'teacher' || value === 'admin';
}

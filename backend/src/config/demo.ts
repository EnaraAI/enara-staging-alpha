// Demo portal (one-click sign-in for partners). Every demo session is its own
// throwaway school, copied from a template school and deleted when the
// session ends. Shared by the demo routes, the session service and budgets.
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

// The template every session is copied from (built by an Enara admin).
export const DEMO_TEMPLATE_ID = 'demo-template';
// Session schools: `demo-s-<random>`.
export const DEMO_SESSION_PREFIX = 'demo-s-';
export const isDemoSessionInstitution = (id: string | undefined | null): boolean => Boolean(id && id.startsWith(DEMO_SESSION_PREFIX));

export const DEMO_LIMITS = {
  // AI spend per session (its own school budget).
  sessionCapUsd: 25,
  // All demo sessions together, per calendar month (UTC). Demo spend does not
  // count toward the staging AI test cap; this ceiling replaces it for demos.
  monthlyCapUsd: Number(process.env.DEMO_MONTHLY_CAP_USD) > 0 ? Number(process.env.DEMO_MONTHLY_CAP_USD) : 200,
  // A session ends 4 h after it starts at the latest, or ~10 min after the
  // browser stops checking in (the tab or browser was closed).
  maxSessionMs: 4 * 60 * 60 * 1000,
  idleMs: 10 * 60 * 1000,
  // Sessions one network address may start per 24 h.
  sessionsPerIpPerDay: 3,
  // Live tutor calls per session, and their length.
  avatarCallsPerSession: 3,
  avatarCallSeconds: 300,
} as const;

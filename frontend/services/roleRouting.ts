// Which portal a signed-in account opens (P1 review). Pure and dependency-free
// so it can be tested without a browser. The server's permission checks stay
// authoritative; this only keeps people out of screens they cannot use.

export type UiRole = 'student' | 'admin' | 'enara-admin' | 'academic-manager';
export type LoginChoice = 'student' | 'admin' | 'enara-admin';

// The login card each account may use, and the portal it then opens.
// Academic managers sign in with the staff card but get their own read-only
// portal, never the admin portal.
const ALLOWED: Record<string, Partial<Record<LoginChoice, UiRole>>> = {
  student: { student: 'student' },
  teacher: { admin: 'admin' },
  academic_manager: { admin: 'academic-manager' },
  admin: { admin: 'admin' },
  'enara-admin': { 'enara-admin': 'enara-admin', admin: 'admin' },
};

export function uiRoleFor(backendRole: string, choice: LoginChoice): UiRole | null {
  return ALLOWED[backendRole]?.[choice] ?? null;
}

// On reload: a stored portal is only trusted if the account may open it.
export function restoreUiRole(backendRole: string | undefined, saved: string | null): UiRole | null {
  if (!backendRole || !saved) return null;
  if (backendRole === 'academic_manager') return 'academic-manager';
  if (saved === 'academic-manager') return null;
  const allowed = Object.values(ALLOWED[backendRole] ?? {});
  return allowed.includes(saved as UiRole) ? (saved as UiRole) : null;
}

// The pages of the academic manager portal: school-wide, read-only analytics
// (GET /api/analytics/*). Nothing that edits content, teaches, grades,
// administers users or budgets, or shows internal AI cost.
export const ACADEMIC_MANAGER_PAGES = [{ page: 'dashboard', label: 'School insights' }] as const;

export function academicManagerPage(page: string): string {
  return ACADEMIC_MANAGER_PAGES.some((p) => p.page === page) ? page : 'dashboard';
}

// Demo/live data views for teacher and class dashboards (P1 final). Default
// live; the server keeps class and tenant scope whatever is chosen. Teachers
// switch between live and demo data; "All data" (both, labelled) is offered
// to school and ENARA admins. Students never get the selector.
export type OriginView = 'live' | 'demo_seed' | 'all';
export const ORIGIN_LABELS: Record<OriginView, string> = { live: 'Live data', demo_seed: 'Demo data', all: 'All data (live + demo)' };

export function originOptionsFor(backendRole: string | undefined): OriginView[] {
  if (backendRole === 'teacher') return ['live', 'demo_seed'];
  if (backendRole === 'admin' || backendRole === 'enara-admin') return ['live', 'demo_seed', 'all'];
  return [];
}

// Adds ?origin= to a dashboard API path. Live is sent explicitly too, so every
// request states its view.
export function withOrigin(path: string, view: OriginView = 'live'): string {
  return `${path}${path.includes('?') ? '&' : '?'}origin=${encodeURIComponent(view)}`;
}

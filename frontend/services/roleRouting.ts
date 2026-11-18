// Which portal a signed-in account opens (P1 review). Pure and dependency-free
// so it can be tested without a browser. The server's permission checks stay
// authoritative; this only keeps people out of screens they cannot use.

export type UiRole = 'student' | 'admin' | 'enara-admin' | 'academic-manager' | 'parent';
export type LoginChoice = 'student' | 'admin' | 'enara-admin' | 'parent';

// The login card each account may use, and the portal it then opens.
// Academic managers sign in with the staff card but get their own read-only
// portal, never the admin portal.
const ALLOWED: Record<string, Partial<Record<LoginChoice, UiRole>>> = {
  student: { student: 'student' },
  teacher: { admin: 'admin' },
  academic_manager: { admin: 'academic-manager' },
  admin: { admin: 'admin' },
  'enara-admin': { 'enara-admin': 'enara-admin', admin: 'admin' },
  // Parents Portal: parent accounts open only the parents area, from the Parents tab.
  parent: { parent: 'parent' },
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

// Staff-portal pages only school (workspace) admins can use: every data call
// on them needs admin rights, so a teacher got only "Access denied" (P15 UI
// sweep). Teachers share the staff portal but never see these pages, and land
// on their Teaching Dashboard instead of the school dashboard.
export const SCHOOL_ADMIN_PAGES = [
  'dashboard', 'live-avatars', 'course-intelligence', 'institution-analytics', 'students',
  'credits', 'engagement', 'school-insights', 'learning-events', 'usage', 'savings', 'people', 'age-bands', 'lms',
] as const;

export function staffPageAllowed(backendRole: string | undefined, page: string): boolean {
  return backendRole !== 'teacher' || !(SCHOOL_ADMIN_PAGES as readonly string[]).includes(page);
}

export function staffLandingPage(backendRole: string | undefined): string {
  return backendRole === 'teacher' ? 'teaching' : 'dashboard';
}

// The pages of the academic manager portal: school-wide, read-only analytics
// (GET /api/analytics/*). Nothing that edits content, teaches, grades,
// administers users or budgets, or shows internal AI cost.
export const ACADEMIC_MANAGER_PAGES = [{ page: 'dashboard', label: 'School insights' }, { page: 'age-bands', label: 'Learner age bands (view)' }] as const;

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

// LMS launch (P0 item 1): the portal a launch opens, from the ENARA account's
// own role (never from the LMS role claim). An unknown or unsupported role
// NEVER falls back to the staff portal: it gets the launch error view with a
// reference code. The server refuses these launches too
// (POST /api/lms/launch/exchange answers LMS_ROLE_NOT_SUPPORTED).
//   student            -> student app
//   teacher, admin     -> staff portal ('admin'); staffPageAllowed /
//                         staffLandingPage keep a teacher on teacher pages,
//                         landing on the Teaching Dashboard
//   parent             -> Parents Portal
//   anything else      -> error lms_role_not_supported
// A student preview (staff opening the activity as a learner) stays the
// student view, and only a teacher or school admin account may preview.
export const LMS_ROLE_NOT_SUPPORTED = 'lms_role_not_supported';
/** role: the portal to open, or null with the reference code to show instead. */
export type LmsLaunchPortal = { role: UiRole; code: null } | { role: null; code: typeof LMS_ROLE_NOT_SUPPORTED };

const LMS_LAUNCH_PORTAL: Record<string, UiRole> = { student: 'student', teacher: 'admin', admin: 'admin', parent: 'parent' };

export function lmsLaunchPortal(backendRole: string | null | undefined, preview = false): LmsLaunchPortal {
  const role = typeof backendRole === 'string' && Object.prototype.hasOwnProperty.call(LMS_LAUNCH_PORTAL, backendRole) ? LMS_LAUNCH_PORTAL[backendRole] : null;
  const refused: LmsLaunchPortal = { role: null, code: LMS_ROLE_NOT_SUPPORTED };
  if (preview) return backendRole === 'teacher' || backendRole === 'admin' ? { role: 'student', code: null } : refused;
  return role ? { role, code: null } : refused;
}

// P0 item 6: students whose ENARA account came from an LMS (or any LMS
// session, including a staff "preview as student") do their work through class
// assignments, which reach the LMS gradebook. The older "Assessments" list
// (attempts without an assignment) is not offered to them; the server also
// refuses to start such an attempt (LMS_USE_CLASS_ASSIGNMENT).
export function showOldAssessmentsTab(opts: { assignmentsEnabled: boolean; oldAssessmentCount: number; lmsStudent: boolean }): boolean {
  if (opts.lmsStudent) return false;
  return !opts.assignmentsEnabled || opts.oldAssessmentCount > 0;
}

// Mic / new tab: "Open in new tab" lands on the same step. An assignment
// opens the assignments page (as before); a page key reopens that page when
// the portal has it (a teacher still never gets a school-admin page).
const PAGES_NEEDING_STATE = ['taking-assessment', 'student-profile', 'student-analytics'] as const;
export const STUDENT_LANDING_PAGES = ['dashboard', 'courses', 'progress', 'assignments-student', 'study-plan', 'assessments', 'results', 'activity-tutor', 'activity-avatar', 'activity-diagnostic'] as const;

// LMS Phase 8: the app page of each no-grade activity (backend
// core/pageTargets.ts ACTIVITY_TARGETS). Students get the activity itself,
// staff an overview of it for the course's class.
export const LMS_ACTIVITY_PAGES = { 'activity-tutor': 'tutor', 'activity-avatar': 'avatar', 'activity-diagnostic': 'diagnostic' } as const;
export type LmsActivityPage = keyof typeof LMS_ACTIVITY_PAGES;
export function lmsActivityOfPage(page: string | null | undefined): (typeof LMS_ACTIVITY_PAGES)[LmsActivityPage] | null {
  return page && Object.prototype.hasOwnProperty.call(LMS_ACTIVITY_PAGES, page) ? LMS_ACTIVITY_PAGES[page as LmsActivityPage] : null;
}
export function lmsLandingPage(uiRole: UiRole, backendRole: string | undefined, target: { assignmentId?: string; page?: string } | null, fallback: string): string {
  if (!target) return fallback;
  if (target.assignmentId) return uiRole === 'student' ? 'assignments-student' : 'class-assignments';
  const page = target.page;
  // Pages that need something picked in the tab first (an assessment being taken, a student) are not reopened.
  if (!page || (PAGES_NEEDING_STATE as readonly string[]).includes(page)) return fallback;
  if (uiRole === 'student') return (STUDENT_LANDING_PAGES as readonly string[]).includes(page) ? page : fallback;
  if (uiRole === 'admin') return staffPageAllowed(backendRole, page) ? page : staffLandingPage(backendRole);
  return fallback;
}

// LMS Phase 2b: a launch with enara_target lands on a page the server already
// resolved for the role (backend core/pageTargets.ts). Enara Kids students get
// the kids equivalent of a student page, or kids home.
export type KidsLmsTab = 'home' | 'learning' | 'progress' | 'assignments' | 'plan' | 'results';
const KIDS_TAB_FOR_PAGE: Record<string, KidsLmsTab> = {
  dashboard: 'home',
  courses: 'learning',
  progress: 'progress',
  'assignments-student': 'assignments',
  'study-plan': 'plan',
  results: 'results',
};
export function kidsTabForLmsPage(page: string | null | undefined): KidsLmsTab {
  return (page && Object.prototype.hasOwnProperty.call(KIDS_TAB_FOR_PAGE, page) ? KIDS_TAB_FOR_PAGE[page] : 'home');
}

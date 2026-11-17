import type { LmsEnaraRole } from './types';

// LTI role URIs -> ENARA role (Spec §5.4). Context (membership) roles decide;
// of institution/system roles only Administrator counts. Several roles: the
// highest wins (admin > teacher > student > observer). Unknown roles map to
// student with a warning for the audit log. Platforms may override per URI.
const LIS = 'http://purl.imsglobal.org/vocab/lis/v2/';
const MEMBERSHIP = `${LIS}membership#`;

const STANDARD: Record<string, LmsEnaraRole | 'admin_if_allowed'> = {
  [`${MEMBERSHIP}Instructor`]: 'teacher',
  [`${MEMBERSHIP}ContentDeveloper`]: 'teacher',
  [`${LIS}membership/Instructor#TeachingAssistant`]: 'teacher',
  [`${MEMBERSHIP}Learner`]: 'student',
  [`${MEMBERSHIP}Mentor`]: 'observer',
  [`${MEMBERSHIP}Administrator`]: 'admin_if_allowed',
  [`${LIS}institution/person#Administrator`]: 'admin_if_allowed',
  [`${LIS}system/person#Administrator`]: 'admin_if_allowed',
  // Deprecated short names some platforms still send.
  Instructor: 'teacher',
  ContentDeveloper: 'teacher',
  Learner: 'student',
  Mentor: 'observer',
  Administrator: 'admin_if_allowed',
};

// LTI 1.3 system role for a platform's test account (e.g. a "student view"
// test student). It says who the person is, not their course role, so it is
// not mapped; isTestUser() lets the launch treat it as a student preview.
export const TEST_USER_ROLE = 'http://purl.imsglobal.org/vocab/lti/system/person#TestUser';

export function isTestUser(roles: unknown): boolean {
  return Array.isArray(roles) && roles.includes(TEST_USER_ROLE);
}

// Sub-roles such as ".../membership/Learner#NonCreditLearner" follow their parent.
function parentOf(uri: string): string | undefined {
  const m = /^http:\/\/purl\.imsglobal\.org\/vocab\/lis\/v2\/membership\/(\w+)#\w+$/.exec(uri);
  return m ? `${MEMBERSHIP}${m[1]}` : undefined;
}

const RANK: Record<LmsEnaraRole, number> = { observer: 0, student: 1, teacher: 2, admin: 3 };

export interface RoleMapResult {
  role: LmsEnaraRole;
  warnings: Array<'unknown_roles' | 'no_roles' | 'admin_downgraded' | 'observer_ignored'>;
}

export function mapLtiRoles(
  roles: unknown,
  opts: { allowAdminRole?: boolean; overrides?: Record<string, string> } = {},
): RoleMapResult {
  const list = Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
  const warnings: RoleMapResult['warnings'] = [];
  let best: LmsEnaraRole | undefined;
  let unknown = false;
  for (const uri of list) {
    if (uri === TEST_USER_ROLE) continue;
    const override = opts.overrides?.[uri];
    let mapped: LmsEnaraRole | 'admin_if_allowed' | undefined =
      override && override in RANK ? (override as LmsEnaraRole) : STANDARD[uri] ?? STANDARD[parentOf(uri) ?? ''];
    if (mapped === 'admin_if_allowed') {
      if (opts.allowAdminRole) mapped = 'admin';
      else {
        mapped = 'teacher';
        if (!warnings.includes('admin_downgraded')) warnings.push('admin_downgraded');
      }
    }
    if (!mapped) {
      unknown = true;
      continue;
    }
    if (!best || RANK[mapped] > RANK[best]) best = mapped;
  }
  if (!list.length) warnings.push('no_roles');
  if (!best) {
    if (list.length) warnings.push('unknown_roles');
    return { role: 'student', warnings };
  }
  if (unknown) warnings.push('unknown_roles');
  // Release 1: an observer (Mentor, often a parent) is logged only, never linked.
  if (best === 'observer') warnings.push('observer_ignored');
  return { role: best, warnings };
}

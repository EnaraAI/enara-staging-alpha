// Continuous delivery to lms-test.enara.app: the pure rules (no network here),
// shared by cli.mjs and its tests. docs/lms/CONTINUOUS_DELIVERY.md.
//
// HARD RULE: test.enara.app (real data) is frozen. Nothing in this pipeline may
// deploy to it, read it or change it. Every target below is a constant; the
// guard refuses to go on unless the Vercel project is exactly enara-lms-test
// and its domains are exactly what we expect.

export const PROJECT_ID = 'prj_tuRpwEJLz1dEQOj6RSEk2xUpqtIn';
export const TEAM_ID = 'team_xbSucLT1roYt4njeB4tRPfKQ';
export const PROJECT_NAME = 'enara-lms-test';
export const SITE_HOST = 'lms-test.enara.app';
export const SITE = `https://${SITE_HOST}`;
export const LIVE_BRANCH = 'lms-test-live';
export const VERCEL_CLI_VERSION = '65.9.0';
/** Hosts the pipeline must never touch. Compared exactly (lms-test.enara.app ends with "test.enara.app"). */
export const FROZEN_HOSTS = ['test.enara.app', 'www.test.enara.app'];

export class GuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuardError';
  }
}

const hostOf = (value) => {
  try {
    return new URL(/^https?:\/\//.test(value) ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return '';
  }
};

/** Throws unless the URL is on lms-test.enara.app (https). Every site call goes through this. */
export function assertSiteUrl(url) {
  const u = new URL(url);
  const host = u.host.toLowerCase();
  if (FROZEN_HOSTS.includes(host)) throw new GuardError(`refusing ${host}: test.enara.app is frozen`);
  if (u.protocol !== 'https:' || host !== SITE_HOST) throw new GuardError(`refusing ${host}: the pipeline only talks to ${SITE_HOST}`);
  return u.toString();
}

/**
 * The project guard. `project` is GET /v9/projects/:id, `domains` the names from
 * GET /v9/projects/:id/domains. Returns the list of problems (empty = go).
 */
export function projectProblems(project, domains) {
  const problems = [];
  if (!project || project.id !== PROJECT_ID) problems.push(`project id is not ${PROJECT_ID}`);
  if (!project || project.name !== PROJECT_NAME) problems.push(`project name is "${project?.name ?? 'unknown'}", expected ${PROJECT_NAME}`);
  if (project?.accountId && project.accountId !== TEAM_ID) problems.push('project belongs to another team');
  const names = (domains ?? []).map((d) => String(typeof d === 'string' ? d : d?.name).toLowerCase());
  for (const frozen of FROZEN_HOSTS) if (names.includes(frozen)) problems.push(`project has the frozen domain ${frozen}`);
  if (!names.includes(SITE_HOST)) problems.push(`project does not have the domain ${SITE_HOST}`);
  const unexpected = names.filter((n) => n !== SITE_HOST && !FROZEN_HOSTS.includes(n) && !n.endsWith('.vercel.app'));
  if (unexpected.length) problems.push(`project has unexpected domains: ${unexpected.join(', ')}`);
  return problems;
}

/** A deployment we may act on: this project, production. */
export function deploymentProblems(dep) {
  const problems = [];
  if (!dep) return ['deployment not found'];
  if (dep.projectId !== PROJECT_ID) problems.push('deployment belongs to another project');
  if (dep.target !== 'production') problems.push(`deployment target is ${dep.target ?? 'preview'}, expected production`);
  const aliases = [...(dep.alias ?? []), dep.url].filter(Boolean).map(hostOf);
  for (const frozen of FROZEN_HOSTS) if (aliases.includes(frozen)) problems.push(`deployment is aliased to the frozen ${frozen}`);
  return problems;
}

// ------------------------------------------------------------------ flags

// PARENT_ added for Parents P1-P5 (docs/parents/P1_NOTES.md); the secret-looking names below are still refused.
const FLAG_NAME = /^(LMS|ENROLLMENT|GRADE_LEDGER|MAINTENANCE_ENDPOINTS|MOODLE_TEST_WS|PARENT)_[A-Z0-9_]{1,60}$/;
// Tutor engine (owner-approved): exactly this one name, not an ENARA_ prefix. Its value is a
// comma list of engine switches (backend/src/services/engineV2.ts); FLAG_VALUE still applies.
const EXTRA_FLAG_NAMES = ['ENARA_ENGINE_V2'];
const FORBIDDEN_IN_NAME = /(KEY|KEK|SECRET|TOKEN|PASSWORD|URI|URL|DSN|CREDENTIAL|PRIVATE)/;
const FLAG_VALUE = /^[A-Za-z0-9_,.:-]{0,200}$/;
// ENARA_ENGINE_V2 is a comma list of switch names only (no other characters); it may be longer than other flags.
const ENGINE_FLAG_VALUE = /^[A-Za-z0-9]+(,[A-Za-z0-9]+){0,40}$/;
const flagValueOk = (key, value) => (key === 'ENARA_ENGINE_V2' ? value.length <= 1000 && ENGINE_FLAG_VALUE.test(value) : FLAG_VALUE.test(value));

/**
 * Reads deploy/lms-test.flags.json: every feature's flags, merged. Refuses a
 * manifest for another project, a name that is not a feature switch (anything
 * that looks like a secret or an address), a value that is not a plain word
 * list, or two features asking for different values of one flag.
 */
export function manifestFlags(manifest) {
  if (manifest?.project?.id !== PROJECT_ID || manifest?.project?.name !== PROJECT_NAME) throw new GuardError('flags manifest is not for enara-lms-test');
  if (manifest.project.target !== 'production') throw new GuardError('flags manifest target must be production');
  const out = {};
  const from = {};
  for (const feature of manifest.features ?? []) {
    if (!feature?.name || typeof feature.flags !== 'object') throw new Error('each feature needs a name and flags');
    for (const [key, value] of Object.entries(feature.flags)) {
      if (!(FLAG_NAME.test(key) || EXTRA_FLAG_NAMES.includes(key)) || FORBIDDEN_IN_NAME.test(key)) throw new GuardError(`${key} is not a feature switch the pipeline may set`);
      if (typeof value !== 'string' || !flagValueOk(key, value)) throw new GuardError(`${key}: the value must be a short plain string`);
      if (key in out && out[key] !== value) throw new Error(`${key}: "${from[key]}" wants ${out[key]}, "${feature.name}" wants ${value}`);
      out[key] = value;
      from[key] = feature.name;
    }
  }
  return out;
}

const targets = (e) => (Array.isArray(e.target) ? e.target : [e.target]).filter(Boolean);
const LOCKED_TYPES = ['sensitive', 'secret'];

/**
 * What to do for each manifest flag, given the project's env list
 * (GET /v9/projects/:id/env; `value` already readable for plain/encrypted).
 * Only the Production target. Never removes, never touches Sensitive vars.
 * Returns [{key, action: create|update|unchanged|skip_sensitive|skip_unreadable, envId?, value}].
 */
export function planFlags(flags, envs) {
  const plan = [];
  for (const [key, value] of Object.entries(flags)) {
    const prod = (envs ?? []).filter((e) => e.key === key && targets(e).includes('production') && !e.gitBranch);
    if (prod.some((e) => LOCKED_TYPES.includes(e.type))) {
      plan.push({ key, value, action: 'skip_sensitive' });
      continue;
    }
    if (!prod.length) {
      plan.push({ key, value, action: 'create' });
      continue;
    }
    const e = prod[0];
    if (typeof e.value !== 'string') plan.push({ key, value, action: 'skip_unreadable', envId: e.id });
    else if (e.value === value) plan.push({ key, value, action: 'unchanged', envId: e.id });
    else plan.push({ key, value, action: 'update', envId: e.id, sharedWith: targets(e).filter((t) => t !== 'production') });
  }
  return plan;
}

// ---------------------------------------------------------------- results

/** The first failed step of a health-check run, as "step (code)". */
export function healthFailure(run) {
  if (!run || typeof run !== 'object') return 'health check gave no answer';
  if (run.ok === true) return null;
  const bad = (run.steps ?? []).find((s) => !s.ok);
  return bad ? `health check failed at ${bad.name}${bad.code ? ` (${bad.code})` : ''}` : 'health check failed';
}

/** Keeps a reason printable: one line, no tokens or URLs with credentials, bounded. */
export function cleanReason(text) {
  return String(text ?? '')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/[A-Za-z0-9_-]{32,}/g, '***')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 200)
    .trim();
}

/**
 * The one-line result. outcome: passed | rolled_back | rollback_failed |
 * not_deployed. Titles are untrusted (PR text): newlines removed, length bounded.
 */
export function resultLine({ title, outcome, reason }) {
  const t = String(title ?? 'PR').replace(/[\r\n]+/g, ' ').slice(0, 200).trim() || 'PR';
  const why = cleanReason(reason);
  switch (outcome) {
    case 'passed':
      return `${t}: deployed to lms-test — passed`;
    case 'rolled_back':
      return `${t}: deployed to lms-test — rolled back (${why || 'health check failed'})`;
    case 'rollback_failed':
      return `${t}: deployed to lms-test — FAILED and the automatic rollback failed too (${why || 'unknown'}); lms-test may be broken, roll back by hand`;
    default:
      return `${t}: not deployed to lms-test (${why || 'stopped before the deploy'})`;
  }
}

export const COMMENT_FOOTER = '\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_';

export function commentBody({ line, details = [] }) {
  const extra = details.filter(Boolean).map((d) => `- ${d}`).join('\n');
  return `${line}${extra ? `\n\n${extra}` : ''}${COMMENT_FOOTER}`;
}

import { LmsAuditLog, LmsContext, LmsGradeSyncJob } from '../models';
import { helpFor, type ProblemHelp } from './problemHelp';

// Phase 1b, the Problems view (GET /api/lms/problems). Groups the audit log's
// failures and warnings in the last 24 hours or 7 days by reference code and
// event, with counts, first/last seen and the affected platform and course IDs
// (IDs only, capped). Also lists what is still broken now, whatever its age:
// grade jobs that gave up ("dead") and courses whose last roster sync failed.
// Each code carries its plain-language explanation and fix (EN and AR).

export const PROBLEM_WINDOWS = [1, 7] as const;
export type ProblemWindow = (typeof PROBLEM_WINDOWS)[number];
const ID_CAP = 10;
const GROUP_CAP = 200;

export type ProblemArea = 'launch' | 'sign_in' | 'grades' | 'roster' | 'registration' | 'seats' | 'other';

export function areaOf(event: string): ProblemArea {
  if (event.includes('registration') || event.startsWith('register')) return 'registration';
  if (event.startsWith('lti.') || event === 'preview_launch' || event === 'preview_check') return 'launch';
  if (event.startsWith('lms.session') || event === 'lms.current_class') return 'sign_in';
  if (event.startsWith('grade.')) return 'grades';
  if (event.startsWith('roster.')) return 'roster';
  if (event.startsWith('seats.')) return 'seats';
  return 'other';
}

const ids = (list: unknown[] | undefined): { ids: string[]; total: number } => {
  const all = [...new Set((list ?? []).filter((x): x is string => typeof x === 'string' && x.length > 0))].sort();
  return { ids: all.slice(0, ID_CAP), total: all.length };
};

export interface ProblemGroup {
  code: string | null;
  event: string;
  area: ProblemArea;
  severity: 'fail' | 'warn';
  count: number;
  failCount: number;
  warnCount: number;
  firstSeen: Date;
  lastSeen: Date;
  platformIds: string[];
  platformCount: number;
  contextIds: string[];
  contextCount: number;
  /** ENARA admins only (all schools). */
  institutionIds?: string[];
  help: ProblemHelp;
}

export interface OpenProblem {
  code: string;
  count: number;
  lastSeen: Date | null;
  platformIds: string[];
  platformCount: number;
  contextIds: string[];
  contextCount: number;
  institutionIds?: string[];
  help: ProblemHelp;
}

export interface ProblemsView {
  days: ProblemWindow;
  since: Date;
  institutionId: string | null;
  problems: ProblemGroup[];
  open: { deadGradeJobs: OpenProblem[]; failedRosterSyncs: OpenProblem[] };
}

interface Agg {
  _id: unknown;
  count: number;
  lastSeen?: Date | null;
  platformIds?: unknown[];
  contextIds?: unknown[];
  institutionIds?: unknown[];
}

function openRow(a: Agg & { _id: string }, event: string, allSchools: boolean): OpenProblem {
  const p = ids(a.platformIds);
  const c = ids(a.contextIds);
  return {
    code: a._id,
    count: a.count,
    lastSeen: a.lastSeen ?? null,
    platformIds: p.ids,
    platformCount: p.total,
    contextIds: c.ids,
    contextCount: c.total,
    ...(allSchools ? { institutionIds: ids(a.institutionIds).ids } : {}),
    help: helpFor(a._id, event),
  };
}

/**
 * `institutionId` undefined = every school (ENARA admins only); a string = that school only.
 */
export async function problemsView(opts: { institutionId?: string; days: ProblemWindow; now?: Date }): Promise<ProblemsView> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - opts.days * 24 * 3600_000);
  const allSchools = opts.institutionId === undefined;
  const school = allSchools ? {} : { institutionId: opts.institutionId };

  const groups = await LmsAuditLog.aggregate<Agg & { _id: { code: string | null; event: string }; failCount: number; firstSeen: Date; lastSeen: Date }>([
    // test_ws.* rows come from the test-only Moodle Web Services tool (maintenance), never from a school's use.
    { $match: { ...school, outcome: { $in: ['fail', 'warn'] }, event: { $not: /^test_ws\./ }, createdAt: { $gte: since, $lte: now } } },
    {
      $group: {
        _id: { code: { $ifNull: ['$code', null] }, event: '$event' },
        count: { $sum: 1 },
        failCount: { $sum: { $cond: [{ $eq: ['$outcome', 'fail'] }, 1, 0] } },
        firstSeen: { $min: '$createdAt' },
        lastSeen: { $max: '$createdAt' },
        platformIds: { $addToSet: '$platformId' },
        contextIds: { $addToSet: '$refIds.contextId' },
        institutionIds: { $addToSet: '$institutionId' },
      },
    },
    { $sort: { failCount: -1, lastSeen: -1 } },
    { $limit: GROUP_CAP },
  ]);

  const problems: ProblemGroup[] = groups.map((g) => {
    const p = ids(g.platformIds);
    const c = ids(g.contextIds);
    const code = typeof g._id.code === 'string' && g._id.code ? g._id.code : null;
    return {
      code,
      event: g._id.event,
      area: areaOf(g._id.event),
      severity: g.failCount > 0 ? 'fail' : 'warn',
      count: g.count,
      failCount: g.failCount,
      warnCount: g.count - g.failCount,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      platformIds: p.ids,
      platformCount: p.total,
      contextIds: c.ids,
      contextCount: c.total,
      ...(allSchools ? { institutionIds: ids(g.institutionIds).ids } : {}),
      help: helpFor(code ?? 'none', g._id.event),
    };
  });

  // Still broken now (not limited to the window): grade jobs that gave up, courses whose last roster sync failed.
  const dead = await LmsGradeSyncJob.aggregate<Agg & { _id: string }>([
    { $match: { ...school, status: 'dead' } },
    {
      $group: {
        _id: { $ifNull: ['$lastError', 'unknown'] },
        count: { $sum: 1 },
        lastSeen: { $max: { $ifNull: ['$lastErrorAt', '$updatedAt'] } },
        platformIds: { $addToSet: '$platformId' },
        contextIds: { $addToSet: '$contextId' },
        institutionIds: { $addToSet: '$institutionId' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ]);
  const roster = await LmsContext.aggregate<Agg & { _id: string }>([
    { $match: { ...school, 'rosterSync.outcome': 'failed' } },
    {
      $group: {
        _id: { $ifNull: ['$rosterSync.lastErrorCode', 'unknown'] },
        count: { $sum: 1 },
        lastSeen: { $max: { $ifNull: ['$rosterSync.lastErrorAt', '$rosterSync.lastAttemptAt'] } },
        platformIds: { $addToSet: '$platformId' },
        contextIds: { $addToSet: '$id' },
        institutionIds: { $addToSet: '$institutionId' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ]);

  return {
    days: opts.days,
    since,
    institutionId: opts.institutionId ?? null,
    problems,
    open: {
      deadGradeJobs: dead.map((a) => openRow(a, 'grade.failed', allSchools)),
      failedRosterSyncs: roster.map((a) => openRow(a, 'roster.sync', allSchools)),
    },
  };
}

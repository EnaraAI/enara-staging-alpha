import { AssessmentAttempt } from '../../../models/AssessmentAttempt';
import { Assignment } from '../../../models/Assignment';
import { LmsContext, LmsPlatform, LmsResourceLink, type ILmsResourceLink } from '../models';
import { getPreset } from '../presets';

// Phase 3 follow-up: "LMS activity may have been deleted", and which LMS
// activity an ENARA assignment belongs to (shown to teachers and admins).
//
// LTI has no "activity deleted" event, so two signs are used:
//   lineitem_gone  the LMS answered 404/410 for the activity's line item
//                  during a grade send (ags.ts stores lineItemGoneAt on the
//                  resource link; the next launch of the activity clears it);
//   stale          computed: the activity has not been launched for 30 days
//                  AND its assignment has no submitted result in 30 days.
// Neither archives anything: the teacher (or an admin) decides, with the
// normal Archive of the assignment.

export const STALE_DAYS = 30;
const DAY_MS = 86_400_000;

export type MayBeDeletedReason = 'lineitem_gone' | 'stale';

export interface ActivityHealth {
  mayBeDeleted: boolean;
  reason: MayBeDeletedReason | null;
  lineItemGoneAt: Date | null;
  lastLaunchAt: Date | null;
  lastResultAt: Date | null;
}

/** Pure: the flag for one resource link, given its assignment's last result time. */
export function activityHealth(
  link: Partial<Pick<ILmsResourceLink, 'lineItemGoneAt' | 'lastLaunchAt' | 'boundAt' | 'createdAt'>>,
  lastResultAt: Date | null | undefined,
  now: Date = new Date(),
): ActivityHealth {
  // Links from before this change have no lastLaunchAt: their binding (or creation) stands in.
  const lastLaunch = link.lastLaunchAt ?? link.boundAt ?? link.createdAt ?? null;
  const cutoff = now.getTime() - STALE_DAYS * DAY_MS;
  const stale = !!lastLaunch && new Date(lastLaunch).getTime() < cutoff && (!lastResultAt || new Date(lastResultAt).getTime() < cutoff);
  const reason: MayBeDeletedReason | null = link.lineItemGoneAt ? 'lineitem_gone' : stale ? 'stale' : null;
  return { mayBeDeleted: !!reason, reason, lineItemGoneAt: link.lineItemGoneAt ?? null, lastLaunchAt: link.lastLaunchAt ?? null, lastResultAt: lastResultAt ?? null };
}

/** The most recent submitted result per assignment. */
async function lastResults(institutionId: string | undefined, assignmentIds: string[]): Promise<Map<string, Date>> {
  if (!assignmentIds.length) return new Map();
  const rows = await AssessmentAttempt.aggregate<{ _id: string; at: Date }>([
    { $match: { assignmentId: { $in: assignmentIds }, status: 'submitted', ...(institutionId ? { institutionId } : {}) } },
    { $group: { _id: '$assignmentId', at: { $max: '$submittedAt' } } },
  ]);
  return new Map(rows.filter((r) => r.at).map((r) => [r._id, r.at]));
}

/** "Moodle (lms-test-enara.moodlecloud.com)". */
export function platformName(p: { vendor: string; issuer: string }): string {
  const label = getPreset(p.vendor)?.label ?? 'LMS';
  try {
    return `${label} (${new URL(p.issuer).host})`;
  } catch {
    return label;
  }
}

/** A link back to the LMS course when the platform's URL scheme is known (Moodle: /course/view.php?id=<course id>). */
export function courseUrl(p: { vendor: string; issuer: string }, externalContextId: string | undefined): string | null {
  if (p.vendor !== 'moodle' || !externalContextId || !/^\d{1,12}$/.test(externalContextId)) return null;
  try {
    const u = new URL(p.issuer);
    if (u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}/course/view.php?id=${externalContextId}`;
  } catch {
    return null;
  }
}

export interface LinkedActivityView {
  resourceLinkId: string;
  platformName: string;
  activityTitle: string | null;
  courseTitle: string | null;
  courseUrl: string | null;
  mayBeDeleted: boolean;
  reason: MayBeDeletedReason | null;
  lineItemGoneAt: Date | null;
  lastLaunchAt: Date | null;
  lastResultAt: Date | null;
}

/**
 * The LMS activities (resource links) bound to these ENARA assignments, with
 * their platform, course and "may have been deleted" flag. Same school only.
 */
export async function linkedActivities(institutionId: string | undefined, assignmentIds: string[], now = new Date()): Promise<Map<string, LinkedActivityView[]>> {
  const out = new Map<string, LinkedActivityView[]>();
  if (!assignmentIds.length) return out;
  const links = await LmsResourceLink.find({ enaraActivityId: { $in: assignmentIds }, ...(institutionId ? { institutionId } : {}) }).limit(500).lean();
  if (!links.length) return out;
  const contexts = await LmsContext.find({ id: { $in: [...new Set(links.map((l) => l.contextId))] } }).select('id platformId institutionId externalContextId title').lean();
  const platforms = await LmsPlatform.find({ id: { $in: [...new Set(contexts.map((c) => c.platformId))] } }).select('id vendor issuer institutionId').lean();
  const results = await lastResults(institutionId, [...new Set(links.map((l) => l.enaraActivityId!))]);
  for (const link of links) {
    const context = contexts.find((c) => c.id === link.contextId && c.institutionId === link.institutionId);
    const platform = context && platforms.find((p) => p.id === context.platformId && p.institutionId === link.institutionId);
    if (!context || !platform) continue;
    const health = activityHealth(link, results.get(link.enaraActivityId!), now);
    const view: LinkedActivityView = {
      resourceLinkId: link.id,
      platformName: platformName(platform),
      activityTitle: link.title ?? null,
      courseTitle: context.title ?? null,
      courseUrl: courseUrl(platform, context.externalContextId),
      ...health,
    };
    out.set(link.enaraActivityId!, [...(out.get(link.enaraActivityId!) ?? []), view]);
  }
  return out;
}

/** Admin view (GET /api/lms/grades): the platform's bound activities that may have been deleted (not archived ones). */
export async function flaggedActivities(platformId: string, now = new Date(), limit = 50) {
  const contexts = await LmsContext.find({ platformId }).select('id institutionId').limit(500).lean();
  if (!contexts.length) return [];
  const links = await LmsResourceLink.find({ contextId: { $in: contexts.map((c) => c.id) }, enaraActivityId: { $exists: true } }).limit(1000).lean();
  const archived = new Set(
    (await Assignment.find({ id: { $in: links.map((l) => l.enaraActivityId!) }, state: 'archived' }).select('id').lean()).map((a) => a.id),
  );
  const live = links.filter((l) => !archived.has(l.enaraActivityId!) && contexts.some((c) => c.id === l.contextId && c.institutionId === l.institutionId));
  const results = await lastResults(undefined, [...new Set(live.map((l) => l.enaraActivityId!))]);
  return live
    .map((l) => ({ link: l, health: activityHealth(l, results.get(l.enaraActivityId!), now) }))
    .filter((x) => x.health.mayBeDeleted)
    .slice(0, limit)
    .map(({ link, health }) => ({ resourceLinkId: link.id, assignmentId: link.enaraActivityId!, activityTitle: link.title ?? null, ...health }));
}

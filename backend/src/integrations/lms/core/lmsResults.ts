import { AssessmentAttempt } from '../../../models/AssessmentAttempt';
import { GradeLmsSlot, type IGradeLmsSlot, type LedgerValue } from '../../../models/GradeLedger';
import { gradeLedgerOn, recordGradeChange } from '../../../services/gradeLedger';
import { logger, serializeError } from '../../../utils/logging';
import { LmsContext, LmsGradeSyncJob, LmsPlatform, LmsResourceLink, LmsUser, type ILmsContext, type ILmsResourceLink } from '../models';
import { writeLmsAudit } from './audit';
import { lmsFlags } from './flags';
import { LMS_VALUE_DIFFERS, lastSentForSlot, type SentValue } from './gradeSyncLog';

// Grade ledger part (e): grades changed directly in the LMS
// (docs/lms/GRADE_LEDGER_NOTES.md). For each gradebook cell ENARA has sent to
// (resource link + LMS user), read what the LMS shows through the AGS result
// service and compare it with the last value ENARA sent (or the value the
// teacher agreed to keep). The LMS keeps its own scale (Moodle scales to the
// line item's maximum, e.g. 100), so fractions are compared, with a tolerance.
//
// Different -> a ledger entry `lms_change_detected` with both values, the
// cell is marked "LMS value differs" (grade_lms_slots) and the outbox sends
// nothing more to it (never silently overwrite a teacher's LMS change) until
// an ENARA teacher decides: keep the LMS value (recorded, nothing sent) or
// keep ENARA's (sent again).
//
// Needs GRADE_LEDGER_ENABLED and the LMS grade switches (LMS_LTI_ENABLED +
// LMS_GRADE_PASSBACK_ENABLED); otherwise it does nothing. Bounded (cells and
// time). Run from the admin "Re-sync grades", the daily cron, and the Phase 4
// roster sync hook (afterRosterSync -> checkLmsResults(context)).

export const FRACTION_TOLERANCE = 0.005;
const DEFAULT_LIMIT = 100;
const DEFAULT_BUDGET_MS = 20_000;

export type LmsCheckTarget =
  | Pick<ILmsResourceLink, 'id' | 'contextId' | 'institutionId' | 'externalResourceLinkId'>
  | Pick<ILmsContext, 'id' | 'platformId' | 'institutionId' | 'externalContextId'>
  | { resourceLinkId?: string; contextId?: string; platformId?: string; institutionId?: string }
  | { all: true };

export interface LmsCheckSummary {
  skipped?: 'off';
  slots: number;
  inSync: number;
  differs: number;
  newlyFlagged: number;
  reverted: number;
  notComparable: number;
  errors: Record<string, number>;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const fraction = (given: number | null | undefined, max: number | null | undefined) =>
  typeof given === 'number' && typeof max === 'number' && Number.isFinite(given) && Number.isFinite(max) && max > 0 ? r4(given / max) : null;

/** Same value? Two scores: fractions within the tolerance. Two "no score": same. One of each: different. */
export function sameValue(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= FRACTION_TOLERANCE;
}

function linkFilter(target: LmsCheckTarget): Record<string, unknown> | null {
  if ('all' in target) return {};
  if ('externalResourceLinkId' in target) return { id: target.id, institutionId: target.institutionId };
  if ('externalContextId' in target) return { contextId: target.id, institutionId: target.institutionId };
  const t = target as { resourceLinkId?: string; contextId?: string; platformId?: string; institutionId?: string };
  if (t.resourceLinkId) return { id: t.resourceLinkId, ...(t.institutionId ? { institutionId: t.institutionId } : {}) };
  if (t.contextId) return { contextId: t.contextId, ...(t.institutionId ? { institutionId: t.institutionId } : {}) };
  if (t.platformId) return { platformId: t.platformId, ...(t.institutionId ? { institutionId: t.institutionId } : {}) };
  return null;
}

interface Slot {
  link: ILmsResourceLink;
  lmsUserId: string;
  lastCheckedAt: number;
}

async function candidateSlots(target: LmsCheckTarget, limit: number): Promise<Slot[]> {
  const f = linkFilter(target);
  if (!f) return [];
  let filter = f;
  if ('platformId' in f) {
    const contexts = await LmsContext.find({ platformId: f.platformId, ...(f.institutionId ? { institutionId: f.institutionId } : {}), status: 'active' }).select('id').limit(500).lean();
    filter = { contextId: { $in: contexts.map((c) => c.id) }, ...(f.institutionId ? { institutionId: f.institutionId } : {}) };
  }
  const links = await LmsResourceLink.find({ ...filter, enaraActivityId: { $exists: true } }).limit(500).lean();
  if (!links.length) return [];
  const byId = new Map(links.map((l) => [l.id, l]));
  const pairs = await LmsGradeSyncJob.aggregate<{ _id: { l: string; u: string } }>([
    { $match: { resourceLinkId: { $in: links.map((l) => l.id) } } },
    { $group: { _id: { l: '$resourceLinkId', u: '$lmsUserId' } } },
    { $limit: 5000 },
  ]);
  const states = await GradeLmsSlot.find({ resourceLinkId: { $in: links.map((l) => l.id) } }).select('resourceLinkId lmsUserId lastCheckedAt').lean();
  const checked = new Map(states.map((s) => [`${s.resourceLinkId}|${s.lmsUserId}`, s.lastCheckedAt?.getTime() ?? 0]));
  return pairs
    .map((p) => ({ link: byId.get(p._id.l)!, lmsUserId: p._id.u, lastCheckedAt: checked.get(`${p._id.l}|${p._id.u}`) ?? 0 }))
    .filter((s) => !!s.link)
    // Least recently checked first, so bounded runs go round every cell.
    .sort((x, y) => x.lastCheckedAt - y.lastCheckedAt)
    .slice(0, limit);
}

const ENARA_VALUE = (s: SentValue): LedgerValue => ({ points: s.scoreGiven ?? null, maxPoints: s.scoreMaximum ?? null, status: s.gradingProgress ?? null, fraction: fraction(s.scoreGiven, s.scoreMaximum) });
const LMS_VALUE = (score: number | null, max: number): LedgerValue => ({ points: score, maxPoints: max, status: 'lms', fraction: fraction(score, max) });

/**
 * Compares the LMS gradebook with what ENARA last sent, for every cell of a
 * resource link, an LMS course (context), a platform, or everything (cron).
 * Exported for the Phase 4 roster sync hook. Never throws.
 */
export async function checkLmsResults(target: LmsCheckTarget, opts: { limit?: number; budgetMs?: number; actor?: string } = {}): Promise<LmsCheckSummary> {
  const out: LmsCheckSummary = { slots: 0, inSync: 0, differs: 0, newlyFlagged: 0, reverted: 0, notComparable: 0, errors: {} };
  const flags = lmsFlags();
  if (!gradeLedgerOn() || !flags.lti || !flags.gradePassback) return { ...out, skipped: 'off' };
  const started = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const err = (code: string) => (out.errors[code] = (out.errors[code] ?? 0) + 1);
  try {
    const slots = await candidateSlots(target, Math.min(opts.limit ?? DEFAULT_LIMIT, 500));
    const { readLmsResult } = await import('../adapters/lti13/ags');
    for (const slot of slots) {
      if (Date.now() - started > budget) break;
      out.slots += 1;
      try {
        const r = await checkSlot(slot, readLmsResult);
        if (r === 'in_sync') out.inSync += 1;
        else if (r === 'flagged') {
          out.differs += 1;
          out.newlyFlagged += 1;
        } else if (r === 'still_differs') out.differs += 1;
        else if (r === 'reverted') out.reverted += 1;
        else if (r === 'not_comparable') out.notComparable += 1;
        else err(r.error);
      } catch (error) {
        err('internal_error');
        logger.warn('lms_result_check_failed', { resourceLinkId: slot.link.id, error: serializeError(error) });
      }
    }
  } catch (error) {
    err('internal_error');
    logger.warn('lms_result_check_failed', { error: serializeError(error) });
  }
  return out;
}

type SlotOutcome = 'in_sync' | 'flagged' | 'still_differs' | 'reverted' | 'not_comparable' | { error: string };

async function checkSlot(slot: Slot, readLmsResult: typeof import('../adapters/lti13/ags').readLmsResult): Promise<SlotOutcome> {
  const { link, lmsUserId } = slot;
  // A newer ENARA result on its way: compare once it is sent.
  if (await LmsGradeSyncJob.exists({ resourceLinkId: link.id, lmsUserId, status: { $in: ['pending', 'processing'] } })) return 'not_comparable';
  const sent = await lastSentForSlot(link.id, lmsUserId);
  if (!sent) return 'not_comparable';
  const [context, lmsUser, state] = await Promise.all([
    LmsContext.findOne({ id: link.contextId, institutionId: link.institutionId, status: 'active' }).lean(),
    LmsUser.findOne({ id: lmsUserId, institutionId: link.institutionId }).select('externalUserId platformId').lean(),
    GradeLmsSlot.findOne({ resourceLinkId: link.id, lmsUserId }).lean(),
  ]);
  if (!context || !lmsUser) return { error: 'not_eligible' };
  const platform = await LmsPlatform.findOne({ id: context.platformId, institutionId: link.institutionId }).lean();
  if (!platform || platform.status !== 'active') return { error: 'platform_not_active' };
  let lineItemUrl = link.lineItemUrl;
  if (!lineItemUrl && sent.jobId) {
    const job = await LmsGradeSyncJob.findOne({ id: sent.jobId }).select('lineItemRef').lean();
    if (job && /^https?:\/\//.test(job.lineItemRef)) lineItemUrl = job.lineItemRef;
  }
  if (!lineItemUrl) return { error: 'no_line_item' };

  const attempt = await AssessmentAttempt.findOne({ id: sent.attemptId }).select('id studentId assignmentId institutionId').lean();
  const keys = { resourceLinkId: link.id, lmsUserId };
  const base = { institutionId: link.institutionId, platformId: context.platformId, contextId: context.id, ...(attempt ? { studentId: attempt.studentId, assignmentId: attempt.assignmentId } : {}) };
  const read = await readLmsResult(platform, context, lineItemUrl, lmsUser.externalUserId);
  const now = new Date();
  if (!read.ok) {
    await GradeLmsSlot.updateOne(keys, { $set: { lastCheckedAt: now, lastCheckError: read.error.slice(0, 80) }, $setOnInsert: base }, { upsert: true });
    return { error: read.error };
  }
  await GradeLmsSlot.updateOne(keys, { $set: { lastCheckedAt: now }, $unset: { lastCheckError: 1 }, $setOnInsert: base }, { upsert: true });
  // No result at all in the LMS: nothing to compare (not treated as a change).
  if (!read.result) return 'not_comparable';

  const lmsFrac = fraction(read.result.resultScore, read.result.resultMaximum);
  const sentFrac = fraction(sent.scoreGiven, sent.scoreMaximum);
  // The reference: the last value sent, or the LMS value the teacher kept after it.
  const keptAfterSend = !!state?.agreedAt && state.agreedAt.getTime() >= sent.at.getTime();
  const ref = keptAfterSend ? (state!.agreedFraction ?? null) : sentFrac;
  // A score ENARA sent and an LMS cell with no score yet: not a teacher change we can act on.
  if (lmsFrac === null && ref !== null) return 'not_comparable';
  const enara = ENARA_VALUE(sent);
  const lms = LMS_VALUE(read.result.resultScore, read.result.resultMaximum);
  const lmsRef = { platformId: context.platformId, contextId: context.id, resourceLinkId: link.id, lmsUserId, ...(sent.jobId ? { jobId: sent.jobId } : {}) };

  if (sameValue(lmsFrac, ref)) {
    if (state?.status !== 'differs') return 'in_sync';
    // The LMS teacher put the value back: the hold ends by itself.
    const done = await GradeLmsSlot.updateOne({ ...keys, status: 'differs' }, { $set: { status: 'resolved', resolution: 'lms_matches_again', resolvedAt: now, resolvedBy: 'system' } });
    if (done.modifiedCount && attempt) await recordGradeChange(attempt.id, 'lms_change_reverted', 'system', { from: LMS_VALUE(state.lmsValue?.scoreGiven ?? null, state.lmsValue?.scoreMaximum ?? 1), to: lms, lms: lmsRef });
    return 'reverted';
  }

  if (state?.status === 'differs' && sameValue(state.lmsValue?.fraction ?? null, lmsFrac)) return 'still_differs';
  const lmsValue = { scoreGiven: read.result.resultScore, scoreMaximum: read.result.resultMaximum, fraction: lmsFrac };
  const enaraValue = { scoreGiven: sent.scoreGiven ?? null, scoreMaximum: sent.scoreMaximum ?? null, fraction: sentFrac, gradingProgress: sent.gradingProgress };
  const wasDiffering = state?.status === 'differs';
  await GradeLmsSlot.updateOne(keys, {
    $set: { status: 'differs', lmsValue, enaraValue, detectedAt: now, attemptId: sent.attemptId, ...(attempt ? { studentId: attempt.studentId, assignmentId: attempt.assignmentId } : {}) },
    $unset: { resolvedAt: 1, resolvedBy: 1, resolution: 1 },
  });
  if (attempt) await recordGradeChange(attempt.id, 'lms_change_detected', 'system', { from: enara, to: lms, lms: lmsRef });
  await writeLmsAudit({ event: 'grade.lms_changed', outcome: 'warn', institutionId: link.institutionId, platformId: context.platformId, refIds: { resourceLinkId: link.id, lmsUserId, attemptId: sent.attemptId } });
  return wasDiffering ? 'still_differs' : 'flagged';
}

// -------------------------------------------------- the teacher's decision

export class SlotDecisionError extends Error {
  constructor(public readonly code: 'not_found' | 'not_differing' | 'off') {
    super(code);
  }
}

/**
 * The ENARA teacher's answer for a cell marked "LMS value differs":
 *  - keep 'lms': ENARA records the LMS value (ledger `kept_lms_value`), sends
 *    nothing, and later checks compare against that value;
 *  - keep 'enara': ledger `kept_enara_value`, the hold ends and ENARA's
 *    current value is sent again.
 */
export async function decideLmsSlot(scope: { institutionId: string; assignmentId: string; studentId: string; resourceLinkId: string }, keep: 'lms' | 'enara', actor: string) {
  const flags = lmsFlags();
  if (!gradeLedgerOn() || !flags.lti || !flags.gradePassback) throw new SlotDecisionError('off');
  const slot = await GradeLmsSlot.findOne({ institutionId: scope.institutionId, assignmentId: scope.assignmentId, studentId: scope.studentId, resourceLinkId: scope.resourceLinkId }).lean();
  if (!slot) throw new SlotDecisionError('not_found');
  if (slot.status !== 'differs') throw new SlotDecisionError('not_differing');
  const now = new Date();
  const resolution = keep === 'lms' ? 'kept_lms_value' : 'kept_enara_value';
  const done = await GradeLmsSlot.updateOne(
    { id: slot.id, status: 'differs' },
    {
      $set: {
        status: 'resolved',
        resolution,
        resolvedAt: now,
        resolvedBy: actor,
        ...(keep === 'lms' ? { agreedFraction: slot.lmsValue?.fraction ?? null, agreedAt: now } : {}),
      },
      ...(keep === 'enara' ? { $unset: { agreedFraction: 1, agreedAt: 1 } } : {}),
    },
  );
  if (!done.modifiedCount) throw new SlotDecisionError('not_differing');
  const lmsValue = LMS_VALUE(slot.lmsValue?.scoreGiven ?? null, slot.lmsValue?.scoreMaximum ?? 1);
  const enaraValue: LedgerValue = { points: slot.enaraValue?.scoreGiven ?? null, maxPoints: slot.enaraValue?.scoreMaximum ?? null, status: slot.enaraValue?.gradingProgress ?? null, fraction: slot.enaraValue?.fraction ?? null };
  const lmsRef = { platformId: slot.platformId, contextId: slot.contextId, resourceLinkId: slot.resourceLinkId, lmsUserId: slot.lmsUserId };
  const link = await LmsResourceLink.findOne({ id: slot.resourceLinkId, institutionId: slot.institutionId }).lean();
  if (keep === 'lms') await recordGradeChange(slot.attemptId, resolution, actor, { from: enaraValue, to: lmsValue, lms: lmsRef });
  else {
    // What ENARA sends now: its current result for the cell (by scoring policy), which may be newer than the last one sent.
    const { linkResult } = await import('./outbox');
    const current = link ? await linkResult(link, scope.studentId) : null;
    const to: LedgerValue = current
      ? { points: current.score.scoreGiven ?? null, maxPoints: current.score.scoreMaximum, status: current.score.gradingProgress, fraction: fraction(current.score.scoreGiven, current.score.scoreMaximum) }
      : enaraValue;
    await recordGradeChange(current?.attemptId ?? slot.attemptId, resolution, actor, { from: lmsValue, to, lms: lmsRef });
  }
  await writeLmsAudit({ event: 'grade.lms_decision', outcome: 'ok', institutionId: slot.institutionId, platformId: slot.platformId, actor, refIds: { resourceLinkId: slot.resourceLinkId, lmsUserId: slot.lmsUserId, keep } });

  const jobIds: string[] = [];
  if (keep === 'enara') {
    // Jobs refused while the cell was held go back to the queue; the current result is queued again.
    const held = await LmsGradeSyncJob.find({ resourceLinkId: slot.resourceLinkId, lmsUserId: slot.lmsUserId, status: 'dead', lastError: LMS_VALUE_DIFFERS }).select('id').lean();
    if (held.length) {
      await LmsGradeSyncJob.updateMany({ id: { $in: held.map((j) => j.id) }, status: 'dead' }, { $set: { status: 'pending', attempts: 0, nextAttemptAt: now }, $unset: { leaseUntil: 1, leaseOwner: 1 } });
      jobIds.push(...held.map((j) => j.id));
    }
    if (link) {
      const { enqueueForLink } = await import('./outbox');
      const r = await enqueueForLink(link, scope.studentId, 'kept_enara_value', { force: true });
      if ((r.outcome === 'queued' || r.outcome === 'requeued') && r.jobId && !jobIds.includes(r.jobId)) jobIds.push(r.jobId);
    }
    const { scheduleInlinePush } = await import('./drain');
    scheduleInlinePush(jobIds);
  }
  return { resolution, jobIds };
}

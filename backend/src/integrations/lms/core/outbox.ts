import { createHash, randomUUID } from 'crypto';
import { AssessmentVersion, Assessment } from '../../../models/Assessment';
import { AssessmentAttempt } from '../../../models/AssessmentAttempt';
import { Assignment, type IAssignment } from '../../../models/Assignment';
import { Curriculum } from '../../../models/Curriculum';
import { User } from '../../../models/User';
import { logger, serializeError } from '../../../utils/logging';
import { LmsContext, LmsEnrollment, LmsGradeSyncJob, LmsPlatform, LmsResourceLink, LmsUser, type ILmsContext, type ILmsGradeSyncJob, type ILmsResourceLink } from '../models';
import { writeLmsAudit } from './audit';
import { AGS_SCOPE } from './capabilities';
import { lmsFlags } from './flags';
import { LMS_VALUE_DIFFERS, lmsSlotHeld, recordGradeSyncTry } from './gradeSyncLog';
import { effectivePolicy, pickForPolicy, toLmsScore, withNewerAttemptWaiting, type LmsScore, type ScoreAttempt, type ScoreCourse, type ScoreQuestion } from './scoring';

// The grade outbox (plan §5, Phase 3): lms_grade_sync_jobs.
//
// Keyed by LMS resource link + line item + LMS user, never by ENARA class.
// A job exists only for an attempt of a REAL student linked to that LMS user:
// the ENARA account is a student account of the same school whose studentId
// is the attempt's, linked (lms_users) to the LMS user, who is an active
// learner (lms_enrollments) of the link's course. A student preview has no
// student record and can write nothing, so it can never get here; the same
// check runs again right before sending.
//
// Idempotency key: hash of (resource link -> its line item, LMS user,
// attempt, grading progress, score, maximum, comment): the same result
// queued twice is one job. A newer result for the same slot (resource link + LMS user)
// replaces an older one still pending, and an older job is never sent after
// a newer one (its timestamp is older too: AGS keeps the newest).
//
// Claiming is atomic (pending -> processing, 2-minute lease; expired leases go
// back to pending). Failures retry on the long schedule 1 m, 5 m, 30 m, 2 h,
// 12 h (with jitter); the 5th failure, or a refusal a retry cannot fix, makes
// the job `dead` (shown to admins, who can retry it).

export const LEASE_MS = 2 * 60_000;
export const LONG_SCHEDULE_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
export const MAX_TRIES = LONG_SCHEDULE_MS.length;
export const DRAIN_BATCH = 20;
const DRAIN_BUDGET_MS = 25_000;
const QUICK_BUDGET_MS = 40_000;
let quickRetryMs = [2_000, 5_000, 15_000];

export const passbackOn = () => {
  const f = lmsFlags();
  return f.lti && f.gradePassback;
};

const sha = (parts: unknown[]) => createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|'), 'utf8').digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backoff after `tries` failed tries: the long schedule with +-10% jitter. */
export function backoffMs(tries: number, retryAfterSeconds?: number): number {
  const base = LONG_SCHEDULE_MS[Math.min(Math.max(tries, 1), LONG_SCHEDULE_MS.length) - 1];
  const jittered = Math.round(base * (0.9 + Math.random() * 0.2));
  return Math.max(jittered, (retryAfterSeconds ?? 0) * 1000);
}

// ----------------------------------------------------------- eligibility

interface LinkedStudent {
  lmsUserId: string;
  enaraUserId: string;
  studentId: string;
}

/** The LMS user of this ENARA student in this LMS course, or null (not a real, linked, enrolled learner). */
async function linkedStudent(studentId: string, institutionId: string, context: ILmsContext): Promise<LinkedStudent | null> {
  const user = await User.findOne({ studentId, institutionId, role: 'student', status: 'active' }).select('_id studentId').lean();
  if (!user) return null;
  const lmsUser = await LmsUser.findOne({ platformId: context.platformId, institutionId, enaraUserId: user._id.toString() }).select('id').lean();
  if (!lmsUser) return null;
  const enrolled = await LmsEnrollment.exists({ contextId: context.id, lmsUserId: lmsUser.id, institutionId, enaraRole: 'student', status: 'active' });
  return enrolled ? { lmsUserId: lmsUser.id, enaraUserId: user._id.toString(), studentId } : null;
}

/** The send-time re-check of a job (plan: check at enqueue AND before sending). Returns a code when it must not be sent. */
async function sendTimeProblem(job: ILmsGradeSyncJob): Promise<string | null> {
  const attempt = await AssessmentAttempt.findOne({ id: job.enaraAttemptId }).select('studentId institutionId assignmentId status anonymised').lean();
  if (!attempt || attempt.institutionId !== job.institutionId || attempt.anonymised || attempt.status !== 'submitted') return 'not_eligible';
  const link = job.resourceLinkId ? await LmsResourceLink.findOne({ id: job.resourceLinkId, institutionId: job.institutionId }).select('enaraActivityId contextId lineItemGoneAt').lean() : null;
  if (!link || link.enaraActivityId !== attempt.assignmentId || link.contextId !== job.contextId) return 'not_eligible';
  if (link.lineItemGoneAt) return LINE_ITEM_GONE;
  if (await Assignment.exists({ id: link.enaraActivityId, institutionId: job.institutionId, state: 'archived' })) return ASSIGNMENT_ARCHIVED;
  const context = await LmsContext.findOne({ id: job.contextId, institutionId: job.institutionId }).lean();
  if (!context || context.platformId !== job.platformId) return 'not_eligible';
  const who = await linkedStudent(attempt.studentId, job.institutionId, context);
  if (!who || who.lmsUserId !== job.lmsUserId) return 'not_eligible';
  // Grade ledger: the teacher changed this cell in the LMS; nothing is sent until an ENARA teacher decides.
  if (await lmsSlotHeld(job.resourceLinkId, job.lmsUserId)) return LMS_VALUE_DIFFERS;
  return null;
}

// --------------------------------------------------------------- scoring

/** Language course or not, and the activity's level (plan §2.1 rule 9). */
async function courseInfo(assignment: Pick<IAssignment, 'assessmentId' | 'institutionId' | 'format' | 'speaking'>): Promise<ScoreCourse> {
  const assessment = await Assessment.findOne({ id: assignment.assessmentId, institutionId: assignment.institutionId }).select('curriculumId').lean();
  const curriculum = assessment?.curriculumId
    ? await Curriculum.findOne({ id: assessment.curriculumId, institutionId: assignment.institutionId }).select('type level chapters.languageSpec').lean()
    : null;
  const languageCurriculum = !!curriculum && ((curriculum.chapters ?? []).some((c) => c.languageSpec && Object.keys(c.languageSpec).length > 0) || /\blanguage\b/i.test(curriculum.type ?? ''));
  const speaking = assignment.format === 'english_conversation';
  const language = speaking || languageCurriculum;
  return { language, level: language ? assignment.speaking?.cefrLevel ?? curriculum?.level : undefined, format: assignment.format };
}

type AttemptRow = ScoreAttempt & { assessmentId: string; assessmentVersion?: number };

export interface LinkResult {
  attemptId: string;
  score: LmsScore;
  /** latest policy, when the picked result waits for a teacher: the most recent RELEASED result, if any (owner decision G2). */
  lastReleased?: { attemptId: string; score: LmsScore };
}

/** The result this LMS user's gradebook cell should show for the link (scoring policy), or null. */
export async function linkResult(link: ILmsResourceLink, studentId: string): Promise<LinkResult | null> {
  if (!link.enaraActivityId) return null;
  const assignment = await Assignment.findOne({ id: link.enaraActivityId, institutionId: link.institutionId }).select('assessmentId institutionId format speaking').lean();
  if (!assignment) return null;
  const attempts = (await AssessmentAttempt.find({ assignmentId: link.enaraActivityId, studentId, institutionId: link.institutionId, status: 'submitted' })
    .select('id status assignmentId gradingStatus score totalPoints maxPoints answers.questionId answers.points answers.maxPoints answers.criterionScores submittedAt anonymised assessmentId assessmentVersion')
    .sort({ submittedAt: -1 })
    .limit(20)
    .lean()) as unknown as AttemptRow[];
  if (!attempts.length) return null;
  const versions = [...new Set(attempts.map((a) => a.assessmentVersion).filter((v): v is number => typeof v === 'number'))];
  const rows = versions.length ? await AssessmentVersion.find({ assessmentId: assignment.assessmentId, version: { $in: versions } }).select('version questions.id questions.type questions.topic questions.rubric').lean() : [];
  const questionsByVersion = new Map(rows.map((r) => [r.version, r.questions as unknown as ScoreQuestion[]]));
  const course = await courseInfo(assignment);
  const scored = attempts.map((attempt) => ({ attempt, score: toLmsScore(attempt, { questions: questionsByVersion.get(attempt.assessmentVersion ?? -1) ?? [], course }) }));
  const policy = effectivePolicy(link);
  const picked = pickForPolicy(scored, policy);
  if (!picked?.score) return null;
  // Newest first (the query's order).
  const released = policy === 'latest' && picked.score.gradingProgress === 'PendingManual' ? scored.find((c) => c.score?.gradingProgress === 'FullyGraded') : undefined;
  return { attemptId: picked.attempt.id, score: picked.score, ...(released?.score ? { lastReleased: { attemptId: released.attempt.id, score: released.score } } : {}) };
}

// --------------------------------------------------------------- enqueue

export type EnqueueOutcome =
  | 'queued'
  | 'requeued'
  | 'duplicate'
  | 'context_inactive'
  | 'platform_not_active'
  | 'no_ags'
  | 'not_graded'
  | 'no_score_scope'
  | 'not_linked'
  | 'nothing_to_send'
  | 'lineitem_gone'
  | 'assignment_archived'
  | 'kept_released';

/** Phase 3 follow-up codes (job lastError / enqueue outcome). */
export const LINE_ITEM_GONE = 'lineitem_gone';
export const ASSIGNMENT_ARCHIVED = 'assignment_archived';

const lineItemRefOf = (link: ILmsResourceLink) => link.lineItemUrl ?? `link:${link.id}`;

async function nextTimestamp(resourceLinkId: string, lmsUserId: string): Promise<Date> {
  const last = await LmsGradeSyncJob.findOne({ resourceLinkId, lmsUserId }).sort({ scoreTimestamp: -1 }).select('scoreTimestamp').lean();
  const now = Date.now();
  return new Date(last ? Math.max(now, last.scoreTimestamp.getTime() + 1) : now);
}

/**
 * Queues (or confirms) the job for one resource link and one ENARA student.
 * `force` (Re-sync): a result already sent is queued again with a new timestamp.
 */
export async function enqueueForLink(link: ILmsResourceLink, studentId: string, reason: string, opts: { force?: boolean } = {}): Promise<{ outcome: EnqueueOutcome; jobId?: string }> {
  // Phase 3 follow-ups: nothing for an activity the LMS said is gone (until it
  // is launched again), nor for an assignment a teacher archived.
  if (link.lineItemGoneAt) return { outcome: 'lineitem_gone' };
  // Phase 2: an item added through the picker without a grade column (practice).
  if ((link.customParams as Record<string, string> | undefined)?.enara_graded === '0') return { outcome: 'not_graded' };
  if (link.enaraActivityId && (await Assignment.exists({ id: link.enaraActivityId, institutionId: link.institutionId, state: 'archived' }))) return { outcome: 'assignment_archived' };
  const context = await LmsContext.findOne({ id: link.contextId, institutionId: link.institutionId, status: 'active' }).lean();
  if (!context) return { outcome: 'context_inactive' };
  const platform = await LmsPlatform.findOne({ id: context.platformId, institutionId: link.institutionId }).select('id status provider').lean();
  if (!platform || platform.status !== 'active') return { outcome: 'platform_not_active' };
  if (!link.lineItemUrl && !context.agsLineItemsUrl) return { outcome: 'no_ags' };
  if (context.agsScopes?.length && !context.agsScopes.includes(AGS_SCOPE.score)) return { outcome: 'no_score_scope' };
  const who = await linkedStudent(studentId, link.institutionId, context);
  if (!who) return { outcome: 'not_linked' };
  const result = await linkResult(link, studentId);
  if (!result) return { outcome: 'nothing_to_send' };
  let { score, attemptId } = result;
  // Owner decision G2 (latest policy): a newer attempt that waits for a teacher
  // (needs review, held for release) does not clear the gradebook cell. Once a
  // released score was queued or sent for this slot, PendingManual is not sent;
  // the most recent RELEASED result is sent again instead, its comment ending
  // "A newer attempt is waiting for teacher review." (so a teacher working only
  // in the LMS sees it). When the newer result is released it is sent as usual,
  // with its normal comment. With nothing ever released, PendingManual is sent
  // as before. (best never picks a pending attempt over a released one.)
  if (score.gradingProgress === 'PendingManual' && effectivePolicy(link) === 'latest' && (await LmsGradeSyncJob.exists({ resourceLinkId: link.id, lmsUserId: who.lmsUserId, gradingProgress: 'FullyGraded' }))) {
    await writeLmsAudit({ event: 'grade.kept_released', outcome: 'ok', institutionId: link.institutionId, platformId: context.platformId, refIds: { resourceLinkId: link.id, lmsUserId: who.lmsUserId, attemptId, reason } });
    if (!result.lastReleased) return { outcome: 'kept_released' };
    attemptId = result.lastReleased.attemptId;
    score = { ...result.lastReleased.score, comment: withNewerAttemptWaiting(result.lastReleased.score.comment) };
  }
  const lineItemRef = lineItemRefOf(link);
  // The resource link stands for its line item here: one link has one line item,
  // which may only be found or created at send time (lineItemRef changes then).
  const idempotencyKey = sha(['v1', link.id, who.lmsUserId, attemptId, score.gradingProgress, score.scoreGiven, score.scoreMaximum, score.comment]);
  const existing = await LmsGradeSyncJob.findOne({ idempotencyKey }).select('id status').lean();
  const audit = (event: string, jobId: string, extra: Record<string, unknown> = {}) =>
    writeLmsAudit({ event, outcome: 'ok', institutionId: link.institutionId, platformId: context.platformId, refIds: { jobId, resourceLinkId: link.id, lmsUserId: who.lmsUserId, attemptId, reason, gradingProgress: score.gradingProgress, ...extra } });

  if (existing) {
    if (!opts.force || existing.status !== 'sent') return { outcome: 'duplicate', jobId: existing.id };
    const scoreTimestamp = await nextTimestamp(link.id, who.lmsUserId);
    const res = await LmsGradeSyncJob.updateOne(
      { id: existing.id, status: 'sent' },
      { $set: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), scoreTimestamp, reason }, $unset: { lastError: 1, lastErrorAt: 1, leaseUntil: 1, leaseOwner: 1 } },
    );
    if (res.modifiedCount !== 1) return { outcome: 'duplicate', jobId: existing.id };
    await audit('grade.requeued', existing.id);
    return { outcome: 'requeued', jobId: existing.id };
  }

  const scoreTimestamp = await nextTimestamp(link.id, who.lmsUserId);
  const id = `lmsj_${randomUUID().replace(/-/g, '')}`;
  const res = await LmsGradeSyncJob.updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        id,
        idempotencyKey,
        institutionId: link.institutionId,
        platformId: context.platformId,
        contextId: context.id,
        resourceLinkId: link.id,
        lineItemRef,
        lmsUserId: who.lmsUserId,
        enaraAttemptId: attemptId,
        ...(typeof score.scoreGiven === 'number' ? { scoreGiven: score.scoreGiven } : {}),
        scoreMaximum: score.scoreMaximum,
        ...(score.levelScheme ? { levelScheme: score.levelScheme, levelLabel: score.levelLabel } : {}),
        comment: score.comment,
        activityProgress: score.activityProgress,
        gradingProgress: score.gradingProgress,
        scoreTimestamp,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        reason,
      },
    },
    { upsert: true },
  ).catch((error: { code?: number }) => {
    if (error.code === 11000) return { upsertedCount: 0 };
    throw error;
  });
  if (!res.upsertedCount) return { outcome: 'duplicate' };
  // A newer result replaces older ones of the same slot that were not sent yet.
  const superseded = await LmsGradeSyncJob.deleteMany({ resourceLinkId: link.id, lmsUserId: who.lmsUserId, status: 'pending', id: { $ne: id }, scoreTimestamp: { $lt: scoreTimestamp } });
  await audit('grade.queued', id, { superseded: superseded.deletedCount ?? 0 });
  return { outcome: 'queued', jobId: id };
}

/** A result changed (submitted, graded, released, corrected): queue it for every LMS placement of its assignment. */
export async function enqueueForAttempt(attemptId: string, reason: string): Promise<{ jobIds: string[]; outcomes: EnqueueOutcome[] }> {
  if (!passbackOn()) return { jobIds: [], outcomes: [] };
  const attempt = await AssessmentAttempt.findOne({ id: attemptId }).select('id studentId institutionId assignmentId status anonymised origin').lean();
  if (!attempt?.assignmentId || !attempt.institutionId || attempt.anonymised || attempt.origin === 'demo_seed' || attempt.status !== 'submitted') return { jobIds: [], outcomes: [] };
  const links = await LmsResourceLink.find({ institutionId: attempt.institutionId, enaraActivityId: attempt.assignmentId }).limit(20).lean();
  const jobIds: string[] = [];
  const outcomes: EnqueueOutcome[] = [];
  for (const link of links) {
    const r = await enqueueForLink(link, attempt.studentId, reason);
    outcomes.push(r.outcome);
    if (r.outcome === 'queued' && r.jobId) jobIds.push(r.jobId);
  }
  return { jobIds, outcomes };
}

// ------------------------------------------------------------ processing

export type ProcessOutcome = 'sent' | 'retry' | 'dead' | 'superseded' | 'lost';

async function releaseExpiredLeases(now = new Date()): Promise<number> {
  const r = await LmsGradeSyncJob.updateMany({ status: 'processing', leaseUntil: { $lt: now } }, { $set: { status: 'pending', nextAttemptAt: now }, $unset: { leaseUntil: 1, leaseOwner: 1 } });
  return r.modifiedCount ?? 0;
}

export interface DrainFilter {
  lmsUserId?: string;
  contextIds?: string[];
  platformId?: string;
  institutionId?: string;
  jobId?: string;
}

function filterQuery(f: DrainFilter = {}): Record<string, unknown> {
  return {
    ...(f.lmsUserId ? { lmsUserId: f.lmsUserId } : {}),
    ...(f.contextIds ? { contextId: { $in: f.contextIds } } : {}),
    ...(f.platformId ? { platformId: f.platformId } : {}),
    ...(f.institutionId ? { institutionId: f.institutionId } : {}),
    ...(f.jobId ? { id: f.jobId } : {}),
  };
}

/** Atomically claims one due job (pending -> processing with a 2-minute lease). */
export async function claimJob(filter: DrainFilter, owner: string, now = new Date()): Promise<ILmsGradeSyncJob | null> {
  return LmsGradeSyncJob.findOneAndUpdate(
    { status: 'pending', nextAttemptAt: { $lte: now }, ...filterQuery(filter) },
    { $set: { status: 'processing', leaseUntil: new Date(now.getTime() + LEASE_MS), leaseOwner: owner }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1 }, new: true },
  ).lean();
}

async function finish(job: ILmsGradeSyncJob, owner: string, update: Record<string, unknown>): Promise<boolean> {
  const r = await LmsGradeSyncJob.updateOne({ id: job.id, status: 'processing', leaseOwner: owner }, update);
  // Grade ledger sync log (inert unless GRADE_LEDGER_ENABLED): one append-only row per try.
  if (r.modifiedCount === 1) await recordGradeSyncTry(job, update.$set as Record<string, unknown> | undefined);
  return r.modifiedCount === 1;
}

/** Sends one claimed job. Quick retries (in-process, after the response) only for the inline push. */
export async function processClaimed(job: ILmsGradeSyncJob, owner: string, opts: { quick?: boolean; trigger?: string } = {}): Promise<ProcessOutcome> {
  const base = { institutionId: job.institutionId, platformId: job.platformId };
  const refs = { jobId: job.id, resourceLinkId: job.resourceLinkId, lmsUserId: job.lmsUserId, attemptId: job.enaraAttemptId, tries: job.attempts, trigger: opts.trigger };

  // Never send an older result after a newer one for the same slot.
  const newer = await LmsGradeSyncJob.exists({ resourceLinkId: job.resourceLinkId, lmsUserId: job.lmsUserId, id: { $ne: job.id }, scoreTimestamp: { $gt: job.scoreTimestamp }, status: { $in: ['pending', 'processing', 'sent'] } });
  if (newer) {
    await LmsGradeSyncJob.deleteOne({ id: job.id, leaseOwner: owner });
    await writeLmsAudit({ ...base, event: 'grade.superseded', outcome: 'ok', refIds: refs });
    return 'superseded';
  }

  const problem = await sendTimeProblem(job);
  if (problem) {
    const done = await finish(job, owner, { $set: { status: 'dead', lastError: problem, lastErrorAt: new Date() }, $unset: { leaseUntil: 1, leaseOwner: 1 } });
    await writeLmsAudit({ ...base, event: 'grade.failed', outcome: 'fail', code: problem, refIds: { ...refs, dead: true } });
    return done ? 'dead' : 'lost';
  }

  const platform = await LmsPlatform.findOne({ id: job.platformId }).select('provider').lean();
  // Loaded here, not at the top: the registry loads the adapters, which load the launch code, which loads this file.
  const { getProvider } = await import('../registry');
  const provider = platform ? getProvider(platform.provider) : undefined;
  const view = {
    id: job.id,
    platformId: job.platformId,
    institutionId: job.institutionId,
    contextId: job.contextId,
    resourceLinkId: job.resourceLinkId,
    lineItemRef: job.lineItemRef,
    lmsUserId: job.lmsUserId,
    scoreGiven: job.scoreGiven,
    scoreMaximum: job.scoreMaximum,
    comment: job.comment,
    activityProgress: job.activityProgress,
    gradingProgress: job.gradingProgress,
    timestamp: job.scoreTimestamp,
  };
  let result: Awaited<ReturnType<NonNullable<typeof provider>['pushScore'] & {}>> = { ok: false, retryable: false, error: 'no_provider' };
  if (provider?.pushScore) {
    const started = Date.now();
    const delays = opts.quick ? quickRetryMs : [];
    for (let i = 0; ; i++) {
      result = await provider.pushScore(view);
      if (result.ok || !result.retryable || i >= delays.length) break;
      if (Date.now() - started + delays[i] > QUICK_BUDGET_MS) break;
      await sleep(delays[i]);
    }
  }

  const lineItemRef = result.lineItemRef && result.lineItemRef !== job.lineItemRef ? { lineItemRef: result.lineItemRef } : {};
  if (result.ok) {
    const done = await finish(job, owner, { $set: { status: 'sent', sentAt: new Date(), ...lineItemRef }, $unset: { leaseUntil: 1, leaseOwner: 1, lastError: 1 } });
    await writeLmsAudit({ ...base, event: 'grade.sent', outcome: 'ok', refIds: { ...refs, gradingProgress: job.gradingProgress } });
    return done ? 'sent' : 'lost';
  }
  const dead = !result.retryable || job.attempts >= MAX_TRIES;
  const next = new Date(Date.now() + backoffMs(job.attempts, result.retryAfterSeconds));
  const done = await finish(job, owner, {
    $set: { status: dead ? 'dead' : 'pending', nextAttemptAt: next, lastError: result.error.slice(0, 80), lastErrorAt: new Date(), ...lineItemRef },
    $unset: { leaseUntil: 1, leaseOwner: 1 },
  });
  await writeLmsAudit({ ...base, event: 'grade.failed', outcome: dead ? 'fail' : 'warn', code: result.error.slice(0, 80), refIds: { ...refs, status: result.status ?? 0, dead } });
  return done ? (dead ? 'dead' : 'retry') : 'lost';
}

export interface DrainResult {
  claimed: number;
  sent: number;
  retry: number;
  dead: number;
  superseded: number;
  released: number;
}

/** A bounded drain: at most `limit` due jobs and `budgetMs` of work (Vercel: no long loops). */
export async function drainGradeJobs(opts: { limit?: number; budgetMs?: number; filter?: DrainFilter; trigger: string }): Promise<DrainResult> {
  const out: DrainResult = { claimed: 0, sent: 0, retry: 0, dead: 0, superseded: 0, released: 0 };
  if (!passbackOn()) return out;
  const owner = randomUUID();
  const started = Date.now();
  out.released = await releaseExpiredLeases();
  const limit = Math.min(opts.limit ?? DRAIN_BATCH, 500);
  const budget = opts.budgetMs ?? DRAIN_BUDGET_MS;
  while (out.claimed < limit && Date.now() - started < budget) {
    const job = await claimJob(opts.filter ?? {}, owner);
    if (!job) break;
    out.claimed += 1;
    try {
      const r = await processClaimed(job, owner, { trigger: opts.trigger });
      if (r !== 'lost') out[r] += 1;
    } catch (error) {
      // The lease runs out and the job goes back to pending.
      logger.warn('lms_grade_job_crashed', { jobId: job.id, error: serializeError(error) });
    }
  }
  return out;
}

/** The inline push of jobs just queued (plan §5 a+b): first try at once, quick retries in the same process. */
export async function pushNow(jobIds: string[], trigger = 'inline'): Promise<ProcessOutcome[]> {
  if (!passbackOn()) return [];
  const owner = randomUUID();
  const out: ProcessOutcome[] = [];
  for (const id of jobIds.slice(0, 5)) {
    const job = await claimJob({ jobId: id }, owner);
    if (!job) continue;
    out.push(await processClaimed(job, owner, { quick: true, trigger }).catch(() => 'lost' as const));
  }
  return out;
}

// ------------------------------------------------------------ admin acts

/** "Retry dead jobs": dead -> pending, tries reset. */
export async function retryDead(scope: { platformId: string; institutionId: string }, actor: string): Promise<number> {
  const r = await LmsGradeSyncJob.updateMany(
    { status: 'dead', platformId: scope.platformId, institutionId: scope.institutionId },
    { $set: { status: 'pending', attempts: 0, nextAttemptAt: new Date() }, $unset: { leaseUntil: 1, leaseOwner: 1 } },
  );
  const n = r.modifiedCount ?? 0;
  await writeLmsAudit({ event: 'grade.retry_dead', outcome: 'ok', institutionId: scope.institutionId, platformId: scope.platformId, actor, refIds: { jobs: n } });
  return n;
}

/** "Re-sync grades": queue the current result of every learner of every bound placement again (bounded). */
export async function resyncGrades(scope: { platformId: string; institutionId: string; resourceLinkId?: string }, actor: string, limits = { links: 100, students: 1000 }) {
  const contexts = await LmsContext.find({ platformId: scope.platformId, institutionId: scope.institutionId, status: 'active' }).select('id').limit(500).lean();
  const links = await LmsResourceLink.find({
    contextId: { $in: contexts.map((c) => c.id) },
    institutionId: scope.institutionId,
    enaraActivityId: { $exists: true },
    ...(scope.resourceLinkId ? { id: scope.resourceLinkId } : {}),
  })
    .limit(limits.links)
    .lean();
  const counts: Record<string, number> = {};
  const jobIds: string[] = [];
  let students = 0;
  for (const link of links) {
    const enrollments = await LmsEnrollment.find({ contextId: link.contextId, institutionId: scope.institutionId, enaraRole: 'student', status: 'active' }).select('lmsUserId').limit(limits.students).lean();
    const lmsUsers = await LmsUser.find({ id: { $in: enrollments.map((e) => e.lmsUserId) }, institutionId: scope.institutionId, enaraUserId: { $exists: true } }).select('enaraUserId').lean();
    const users = await User.find({ _id: { $in: lmsUsers.map((u) => u.enaraUserId) }, institutionId: scope.institutionId, role: 'student' }).select('studentId').lean();
    for (const u of users) {
      if (!u.studentId || students >= limits.students) continue;
      students += 1;
      const r = await enqueueForLink(link, u.studentId, 'resync', { force: true });
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      if ((r.outcome === 'queued' || r.outcome === 'requeued') && r.jobId) jobIds.push(r.jobId);
    }
  }
  await writeLmsAudit({ event: 'grade.resync', outcome: 'ok', institutionId: scope.institutionId, platformId: scope.platformId, actor, refIds: { links: links.length, students, queued: counts.queued ?? 0, requeued: counts.requeued ?? 0 } });
  return { links: links.length, students, outcomes: counts, jobIds };
}

/** Per-platform counts and the last error code, for the admin view. IDs and codes only. */
export async function gradeStats(platformIds: string[]) {
  if (!platformIds.length) return [];
  const grouped = await LmsGradeSyncJob.aggregate<{ _id: { p: string; s: string }; n: number }>([
    { $match: { platformId: { $in: platformIds } } },
    { $group: { _id: { p: '$platformId', s: '$status' }, n: { $sum: 1 } } },
  ]);
  return Promise.all(
    platformIds.map(async (platformId) => {
      const count = (s: string) => grouped.find((g) => g._id.p === platformId && g._id.s === s)?.n ?? 0;
      const [lastError, lastSent, dead] = await Promise.all([
        LmsGradeSyncJob.findOne({ platformId, lastError: { $exists: true } }).sort({ lastErrorAt: -1 }).select('lastError lastErrorAt').lean(),
        LmsGradeSyncJob.findOne({ platformId, status: 'sent' }).sort({ sentAt: -1 }).select('sentAt').lean(),
        LmsGradeSyncJob.find({ platformId, status: 'dead' }).sort({ updatedAt: -1 }).limit(10).select('id resourceLinkId lmsUserId enaraAttemptId lastError attempts updatedAt').lean(),
      ]);
      return {
        platformId,
        pending: count('pending'),
        processing: count('processing'),
        sent: count('sent'),
        dead: count('dead'),
        lastErrorCode: lastError?.lastError ?? null,
        lastErrorAt: lastError?.lastErrorAt ?? null,
        lastSentAt: lastSent?.sentAt ?? null,
        recentDead: dead.map((d) => ({ id: d.id, resourceLinkId: d.resourceLinkId ?? null, lmsUserId: d.lmsUserId, attemptId: d.enaraAttemptId, code: d.lastError ?? null, tries: d.attempts, at: d.updatedAt })),
      };
    }),
  );
}

/** Tests only: the in-process quick retry delays. */
export function setQuickRetriesForTests(ms: number[]): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  quickRetryMs = ms;
}

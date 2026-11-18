import { randomUUID } from 'crypto';
import { Assessment } from '../../../models/Assessment';
import { Assignment, type IAssignment } from '../../../models/Assignment';
import { LmsResourceLink, type ILmsContext, type ILmsResourceLink } from '../models';
import { institutionTimeZone } from '../../../services/institutionTimeZone';
import { writeLmsAudit } from './audit';
import { DUE_PARAM, MAX_DUE_AHEAD_MS, parseDueParam } from './dueDate';
import { TARGET_PARAM } from './pageTargets';
import type { GradableKind } from './scoring';

// Which ENARA work an LMS activity opens (Phase 3, until Phase 2's Activity
// Picker replaces it). The LMS activity carries one LTI custom parameter:
//
//   enara_assessment=<ENARA assessment id>    (a published assessment)
//   enara_assignment=<ENARA assignment id>    (an existing assignment)
//
// Both are checked against the launch's school: work from another school, an
// unknown id, an unpublished assessment or a draft/archived assignment refuses
// the launch (invalid_activity_binding) and nothing is bound. The LMS course's
// students are only in the course's own ENARA class, so the work is given to
// that class as an assignment ("materialized" once, race-safe): an assignment
// already in that class is used as it is; an assessment, or an assignment of
// another class, gets an assignment in the LMS class with the same settings.
// The resource link stores the binding (enaraActivityId = that assignment).
// A preview launch never binds or creates anything.
//
// Phase 2b: an activity that names a page instead (enara_target, pageTargets.ts)
// binds nothing; naming both a page and work refuses the launch
// (invalid_activity_binding, reason target_and_work).
// A due date picked in the activity picker (enara_due=<ISO UTC>, dueDate.ts)
// replaces the one-year default when the assignment is created at the first
// binding, and only then: later edits in ENARA win, and later launches never
// apply it again (the link is already bound). It is used only while it is
// still in the future (otherwise the default applies, and the audit says so).
// An assignment already in the course's class is used as it is: its own due
// date stays.

export const BINDING_PARAM = { assessment: 'enara_assessment', assignment: 'enara_assignment' } as const;
const ID = /^[A-Za-z0-9][\w.:-]{0,127}$/;
const SYSTEM_ACTOR = 'system:lms';
const DEFAULT_OPEN_DAYS = 365;

export type BindingSourceType = keyof typeof BINDING_PARAM;

export class BindingError extends Error {
  constructor(public readonly reason: 'malformed' | 'ambiguous' | 'target_and_work' | 'not_found' | 'not_published' | 'not_available') {
    super(reason);
    this.name = 'BindingError';
  }
}

export interface BindingRequest {
  type: BindingSourceType;
  id: string;
  /** Phase 2b: the due date picked in the activity picker (enara_due), if any. */
  due?: Date;
}

/** The binding the activity's custom parameters ask for; null when it names none. Throws BindingError when malformed. */
export function bindingRequest(custom: Record<string, string> | undefined): BindingRequest | null {
  const assessment = custom?.[BINDING_PARAM.assessment]?.trim();
  const assignment = custom?.[BINDING_PARAM.assignment]?.trim();
  if (!assessment && !assignment) return null;
  if (assessment && assignment) throw new BindingError('ambiguous');
  // Phase 2b: a page target and ENARA work are mutually exclusive.
  if (custom?.[TARGET_PARAM]?.trim()) throw new BindingError('target_and_work');
  const id = (assessment || assignment)!;
  // An unsubstituted LMS variable (e.g. "$ResourceLink.id") or anything that is not a plain id.
  if (!ID.test(id)) throw new BindingError('malformed');
  const due = parseDueParam(custom?.[DUE_PARAM]);
  return { type: assessment ? 'assessment' : 'assignment', id, ...(due ? { due } : {}) };
}

export interface ValidatedBinding extends BindingRequest {
  assessmentId: string;
  kind: GradableKind;
  /** Set when the source is an assignment. */
  assignment?: Pick<IAssignment, 'id' | 'classId' | 'assessmentId' | 'assessmentVersion' | 'title' | 'instructions' | 'opensAt' | 'dueAt' | 'closesAt' | 'timeZone' | 'latePolicy' | 'maxAttempts' | 'timeLimitMinutes' | 'releasePolicy' | 'answerReveal' | 'tutorPolicy' | 'assessmentKind' | 'format' | 'speaking'>;
  /** Set when the source is an assessment. */
  assessment?: { id: string; title: string; instructions?: string; publishedVersion: number; maxAttempts?: number; answerReveal?: IAssignment['answerReveal']; assessmentKind?: string };
}

const kindOf = (k: string | undefined): GradableKind => (k === 'practice' ? 'practice' : 'assessment');

/** Checks the requested work against the launch's school. Read-only. Throws BindingError. */
export async function validateBinding(req: BindingRequest, institutionId: string): Promise<ValidatedBinding> {
  if (req.type === 'assessment') {
    const a = await Assessment.findOne({ id: req.id, institutionId }).select('id title instructions lifecycle publishedVersion maxAttempts answerReveal assessmentKind').lean();
    if (!a) throw new BindingError('not_found');
    if (a.lifecycle !== 'published' || !(a.publishedVersion >= 1)) throw new BindingError('not_published');
    return {
      ...req,
      assessmentId: a.id,
      kind: kindOf(a.assessmentKind),
      assessment: { id: a.id, title: a.title, instructions: a.instructions, publishedVersion: a.publishedVersion, maxAttempts: a.maxAttempts, answerReveal: a.answerReveal, assessmentKind: a.assessmentKind },
    };
  }
  const s = await Assignment.findOne({ id: req.id, institutionId }).lean();
  if (!s) throw new BindingError('not_found');
  if (s.state !== 'published' && s.state !== 'closed') throw new BindingError('not_available');
  const assessment = await Assessment.findOne({ id: s.assessmentId, institutionId }).select('assessmentKind').lean();
  return { ...req, assessmentId: s.assessmentId, kind: kindOf(s.assessmentKind ?? assessment?.assessmentKind), assignment: s };
}

export type DueSource = 'picker' | 'picker_passed' | 'source' | 'default';

/** Creates the assignment of the bound work in the LMS course's own class. */
async function materialize(v: ValidatedBinding, context: ILmsContext, link: ILmsResourceLink): Promise<{ id: string; dueFrom: DueSource }> {
  const now = new Date();
  const s = v.assignment;
  const a = v.assessment;
  const later = new Date(now.getTime() + DEFAULT_OPEN_DAYS * 86_400_000);
  // Phase 2b: the picker's due date, while it is still in the future (and sane).
  const pickerDue = v.due && v.due.getTime() > now.getTime() && v.due.getTime() - now.getTime() <= MAX_DUE_AHEAD_MS + 86_400_000 ? v.due : undefined;
  const sourceDue = s && new Date(s.dueAt).getTime() > now.getTime() ? new Date(s.dueAt) : undefined;
  const dueAt = pickerDue ?? sourceDue ?? later;
  const dueFrom: DueSource = pickerDue ? 'picker' : v.due ? 'picker_passed' : sourceDue ? 'source' : 'default';
  const sourceOpens = s && new Date(s.opensAt).getTime() > now.getTime() ? new Date(s.opensAt) : undefined;
  const opensAt = sourceOpens && sourceOpens.getTime() < dueAt.getTime() ? sourceOpens : now;
  const id = `asg-lms-${randomUUID()}`;
  await Assignment.create({
    id,
    institutionId: context.institutionId,
    assessmentId: v.assessmentId,
    assessmentVersion: s ? s.assessmentVersion : a!.publishedVersion,
    title: (s?.title ?? a!.title).slice(0, 160),
    instructions: s?.instructions ?? a?.instructions,
    classId: context.enaraClassId!,
    state: 'published',
    opensAt,
    dueAt,
    ...(s?.latePolicy === 'accept_late' && s.closesAt && new Date(s.closesAt) > dueAt ? { closesAt: new Date(s.closesAt), latePolicy: 'accept_late' } : { latePolicy: 'not_accepted' }),
    timeZone: pickerDue ? await institutionTimeZone(context.institutionId) : s?.timeZone ?? 'UTC',
    maxAttempts: Math.min(10, Math.max(1, s?.maxAttempts ?? a?.maxAttempts ?? 1)),
    ...(s?.timeLimitMinutes ? { timeLimitMinutes: s.timeLimitMinutes } : {}),
    releasePolicy: s?.releasePolicy ?? 'auto',
    answerReveal: s?.answerReveal ?? a?.answerReveal ?? 'after-close',
    tutorPolicy: s?.tutorPolicy ?? 'hints_only',
    ...(s?.assessmentKind || a?.assessmentKind ? { assessmentKind: s?.assessmentKind ?? a?.assessmentKind } : {}),
    format: s?.format ?? 'written',
    // Accommodations name students of the other class; the LMS class starts with none.
    ...(s?.speaking ? { speaking: { ...s.speaking, accommodationStudentIds: [] } } : {}),
    extensions: [],
    createdBy: SYSTEM_ACTOR,
    history: [{ at: now, by: SYSTEM_ACTOR, action: 'published', detail: { lmsResourceLinkId: link.id, source: v.type, sourceId: v.id, dueFrom } }],
    origin: 'live',
  });
  return { id, dueFrom };
}

/**
 * Binds the resource link to the validated work (idempotent; race-safe: two
 * first launches at once keep one assignment). Returns the updated link.
 */
export async function bindResourceLink(link: ILmsResourceLink, context: ILmsContext, v: ValidatedBinding): Promise<ILmsResourceLink> {
  if (link.enaraSourceType === v.type && link.enaraSourceId === v.id && link.enaraActivityId) return link;
  if (!context.enaraClassId) return link;
  const direct = v.assignment && v.assignment.classId === context.enaraClassId ? v.assignment.id : undefined;
  const made = direct ? undefined : await materialize(v, context, link);
  const assignmentId = direct ?? made!.id;
  const won = await LmsResourceLink.findOneAndUpdate(
    { id: link.id, enaraSourceType: link.enaraSourceType ?? null, enaraSourceId: link.enaraSourceId ?? null },
    { $set: { enaraSourceType: v.type, enaraSourceId: v.id, enaraActivityId: assignmentId, activityKind: v.kind, boundAt: new Date() } },
    { new: true },
  ).lean();
  if (won) {
    await writeLmsAudit({
      event: 'activity.bound',
      outcome: 'ok',
      institutionId: context.institutionId,
      platformId: context.platformId,
      refIds: { resourceLinkId: link.id, contextId: context.id, source: v.type, sourceId: v.id, assignmentId, created: !direct, kind: v.kind, ...(made ? { dueFrom: made.dueFrom } : v.due ? { dueFrom: 'existing' } : {}) },
    });
    return won;
  }
  // Another launch bound it first: drop the assignment this one made.
  if (!direct) await Assignment.deleteOne({ id: assignmentId, createdBy: SYSTEM_ACTOR });
  return (await LmsResourceLink.findOne({ id: link.id }).lean()) ?? link;
}

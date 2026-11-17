import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { getConfig } from '../../../config/env';
import { Batch } from '../../../models/Batch';
import { CourseInstance } from '../../../models/CourseInstance';
import { Student } from '../../../models/Student';
import { User } from '../../../models/User';
import { enroll } from '../../../services/enrollment';
import { initialsFromName } from '../../../utils/idGenerator';
import { LmsContext, LmsEnrollment, LmsResourceLink, LmsUser, type ILmsContext, type ILmsResourceLink, type ILmsUser } from '../models';
import { checkSeatForNewStudent } from './seats';
import type { LmsEnaraRole } from './types';

// The LMS domain service (plan §2.2): turns a validated, provider-neutral
// launch into ENARA records. No protocol or vendor knowledge here: the LTI
// adapter (and later Google Classroom) call this with normalised data.
//
// Identity is (platform, external user id), never email. A new LMS person gets
// a new ENARA account with a reserved address (<lms user id>@lms.enara.test,
// never emailed); the LMS's own name and email stay in lms_users only.
//
// Context -> its own class (CourseInstance) and group (Batch), created on the
// first launch. Learners join the class through class_enrollments (scope
// 'class', source 'lms', lmsContextId) via services/enrollment.ts, and also
// through CourseInstance.studentIds while that field is still read by the app
// (multi-class steps 5-7), so old and new reads agree. Teachers are added to
// the class's instructorIds. Grades are never keyed by class (Phase 3 uses
// resource link + line item + LMS user).

export class LmsProvisionError extends Error {
  constructor(public readonly code: 'role_conflict' | 'account_disabled' | 'seat_limit_reached' | 'account_conflict', message?: string) {
    super(message ?? code);
    this.name = 'LmsProvisionError';
  }
}

export type ProvisionRole = Exclude<LmsEnaraRole, 'observer'>;

export interface ProvisionInput {
  platformId: string;
  institutionId: string;
  externalUserId: string;
  person: { email?: string; givenName?: string; familyName?: string; name?: string };
  role: ProvisionRole;
  rawRoles: string[];
  context: { externalId: string; title?: string; label?: string };
  resourceLink: { externalId: string; title?: string; customParams?: Record<string, string>; lineItemUrl?: string };
  services?: { nrpsUrl?: string; agsLineItemsUrl?: string };
}

export interface ProvisionResult {
  lmsUser: ILmsUser;
  enaraUserId: string;
  studentId?: string;
  createdUser: boolean;
  context: ILmsContext;
  createdContext: boolean;
  enaraClassId: string;
  enaraGroupId: string;
  resourceLink: ILmsResourceLink;
  seat?: { overLimit: boolean; seatsUsed?: number; seatLimit?: number };
}

const ENARA_ROLE: Record<ProvisionRole, 'student' | 'teacher' | 'admin'> = { student: 'student', teacher: 'teacher', admin: 'admin' };

function displayName(p: ProvisionInput['person']): string {
  const full = p.name?.trim() || [p.givenName, p.familyName].filter(Boolean).join(' ').trim();
  return (full || 'LMS user').slice(0, 120);
}

function academicYear(d = new Date()): string {
  const y = d.getUTCFullYear();
  return d.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const shortId = () => randomBytes(9).toString('base64url').replace(/[-_]/g, 'x');

async function upsertLmsUser(input: ProvisionInput): Promise<ILmsUser> {
  const person = {
    ...(input.person.email ? { email: input.person.email.slice(0, 254) } : {}),
    ...(input.person.givenName ? { givenName: input.person.givenName.slice(0, 120) } : {}),
    ...(input.person.familyName ? { familyName: input.person.familyName.slice(0, 120) } : {}),
  };
  const key = { platformId: input.platformId, externalUserId: input.externalUserId };
  try {
    return (await LmsUser.findOneAndUpdate(
      key,
      { $set: { ...person, lastLaunchAt: new Date() }, $setOnInsert: { institutionId: input.institutionId } },
      { upsert: true, new: true },
    ).lean())!;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return (await LmsUser.findOneAndUpdate(key, { $set: { ...person, lastLaunchAt: new Date() } }, { new: true }).lean())!;
  }
}

async function newStudentId(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = `STU${randomInt(10_000_000, 99_999_999)}`;
    if (!(await Student.exists({ id }))) return id;
  }
  return `STU${Date.now()}${randomInt(100, 999)}`;
}

/** Creates the ENARA account for a first-time LMS person; returns the winner if two launches race. */
async function createEnaraAccount(input: ProvisionInput, lmsUser: ILmsUser): Promise<{ userId: string; studentId?: string; created: boolean; seat?: ProvisionResult['seat'] }> {
  let seat: ProvisionResult['seat'];
  if (input.role === 'student') {
    const decision = await checkSeatForNewStudent(input.institutionId, lmsUser.id);
    if (!decision.allowed) throw new LmsProvisionError('seat_limit_reached');
    seat = { overLimit: decision.overLimit, seatsUsed: decision.seatsUsed, seatLimit: decision.seatLimit };
  }
  const name = displayName(input.person);
  const email = `${lmsUser.id}@lms.enara.test`.toLowerCase();
  const password = await bcrypt.hash(randomBytes(32).toString('base64url'), Math.min(getConfig().bcryptRounds, 10));
  let studentId: string | undefined;
  if (input.role === 'student') {
    studentId = await newStudentId();
    await Student.create({ id: studentId, name, email, grade: '', avatar: initialsFromName(name), institutionId: input.institutionId });
  }
  let user;
  try {
    user = await User.create({ email, password, role: ENARA_ROLE[input.role], name, institutionId: input.institutionId, ...(studentId ? { studentId } : {}) });
  } catch (error) {
    if (studentId) await Student.deleteOne({ id: studentId });
    if ((error as { code?: number }).code !== 11000) throw error;
    // Another launch for the same person won: use its account.
    const winner = await User.findOne({ email }).select('_id studentId').lean();
    if (!winner) throw error;
    await LmsUser.updateOne({ id: lmsUser.id, enaraUserId: { $exists: false } }, { $set: { enaraUserId: winner._id.toString() } });
    return { userId: winner._id.toString(), studentId: winner.studentId, created: false };
  }
  const userId = user._id.toString();
  const linked = await LmsUser.updateOne({ id: lmsUser.id, enaraUserId: { $exists: false } }, { $set: { enaraUserId: userId } });
  if (linked.modifiedCount !== 1) {
    // Lost a race after creating: undo ours, use the linked account.
    await User.deleteOne({ _id: user._id });
    if (studentId) await Student.deleteOne({ id: studentId });
    const row = await LmsUser.findOne({ id: lmsUser.id }).lean();
    const other = row?.enaraUserId ? await User.findById(row.enaraUserId).select('studentId').lean() : null;
    if (!other) throw new LmsProvisionError('account_conflict');
    return { userId: other._id.toString(), studentId: other.studentId, created: false };
  }
  return { userId, studentId, created: true, seat };
}

async function resolveAccount(input: ProvisionInput, lmsUser: ILmsUser) {
  if (!lmsUser.enaraUserId) return createEnaraAccount(input, lmsUser);
  const user = await User.findById(lmsUser.enaraUserId).select('role status institutionId studentId').lean();
  if (!user) {
    // The ENARA account was deleted by the school: start again with a new one.
    await LmsUser.updateOne({ id: lmsUser.id, enaraUserId: lmsUser.enaraUserId }, { $unset: { enaraUserId: 1 } });
    return createEnaraAccount(input, { ...lmsUser, enaraUserId: undefined });
  }
  if (user.institutionId !== input.institutionId) throw new LmsProvisionError('account_conflict');
  if (user.status !== 'active') throw new LmsProvisionError('account_disabled');
  // An account keeps the role it was created with: a launch never raises or
  // lowers it (a learner in one course who teaches another needs a decision).
  if (user.role !== ENARA_ROLE[input.role]) throw new LmsProvisionError('role_conflict');
  return { userId: user._id.toString(), studentId: user.studentId, created: false };
}

/** The context row and its ENARA class + group (created once, race-safe). */
async function ensureContext(input: ProvisionInput): Promise<{ context: ILmsContext; created: boolean }> {
  const key = { platformId: input.platformId, externalContextId: input.context.externalId };
  const set: Record<string, unknown> = {};
  if (input.context.title) set.title = input.context.title.slice(0, 200);
  if (input.context.label) set.label = input.context.label.slice(0, 120);
  if (input.services?.nrpsUrl) set.nrpsUrl = input.services.nrpsUrl;
  if (input.services?.agsLineItemsUrl) set.agsLineItemsUrl = input.services.agsLineItemsUrl;
  let context: ILmsContext;
  try {
    context = (await LmsContext.findOneAndUpdate(key, { $set: set, $setOnInsert: { institutionId: input.institutionId, status: 'active' } }, { upsert: true, new: true }).lean())!;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    context = (await LmsContext.findOneAndUpdate(key, { $set: set }, { new: true }).lean())!;
  }
  if (context.enaraClassId && context.enaraGroupId) return { context, created: false };

  const title = (context.title || context.label || 'LMS course').slice(0, 120);
  const year = academicYear();
  const groupId = `b-lms-${shortId()}`;
  const classId = `inst-lms-${shortId()}`;
  await Batch.create({ id: groupId, name: title, institutionId: input.institutionId, academicYear: year, studentCount: 0 });
  await CourseInstance.create({
    id: classId,
    courseId: `lms-${context.id}`,
    courseName: title.slice(0, 160),
    institutionId: input.institutionId,
    visibility: 'student',
    isDemo: false,
    academicYear: year,
    batchId: groupId,
    studentIds: [],
    instructorIds: [],
  });
  const won = await LmsContext.findOneAndUpdate(
    { id: context.id, enaraClassId: { $exists: false } },
    { $set: { enaraClassId: classId, enaraGroupId: groupId } },
    { new: true },
  ).lean();
  if (won) return { context: won, created: true };
  // Another launch created the class first: remove ours.
  await CourseInstance.deleteOne({ id: classId });
  await Batch.deleteOne({ id: groupId });
  return { context: (await LmsContext.findOne({ id: context.id }).lean())!, created: false };
}

async function upsertResourceLink(input: ProvisionInput, context: ILmsContext): Promise<ILmsResourceLink> {
  const key = { contextId: context.id, externalResourceLinkId: input.resourceLink.externalId };
  const set: Record<string, unknown> = {};
  if (input.resourceLink.customParams && Object.keys(input.resourceLink.customParams).length) set.customParams = input.resourceLink.customParams;
  if (input.resourceLink.lineItemUrl) set.lineItemUrl = input.resourceLink.lineItemUrl;
  try {
    return (await LmsResourceLink.findOneAndUpdate(
      key,
      { ...(Object.keys(set).length ? { $set: set } : {}), $setOnInsert: { institutionId: input.institutionId, presentation: 'iframe' } },
      { upsert: true, new: true },
    ).lean())!;
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return (await LmsResourceLink.findOne(key).lean())!;
  }
}

export async function provisionLaunch(input: ProvisionInput): Promise<ProvisionResult> {
  const lmsUser = await upsertLmsUser(input);
  const account = await resolveAccount(input, lmsUser);
  const { context, created: createdContext } = await ensureContext(input);
  const enaraClassId = context.enaraClassId!;
  const enaraGroupId = context.enaraGroupId!;

  await LmsEnrollment.updateOne(
    { contextId: context.id, lmsUserId: lmsUser.id },
    {
      $set: { ltiRoles: input.rawRoles.slice(0, 30).map((r) => r.slice(0, 200)), enaraRole: input.role, status: 'active' },
      $setOnInsert: { institutionId: input.institutionId, source: 'launch' },
    },
    { upsert: true },
  ).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
  });

  if (input.role === 'student' && account.studentId) {
    await enroll({ institutionId: input.institutionId, studentId: account.studentId, scope: 'class', targetId: enaraClassId, source: 'lms', lmsContextId: context.id });
    await CourseInstance.updateOne({ id: enaraClassId, institutionId: input.institutionId }, { $addToSet: { studentIds: account.studentId } });
  } else if (input.role === 'teacher') {
    await CourseInstance.updateOne({ id: enaraClassId, institutionId: input.institutionId }, { $addToSet: { instructorIds: account.userId } });
  }

  const resourceLink = await upsertResourceLink(input, context);
  return {
    lmsUser: { ...lmsUser, enaraUserId: account.userId },
    enaraUserId: account.userId,
    studentId: account.studentId,
    createdUser: account.created,
    context,
    createdContext,
    enaraClassId,
    enaraGroupId,
    resourceLink,
    seat: 'seat' in account ? account.seat : undefined,
  };
}

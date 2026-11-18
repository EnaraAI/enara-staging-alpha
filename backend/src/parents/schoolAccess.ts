import { AppError } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { recordAudit } from '../services/auditTrail';
import { parentSettingsEnabled } from './flags';

// Parents P1: THE place a school's parent access setting is read.
//   free (default, D1): parents linked to this school's children see them.
//   off: this school's children disappear from their parents' portal (every
//        learner endpoint answers 403 PARENT_SCHOOL_ACCESS_OFF, the child is
//        left out of the list, and a code for this school cannot be redeemed).
//        Links are NOT ended: switching back to Free shows them again.
// Children at other schools are unaffected. With PARENT_SETTINGS_ENABLED off,
// every school counts as Free (exactly the behaviour before P1).
// Only an ENARA admin changes it (audited); a school admin can see it.
export type ParentAccess = 'off' | 'free';
export const PARENT_ACCESS_VALUES: readonly ParentAccess[] = ['off', 'free'];
export const DEFAULT_PARENT_ACCESS: ParentAccess = 'free';
export const SCHOOL_ACCESS_OFF_MESSAGE = "Parent access is switched off at this child's school";

export function accessFromDoc(doc: { parentPortal?: { access?: string } } | null | undefined): ParentAccess {
  return doc?.parentPortal?.access === 'off' ? 'off' : DEFAULT_PARENT_ACCESS;
}

/** The school IDs (of those given) whose parent access is Off. Empty with the switch off. */
export async function schoolsWithAccessOff(institutionIds: (string | undefined)[]): Promise<Set<string>> {
  if (!parentSettingsEnabled()) return new Set();
  const ids = [...new Set(institutionIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Set();
  const off = await Institution.find({ id: { $in: ids }, 'parentPortal.access': 'off' }).select('id').lean();
  return new Set(off.map((s) => s.id));
}

export async function parentAccessOf(institutionId: string | undefined): Promise<ParentAccess> {
  if (!institutionId) return DEFAULT_PARENT_ACCESS;
  return (await schoolsWithAccessOff([institutionId])).has(institutionId) ? 'off' : DEFAULT_PARENT_ACCESS;
}

export function schoolAccessOffError() {
  return new AppError(SCHOOL_ACCESS_OFF_MESSAGE, 403, 'PARENT_SCHOOL_ACCESS_OFF');
}

/** ENARA admin only (the route checks the role; this checks the value). Audited when it changes. */
export async function setParentAccess(actor: { id: string; role: string }, institutionId: string, access: unknown) {
  if (actor.role !== 'enara-admin') throw new AppError('Only the ENARA team can change parent access', 403, 'FORBIDDEN');
  if (access !== 'off' && access !== 'free') throw new AppError('access must be off or free', 400, 'VALIDATION_ERROR');
  const school = await Institution.findOne({ id: institutionId });
  if (!school) throw new AppError('Institution not found', 404, 'NOT_FOUND');
  const before = accessFromDoc(school);
  if (before !== access || !school.parentPortal?.access) {
    school.parentPortal = { access, updatedAt: new Date(), updatedBy: actor.id };
    await school.save();
    await recordAudit('parent_access_changed', actor, { institutionId: school.id, type: 'institution', id: school.id }, { from: before, to: access });
  }
  return { institutionId: school.id, access };
}

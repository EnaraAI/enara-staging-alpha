import { randomUUID } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { Institution } from '../models/Institution';
import { recordAudit } from '../services/auditTrail';
import { SECTIONS, isSection, siteSectionOn, type Section } from './flags';

// THE place a school's parent-app sections are read: a section is on for a school only when its SCHOOL_APP_*_ENABLED site switch is on
// AND the school turned it on. A school turns on only what it has data for. School admin (own school) or ENARA admin; audited.
export async function schoolSections(institutionId: string | undefined): Promise<Record<Section, boolean>> {
  const out = Object.fromEntries(SECTIONS.map((s) => [s, false])) as Record<Section, boolean>;
  if (!institutionId) return out;
  const doc = await Institution.findOne({ id: institutionId }).select('schoolApp').lean();
  for (const s of SECTIONS) out[s] = siteSectionOn(s) && doc?.schoolApp?.sections?.[s] === true;
  return out;
}
export async function sectionOn(institutionId: string | undefined, s: Section) { return (await schoolSections(institutionId))[s]; }

export async function setSchoolSections(actor: { id: string; role: string; institutionId?: string }, institutionId: string, body: Record<string, unknown>) {
  if (actor.role !== 'enara-admin' && !(actor.role === 'admin' && actor.institutionId === institutionId)) throw new AppError('Access denied', 403, 'FORBIDDEN');
  const school = await Institution.findOne({ id: institutionId });
  if (!school) throw new AppError('Institution not found', 404, 'NOT_FOUND');
  const before = { ...(school.schoolApp?.sections ?? {}) } as Record<string, boolean | undefined>;
  const next = { ...before };
  for (const [k, v] of Object.entries(body)) {
    if (!isSection(k)) throw new AppError(`Unknown section ${k}`, 400, 'VALIDATION_ERROR');
    if (typeof v !== 'boolean') throw new AppError(`${k} must be true or false`, 400, 'VALIDATION_ERROR');
    if (v && !siteSectionOn(k)) throw new AppError(`${k} is not available yet`, 409, 'SECTION_NOT_AVAILABLE');
    next[k] = v;
  }
  school.schoolApp = { sections: next, updatedAt: new Date(), updatedBy: actor.id };
  school.markModified('schoolApp');
  await school.save();
  await recordAudit('school_app_sections_changed', actor, { institutionId, type: 'institution', id: institutionId }, { from: before, to: next });
  return { institutionId, sections: await schoolSections(institutionId) };
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;

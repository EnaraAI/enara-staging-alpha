// planner2: the learner signals the lesson planner needs that are not graded answers (goal, age).
// Rules (owner decision, 19 Nov 2026):
//  - goal: asked once at onboarding and editable. A teen or adult answers it themselves; for a child (or an unknown
//    age) the parent or the school sets it. The tutor never asks it in chat.
//  - age: from a staff- or parent-entered birth date; when the age band is unknown, the school and the parent are asked.
//    The learner is never asked their age, by the app or by the tutor.
import { Student, isLearningGoal, type LearningGoal } from '../models/Student';
import { Batch } from '../models/Batch';
import { Institution } from '../models/Institution';
import { ageFromBirthDate, resolveTrustedAgeBand } from './languageTeachingContext';
import { recordAudit } from './auditTrail';
import { AppError } from '../middleware/errorHandler';

export type SignalActor = { id?: string; role?: string };

/** A birth date accepted from a parent or the school: YYYY-MM-DD, age 3-100 today. */
export function parseBirthDate(v: unknown, now = new Date()): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new AppError('birthDate must be YYYY-MM-DD', 400, 'VALIDATION_ERROR');
  const d = new Date(`${v}T00:00:00Z`);
  const age = ageFromBirthDate(d, now);
  if (Number.isNaN(d.getTime()) || age === undefined || age < 3 || age > 100) throw new AppError('birthDate must give an age between 3 and 100', 400, 'VALIDATION_ERROR');
  return d;
}
export function parseGoal(v: unknown): LearningGoal {
  if (!isLearningGoal(v)) throw new AppError('goal must be one of work, exam, daily, school', 400, 'VALIDATION_ERROR');
  return v;
}

async function bandOf(studentId: string, institutionId?: string) {
  const s = await Student.findOne({ id: studentId, ...(institutionId ? { institutionId } : {}) }).select('+learnerAgeBand +birthDate id institutionId batchId uiMode learningGoal learningGoalSkippedAt').lean();
  if (!s) throw new AppError('Student not found', 404, 'NOT_FOUND');
  const [inst, batch] = await Promise.all([
    s.institutionId ? Institution.findOne({ id: s.institutionId }).select('learningSettings').lean() : null,
    s.batchId ? Batch.findOne({ id: s.batchId, institutionId: s.institutionId }).select('+learnerAgeBand').lean() : null,
  ]);
  // Birth date and kids mode count here whatever the switches: this is only "do we know the age band", never shown to the learner.
  const band = resolveTrustedAgeBand((inst as { learningSettings?: unknown } | null)?.learningSettings, s.learnerAgeBand, (batch as { learnerAgeBand?: unknown } | null)?.learnerAgeBand, { birthDate: s.birthDate, uiMode: s.uiMode });
  const fromBirth = ageFromBirthDate(s.birthDate, new Date());
  const effective = band.status === 'known' ? band.band : fromBirth !== undefined ? (fromBirth < 13 ? 'child' : fromBirth < 18 ? 'teen' : 'adult') : s.uiMode === 'kids' ? 'child' : 'unknown';
  return { student: s, band: effective as 'child' | 'teen' | 'adult' | 'unknown' };
}

/** What the student's own app may ask at onboarding. Never the age; the goal only for a teen or adult. */
export async function onboardingFor(studentId: string) {
  const { student, band } = await bandOf(studentId);
  const selfAnswers = band === 'teen' || band === 'adult';
  return {
    goal: student.learningGoal ?? null,
    askGoal: selfAnswers && !student.learningGoal && !student.learningGoalSkippedAt,
    // A child's goal (and any unknown age) is asked of the parent or school, not here.
    goalSetByAdult: !selfAnswers,
    options: ['work', 'exam', 'daily'] as const,
  };
}

export async function setGoal(studentId: string, goal: LearningGoal | null, by: 'student' | 'parent' | 'school', actor: SignalActor, institutionId?: string) {
  const { student, band } = await bandOf(studentId, institutionId);
  if (by === 'student' && !(band === 'teen' || band === 'adult')) throw new AppError('Your parent or school sets this', 403, 'GOAL_SET_BY_ADULT');
  await Student.updateOne({ id: student.id }, goal ? { $set: { learningGoal: goal, learningGoalSetAt: new Date(), learningGoalSetBy: by } } : { $unset: { learningGoal: 1, learningGoalSetAt: 1, learningGoalSetBy: 1 } });
  await recordAudit('learning_goal_changed', actor, { institutionId: student.institutionId, type: 'student', id: student.id }, { by, from: student.learningGoal ?? null, to: goal });
  return { id: student.id, goal };
}

export async function skipGoal(studentId: string) {
  await Student.updateOne({ id: studentId }, { $set: { learningGoalSkippedAt: new Date() } });
  return { skipped: true };
}

export async function setBirthDate(studentId: string, birthDate: Date | null, by: 'parent' | 'school', actor: SignalActor, institutionId?: string) {
  const { student } = await bandOf(studentId, institutionId);
  await Student.updateOne({ id: student.id }, birthDate ? { $set: { birthDate } } : { $unset: { birthDate: 1 } });
  // The date itself is not written to the audit detail (personal data); only that it changed and by whom.
  await recordAudit('learner_birth_date_changed', actor, { institutionId: student.institutionId, type: 'student', id: student.id }, { by, set: Boolean(birthDate) });
  return { id: student.id, birthDateSet: Boolean(birthDate) };
}

/** What a parent or the school is asked to fill in for one learner. */
export async function requestsFor(studentId: string, institutionId?: string) {
  const { student, band } = await bandOf(studentId, institutionId);
  const requests: ('birth_date' | 'goal')[] = [];
  if (band === 'unknown') requests.push('birth_date');
  if (!student.learningGoal && band !== 'teen' && band !== 'adult') requests.push('goal');
  return { id: student.id, ageBandKnown: band !== 'unknown', requests };
}

/** The school's list: learners with an unknown age band, and children with no goal. */
export async function missingForSchool(institutionId: string) {
  const students = await Student.find({ institutionId }).select('id name').sort({ name: 1 }).limit(5000).lean();
  const out: { id: string; name: string; requests: ('birth_date' | 'goal')[] }[] = [];
  for (const s of students) {
    const r = await requestsFor(s.id, institutionId);
    if (r.requests.length) out.push({ id: s.id, name: s.name, requests: r.requests });
  }
  return { count: out.length, students: out };
}

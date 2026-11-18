import { Assessment } from '../../../models/Assessment';
import { Assignment } from '../../../models/Assignment';
import { CourseInstance } from '../../../models/CourseInstance';
import { Curriculum } from '../../../models/Curriculum';
import { isLanguageCourse } from '../../../services/languageTeachingContext';
import { BINDING_PARAM } from './binding';
import { registerPickerType, type PickerItem } from './picker';

// The two item types of Phase 2 (owner decision P1): published assessments and
// existing assignments. Both open through the Phase 3 binding (the same custom
// parameters a teacher used to type by hand), so grades (Phase 3), the roster
// (Phase 4) and the ledger work unchanged. Practice gets no grade column
// (custom parameter enara_graded=0 keeps the grade outbox away from it).

export const NOT_GRADED_PARAM = 'enara_graded';

const ID = /^[A-Za-z0-9][\w.:-]{0,127}$/;
const graded = (kind?: string) => kind !== 'practice';
const pointsOf = (qs: { points?: number }[] = []) => qs.reduce((n, q) => n + (typeof q.points === 'number' ? q.points : 1), 0);

type LangInfo = Map<string, { level?: string; skills?: string[] }>;
async function languageInfo(institutionId: string, curriculumIds: string[]): Promise<LangInfo> {
  const out: LangInfo = new Map();
  const ids = [...new Set(curriculumIds.filter(Boolean))];
  if (!ids.length) return out;
  const rows = await Curriculum.find({ id: { $in: ids }, institutionId }).select('id type level chapters.languageSpec.skills').lean();
  for (const c of rows) {
    if (!isLanguageCourse(c.type)) continue;
    const skills = [...new Set((c.chapters ?? []).flatMap((ch: { languageSpec?: { skills?: string[] } }) => ch.languageSpec?.skills ?? []))].slice(0, 12);
    out.set(c.id, { level: c.level || undefined, skills: skills.length ? skills : undefined });
  }
  return out;
}

const ASSESSMENT_FIELDS = 'id title subject assessmentKind difficulty curriculumId questions.points instructions';
type AssessmentRow = { id: string; title: string; subject?: string; assessmentKind?: string; difficulty?: string; curriculumId?: string; questions?: { points?: number }[]; instructions?: string };

function assessmentItem(a: AssessmentRow, lang: LangInfo): PickerItem {
  const custom: Record<string, string> = { [BINDING_PARAM.assessment]: a.id };
  if (!graded(a.assessmentKind)) custom[NOT_GRADED_PARAM] = '0';
  return {
    type: 'assessment',
    id: a.id,
    title: a.title,
    description: a.instructions?.slice(0, 300) || undefined,
    subject: a.subject || undefined,
    kind: a.assessmentKind,
    difficulty: a.difficulty,
    language: a.curriculumId ? lang.get(a.curriculumId) : undefined,
    questions: a.questions?.length ?? 0,
    points: pointsOf(a.questions),
    graded: graded(a.assessmentKind),
    needsMedia: false,
    custom,
  };
}

registerPickerType({
  type: 'assessment',
  label: { en: 'Assessments', ar: 'التقييمات' },
  async list(institutionId, limit) {
    const rows = (await Assessment.find({ institutionId, lifecycle: 'published', publishedVersion: { $gte: 1 }, origin: { $ne: 'demo_seed' } })
      .select(ASSESSMENT_FIELDS).sort({ updatedAt: -1 }).limit(limit).lean()) as unknown as AssessmentRow[];
    const lang = await languageInfo(institutionId, rows.map((r) => r.curriculumId ?? ''));
    return rows.map((r) => assessmentItem(r, lang));
  },
  async resolve(institutionId, id) {
    if (!ID.test(id)) return null;
    const a = (await Assessment.findOne({ id, institutionId, lifecycle: 'published', publishedVersion: { $gte: 1 } }).select(ASSESSMENT_FIELDS).lean()) as unknown as AssessmentRow | null;
    if (!a) return null;
    return assessmentItem(a, await languageInfo(institutionId, [a.curriculumId ?? '']));
  },
});

type AssignmentRow = { id: string; title: string; classId: string; assessmentId: string; assessmentKind?: string; dueAt: Date; format?: string; speaking?: unknown; instructions?: string };
const ASSIGNMENT_FIELDS = 'id title classId assessmentId assessmentKind dueAt format speaking instructions';

async function assignmentItems(institutionId: string, rows: AssignmentRow[]): Promise<PickerItem[]> {
  const classes = new Map((await CourseInstance.find({ id: { $in: [...new Set(rows.map((r) => r.classId))] }, institutionId }).select('id courseName').lean()).map((c) => [c.id, c.courseName as string]));
  const assessments = new Map(
    ((await Assessment.find({ id: { $in: [...new Set(rows.map((r) => r.assessmentId))] }, institutionId }).select(ASSESSMENT_FIELDS).lean()) as unknown as AssessmentRow[]).map((a) => [a.id, a]),
  );
  const lang = await languageInfo(institutionId, [...assessments.values()].map((a) => a.curriculumId ?? ''));
  return rows.map((s) => {
    const a = assessments.get(s.assessmentId);
    const kind = s.assessmentKind ?? a?.assessmentKind;
    const media = !!s.speaking || s.format === 'conversation' || s.format === 'english_conversation';
    const custom: Record<string, string> = { [BINDING_PARAM.assignment]: s.id };
    if (!graded(kind)) custom[NOT_GRADED_PARAM] = '0';
    return {
      type: 'assignment',
      id: s.id,
      title: s.title,
      description: s.instructions?.slice(0, 300) || undefined,
      subject: a?.subject || undefined,
      kind: media ? 'speaking' : kind,
      difficulty: a?.difficulty,
      language: a?.curriculumId ? lang.get(a.curriculumId) : undefined,
      questions: a?.questions?.length,
      points: a ? pointsOf(a.questions) : undefined,
      graded: graded(kind),
      needsMedia: media,
      custom,
      meta: [classes.get(s.classId), s.dueAt ? new Date(s.dueAt).toISOString().slice(0, 10) : undefined].filter(Boolean).join(' · ') || undefined,
    };
  });
}

registerPickerType({
  type: 'assignment',
  label: { en: 'Assignments', ar: 'الواجبات' },
  async list(institutionId, limit) {
    const rows = (await Assignment.find({ institutionId, state: { $in: ['published', 'closed'] }, origin: { $ne: 'demo_seed' }, id: { $not: /^asg-lms-/ } })
      .select(ASSIGNMENT_FIELDS).sort({ dueAt: -1 }).limit(limit).lean()) as unknown as AssignmentRow[];
    return assignmentItems(institutionId, rows);
  },
  async resolve(institutionId, id) {
    if (!ID.test(id)) return null;
    const s = (await Assignment.findOne({ id, institutionId, state: { $in: ['published', 'closed'] } }).select(ASSIGNMENT_FIELDS).lean()) as unknown as AssignmentRow | null;
    return s ? (await assignmentItems(institutionId, [s]))[0] : null;
  },
});

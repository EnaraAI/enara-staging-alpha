import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';
import { CourseInstance } from '../models/CourseInstance';
import { DiagnosticSession } from '../models/DiagnosticSession';
import { LearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';
import { Student } from '../models/Student';
import { StudentMisconception } from '../models/StudentMisconception';
import { MasteryHistory, StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { classStudentIds, loadClassForStaff, resolveStudentForRead } from '../services/learningAccess';
import { originFilter, parseOriginView, studentsInView } from '../services/originScope';
import { buildPathway } from '../services/pathways';
import { retentionStatus } from '../services/retention';

const MAX_STUDENTS = 500;
const GAP = new Set(['emerging', 'developing']);

// GET /api/learning/students/:studentId/pathway
export const getPathway = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const pathway = await buildPathway(student);
  const { recommendations, ...rest } = pathway;
  res.json(rest);
});

// GET /api/learning/students/:studentId/recommendations
export const getRecommendations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const pathway = await buildPathway(student);
  res.json({ version: pathway.version, mode: pathway.mode, recommendations: pathway.recommendations });
});

// GET /api/learning/students/:studentId/retention
export const getRetention = asyncHandler(async (req: AuthRequest, res: Response) => {
  const student = await resolveStudentForRead(req, String(req.params.studentId));
  const states = await ObjectiveRetentionState.find({ studentId: student.id }).lean();
  const objectives = new Map(
    (await LearningObjective.find({ id: { $in: states.map((s) => s.objectiveId) } }).select('id code title').lean()).map((o) => [o.id, o]),
  );
  res.json({
    retention: states.map((s) => ({
      objectiveId: s.objectiveId,
      code: objectives.get(s.objectiveId)?.code,
      title: objectives.get(s.objectiveId)?.title,
      status: retentionStatus(s),
      nextReviewAt: s.nextReviewAt ?? null,
      lastSuccessfulRetrievalAt: s.lastSuccessfulRetrievalAt ?? null,
      consecutiveSuccessfulReviews: s.consecutiveSuccessfulReviews,
      schedulingVersion: s.schedulingVersion,
    })),
  });
});

// GET /api/learning/classes — classes the caller may look at.
export const listClasses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const filter: Record<string, unknown> =
    user.role === 'enara-admin' ? {} : { institutionId: user.institutionId, ...(user.role === 'teacher' ? { instructorIds: user.id } : {}) };
  const view = parseOriginView(req.query.origin);
  const classes = await CourseInstance.find({ ...filter, ...originFilter(view) }).sort({ courseName: 1 }).limit(500).lean();
  res.json({ origin: view, classes: classes.map((c) => ({ id: c.id, courseName: c.courseName, curriculumId: c.curriculumId, batchId: c.batchId, institutionId: c.institutionId })) });
});

// GET /api/learning/classes/:classId/insights — the class knowledge heatmap,
// common gaps, misconceptions to review, interventions, diagnostic completion
// and baseline-to-latest changes. Everything is computed from stored records.
export const getClassInsights = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Class scope first, then the demo/live view (?origin, default live). The
  // derived records below (mastery, misconceptions, interventions, history)
  // follow their students' origin.
  const cls = await loadClassForStaff(req, String(req.params.classId));
  const view = parseOriginView(req.query.origin);
  const studentIds = (await studentsInView(await classStudentIds(cls), view)).slice(0, MAX_STUDENTS);
  const [students, objectives] = await Promise.all([
    Student.find({ id: { $in: studentIds } }).select('id name').sort({ name: 1 }).lean(),
    LearningObjective.find({ institutionId: cls.institutionId, curriculumId: cls.curriculumId, status: 'approved' }).sort({ code: 1 }).lean(),
  ]);
  const objectiveIds = objectives.map((o) => o.id);
  const [states, misconceptions, interventions, diagnostics, history] = await Promise.all([
    StudentObjectiveMastery.find({ studentId: { $in: studentIds }, objectiveId: { $in: objectiveIds } }).lean(),
    StudentMisconception.find({ studentId: { $in: studentIds }, objectiveId: { $in: objectiveIds }, status: { $in: ['suspected', 'confirmed'] } }).lean(),
    LearningIntervention.find({ studentId: { $in: studentIds }, objectiveId: { $in: objectiveIds } }).lean(),
    DiagnosticSession.find({ studentId: { $in: studentIds }, courseId: cls.id, status: 'completed' }).select('studentId').lean(),
    MasteryHistory.find({ studentId: { $in: studentIds }, objectiveId: { $in: objectiveIds } }).sort({ at: 1 }).select('studentId objectiveId masteryEstimate at').lean(),
  ]);
  const key = (s: string, o: string) => `${s}|${o}`;
  const stateOf = new Map(states.map((s) => [key(s.studentId, s.objectiveId), s]));
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const codeOf = new Map(objectives.map((o) => [o.id, o.code]));

  const heatmap = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    cells: objectives.map((o) => {
      const m = stateOf.get(key(s.id, o.id));
      return {
        objectiveId: o.id,
        masteryStatus: m?.masteryStatus ?? 'not_assessed',
        masteryEstimate: m?.masteryEstimate ?? null,
        evidenceStrength: m?.evidenceStrength ?? 'none',
        needsVerification: m?.needsVerification ?? false,
      };
    }),
  }));

  const commonGaps = objectives
    .map((o) => {
      const withGap = students.filter((s) => {
        const m = stateOf.get(key(s.id, o.id));
        return m && GAP.has(m.masteryStatus) && m.independentEvidenceCount > 0;
      });
      const assessed = students.filter((s) => (stateOf.get(key(s.id, o.id))?.evidenceCount ?? 0) > 0).length;
      return { objectiveId: o.id, code: o.code, title: o.title, studentsWithGap: withGap.map((s) => ({ id: s.id, name: s.name })), assessed };
    })
    .filter((g) => g.studentsWithGap.length > 0)
    .sort((a, b) => b.studentsWithGap.length - a.studentsWithGap.length);

  const groups = new Map<string, { objectiveId: string; code?: string; category: string; description: string; items: { id: string; studentId: string; name?: string; status: string; confidence: number }[] }>();
  for (const m of misconceptions) {
    const k = `${m.objectiveId}|${m.description}`;
    const g = groups.get(k) ?? { objectiveId: m.objectiveId, code: codeOf.get(m.objectiveId), category: m.category, description: m.description, items: [] };
    g.items.push({ id: m.id, studentId: m.studentId, name: nameOf.get(m.studentId), status: m.status, confidence: m.confidence });
    groups.set(k, g);
  }

  const reassessed = interventions.filter((i) => i.outcome);
  // Baseline (first recorded estimate) vs latest, for students with 2+ records.
  const firstLast = new Map<string, { first: number | null; last: number | null; n: number }>();
  for (const h of history) {
    const k = key(h.studentId, h.objectiveId);
    const v = firstLast.get(k) ?? { first: h.masteryEstimate, last: h.masteryEstimate, n: 0 };
    v.last = h.masteryEstimate;
    v.n += 1;
    firstLast.set(k, v);
  }
  const change = objectives.map((o) => {
    const pairs = students
      .map((s) => firstLast.get(key(s.id, o.id)))
      .filter((v): v is { first: number; last: number; n: number } => !!v && v.n >= 2 && v.first !== null && v.last !== null);
    const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null);
    return { objectiveId: o.id, code: o.code, students: pairs.length, meanBaseline: mean(pairs.map((p) => p.first)), meanLatest: mean(pairs.map((p) => p.last)) };
  });

  res.json({
    origin: view,
    class: { id: cls.id, courseName: cls.courseName, curriculumId: cls.curriculumId },
    studentsShown: students.length,
    studentsTruncated: studentIds.length >= MAX_STUDENTS,
    objectives: objectives.map((o) => ({ id: o.id, code: o.code, title: o.title, prerequisiteObjectiveIds: o.prerequisiteObjectiveIds })),
    heatmap,
    commonGaps,
    misconceptionsToReview: [...groups.values()].sort((a, b) => b.items.length - a.items.length),
    interventions: {
      byStatus: ['assigned', 'in_progress', 'completed', 'cancelled'].map((status) => ({ status, count: interventions.filter((i) => i.status === status).length })),
      reassessed: reassessed.length,
      improvedAfterReassessment: reassessed.filter((i) => i.outcome?.improved).length,
      list: interventions
        .filter((i) => ['assigned', 'in_progress', 'completed'].includes(i.status))
        .map((i) => ({ id: i.id, studentId: i.studentId, name: nameOf.get(i.studentId), objectiveId: i.objectiveId, code: i.objectiveId ? codeOf.get(i.objectiveId) : undefined, status: i.status, assignedBy: i.assignedBy, outcome: i.outcome ?? null })),
    },
    diagnostics: { studentsCompleted: new Set(diagnostics.map((d) => d.studentId)).size, students: students.length },
    baselineToLatest: { note: 'Mean mastery estimate at each student\'s first and latest record. Describes change; does not show what caused it.', objectives: change },
  });
});

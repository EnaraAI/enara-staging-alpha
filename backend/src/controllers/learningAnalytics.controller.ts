import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { isGlobalAdmin, requireInstitutionId } from '../auth/authorization';
import { Assessment } from '../models/Assessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { CurriculumFileJob } from '../models/CurriculumChunk';
import { DiagnosticSession } from '../models/DiagnosticSession';
import { LearningEvidence } from '../models/LearningEvidence';
import { LearningIntervention } from '../models/LearningIntervention';
import { LearningObjective } from '../models/LearningObjective';
import { ObjectiveRetentionState } from '../models/ObjectiveRetentionState';
import { Student } from '../models/Student';
import { StudentMisconception } from '../models/StudentMisconception';
import { StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { loadCurriculumForStaff } from '../services/learningAccess';
import { processCurriculumFiles, syncCurriculumJobs } from '../services/curriculumExtraction';

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 30;

// Every number the school dashboard shows, with what it counts. Kept next to
// the code so the definitions can't drift from the queries.
export const METRIC_DEFINITIONS = {
  studentsTotal: 'Students on the school roster.',
  studentsWithEvidence: 'Students with at least one valid (not invalidated) evidence record for any objective.',
  objectivesApproved: 'Learning objectives a teacher has approved.',
  objectivesWithEvidence: 'Approved objectives with at least one valid evidence record from any student.',
  masteryDistribution: 'Student-objective estimates by status. "Not assessed" pairs are not stored and are not counted.',
  evidenceLast30Days: 'Valid evidence records with an occurrence time in the last 30 days, by evidence type.',
  diagnosticsCompletedLast30Days: 'Diagnostic sessions completed in the last 30 days.',
  interventions: 'Interventions by status; "improved" counts reassessed interventions whose reassessment showed a higher estimate. Describes change, not cause.',
  misconceptions: 'Misconception records by status (rule-detected or teacher-entered). Suspected records are hypotheses until a teacher confirms them.',
  retention: 'Scheduled objective reviews that are due or overdue now (overdue = more than 7 days past due).',
  curriculumFiles: 'Uploaded curriculum files by text-extraction status.',
  objectives: 'Per objective: students with evidence, and how many of them are estimated proficient or mastered. The estimate is a heuristic score, not a probability.',
} as const;

function institutionFor(req: AuthRequest) {
  if (isGlobalAdmin(req)) {
    const id = typeof req.query.institutionId === 'string' ? req.query.institutionId : '';
    if (!id) throw new AppError('institutionId query parameter is required', 400, 'VALIDATION_ERROR');
    return id;
  }
  return requireInstitutionId(req);
}

const countBy = <T extends string>(rows: { _id: T; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id ?? 'unknown', r.n]));

// GET /api/learning/analytics/school — school-wide learning analytics (admins).
export const getSchoolAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = institutionFor(req);
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const now = new Date();
  const valid = { institutionId, invalidatedAt: { $exists: false } };

  const [
    studentsTotal,
    studentsWithEvidence,
    objectives,
    objectivesWithEvidence,
    masteryRows,
    evidenceRows,
    diagnosticsCompleted,
    interventionRows,
    improved,
    misconceptionRows,
    retentionStates,
    fileRows,
    perObjective,
  ] = await Promise.all([
    Student.countDocuments({ institutionId }),
    LearningEvidence.distinct('studentId', valid).then((ids) => ids.length),
    LearningObjective.find({ institutionId, status: 'approved' }).select('id code title curriculumId').sort({ code: 1 }).lean(),
    LearningEvidence.distinct('objectiveId', valid),
    StudentObjectiveMastery.aggregate([{ $match: { institutionId } }, { $group: { _id: '$masteryStatus', n: { $sum: 1 } } }]),
    LearningEvidence.aggregate([{ $match: { ...valid, occurredAt: { $gte: since } } }, { $group: { _id: '$evidenceType', n: { $sum: 1 } } }]),
    DiagnosticSession.countDocuments({ institutionId, status: 'completed', completedAt: { $gte: since } }),
    LearningIntervention.aggregate([{ $match: { institutionId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    LearningIntervention.countDocuments({ institutionId, 'outcome.improved': true }),
    StudentMisconception.aggregate([{ $match: { institutionId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ObjectiveRetentionState.find({ institutionId, scheduled: true, nextReviewAt: { $lte: now } }).select('nextReviewAt').lean(),
    CurriculumFileJob.aggregate([{ $match: { institutionId, status: { $ne: 'removed' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    StudentObjectiveMastery.aggregate([
      { $match: { institutionId, evidenceCount: { $gt: 0 } } },
      {
        $group: {
          _id: '$objectiveId',
          assessed: { $sum: 1 },
          proficientOrMastered: { $sum: { $cond: [{ $in: ['$masteryStatus', ['proficient', 'mastered']] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const approvedIds = new Set(objectives.map((o) => o.id));
  const perObjectiveMap = new Map(perObjective.map((r: { _id: string; assessed: number; proficientOrMastered: number }) => [r._id, r]));
  const overdueCutoff = now.getTime() - 7 * DAY;
  const reassessed = await LearningIntervention.countDocuments({ institutionId, outcome: { $exists: true, $ne: null } });

  res.json({
    institutionId,
    generatedAt: now,
    windowDays: WINDOW_DAYS,
    definitions: METRIC_DEFINITIONS,
    metrics: {
      studentsTotal,
      studentsWithEvidence,
      objectivesApproved: objectives.length,
      objectivesWithEvidence: objectivesWithEvidence.filter((id) => approvedIds.has(id)).length,
      masteryDistribution: countBy(masteryRows),
      evidenceLast30Days: countBy(evidenceRows),
      diagnosticsCompletedLast30Days: diagnosticsCompleted,
      interventions: { byStatus: countBy(interventionRows), reassessed, improved },
      misconceptions: countBy(misconceptionRows),
      retention: {
        due: retentionStates.filter((s) => new Date(s.nextReviewAt!).getTime() >= overdueCutoff).length,
        overdue: retentionStates.filter((s) => new Date(s.nextReviewAt!).getTime() < overdueCutoff).length,
      },
      curriculumFiles: countBy(fileRows),
    },
    objectives: objectives.map((o) => {
      const r = perObjectiveMap.get(o.id);
      return { id: o.id, code: o.code, title: o.title, curriculumId: o.curriculumId, studentsAssessed: r?.assessed ?? 0, proficientOrMastered: r?.proficientOrMastered ?? 0 };
    }),
  });
});

const jobView = (j: Record<string, any>) => ({
  id: j.id,
  lessonId: j.lessonId,
  fileUrl: j.fileUrl,
  fileName: String(j.fileUrl).split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, ''),
  status: j.status,
  detail: j.detail ?? null,
  pages: j.pages ?? null,
  pagesWithText: j.pagesWithText ?? null,
  chunkCount: j.chunkCount ?? null,
  attempts: j.attempts,
  extractionVersion: j.extractionVersion ?? null,
  updatedAt: j.updatedAt,
});

// GET /api/learning/curricula/:id/processing — text extraction status per file.
export const getCurriculumProcessing = asyncHandler(async (req: AuthRequest, res: Response) => {
  const curriculum = await loadCurriculumForStaff(req, String(req.params.id));
  const jobs = await CurriculumFileJob.find({ curriculumId: curriculum.id, status: { $ne: 'removed' } }).sort({ lessonId: 1 }).lean();
  res.json({ curriculumId: curriculum.id, files: jobs.map(jobView) });
});

// POST /api/learning/curricula/:id/process — record jobs for every file and
// process a few now (admins). The rest are picked up by the daily job.
export const processCurriculum = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!['admin', 'enara-admin'].includes(req.user!.role)) throw new AppError('Admin access required', 403, 'FORBIDDEN');
  const curriculum = await loadCurriculumForStaff(req, String(req.params.id));
  await syncCurriculumJobs(curriculum);
  // Failed files get another try when an admin asks.
  if (req.body?.retryFailed) {
    await CurriculumFileJob.updateMany({ curriculumId: curriculum.id, status: 'failed' }, { $set: { attempts: 0 } });
  }
  const result = await processCurriculumFiles({ curriculumId: curriculum.id, limit: 3 });
  const jobs = await CurriculumFileJob.find({ curriculumId: curriculum.id, status: { $ne: 'removed' } }).sort({ lessonId: 1 }).lean();
  res.json({ processed: result.processed, files: jobs.map(jobView) });
});

const SECURE = new Set(['proficient', 'mastered']);
const MAX_STATES = 5000;

// GET /api/learning/analytics/shadow-comparison — for shadow mode (rollout
// stage C): compares each mastery estimate with the student's latest score on
// an existing assessment that has questions on that objective. The score is
// the whole assessment's, so it is a rough check, not ground truth; strong
// disagreements are listed for a person to review.
export const getShadowComparison = asyncHandler(async (req: AuthRequest, res: Response) => {
  const institutionId = institutionFor(req);
  const states = await StudentObjectiveMastery.find({ institutionId, evidenceCount: { $gt: 0 } })
    .select('studentId objectiveId masteryStatus masteryEstimate evidenceStrength')
    .limit(MAX_STATES)
    .lean();
  const objectiveIds = [...new Set(states.map((s) => s.objectiveId))];
  const assessments = await Assessment.find({ institutionId, 'questions.objectiveIds': { $in: objectiveIds } }).select('id title questions.objectiveIds').lean();
  const assessmentsFor = new Map<string, string[]>();
  for (const a of assessments) {
    for (const o of new Set((a.questions || []).flatMap((q: { objectiveIds?: string[] }) => q.objectiveIds || []))) {
      assessmentsFor.set(o, [...(assessmentsFor.get(o) ?? []), a.id]);
    }
  }
  const attempts = await AssessmentAttempt.find({
    institutionId,
    status: 'submitted',
    assessmentId: { $in: assessments.map((a) => a.id) },
    studentId: { $in: [...new Set(states.map((s) => s.studentId))] },
  })
    .select('studentId assessmentId assessmentTitle score submittedAt')
    .sort({ submittedAt: -1 })
    .lean();
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(`${a.studentId}|${a.assessmentId}`)) latest.set(`${a.studentId}|${a.assessmentId}`, a);

  const [objectives, students] = await Promise.all([
    LearningObjective.find({ id: { $in: objectiveIds } }).select('id code').lean(),
    Student.find({ id: { $in: [...new Set(states.map((s) => s.studentId))] } }).select('id name').lean(),
  ]);
  const codeOf = new Map(objectives.map((o) => [o.id, o.code]));
  const nameOf = new Map(students.map((s) => [s.id, s.name]));

  let agree = 0;
  let disagree = 0;
  let noScore = 0;
  const review: Record<string, unknown>[] = [];
  for (const s of states) {
    const candidates = (assessmentsFor.get(s.objectiveId) ?? [])
      .map((id) => latest.get(`${s.studentId}|${id}`))
      .filter((a): a is NonNullable<typeof a> => !!a && typeof a.score === 'number');
    const attempt = candidates.sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())[0];
    if (!attempt || s.masteryStatus === 'not_assessed') {
      noScore += 1;
      continue;
    }
    const score = attempt.score as number;
    const secure = SECURE.has(s.masteryStatus);
    if (secure === score >= 70) agree += 1;
    else disagree += 1;
    if ((secure && score < 50) || (s.masteryStatus === 'emerging' && score >= 80)) {
      review.push({
        studentId: s.studentId,
        name: nameOf.get(s.studentId),
        objectiveId: s.objectiveId,
        code: codeOf.get(s.objectiveId),
        masteryStatus: s.masteryStatus,
        masteryEstimate: s.masteryEstimate,
        evidenceStrength: s.evidenceStrength,
        assessmentTitle: attempt.assessmentTitle,
        assessmentScore: score,
      });
    }
  }
  res.json({
    institutionId,
    definitions: {
      agree: 'Estimate proficient/mastered and latest related assessment score 70% or more, or estimate emerging/developing and score below 70%.',
      disagree: 'The other cases.',
      noScore: 'Estimates without a submitted, scored assessment containing a question on that objective.',
      toReview: 'Strong disagreements: proficient/mastered with a score below 50%, or emerging with a score of 80% or more.',
      caveat: 'The assessment score covers the whole assessment, not only this objective. This is a sanity check, not a measure of accuracy.',
    },
    statesCompared: states.length,
    statesTruncated: states.length >= MAX_STATES,
    agree,
    disagree,
    noScore,
    toReview: review.slice(0, 200),
  });
});

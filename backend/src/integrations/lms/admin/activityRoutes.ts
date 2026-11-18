import { Router, type NextFunction, type Response } from 'express';
import { authMiddleware, type AuthRequest } from '../../../middleware/auth.middleware';
import { AppError, asyncHandler } from '../../../middleware/errorHandler';
import { loadClassForStaff } from '../../../services/learningAccess';
import { getOptionalId } from '../../../utils/validation';
import { ACTIVITY_NEEDS_MIC, activityOverview, activityReadiness, isActivityKind } from '../core/activities';
import { writeLmsAudit } from '../core/audit';
import { lmsFlags } from '../core/flags';

// LMS Phase 8: GET /api/lms/activities/:kind?classId=   (kind: tutor | avatar | diagnostic)
//
// The activity page of a launch asks this once when it opens. Signed-in
// student, teacher or school admin of the school (an LMS session, or a normal
// one). Answers whether the activity can start here, and why not (a code the
// page shows in English and Arabic, with the reference code), and that it
// sends no grade. Staff with a classId (a class they may see) also get the
// class's counts for the last 7 days. Never calls an AI provider; never 500s
// for a missing provider. 404 unless LMS_NO_GRADE_ACTIVITIES_ENABLED (and LTI)
// is on. Audit: lti.activity (IDs and codes only), outcome warn when not ready.

export const activityRouter = Router();

activityRouter.get(
  '/activities/:kind',
  (_req: AuthRequest, res: Response, next: NextFunction) => {
    if (!lmsFlags().noGradeActivities) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const kind = req.params.kind;
    if (!isActivityKind(kind)) throw new AppError('Unknown activity', 404, 'NOT_FOUND');
    if (!['student', 'teacher', 'admin'].includes(user.role) || !user.institutionId) throw new AppError('Not available for this account', 403, 'FORBIDDEN');
    const classId = getOptionalId(req.query as Record<string, unknown>, 'classId');
    const institutionId = user.institutionId;
    const student = user.role === 'student';

    let overview = null;
    let readiness;
    if (student) {
      readiness = await activityReadiness({ kind, institutionId, studentId: user.studentId, classId });
    } else if (classId) {
      // Teachers: only a class they teach; school admins: their school's (404 otherwise).
      const cls = await loadClassForStaff(req, classId);
      readiness = await activityReadiness({ kind, institutionId, staffClass: { id: cls.id, curriculumId: cls.curriculumId ?? undefined } });
      overview = await activityOverview(kind, { id: cls.id, institutionId, courseName: cls.courseName, studentIds: cls.studentIds, batchId: cls.batchId });
    } else {
      readiness = await activityReadiness({ kind, institutionId });
    }

    await writeLmsAudit({
      event: 'lti.activity',
      outcome: readiness.ready ? 'ok' : 'warn',
      institutionId,
      code: readiness.code,
      refIds: { activity: kind, role: user.preview ? 'preview' : user.role, enaraClassId: classId, ready: readiness.ready },
    });
    res.json({
      kind,
      ready: readiness.ready,
      code: readiness.code ?? null,
      graded: false,
      needsMicrophone: ACTIVITY_NEEDS_MIC[kind],
      classId: classId ?? null,
      overview,
    });
  }),
);

import { logger, serializeError } from '../../../utils/logging';
import { lmsFlags } from './flags';

// The one call ENARA's grading code makes into the LMS layer (plan §8): "this
// attempt's result changed" (submitted, graded, finalized, released,
// corrected, regraded). With LMS_GRADE_PASSBACK_ENABLED (or LMS_LTI_ENABLED)
// off it returns at once and loads nothing. On, it queues the grade job(s) for
// the attempt's LMS placements (outbox.ts decides whether there are any and
// whether the result may be sent) and pushes them in the background after the
// response. It never throws and never changes the grade.
//
// On real schools LMS_GRADE_PASSBACK_ENABLED stays off until the grader meets
// the ESL6 accuracy bar (plan §6); test LMSs only until then.
export async function lmsResultChanged(attemptId: string | undefined, reason: string): Promise<void> {
  const flags = lmsFlags();
  if (!attemptId || !flags.lti || !flags.gradePassback) return;
  try {
    const { enqueueForAttempt } = await import('./outbox');
    const { scheduleInlinePush } = await import('./drain');
    const { jobIds } = await enqueueForAttempt(attemptId, reason);
    scheduleInlinePush(jobIds);
  } catch (error) {
    logger.warn('lms_grade_enqueue_failed', { attemptId, reason, error: serializeError(error) });
  }
}

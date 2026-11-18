import { LmsUser } from '../models';
import { lmsFlags } from './flags';

// P0 item 6: a student whose ENARA account came from an LMS (an lms_users row
// links to it). Their work goes through class assignments, which reach the
// LMS gradebook; the older assignment-less attempts are refused for them
// (LMS_USE_CLASS_ASSIGNMENT) and the app hides the older "Assessments" tab.
// Inert (always false) while LMS launches are off.
export async function isLmsStudentAccount(user: { id: string; role: string; institutionId?: string | null } | null | undefined): Promise<boolean> {
  if (!user || user.role !== 'student' || !user.institutionId || !lmsFlags().lti) return false;
  return Boolean(await LmsUser.exists({ enaraUserId: user.id, institutionId: user.institutionId }));
}

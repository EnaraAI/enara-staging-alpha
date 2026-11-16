import { getConfig } from '../../../config/env';

// Effective LMS switches. A flag is on only when it is set AND the LMS
// configuration has no problem (e.g. a missing or malformed LMS_KEK).
export interface LmsFlags {
  lti: boolean;
  googleClassroom: boolean;
  gradePassback: boolean;
  problem?: string;
}

export function lmsFlags(): LmsFlags {
  const lms = getConfig().lms;
  const ok = !lms.problem;
  return {
    lti: ok && lms.ltiEnabled,
    googleClassroom: ok && lms.googleClassroomEnabled,
    gradePassback: ok && lms.gradePassbackEnabled,
    problem: lms.problem,
  };
}

export function anyLmsFlagSet(): boolean {
  const lms = getConfig().lms;
  return lms.ltiEnabled || lms.googleClassroomEnabled || lms.gradePassbackEnabled;
}

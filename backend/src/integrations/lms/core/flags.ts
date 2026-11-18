import { getConfig } from '../../../config/env';

// Effective LMS switches. A flag is on only when it is set AND the LMS
// configuration has no problem (e.g. a missing or malformed LMS_KEK).
export interface LmsFlags {
  lti: boolean;
  googleClassroom: boolean;
  gradePassback: boolean;
  /** Phase 4 roster sync (NRPS). On only with LMS_LTI_ENABLED too. */
  roster: boolean;
  problem?: string;
}

export function lmsFlags(): LmsFlags {
  const lms = getConfig().lms;
  const ok = !lms.problem;
  return {
    lti: ok && lms.ltiEnabled,
    googleClassroom: ok && lms.googleClassroomEnabled,
    gradePassback: ok && lms.gradePassbackEnabled,
    roster: ok && lms.ltiEnabled && lms.rosterSyncEnabled,
    problem: lms.problem,
  };
}

export function anyLmsFlagSet(): boolean {
  const lms = getConfig().lms;
  return lms.ltiEnabled || lms.googleClassroomEnabled || lms.gradePassbackEnabled || lms.rosterSyncEnabled;
}

/** Phase 1a settings read by the LTI and admin routes. */
export function lmsSettings(): { toolBaseUrl?: string; schoolConnectionsRequireApproval: boolean } {
  const lms = getConfig().lms;
  return { toolBaseUrl: lms.toolBaseUrl, schoolConnectionsRequireApproval: lms.schoolConnectionsRequireApproval };
}

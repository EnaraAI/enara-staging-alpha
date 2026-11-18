import { getConfig } from '../../../config/env';
import { logger } from '../../../utils/logging';

// Effective LMS switches. A flag is on only when it is set AND the LMS
// configuration has no problem (e.g. a missing or malformed LMS_KEK).
export interface LmsFlags {
  lti: boolean;
  googleClassroom: boolean;
  gradePassback: boolean;
  /** Phase 4 roster sync (NRPS). On only with LMS_LTI_ENABLED too. */
  roster: boolean;
  /** Phase 2 activity picker (LTI Deep Linking). On only with LMS_LTI_ENABLED too. */
  deepLinking: boolean;
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
    deepLinking: ok && lms.ltiEnabled && lms.deepLinkingEnabled,
    problem: lms.problem,
  };
}

export function anyLmsFlagSet(): boolean {
  const lms = getConfig().lms;
  return lms.ltiEnabled || lms.googleClassroomEnabled || lms.gradePassbackEnabled || lms.rosterSyncEnabled || lms.deepLinkingEnabled;
}

/** Phase 1a settings read by the LTI and admin routes. */
export function lmsSettings(): { toolBaseUrl?: string; schoolConnectionsRequireApproval: boolean; platformStorageEnabled: boolean } {
  const lms = getConfig().lms;
  return { toolBaseUrl: lms.toolBaseUrl, schoolConnectionsRequireApproval: lms.schoolConnectionsRequireApproval, platformStorageEnabled: lms.platformStorageEnabled !== false };
}

let startupLogged = false;
/**
 * Logs the LMS configuration problem (the LMS is off) or warning once per
 * process, at startup (createApp). Names variables only, never values.
 */
export function logLmsConfigOnce(): void {
  if (startupLogged || !anyLmsFlagSet()) return;
  startupLogged = true;
  const { problem, warning } = getConfig().lms;
  if (problem) logger.error('lms_config_problem', { problem, effect: 'LMS integration is off' });
  if (warning) logger.warn('lms_config_warning', { warning });
}

/** Tests only. */
export function resetLmsConfigLogForTests(): void {
  startupLogged = false;
}

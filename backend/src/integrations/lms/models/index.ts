import { LmsAuditLog } from './audit';
import { LmsContext, LmsEnrollment, LmsLineItem, LmsResourceLink, LmsUser } from './context';
import { GoogleConnection } from './google';
import { LmsGradeSyncJob, LmsLock } from './outbox';
import { LmsDeployment, LmsPlatform } from './platform';
import { LmsOrgSettings } from './seats';
import { LmsAccessToken, LmsOidcState, LmsToolKey } from './security';
import { LmsLaunchToken } from './session';

export * from './audit';
export * from './context';
export * from './google';
export * from './outbox';
export * from './platform';
export * from './seats';
export * from './security';
export * from './session';

// Every LMS model (13 from Spec §4 plus lms_locks). Used by the index
// migration and the cleanup script.
export const LMS_MODELS = [
  LmsPlatform,
  LmsDeployment,
  LmsContext,
  LmsUser,
  LmsEnrollment,
  LmsResourceLink,
  LmsLineItem,
  LmsGradeSyncJob,
  LmsToolKey,
  LmsOidcState,
  LmsAccessToken,
  GoogleConnection,
  LmsAuditLog,
  LmsLock,
] as const;

// Added in Phase 1a (their own migration, 2026-11-17-lms-phase1a-indexes; the
// Phase 0 list above stays as it was so that migration never changes).
export const LMS_PHASE1A_MODELS = [LmsLaunchToken, LmsOrgSettings] as const;

/** Every LMS collection, for the cleanup script. */
export const ALL_LMS_MODELS = [...LMS_MODELS, ...LMS_PHASE1A_MODELS] as const;

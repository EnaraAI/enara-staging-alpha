import { LmsAuditLog } from './audit';
import { LmsContext, LmsEnrollment, LmsLineItem, LmsResourceLink, LmsUser } from './context';
import { GoogleConnection } from './google';
import { LmsGradeSyncJob, LmsLock } from './outbox';
import { LmsDeployment, LmsPlatform } from './platform';
import { LmsAccessToken, LmsOidcState, LmsToolKey } from './security';

export * from './audit';
export * from './context';
export * from './google';
export * from './outbox';
export * from './platform';
export * from './security';

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

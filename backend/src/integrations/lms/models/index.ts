import { LmsAuditLog } from './audit';
import { LmsContext, LmsEnrollment, LmsLineItem, LmsResourceLink, LmsUser } from './context';
import { GoogleConnection } from './google';
import { LmsGradeSyncJob, LmsLock } from './outbox';
import { LmsDeployment, LmsPlatform } from './platform';
import { LmsRegistrationCode } from './registration';
import { LmsOrgSettings } from './seats';
import { LmsAccessToken, LmsOidcState, LmsToolKey } from './security';
import { LmsDeepLinkSession, LmsHandoffCode, LmsLaunchToken } from './session';
import { LmsMicDaily } from './telemetry';
import { LmsSuppressedIdentity } from './suppression';

export * from './audit';
export * from './context';
export * from './google';
export * from './outbox';
export * from './platform';
export * from './registration';
export * from './seats';
export * from './security';
export * from './session';
export * from './suppression';
export * from './telemetry';

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

// Added in Phase 2 (migration 2026-11-20-lms-phase2-deep-linking).
export const LMS_PHASE2_MODELS = [LmsDeepLinkSession] as const;

// Added in Priority 0 (migration 2026-11-21-lms-p0-suppressed-identities): the
// PDPL suppression list. Kept by the drop script unless asked (see lmsDropCollections.ts).
export const LMS_P0_MODELS = [LmsSuppressedIdentity] as const;

// Added for the mic / new-tab fixes (migration 2026-11-22-lms-mic-handoff):
// the one-time "Open in new tab" codes and the daily mic counters.
export const LMS_MIC_MODELS = [LmsHandoffCode, LmsMicDaily] as const;

// Added in Phase 1b (migration 2026-11-23-lms-phase1b-registration): the
// one-URL "Connect Moodle" links (LTI Dynamic Registration).
export const LMS_PHASE1B_MODELS = [LmsRegistrationCode] as const;

/** Every LMS collection, for the cleanup script and the tests. */
export const ALL_LMS_MODELS = [...LMS_MODELS, ...LMS_PHASE1A_MODELS, ...LMS_PHASE2_MODELS, ...LMS_P0_MODELS, ...LMS_MIC_MODELS, ...LMS_PHASE1B_MODELS] as const;

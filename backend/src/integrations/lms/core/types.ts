// Provider-neutral LMS types (Spec §3.1, docs/lms/IMPLEMENTATION_PLAN.md §2).
// ENARA core and the LMS domain service use only these. Vendor names and
// vendor rules live in presets/ (data) and adapters/ (protocol code), nowhere else.

/** A protocol family. A new one (e.g. 'oneroster') is a new adapter plus one registry line. */
export type LmsProviderKind = 'lti13' | 'google_classroom' | (string & {});

/** What a platform or deployment supports. Features switch on these, never on a vendor name. */
export interface LmsCapabilities {
  launch: boolean;
  roster: boolean;
  grades: boolean;
  deepLinking: boolean;
  lineItemCreate: boolean;
  submissionReview: boolean;
}

export const NO_CAPABILITIES: Readonly<LmsCapabilities> = Object.freeze({
  launch: false,
  roster: false,
  grades: false,
  deepLinking: false,
  lineItemCreate: false,
  submissionReview: false,
});

/** ENARA roles an LMS identity can map to (Spec `org_admin` is ENARA `admin`). */
export type LmsEnaraRole = 'student' | 'teacher' | 'admin' | 'observer';

export type LmsPresentation = 'iframe' | 'window';

export interface LaunchResult {
  enaraUserId: string;
  enaraRole: LmsEnaraRole;
  /** ENARA institutionId. */
  enaraOrgId: string;
  /** ENARA Batch id mapped from the LMS context. */
  enaraClassId?: string;
  targetActivityId?: string;
  presentation: LmsPresentation;
  returnUrl?: string;
}

export interface RosterDiff {
  added: number;
  updated: number;
  deactivated: number;
  unchanged: number;
}

export interface ExternalAssignment {
  externalId: string;
  url?: string;
}

/** The outbox row as an adapter sees it (no Mongoose types leak into adapters). */
export interface GradeSyncJobView {
  id: string;
  platformId: string;
  lineItemRef: string;
  lmsUserId: string;
  scoreGiven: number;
  scoreMaximum: number;
  comment?: string;
  activityProgress: string;
  gradingProgress: string;
  timestamp: Date;
}

export type PushResult =
  | { ok: true }
  | { ok: false; retryable: boolean; status?: number; retryAfterSeconds?: number; error: string };

/**
 * One implementation per protocol family. Phase 0 defines the contract only;
 * adapters arrive in later phases. Methods a provider cannot support are
 * absent from its capabilities and are never called.
 */
export interface LmsProvider {
  readonly kind: LmsProviderKind;
  capabilities(platform: { vendor: string; scopes?: string[] }): LmsCapabilities;
  handleLaunch?(input: unknown): Promise<LaunchResult>;
  syncRoster?(contextId: string): Promise<RosterDiff>;
  createAssignmentLink?(contextId: string, activityRef: string, opts?: Record<string, unknown>): Promise<ExternalAssignment>;
  pushScore?(job: GradeSyncJobView): Promise<PushResult>;
}

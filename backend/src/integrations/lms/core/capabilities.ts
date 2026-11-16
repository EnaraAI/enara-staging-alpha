import type { LmsVendorPreset } from '../presets';
import type { LmsCapabilities } from './types';

// What one platform/deployment can do = the vendor preset's ceiling, narrowed
// by the scopes the platform granted (and, from Phase 1, the launch claims).
export const AGS_SCOPE = {
  lineItem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineItemReadOnly: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  resultReadOnly: 'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
} as const;
export const NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';

export function resolveCapabilities(
  preset: Pick<LmsVendorPreset, 'capabilities'>,
  granted: { scopes?: string[]; deepLinking?: boolean } = {},
): LmsCapabilities {
  const scopes = new Set(granted.scopes ?? []);
  const c = preset.capabilities;
  return {
    launch: c.launch,
    roster: c.roster && scopes.has(NRPS_SCOPE),
    grades: c.grades && scopes.has(AGS_SCOPE.score),
    deepLinking: c.deepLinking && granted.deepLinking !== false,
    lineItemCreate: c.lineItemCreate && scopes.has(AGS_SCOPE.lineItem),
    submissionReview: c.submissionReview,
  };
}

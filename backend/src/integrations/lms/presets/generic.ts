import type { LmsVendorPreset } from './types';

// Any spec-compliant LTI 1.3 Advantage platform. Capabilities are the full set;
// what a deployment really supports is narrowed by its launch claims and scopes.
export const genericPreset: LmsVendorPreset = {
  id: 'generic',
  label: 'Other LTI 1.3 platform',
  provider: 'lti13',
  registration: ['dynamic', 'manual'],
  capabilities: { launch: true, roster: true, grades: true, deepLinking: true, lineItemCreate: true, submissionReview: false },
  notes: 'Spec-compliant LTI 1.3 with Deep Linking 2.0, AGS 2.0 and NRPS 2.0.',
};

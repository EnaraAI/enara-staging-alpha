import type { LmsVendorPreset } from './types';

// Moodle 4.x "External tool" (LTI 1.3). Supports Dynamic Registration from
// Site administration > Plugins > Activity modules > External tool > Manage tools.
export const moodlePreset: LmsVendorPreset = {
  id: 'moodle',
  label: 'Moodle',
  provider: 'lti13',
  registration: ['dynamic', 'manual'],
  capabilities: { launch: true, roster: true, grades: true, deepLinking: true, lineItemCreate: true, submissionReview: false },
  notes: 'Tested targets: Moodle 4.5 LTS and the latest release (Phase 7).',
};

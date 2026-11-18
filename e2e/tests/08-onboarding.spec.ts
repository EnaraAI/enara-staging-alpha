import { test } from '@playwright/test';

// Scenario 8: Step 2 onboarding, timed (Test School C: ENARA admin creates the
// school and its one-URL link, the Moodle admin registers, the status page's
// checklist turns green; time from "create school" to the first launch).
// TODO: enable once the onboarding feature (branch claude/lms-onboarding,
// PR #19, migration 2026-11-24-lms-onboarding, API /api/lms/onboarding/*,
// data-testids lms-new-school-*, lms-invite-link, lms-status-item-<key>,
// lms-manual-<key>-checkbox, lms-check-step-<key>, lms-status-elapsed) is
// merged into lms-test-live.
test.describe('8 · step 2 onboarding (timed)', () => {
  test.skip(true, 'onboarding is on another branch (claude/lms-onboarding); enable after it is merged');
  test('ENARA admin creates Test School C → Moodle registers → checklist done → first launch (timed)', async () => {});
});

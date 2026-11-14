import { defineConfig } from 'vitest/config';

// Post-remediation validation audit (2026-11-09). Separate config so the audit's
// scenario files (*.audit.ts) never join the project's normal `vitest run`.
// Run from backend/: npx vitest run --config test/audit-post-remediation/vitest.audit.config.ts
export default defineConfig({
  test: {
    include: ['test/audit-post-remediation/**/*.audit.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    env: { ANTHROPIC_API_KEY: '', ELEVENLABS_API_KEY: '', R2_ACCOUNT_ID: '', R2_BUCKET: '', R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' },
  },
});

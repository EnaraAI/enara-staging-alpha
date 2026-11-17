import path from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

// Whole suite with step 5 features on, enrollments mirrored from the old
// fields (see step5.suiteMirror.setup.ts). Run from backend/:
//   ENROLLMENT_READ_FROM=student_app,teacher_rosters,assessments,analytics,profile_context,credits,attendance \
//     npx vitest run --config test/multiClass/vitest.step5-suite.config.ts
export default mergeConfig(base, defineConfig({
  root: path.resolve(__dirname, '../..'),
  test: { setupFiles: [path.resolve(__dirname, 'step5.suiteMirror.setup.ts')] },
}));

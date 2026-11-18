import { defineConfig, devices } from '@playwright/test';
import { ENARA, MOODLE, RUN_DIR } from './lib/env';

// The scenarios share one Moodle and one ENARA and build on each other
// (registration, then launches, then picks, then grades ...), so they run in
// order in one worker. Each spec file is one scenario; its tests are serial.
const chromeMedia = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

export default defineConfig({
  testDir: './tests',
  outputDir: `${RUN_DIR}/test-results`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 4 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: `${RUN_DIR}/playwright-report`, open: 'never' }],
    ['json', { outputFile: `${RUN_DIR}/results.json` }],
  ],
  use: {
    ignoreHTTPSErrors: true,
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    viewport: { width: 1366, height: 900 },
  },
  metadata: { moodle: MOODLE, enara: ENARA },
  projects: [
    {
      name: 'chromium',
      testIgnore: /webkit\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, launchOptions: { args: chromeMedia } },
    },
    {
      // Scenario 7, Safari: WebKit after the Chromium run (needs its state).
      name: 'webkit',
      testMatch: /webkit\.spec\.ts$/,
      dependencies: ['chromium'],
      use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 900 } },
    },
  ],
});

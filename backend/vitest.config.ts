import { defineConfig } from 'vitest/config';

// Keep tests off real services even when a local .env holds live credentials
// (dotenv never overrides variables that are already set).
export default defineConfig({
  test: {
    env: {
      ANTHROPIC_API_KEY: '',
      ELEVENLABS_API_KEY: '',
      R2_ACCOUNT_ID: '',
      R2_BUCKET: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
    },
  },
});

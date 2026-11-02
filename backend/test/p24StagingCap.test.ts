import { describe, expect, it } from 'vitest';
import { STAGING_DB_NAME, STAGING_MAX_TEST_SPEND_USD, stagingProblems } from '../src/config/stagingGuard';

// Owner decision 2026-11-02: the staging AI test-spend cap may be up to $100.
const base = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'development', ENARA_STAGING: 'true', MONGODB_URI: `mongodb://h:27017/${STAGING_DB_NAME}`,
  JWT_SECRET: 'jwt-staging-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa', INGEST_HMAC_SECRET: 'hmac-staging-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbb',
  CRON_SECRET: 'cron-staging-secret-ccccccccccccccccccccccccccc', RUN_MIGRATIONS_ON_START: 'false',
  R2_ACCOUNT_ID: 'a', R2_BUCKET: 'enara-staging-alpha-uploads', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', SERVE_LOCAL_UPLOADS: 'false',
  CORS_ALLOWED_ORIGINS: 'https://staging.example.test', FRONTEND_URL: 'https://staging.example.test', ANTHROPIC_API_KEY: 'x', AI_TEST_SPEND_ID: 'p14', ...over,
});

describe('staging test-spend cap ceiling ($100)', () => {
  it('accepts caps up to $100', () => {
    expect(STAGING_MAX_TEST_SPEND_USD).toBe(100);
    for (const v of ['0.01', '50', '99.99', '100']) expect(stagingProblems(base({ AI_TEST_SPEND_CAP_USD: v })), v).toEqual([]);
  });
  it('refuses anything above $100 or not a positive number', () => {
    for (const v of ['100.01', '150', '0', '-1', 'five']) expect(stagingProblems(base({ AI_TEST_SPEND_CAP_USD: v })).join(' '), v).toMatch(/at most 100/);
  });
});

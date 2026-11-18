import { timingSafeEqual } from 'crypto';

// Maintenance for the LMS TEST deployment only (lms-test.enara.app). This
// sandbox and the operator's tools can't reach the test database directly, so
// migrations and the fake seed run inside the deployed app. Every request must
// pass ALL of these, or the route answers 404 as if it did not exist:
//   1. MAINTENANCE_ENDPOINTS_ENABLED=true (set only on the test project);
//   2. MONGODB_URI points at the test cluster (host starts "enara-lms-test.");
//   3. Authorization: Bearer <MAINTENANCE_TOKEN> or Bearer <MAINTENANCE_CI_TOKEN>
//      (each >= 32 chars, each compared in constant time; either one works).
//      MAINTENANCE_CI_TOKEN is the continuous-delivery pipeline's own token
//      (GitHub secret LMSTEST_MAINTENANCE_TOKEN, docs/lms/CONTINUOUS_DELIVERY.md),
//      so it can be rotated without touching the operator's token.
// test.enara.app never has the switch or the tokens, and its database is a
// different cluster, so these routes cannot run there.
// Exception (same switch and cluster checks, no maintenance token): the mock
// LMS protocol endpoints under /mock-lms (its JWKS, token, AGS and NRPS
// services are called by ENARA's own LTI code, which never holds the token;
// they have the LTI protocol's own checks instead). Its sign-in endpoint
// (/mock-lms/auth) does need the maintenance token. See mockLms.ts.
export const TEST_CLUSTER_HOST_PREFIX = 'enara-lms-test.';
export const MIN_TOKEN_LENGTH = 32;

export function mongoHost(uri: string): string | null {
  const m = /^mongodb(?:\+srv)?:\/\/([^/?]*)/.exec(uri.trim());
  if (!m) return null;
  const hosts = m[1].slice(m[1].lastIndexOf('@') + 1); // after the credentials (last @)
  const first = hosts.split(',')[0].split(':')[0];
  return first ? first.toLowerCase() : null;
}

/** The accepted maintenance tokens: MAINTENANCE_TOKEN and MAINTENANCE_CI_TOKEN, each only when >= 32 chars. */
export function maintenanceTokens(env: NodeJS.ProcessEnv): string[] {
  return [env.MAINTENANCE_TOKEN, env.MAINTENANCE_CI_TOKEN].filter((t): t is string => typeof t === 'string' && t.length >= MIN_TOKEN_LENGTH);
}

export function maintenanceAllowed(env: NodeJS.ProcessEnv, mongoUri: string): boolean {
  if (env.MAINTENANCE_ENDPOINTS_ENABLED !== 'true') return false;
  if (!maintenanceTokens(env).length) return false;
  return (mongoHost(mongoUri) ?? '').startsWith(TEST_CLUSTER_HOST_PREFIX);
}

function matches(given: Buffer, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Authorization header equals "Bearer <token>" for one of the accepted tokens (constant time per token; every token is compared). */
export function maintenanceAuthorised(header: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const given = Buffer.from(typeof header === 'string' ? header : '');
  let ok = false;
  for (const token of maintenanceTokens(env)) ok = matches(given, token) || ok;
  return ok;
}

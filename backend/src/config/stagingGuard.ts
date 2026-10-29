// Staging isolation guard (P6 preflight). With ENARA_STAGING=true the backend
// refuses to start unless its configuration is provably separate from any
// production/shared environment. Nothing is inferred from NODE_ENV. Error
// messages name variables only, never values.

export const STAGING_DB_NAME = 'enara_staging_alpha';
const MIN_SECRET_LENGTH = 32;
const STAGING_MARK = /staging/i;
// Hosts of existing deployments recorded in this repository (production and
// the shared sandbox). Staging must never allow them as browser origins.
export const KNOWN_NON_STAGING_HOSTS = [
  'enara.app',
  'www.enara.app',
  'enara-sandbox-frontend.vercel.app',
  'enara-sandbox-backend.vercel.app',
  'backend-engine-copy-production.up.railway.app',
  'backend-engine-vhcz.onrender.com',
];

// The origin of a URL ("https://host[:port]"), or null if it is not one.
function originOf(value: string): string | null {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? u.origin : null;
  } catch {
    return null;
  }
}

export function isStagingMode(source: NodeJS.ProcessEnv): boolean {
  return /^(1|true|yes)$/i.test((source.ENARA_STAGING ?? '').trim());
}

// ENARA_STAGING set to anything but a boolean ("ture", "on") would read as
// off and skip the guard. Unset, empty and false are unchanged.
export function stagingFlagProblem(source: NodeJS.ProcessEnv): string | null {
  const raw = (source.ENARA_STAGING ?? '').trim();
  return raw && !/^(1|true|yes|0|false|no)$/i.test(raw) ? 'ENARA_STAGING must be true or false' : null;
}

// Entry points that exist only for staging (api/index.js -> vercel.ts) call
// this before anything else: without ENARA_STAGING=true the isolation guard
// would not run, so they refuse to start. Isolation itself is still proven by
// stagingProblems(), never by the flag alone.
export function assertStagingEntry(source: NodeJS.ProcessEnv): void {
  const problem = stagingFlagProblem(source);
  if (problem) throw new Error(`Staging entry refused: ${problem}`);
  if (!isStagingMode(source)) throw new Error('Staging entry refused: this entry point serves only ENARA staging and needs ENARA_STAGING=true');
}

// The database named in a MongoDB URI path, without logging the URI.
export function mongoDbName(uri: string): string | null {
  const m = /^mongodb(?:\+srv)?:\/\/[^/]*\/([^?]*)/.exec(uri.trim());
  if (!m || !m[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

const val = (source: NodeJS.ProcessEnv, k: string) => (source[k] ?? '').trim();

export function stagingProblems(source: NodeJS.ProcessEnv, dotenvKeys: string[] = []): string[] {
  const problems: string[] = [];
  // A .env file in the working directory would fill in values from another
  // environment. Staging must be configured only by its own environment.
  if (dotenvKeys.length) problems.push(`a .env file supplied ${dotenvKeys.length} variable(s); start staging from a directory without .env, using only the staging environment`);

  // Database: exactly the staging database.
  const db = mongoDbName(val(source, 'MONGODB_URI'));
  if (db !== STAGING_DB_NAME) problems.push(`MONGODB_URI must name the database "${STAGING_DB_NAME}" in its path`);

  // Upload storage: R2 only (owner decision 2026-10-29). Every staging file
  // lives in a dedicated staging bucket; there is no local-disk fallback.
  const r2 = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter((k) => val(source, k)).length;
  if (r2 !== 4) problems.push('R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must all be set (staging stores files only in R2)');
  else if (!STAGING_MARK.test(val(source, 'R2_BUCKET'))) problems.push('R2_BUCKET must be a staging bucket (its name must contain "staging")');
  if (/^(1|true|yes)$/i.test(val(source, 'SERVE_LOCAL_UPLOADS'))) problems.push('SERVE_LOCAL_UPLOADS must be false in staging (files are stored only in R2)');
  // Behind one edge proxy (Railway, Vercel): trust exactly one hop. `true`
  // trusts any client-supplied X-Forwarded-For and defeats IP rate limits.
  if (/^(true|yes)$/i.test(val(source, 'TRUST_PROXY'))) problems.push('TRUST_PROXY must be a hop count (use 1 behind Railway or Vercel), not true');
  if (val(source, 'AWS_S3_BUCKET') && !STAGING_MARK.test(val(source, 'AWS_S3_BUCKET'))) problems.push('AWS_S3_BUCKET must be unset or a staging bucket (containing "staging")');

  // Staging-only secrets: present, long, and not reused between purposes.
  const secrets = ['JWT_SECRET', 'INGEST_HMAC_SECRET', 'CRON_SECRET'];
  for (const k of secrets) {
    if (val(source, k).length < MIN_SECRET_LENGTH) problems.push(`${k} must be set to a staging-only secret of at least ${MIN_SECRET_LENGTH} characters`);
  }
  const values = secrets.map((k) => val(source, k)).filter(Boolean);
  if (new Set(values).size !== values.length) problems.push('JWT_SECRET, INGEST_HMAC_SECRET and CRON_SECRET must all be different');

  // Browser origins: an explicit allowlist that includes the staging frontend
  // (FRONTEND_URL) and no wildcard, empty entry or existing deployment.
  const rawOrigins = val(source, 'CORS_ALLOWED_ORIGINS');
  if (!rawOrigins) {
    problems.push('CORS_ALLOWED_ORIGINS must be set explicitly in staging');
  } else {
    const entries = rawOrigins.split(',').map((o) => o.trim());
    if (entries.some((o) => !o)) problems.push('CORS_ALLOWED_ORIGINS must not contain empty entries');
    if (entries.some((o) => o.includes('*'))) problems.push('CORS_ALLOWED_ORIGINS must not contain a wildcard');
    const origins = entries.filter((o) => o && !o.includes('*')).map((o) => ({ raw: o, origin: originOf(o) }));
    if (origins.some((o) => !o.origin)) problems.push('CORS_ALLOWED_ORIGINS entries must be full origins such as https://host');
    const hosts = origins.map((o) => (o.origin ? new URL(o.origin).hostname.toLowerCase() : ''));
    if (hosts.some((h) => KNOWN_NON_STAGING_HOSTS.includes(h))) problems.push('CORS_ALLOWED_ORIGINS must not include a production or shared ENARA domain');
    const frontend = originOf(val(source, 'FRONTEND_URL'));
    if (!frontend) problems.push('FRONTEND_URL must be set to the staging frontend origin');
    else if (KNOWN_NON_STAGING_HOSTS.includes(new URL(frontend).hostname.toLowerCase())) problems.push('FRONTEND_URL must not be a production or shared ENARA domain');
    else if (!origins.some((o) => o.origin === frontend)) problems.push('CORS_ALLOWED_ORIGINS must include the staging frontend origin (FRONTEND_URL)');
  }

  // Migrations only on purpose (npm run migrate).
  if (val(source, 'RUN_MIGRATIONS_ON_START').toLowerCase() !== 'false') problems.push('RUN_MIGRATIONS_ON_START must be "false" (run migrations deliberately)');

  // Registration and email.
  if (/^(0|false|no)$/i.test(val(source, 'REGISTRATION_INVITE_ONLY'))) problems.push('REGISTRATION_INVITE_ONLY must not be false in staging');
  if (/^(1|true|yes)$/i.test(val(source, 'REMINDERS_ENABLED')) && !val(source, 'REMINDER_TEST_RECIPIENT')) {
    problems.push('REMINDERS_ENABLED needs REMINDER_TEST_RECIPIENT in staging (every email to one test inbox)');
  }
  if (/^(1|true|yes)$/i.test(val(source, 'DEMO_MODE_ENABLED'))) problems.push('DEMO_MODE_ENABLED must be false in staging');

  // Any paid provider path in staging needs the cumulative test-spend cap
  // (aiBudget.ts): model keys, voice, avatar, orchestrator, ingestion engine.
  const paid = ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY', 'ANAM_API_KEY', 'ENARA_API_KEY', 'ENARA_ORCHESTRATOR_URL', 'AI_ENGINE_URL'];
  if (paid.some((k) => val(source, k)) && !(val(source, 'AI_TEST_SPEND_CAP_USD') && val(source, 'AI_TEST_SPEND_ID'))) {
    problems.push('AI_TEST_SPEND_CAP_USD and AI_TEST_SPEND_ID must be set when a provider key is set in staging');
  }
  return problems;
}

export function assertStagingIsolation(source: NodeJS.ProcessEnv, dotenvKeys: string[] = []): void {
  const problems = stagingProblems(source, dotenvKeys);
  if (problems.length) throw new Error(`Staging isolation check failed (ENARA_STAGING=true): ${problems.join('; ')}`);
}

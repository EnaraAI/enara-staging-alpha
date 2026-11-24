// One test of every environment variable, Part 2 (docs/lms/ENV_CHECK_PLAN.md): from inside the running site, read-only.
// Each check makes one call that changes nothing (a ping, a list, an in-memory round trip) and reports NAMES AND STATES ONLY:
// ok | not_configured | rejected | error | weak. No value, key prefix or provider message is ever returned or logged.
// No Anthropic spending: the Anthropic keys are checked with "list models" (free). Calling cron would run jobs, so CRON_SECRET and
// the passwords are checked for presence and length only.
import { createHmac, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getConfig } from '../config/env';
import { getPostgresPool } from '../config/postgres';
import { keyStatus, fallbackKey } from '../services/modelFallback';
import { encryptSecret, decryptSecret } from '../integrations/lms/core/crypto';
import { llmPing } from './llmCheck';
import { scoreWithMishkat } from '../assessment/grading-engine/mishkat/client';

export type EnvState = 'ok' | 'not_configured' | 'rejected' | 'error' | 'weak';
export interface EnvCheck { name: string; vars: string[]; state: EnvState; required: boolean; note?: string }

const MIN_SECRET = 32;
type Fetch = typeof fetch;

/** HTTP status → state, for a read-only provider call. 401/403 = the key is refused. */
export const stateOfStatus = (status: number): EnvState => (status >= 200 && status < 300 ? 'ok' : status === 401 || status === 403 ? 'rejected' : 'error');

async function timed<T>(f: () => Promise<T>): Promise<T | 'error'> {
  try { return await f(); } catch { return 'error'; }
}

export async function runEnvCheck(deps: { fetch?: Fetch; env?: NodeJS.ProcessEnv } = {}): Promise<{ ok: boolean; checks: EnvCheck[] }> {
  const f = deps.fetch ?? fetch; const env = deps.env ?? process.env; const c = getConfig();
  const checks: EnvCheck[] = [];
  const add = (name: string, vars: string[], state: EnvState, required: boolean, note?: string) => checks.push({ name, vars, state, required, ...(note ? { note } : {}) });
  const secret = (v: string | undefined): EnvState => (!v ? 'not_configured' : v.length >= MIN_SECRET ? 'ok' : 'weak');

  // Database
  const ping = await timed(async () => { await mongoose.connection.db!.admin().ping(); return 'ok' as const; });
  add('mongo', ['MONGODB_URI'], ping === 'ok' ? 'ok' : 'error', true);
  if (c.databaseUrl) add('postgres', ['DATABASE_URL'], (await timed(async () => { await getPostgresPool().query('SELECT 1'); return 'ok' as const; })) === 'ok' ? 'ok' : 'error', false);
  else add('postgres', ['DATABASE_URL'], 'not_configured', false);

  // Secrets used in memory: a round trip proves the value loads and works.
  const jwtState = await timed(async () => { const t = jwt.sign({ envCheck: true }, c.jwtSecret, { expiresIn: 30 }); jwt.verify(t, c.jwtSecret); return c.jwtSecret.length >= MIN_SECRET ? 'ok' as const : 'weak' as const; });
  add('login tokens', ['JWT_SECRET'], jwtState === 'error' ? 'error' : jwtState, true);
  const hmacState = await timed(async () => {
    const a = createHmac('sha256', c.ingestHmacSecret).update('env-check').digest(); const b = createHmac('sha256', c.ingestHmacSecret).update('env-check').digest();
    return timingSafeEqual(a, b) ? (c.ingestHmacSecret.length >= MIN_SECRET ? 'ok' as const : 'weak' as const) : 'error' as const;
  });
  add('ingest signatures', ['INGEST_HMAC_SECRET'], hmacState === 'error' ? 'error' : hmacState, true);
  if (c.lms.kek) {
    const kekState = await timed(async () => (decryptSecret(encryptSecret('env-check', 'env-check'), 'env-check') === 'env-check' ? 'ok' as const : 'error' as const));
    add('LMS key', ['LMS_KEK', 'LMS_KEK_PREVIOUS'], kekState === 'ok' ? 'ok' : 'error', true, 'round trip; stored school secrets are proven by the health check (LTI flow)');
  } else add('LMS key', ['LMS_KEK'], c.lms.problem ? 'error' : 'not_configured', c.lms.ltiEnabled);

  // Storage: list at most one object (no write).
  if (c.r2) {
    const r2 = c.r2;
    const s = await timed(async () => {
      const client = new S3Client({ region: 'auto', endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey } });
      await client.send(new ListObjectsV2Command({ Bucket: r2.bucket, MaxKeys: 1 })); return 'ok' as const;
    });
    add('file storage (R2)', ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'], s === 'ok' ? 'ok' : 'rejected', true);
  } else add('file storage (R2)', ['R2_*'], 'not_configured', Boolean(env.VERCEL));

  // Email: list domains; a send-only key answers "restricted" and still counts as valid.
  if (c.email.resendApiKey) {
    const r = await timed(() => f('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${c.email.resendApiKey}` }, signal: AbortSignal.timeout(10_000) }));
    if (r === 'error') add('email (Resend)', ['RESEND_API_KEY'], 'error', false);
    else {
      const body = (await r.json().catch(() => ({}))) as { name?: string; data?: { name: string; status: string }[] };
      const restricted = body?.name === 'restricted_api_key';
      const from = c.email.from?.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
      const domain = body?.data?.find((d) => d.name.toLowerCase() === from);
      const state: EnvState = r.ok || restricted ? 'ok' : stateOfStatus(r.status);
      add('email (Resend)', ['RESEND_API_KEY', 'REMINDER_FROM'], state, false,
        restricted ? 'send-only key (valid); sender domain not checked' : r.ok ? `sender domain ${from ? (domain ? domain.status : 'not in this account') : 'not set'}` : undefined);
    }
  } else add('email (Resend)', ['RESEND_API_KEY'], 'not_configured', false);

  // Avatar and speech: list one item.
  if (c.anam) {
    const r = await timed(() => f('https://api.anam.ai/v1/avatars?perPage=1', { headers: { Authorization: `Bearer ${c.anam!.apiKey}` }, signal: AbortSignal.timeout(10_000) }));
    add('avatar (Anam)', ['ANAM_API_KEY'], r === 'error' ? 'error' : stateOfStatus(r.status), false);
  } else add('avatar (Anam)', ['ANAM_API_KEY'], 'not_configured', false);
  if (c.elevenlabs) {
    const r = await timed(() => f('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': c.elevenlabs!.apiKey }, signal: AbortSignal.timeout(10_000) }));
    add('speech (ElevenLabs)', ['ELEVENLABS_API_KEY'], r === 'error' ? 'error' : stateOfStatus(r.status), false);
  } else add('speech (ElevenLabs)', ['ELEVENLABS_API_KEY'], 'not_configured', false);

  // Models: Anthropic by "list models" (free); the tutor model (DeepSeek on Modal) by its 1-token ping.
  const ak = c.anthropicApiKey ? await keyStatus(c.anthropicApiKey) : 'not_configured';
  add('Anthropic key', ['ANTHROPIC_API_KEY'], ak === 'accepted' ? 'ok' : ak === 'not_configured' ? 'not_configured' : ak === 'rejected' ? 'rejected' : 'error', false);
  const fk = fallbackKey();
  if (fk) { const s = await keyStatus(fk); add('Anthropic fallback key', ['ANTHROPIC_API_KEY_FALLBACK'], s === 'accepted' ? 'ok' : s === 'rejected' ? 'rejected' : 'error', false); }
  if (env.TUTOR_LLM_BASE_URL || env.TUTOR_LLM_API_KEY) {
    const p = await llmPing();
    add('tutor model (DeepSeek)', ['TUTOR_LLM_BASE_URL', 'TUTOR_LLM_API_KEY', 'TUTOR_LLM_MODEL'], p.ok ? 'ok' : (p as { status?: number }).status === 401 || (p as { status?: number }).status === 403 ? 'rejected' : 'error', false);
  } else add('tutor model (DeepSeek)', ['TUTOR_LLM_*'], 'not_configured', false);

  // Mishkat scoring service: one tiny answer per language (scores nothing that is stored); proves the endpoint and the shared token.
  if (env.MISHKAT_ENDPOINT || env.MISHKAT_TOKEN) {
    for (const lang of ['en', 'ar'] as const) {
      const m = await scoreWithMishkat({ lang, type: 'short_answer', text: lang === 'en' ? 'I like reading books.' : 'أحب قراءة الكتب.' }, { env, fetchImpl: f });
      add(`Mishkat (${lang})`, ['MISHKAT_ENDPOINT', 'MISHKAT_TOKEN'], m.status === 'ok' ? 'ok' : m.reason === 'not_configured' ? 'not_configured' : m.reason === 'http_error' ? 'rejected' : 'error', false,
        m.status === 'ok' ? `model ${m.version}` : m.reason);
    }
  } else add('Mishkat', ['MISHKAT_ENDPOINT', 'MISHKAT_TOKEN'], 'not_configured', false);

  // Presence and length only.
  add('cron caller', ['CRON_SECRET'], secret(c.cronSecret), false);
  add('maintenance tokens', ['MAINTENANCE_TOKEN', 'MAINTENANCE_CI_TOKEN'], [env.MAINTENANCE_TOKEN, env.MAINTENANCE_CI_TOKEN].some((t) => t && t.length >= MIN_SECRET) ? 'ok' : 'weak', true, 'proven by this call');
  for (const n of ['SEED_USER_PASSWORD', 'API_DOCS_PASSWORD']) add(n, [n], env[n] ? (env[n]!.length >= 12 ? 'ok' : 'weak') : 'not_configured', false);
  if (c.googleClientId !== undefined) add('Google sign-in', ['GOOGLE_CLIENT_ID'], /\.apps\.googleusercontent\.com$/.test(c.googleClientId) ? 'ok' : 'error', false);

  const ok = checks.every((x) => !x.required || x.state === 'ok');
  return { ok, checks };
}

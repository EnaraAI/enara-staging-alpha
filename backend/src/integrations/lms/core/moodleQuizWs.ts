// Read-only Moodle web-service client for errors to work on from Moodle's own quizzes (MOODLE_QUIZ_IMPORT_PLAN v2).
// The school's Moodle admin creates a web service with ONLY the functions below and gives ENARA a token for it; ENARA keeps
// the token encrypted (moodleQuiz.ts) and sends it only in the POST body to the school's own Moodle site (the connection's
// issuer). No other function can be called through this client, and the token never appears in an error, log or response.

export const MOODLE_QUIZ_FUNCTIONS = ['mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts', 'mod_quiz_get_attempt_review'] as const;
export type MoodleQuizFunction = (typeof MOODLE_QUIZ_FUNCTIONS)[number];

const CALL_TIMEOUT_MS = 12_000;

export class MoodleQuizWsError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = 'MoodleQuizWsError';
  }
}

/** Moodle's REST form encoding: courseids[0]=5. */
export function flatten(value: unknown, prefix = '', out: [string, string][] = []): [string, string][] {
  if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  else if (value !== undefined) out.push([prefix, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]);
  return out;
}

/** The site base from the connection's issuer: https only (http only for a localhost test site), no path, query or credentials. */
export function siteBase(issuer: string, allowHttpLocal = false): string {
  let u: URL;
  try { u = new URL(issuer); } catch { throw new MoodleQuizWsError('bad_site_url'); }
  if (u.username || u.password || u.search || u.hash) throw new MoodleQuizWsError('bad_site_url');
  if (u.protocol !== 'https:' && !(allowHttpLocal && u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new MoodleQuizWsError('site_not_https');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'error'; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface MoodleQuizWs { call<T>(fn: MoodleQuizFunction, params: Record<string, unknown>): Promise<T> }

export function moodleQuizWs(base: string, token: string, fetchImpl: Fetch = fetch as unknown as Fetch): MoodleQuizWs {
  const scrub = (s: string) => s.split(token).join('[token]').slice(0, 200);
  return {
    async call<T>(fn: MoodleQuizFunction, params: Record<string, unknown>): Promise<T> {
      if (!(MOODLE_QUIZ_FUNCTIONS as readonly string[]).includes(fn)) throw new MoodleQuizWsError('function_not_allowed');
      const body = new URLSearchParams([['wstoken', token], ['wsfunction', fn], ['moodlewsrestformat', 'json'], ...flatten(params)]).toString();
      let res: Awaited<ReturnType<Fetch>>;
      try {
        res = await fetchImpl(`${base}/webservice/rest/server.php`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'error', signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      } catch {
        throw new MoodleQuizWsError('network_error');
      }
      if (!res.ok) throw new MoodleQuizWsError(`http_${res.status}`);
      let json: unknown;
      try { json = JSON.parse(await res.text()); } catch { throw new MoodleQuizWsError('bad_response'); }
      if (json && typeof json === 'object' && 'exception' in json) {
        const j = json as { errorcode?: string; message?: string };
        throw new MoodleQuizWsError(String(j.errorcode ?? 'moodle_error').replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'moodle_error', scrub(String(j.message ?? '')));
      }
      return json as T;
    },
  };
}

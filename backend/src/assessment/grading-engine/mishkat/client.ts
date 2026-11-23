// Mishkat client (docs/tutor/MISHKAT_SPLIT_PLAN.md, switch mishkatSplit): the trained criterion scorer on its own CPU service.
// Contract:
//   POST <MISHKAT_ENDPOINT>   Authorization: Bearer <MISHKAT_TOKEN>   Content-Type: application/json
//   request  {"lang":"ar"|"en","type":"essay"|"short_answer","text":"<the learner's answer>"}
//   response {"version":"<model version>","scores":{"<criterion>":<raw continuous score>},"criteria":["<criterion ids this model covers for lang+type>"]}
// Both settings are secrets the owner sets; when either is missing the client says "unavailable". It never throws: a timeout (3 s),
// an HTTP error, a network error or a reply that does not match the contract are all "unavailable", and grading goes on with v3b
// alone. No retries on the grading path. Nothing is logged here (the caller logs the reason; never the text or the token).

export type MishkatLang = 'ar' | 'en';
export type MishkatType = 'essay' | 'short_answer';
export interface MishkatRequest { lang: MishkatLang; type: MishkatType; text: string }
export type MishkatUnavailable = 'not_configured' | 'timeout' | 'http_error' | 'network_error' | 'bad_response';
export type MishkatResult =
  | { status: 'ok'; version: string; scores: Record<string, number>; criteria: string[] }
  | { status: 'unavailable'; reason: MishkatUnavailable };

export const MISHKAT_TIMEOUT_MS = 3_000;
const MAX_TEXT = 20_000;

/** Checks a reply against the contract; null when it does not match. Exported for tests. */
export function parseMishkatReply(body: unknown): { version: string; scores: Record<string, number>; criteria: string[] } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.version !== 'string' || !b.version.trim() || b.version.length > 100) return null;
  if (!b.scores || typeof b.scores !== 'object' || Array.isArray(b.scores)) return null;
  if (!Array.isArray(b.criteria) || !b.criteria.every((c) => typeof c === 'string')) return null;
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.scores as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    scores[k] = v;
  }
  return { version: b.version.trim(), scores, criteria: [...new Set(b.criteria as string[])] };
}

/** One Mishkat call. Never throws; "unavailable" with a reason on any problem. */
export async function scoreWithMishkat(req: MishkatRequest, opts: { fetchImpl?: typeof fetch; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<MishkatResult> {
  const env = opts.env ?? process.env;
  const endpoint = (env.MISHKAT_ENDPOINT ?? '').trim();
  const token = (env.MISHKAT_TOKEN ?? '').trim();
  if (!endpoint || !token) return { status: 'unavailable', reason: 'not_configured' };
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, opts.timeoutMs ?? MISHKAT_TIMEOUT_MS);
  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: req.lang, type: req.type, text: req.text.slice(0, MAX_TEXT) }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: 'unavailable', reason: 'http_error' };
    let body: unknown;
    try { body = await res.json(); } catch { return { status: 'unavailable', reason: timedOut ? 'timeout' : 'bad_response' }; }
    const parsed = parseMishkatReply(body);
    return parsed ? { status: 'ok', ...parsed } : { status: 'unavailable', reason: 'bad_response' };
  } catch {
    return { status: 'unavailable', reason: timedOut ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

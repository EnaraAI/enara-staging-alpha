// The lms-test API, called directly from design.enara.app (CORS allows exactly this origin on lms-test).
// One place for the base URL, the sign-in token, errors and streaming. Never test.enara.app.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'https://lms-test.enara.app';
if (/(^|\/\/)test\.enara\.app/.test(API_BASE)) throw new Error('design app must never call test.enara.app');

const TOKEN_KEY = 'enara_design_token';
const DEVICE_KEY = 'enara_design_parent_device';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
export const getToken = () => store.get(TOKEN_KEY);
export const setToken = (t: string | null) => store.set(TOKEN_KEY, t);
export const getDeviceToken = () => store.get(DEVICE_KEY);
export const setDeviceToken = (t: string | null) => store.set(DEVICE_KEY, t);

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function parse(res: Response) {
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const err = body && typeof body === 'object' ? body.error : null;
    const message = (err && (err.message || (typeof err === 'string' ? err : ''))) || body?.message || `HTTP ${res.status}`;
    throw new ApiError(String(message), res.status, err?.code);
  }
  return body;
}

/** JSON request with the sign-in token. A 401 on a signed-in call signs the user out (handled by the session). */
export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, opts: { signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal, credentials: 'omit' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('offline', 0, 'NETWORK');
  }
  if (res.status === 401 && token && opts.auth !== false) { onUnauthorized?.(); }
  return parse(res) as Promise<T>;
}
export const get = <T = any>(path: string, signal?: AbortSignal) => api<T>('GET', path, undefined, { signal });
export const post = <T = any>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const put = <T = any>(path: string, body?: unknown) => api<T>('PUT', path, body ?? {});
export const del = <T = any>(path: string) => api<T>('DELETE', path);

/** Server-sent events over POST (tutor chat streaming). Calls onEvent for each `data:` line parsed as JSON. */
export async function stream(path: string, body: unknown, onEvent: (ev: any) => void, signal?: AbortSignal) {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    method: 'POST', signal, credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) return parse(res);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try { onEvent(JSON.parse(data)); } catch { onEvent({ type: 'text', text: data }); }
      }
    }
  }
}

/** A one-line, user-safe message for an error (never the raw server text for 5xx). */
export function errorText(e: unknown, lang: 'en' | 'ar'): string {
  const err = e as ApiError;
  if (err?.code === 'NETWORK') return lang === 'ar' ? 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.' : 'Could not connect. Check your internet and try again.';
  if (err?.status === 401) return lang === 'ar' ? 'البريد أو كلمة المرور غير صحيحة.' : 'The email or password is not right.';
  if (err?.status === 429) return lang === 'ar' ? 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.' : 'Too many tries. Wait a little and try again.';
  if (err?.status && err.status < 500 && err.message) return err.message;
  return lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى بعد قليل.' : 'Something went wrong. Try again in a moment.';
}

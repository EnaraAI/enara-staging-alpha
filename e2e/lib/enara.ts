import { request, type APIRequestContext, type Frame, type Page, expect } from '@playwright/test';
import { ENARA, secrets } from './env';

// ENARA's API, as the operator (maintenance routes) or as a seeded account.
export const SEED_DOMAIN = 'lms-test.example';
export const seedEmail = (key: string) => `${key}@${SEED_DOMAIN}`;

let ctx: APIRequestContext | undefined;
async function api(): Promise<APIRequestContext> {
  ctx ??= await request.newContext({ baseURL: ENARA, ignoreHTTPSErrors: true, timeout: 60_000 });
  return ctx;
}

async function call<T = any>(method: 'GET' | 'POST' | 'PUT', path: string, opts: { token?: string; bearer?: string; body?: unknown; ok?: number[] } = {}): Promise<T> {
  const c = await api();
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  const res = await c.fetch(path, { method, headers, data: opts.body });
  const text = await res.text();
  const ok = opts.ok ?? [200, 201];
  if (!ok.includes(res.status())) throw new Error(`${method} ${path} -> ${res.status()}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}
export const enaraApi = {
  get: <T = any>(path: string, token: string) => call<T>('GET', path, { token }),
  post: <T = any>(path: string, token: string, body?: unknown, ok?: number[]) => call<T>('POST', path, { token, body, ok }),
  put: <T = any>(path: string, token: string, body?: unknown) => call<T>('PUT', path, { token, body }),
};

export async function maintenance<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  return call<T>(method, `/api/maintenance${path}`, { bearer: secrets.maintenanceToken, body });
}

const tokens = new Map<string, string>();
/** A session token for a seeded account (admin.a, admin.b, enara.admin, teacher.a1 ...). */
export async function login(key: string): Promise<string> {
  const cached = tokens.get(key);
  if (cached) return cached;
  const r = await call<{ token: string }>('POST', '/api/auth/login', { body: { email: seedEmail(key), password: secrets.enaraPassword } });
  tokens.set(key, r.token);
  return r.token;
}

/** The ENARA frame inside a Moodle activity page (the launch ends on ENARA's host). */
export async function enaraFrame(page: Page, timeout = 90_000): Promise<Frame> {
  const host = new URL(ENARA).host;
  const deadline = Date.now() + timeout;
  for (;;) {
    const f = page.frames().find((fr) => {
      try { return new URL(fr.url()).host === host && !/\/lti\//.test(new URL(fr.url()).pathname); } catch { return false; }
    });
    if (f) return f;
    if (Date.now() > deadline) throw new Error(`no ENARA frame on ${page.url()} (frames: ${page.frames().map((x) => x.url()).join(', ')})`);
    await page.waitForTimeout(250);
  }
}

/** The ENARA session the frame holds after the launch (role, preview, LMS target). */
export async function frameSession(frame: Frame): Promise<{ role: string; name?: string; preview: boolean; lms: any; target: any }> {
  await expect.poll(async () => frame.evaluate(() => !!sessionStorage.getItem('enara_token')), { timeout: 60_000 }).toBe(true);
  return frame.evaluate(() => {
    const user = JSON.parse(sessionStorage.getItem('enara_user') || '{}');
    const lms = JSON.parse(sessionStorage.getItem('enara_lms') || '{}');
    const target = JSON.parse(sessionStorage.getItem('enara_lms_target') || 'null');
    return { role: user.role, name: user.name, preview: lms.preview === true, lms, target };
  });
}

/** The token of the ENARA session inside the frame (to read ENARA's API as that person). */
export async function frameToken(frame: Frame): Promise<string> {
  return frame.evaluate(() => sessionStorage.getItem('enara_token') || '');
}

/** A frame on ENARA's host whose path matches (e.g. /lms/picker). */
export async function enaraFrameAt(page: Page, path: RegExp, timeout = 90_000): Promise<Frame> {
  const host = new URL(ENARA).host;
  const deadline = Date.now() + timeout;
  for (;;) {
    const f = page.frames().find((fr) => {
      try { const u = new URL(fr.url()); return u.host === host && path.test(u.pathname); } catch { return false; }
    });
    if (f) return f;
    if (Date.now() > deadline) throw new Error(`no ENARA frame at ${path} on ${page.url()} (frames: ${page.frames().map((x) => x.url()).join(', ')})`);
    await page.waitForTimeout(250);
  }
}

import { request, type APIRequestContext, type Frame, type Page, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ENARA, RUN_DIR, secrets } from './env';

// ENARA's API, as the operator (maintenance routes) or as a seeded account.
export const SEED_DOMAIN = 'lms-test.example';
export const seedEmail = (key: string) => `${key}@${SEED_DOMAIN}`;

let ctx: APIRequestContext | undefined;
async function api(): Promise<APIRequestContext> {
  ctx ??= await request.newContext({ baseURL: ENARA, ignoreHTTPSErrors: true, timeout: 60_000 });
  return ctx;
}

async function call<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, opts: { token?: string; bearer?: string; body?: unknown; ok?: number[] } = {}): Promise<T> {
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
  patch: <T = any>(path: string, token: string, body?: unknown) => call<T>('PATCH', path, { token, body }),
};

export async function maintenance<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  return call<T>(method, `/api/maintenance${path}`, { bearer: secrets.maintenanceToken, body });
}

const tokens = new Map<string, string>();
// Tokens are also kept in the run folder, so a worker restarted after a failed test does not sign in again (the login rate limit).
const TOKEN_FILE = () => path.join(RUN_DIR, 'login-tokens.json');
const readTokens = (): Record<string, string> => { try { return JSON.parse(fs.readFileSync(TOKEN_FILE(), 'utf8')); } catch { return {}; } };
/** A session token for a seeded account (admin.a, admin.b, enara.admin, teacher.a1 ...). */
export async function login(key: string): Promise<string> {
  const cached = tokens.get(key) ?? readTokens()[key];
  if (cached) { tokens.set(key, cached); return cached; }
  const r = await call<{ token: string }>('POST', '/api/auth/login', { body: { email: seedEmail(key), password: secrets.enaraPassword } });
  tokens.set(key, r.token);
  try { fs.mkdirSync(RUN_DIR, { recursive: true }); fs.writeFileSync(TOKEN_FILE(), JSON.stringify({ ...readTokens(), [key]: r.token })); } catch { /* the in-memory copy still works */ }
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
    if (f) {
      // Moodle's view.php resizes #contentframe from 600px to the window height
      // with YUI, after its modules load (late on a slow runner). Wait for it:
      // a click while the frame resizes lands at stale coordinates.
      await page.waitForFunction(() => { const el = document.getElementById('contentframe'); return !el || !!el.style.height; }, undefined, { timeout: 20_000 }).catch(() => undefined);
      return f;
    }
    if (Date.now() > deadline) throw new Error(`no ENARA frame on ${page.url()} (frames: ${page.frames().map((x) => x.url()).join(', ')})`);
    await page.waitForTimeout(250);
  }
}

/** The ENARA session the frame holds after the launch (role, preview, LMS target). */
export async function frameSession(frame: Frame): Promise<{ id: string /* the account's (reserved) email */; role: string; name?: string; institutionId?: string; preview: boolean; lms: any; target: any }> {
  await expect.poll(async () => frame.evaluate(() => !!sessionStorage.getItem('enara_token')), { timeout: 60_000 }).toBe(true);
  // The product tour is not under test: mark it done for this account (as
  // "Skip tour" would), so it does not cover the page in later launches.
  const pending = await frame.evaluate(() => JSON.parse(sessionStorage.getItem('enara_user') || '{}').tourPending === true);
  if (pending) {
    const token = await frameToken(frame);
    await call('POST', '/api/auth/tour/complete', { token, ok: [200, 403] }).catch(() => undefined);
  }
  return frame.evaluate(() => {
    const user = JSON.parse(sessionStorage.getItem('enara_user') || '{}');
    const lms = JSON.parse(sessionStorage.getItem('enara_lms') || '{}');
    const target = JSON.parse(sessionStorage.getItem('enara_lms_target') || 'null');
    return { id: user.email, role: user.role, name: user.name, institutionId: user.institutionId, preview: lms.preview === true, lms, target };
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

/**
 * A browser context signed in to ENARA's own site (not through an LMS) as a
 * seeded account, through the sign-in page.
 */
export async function enaraUiSession(browser: import('@playwright/test').Browser, key: string, tab: 'ENARA team' | 'School staff' = 'ENARA team'): Promise<{ context: import('@playwright/test').BrowserContext; page: Page }> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[pageerror enara ${key}]`, String(e).slice(0, 500)));
  // ENARA's first-visit product tour (not under test) opens over the page: skip it.
  await page.addLocatorHandler(page.getByRole('button', { name: 'Skip tour' }), async (b) => { await b.click(); });
  await page.goto(`${ENARA}/`);
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await page.locator('#si-email').fill(seedEmail(key));
  await page.locator('#si-pass').fill(secrets.enaraPassword);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => page.evaluate(() => !!(sessionStorage.getItem('enara_token') || localStorage.getItem('enara_token'))), { timeout: 30_000 }).toBe(true);
  return { context, page };
}

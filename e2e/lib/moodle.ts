import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { E2E_DIR, MOODLE, RUN_DIR, secrets } from './env';

/** The test-only Moodle CLI helper (moodle/e2e_cli.php) inside the moodle container. */
export function moodleCli<T = any>(command: string, args: Record<string, string | number> = {}): T {
  const argv = ['compose', 'exec', '-T', '-u', 'www-data', 'moodle', 'php', '/e2e/e2e_cli.php', command, ...Object.entries(args).map(([k, v]) => `--${k}=${v}`)];
  const out = execFileSync('docker', argv, { cwd: E2E_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
  const last = out.trim().split('\n').filter(Boolean).pop() ?? '{}';
  return JSON.parse(last) as T;
}

export interface MoodleTool { id: number; name: string; state: number; coursevisible: number; clientid: string; categories: number[]; acceptgrades: string | null; contentitem: string | null; ltiservice_gradesynchronization: string | null; ltiservice_memberships: string | null; launchcontainer: string | null }
export const moodleTools = () => moodleCli<{ tools: MoodleTool[] }>('tools').tools;
export const moodleProvision = () => JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'moodle-provision.json'), 'utf8')) as { users: Record<string, number>; courses: Record<string, number>; categories: Record<string, number> };

export type MoodleUser = 'admin' | 'teacher.test' | 'student.test' | 'student2.test';

/** A signed-in Moodle browser context per user, reused across the run (storage state on disk). */
export async function moodleSession(browser: Browser, user: MoodleUser, opts: { permissions?: string[] } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const stateFile = path.join(RUN_DIR, `moodle-${user}.json`);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...(fs.existsSync(stateFile) ? { storageState: stateFile } : {}), ...(opts.permissions ? { permissions: opts.permissions } : {}) });
  const page = await context.newPage();
  await page.goto(`${MOODLE}/my/`);
  if (/login\/index\.php/.test(page.url())) {
    // Signs in with the context's own HTTP client (same cookie jar as the
    // pages). Typing into the form raced with Moodle's login-page scripts in
    // headless Chromium (the session behind the login token changed).
    for (let attempt = 1; ; attempt++) {
      const html = await (await context.request.get(`${MOODLE}/login/index.php`)).text();
      const token = /name="logintoken" value="([^"]+)"/.exec(html)?.[1] ?? '';
      await context.request.post(`${MOODLE}/login/index.php`, { form: { username: user, password: secrets.moodlePassword, logintoken: token, anchor: '' } });
      await page.goto(`${MOODLE}/my/`);
      if (!/login\/index\.php/.test(page.url())) break;
      if (attempt >= 3) throw new Error(`Moodle login failed for ${user}`);
    }
    await context.storageState({ path: stateFile });
  }
  return { context, page };
}

export async function sesskey(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).M.cfg.sesskey as string);
}

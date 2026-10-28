// Staging isolation guard for the frontend server (Railway staging). With
// ENARA_STAGING=true the server refuses to start unless it proxies to an
// explicit staging backend and has no direct provider keys. Messages name
// variables only, never values. Keep the host list in step with
// backend/src/config/stagingGuard.ts (a backend test checks this).

export const KNOWN_NON_STAGING_HOSTS = [
  'enara.app',
  'www.enara.app',
  'enara-sandbox-frontend.vercel.app',
  'enara-sandbox-backend.vercel.app',
  'backend-engine-copy-production.up.railway.app',
  'backend-engine-vhcz.onrender.com',
];

export function isStagingMode(source: NodeJS.ProcessEnv): boolean {
  return /^(1|true|yes)$/i.test((source.ENARA_STAGING ?? '').trim());
}

export function frontendStagingProblems(source: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  const raw = (source.BACKEND_URL ?? '').trim();
  let url: URL | null = null;
  try {
    url = raw ? new URL(raw) : null;
  } catch {
    url = null;
  }
  if (!url || !url.hostname) {
    problems.push('BACKEND_URL must be set to the staging backend URL');
  } else {
    const host = url.hostname.toLowerCase();
    // HTTPS, or plain HTTP only over Railway's private network.
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && host.endsWith('.railway.internal'))) {
      problems.push('BACKEND_URL must use https (or http to a *.railway.internal private host)');
    }
    if (KNOWN_NON_STAGING_HOSTS.includes(host)) problems.push('BACKEND_URL must not be a production or shared ENARA backend');
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') problems.push('BACKEND_URL must not be localhost in staging');
  }
  // Legacy direct provider routes in server.ts bypass the AI Gateway.
  for (const k of ['GEMINI_API_KEY', 'AVATAR_API_KEY']) {
    if ((source[k] ?? '').trim()) problems.push(`${k} must be unset in staging (direct provider calls bypass the AI Gateway and budgets)`);
  }
  if ((source.NODE_ENV ?? '').trim() !== 'production') problems.push('NODE_ENV must be production for the staging frontend (serves the built app)');
  return problems;
}

export function assertFrontendStaging(source: NodeJS.ProcessEnv): void {
  const problems = frontendStagingProblems(source);
  if (problems.length) throw new Error(`Frontend staging isolation check failed (ENARA_STAGING=true): ${problems.join('; ')}`);
}

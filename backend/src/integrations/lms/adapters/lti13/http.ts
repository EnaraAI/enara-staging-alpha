import type { NextFunction, Request, Response } from 'express';
import { logger, serializeError } from '../../../../utils/logging';
import { lmsSettings } from '../../core/flags';
import { LtiError } from './errors';
import { oidcLaunch, oidcLogin, platformFrameOrigins } from './oidc';

// Express glue for /lti/login and /lti/launch: frame headers, cookies, the
// redirect to the ENARA landing page, and a plain error page.

const STATE_COOKIE_MAX_AGE = 600;

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * LTI pages are shown inside the LMS. helmet's X-Frame-Options and its CSP
 * frame-ancestors 'self' are replaced on /lti/* only (every other route keeps
 * today's headers). EVERY /lti/* response needs this, success redirects
 * included: Chrome applies frame-ancestors to each response in a framed
 * navigation, so a redirect still carrying 'self' is blocked with Chrome's
 * generic "might be temporarily down" page (first MoodleCloud test,
 * 2026-11-17). Responses may be framed by the registered platform's origins
 * (or, when the platform is unknown, by any https page: error pages carry no
 * actions and no data).
 */
export function setFrameHeaders(res: Response, origins: string[] | 'any-https'): void {
  res.removeHeader('X-Frame-Options');
  const ancestors = origins === 'any-https' ? "'self' https:" : ["'self'", ...origins].join(' ');
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${ancestors}; base-uri 'none'; form-action 'none'`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function stateCookie(name: string, value: string, maxAge: number): string {
  // Partitioned (CHIPS) lets Chrome keep it inside the LMS iframe even with
  // third-party cookies blocked; where it is still dropped, the launch runs
  // cookieless (counted and logged).
  return `${name}=${value}; Path=/lti; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

function errorPage(res: Response, error: LtiError): void {
  setFrameHeaders(res, error.context.frameOrigins?.length ? error.context.frameOrigins : 'any-https');
  res
    .status(error.status)
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENARA</title>` +
        `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2937;max-width:560px;margin:48px auto;padding:0 20px}h1{font-size:20px}p{line-height:1.5}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}</style></head>` +
        `<body><h1>We couldn't open ENARA</h1><p>${escapeHtml(error.message)}</p><p>Reference: <code>${escapeHtml(error.code)}</code></p></body></html>`,
    );
}

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((error) => {
      if (error instanceof LtiError) return errorPage(res, error);
      // Never fall through to the JSON error handler: its default headers forbid
      // framing, so the LMS would show the browser's raw error instead of a page
      // with a Reference code.
      logger.error('lti_unexpected_error', { path: req.path, error: serializeError(error) });
      if (res.headersSent) return next(error);
      return errorPage(res, new LtiError('internal_error'));
    });
  };
}

function params(req: Request): Record<string, unknown> {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
  return req.method === 'POST' ? { ...(req.query as Record<string, unknown>), ...body } : (req.query as Record<string, unknown>);
}

export const ltiLogin = handle(async (req, res) => {
  const out = await oidcLogin(params(req));
  setFrameHeaders(res, platformFrameOrigins(out.platform));
  res.append('Set-Cookie', stateCookie(out.cookieName, '1', STATE_COOKIE_MAX_AGE));
  res.redirect(302, out.redirectUrl);
});

export const ltiLaunch = handle(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
  const out = await oidcLaunch(body, req.headers.cookie);
  setFrameHeaders(res, platformFrameOrigins(out.platform));
  if (!out.cookieless) res.append('Set-Cookie', stateCookie(out.stateCookieName, '', 0));
  // The token travels in the fragment: never sent to a server or in a Referer.
  const params = new URLSearchParams({ lt: out.token });
  if (out.cookieless) params.set('c', '1');
  res.redirect(303, `${lmsSettings().toolBaseUrl}/lms/launch#${params.toString()}`);
});

import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger, serializeError } from '../../../../utils/logging';
import { lmsSettings } from '../../core/flags';
import { dynamicRegistration } from './dynamicRegistration';
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
export function setFrameHeaders(res: Response, origins: string[] | 'any-https', opts: { scriptNonce?: string } = {}): void {
  res.removeHeader('X-Frame-Options');
  const ancestors = origins === 'any-https' ? "'self' https:" : ["'self'", ...origins].join(' ');
  // Only the registration pages run a script (the spec's "close" message), by nonce.
  const script = opts.scriptNonce ? `; script-src 'nonce-${opts.scriptNonce}'` : '';
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'${script}; frame-ancestors ${ancestors}; base-uri 'none'; form-action 'none'`);
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
  // Phase 2: the activity picker (the secret travels in the fragment, like the launch token).
  if ('pickerSecret' in out) {
    res.redirect(303, `${lmsSettings().toolBaseUrl}/lms/picker#${new URLSearchParams({ ps: out.pickerSecret }).toString()}`);
    return;
  }
  // The token travels in the fragment: never sent to a server or in a Referer.
  const params = new URLSearchParams({ lt: out.token });
  if (out.cookieless) params.set('c', '1');
  res.redirect(303, `${lmsSettings().toolBaseUrl}/lms/launch#${params.toString()}`);
});

// ------------------------------------------------- Dynamic Registration (Phase 1b)
//
// GET /lti/register/<code>?openid_configuration=...&registration_token=...
// Moodle opens this page inside its "Manage tools" page (any https origin may
// frame it: the platform is not known until the code and its configuration
// are checked). The page ends by posting {subject:'org.imsglobal.lti.close'}
// to window.opener || window.parent (LTI DR 1.0 §3.7; target '*' as the spec
// shows: the message carries nothing), so Moodle closes its dialog and shows
// the new tool, which the Moodle admin then activates.

const PAGE_STYLE =
  'body{font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;color:#1f2937;max-width:560px;margin:40px auto;padding:0 20px}' +
  'h1{font-size:20px}p{line-height:1.6}code{background:#f1f5f9;padding:2px 6px;border-radius:4px}' +
  'button{margin-top:12px;padding:8px 18px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-weight:600;cursor:pointer}' +
  '[dir=rtl]{text-align:right}hr{border:0;border-top:1px solid #e2e8f0;margin:20px 0}';

function closeScript(nonce: string, autoCloseMs?: number): string {
  const auto = autoCloseMs ? `setTimeout(c,${autoCloseMs});` : '';
  return `<script nonce="${nonce}">(function(){function c(){var t=window.opener||window.parent;if(t&&t!==window){t.postMessage({subject:'org.imsglobal.lti.close'},'*');}}` +
    `var b=document.getElementById('close');if(b){b.addEventListener('click',c);}${auto}})();</script>`;
}

function registrationPage(res: Response, status: number, body: string, autoCloseMs?: number): void {
  const nonce = randomBytes(16).toString('base64');
  setFrameHeaders(res, 'any-https', { scriptNonce: nonce });
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENARA</title><style>${PAGE_STYLE}</style></head>` +
        `<body>${body}<button id="close" type="button">Close · إغلاق</button>${closeScript(nonce, autoCloseMs)}</body></html>`,
    );
}

function registrationErrorPage(res: Response, error: LtiError): void {
  registrationPage(
    res,
    error.status,
    `<h1>ENARA could not be connected</h1><p>${escapeHtml(error.message)}</p><p>Reference: <code>${escapeHtml(error.code)}</code></p>` +
      `<hr><div dir="rtl" lang="ar"><h1>تعذّر ربط ENARA</h1><p>لم يكتمل ربط ENARA بنظام إدارة التعلّم. أرسل الرمز المرجعي أدناه إلى فريق ENARA أو إلى مسؤول مدرستك.</p><p>الرمز المرجعي: <code dir="ltr">${escapeHtml(error.code)}</code></p></div>`,
  );
}

const SUCCESS_AUTO_CLOSE_MS = 5000;

export const ltiRegister = (req: Request, res: Response, next: NextFunction) => {
  const q = req.query as Record<string, unknown>;
  dynamicRegistration({ code: req.params.code, openidConfiguration: q.openid_configuration, registrationToken: q.registration_token })
    .then((out) => {
      const pending = out.status === 'pending';
      const en =
        '<h1>ENARA is registered.</h1><p>Click <b>Activate</b> in Moodle.</p>' +
        (pending ? '<p>ENARA will approve this connection before teachers and students can use it.</p>' : '') +
        (out.alreadyConnected ? '<p>Note: this LMS was already connected to ENARA for this school. Both connections are kept; ask ENARA to switch off the one you do not need.</p>' : '');
      const ar =
        '<h1>تم تسجيل ENARA.</h1><p>اضغط على <b>Activate</b> (تفعيل) في Moodle.</p>' +
        (pending ? '<p>سيوافق فريق ENARA على هذا الاتصال قبل أن يتمكن المعلمون والطلاب من استخدامه.</p>' : '') +
        (out.alreadyConnected ? '<p>ملاحظة: هذا النظام متصل بالفعل بـ ENARA لهذه المدرسة. سيُحتفظ بالاتصالين؛ اطلب من ENARA إيقاف الاتصال غير المطلوب.</p>' : '');
      registrationPage(res, 200, `${en}<hr><div dir="rtl" lang="ar">${ar}</div>`, SUCCESS_AUTO_CLOSE_MS);
    })
    .catch((error) => {
      if (error instanceof LtiError) return registrationErrorPage(res, error);
      // Never the JSON error handler (its headers forbid framing); never the query (it holds the token).
      logger.error('lti_unexpected_error', { path: '/lti/register', error: serializeError(error) });
      if (res.headersSent) return next(error);
      return registrationErrorPage(res, new LtiError('internal_error'));
    });
};

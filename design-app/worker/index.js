// design.enara.app: serves the built app (static assets) and adds security headers to every response.
// Cloudflare Access sits in front of this hostname (only people you allow, plus the check service token).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lms-test.enara.app https://*.r2.cloudflarestorage.com",
  "font-src 'self' data:",
  "media-src 'self' blob: https://lms-test.enara.app https://*.r2.cloudflarestorage.com",
  "connect-src 'self' https://lms-test.enara.app https://rt.enara.app wss://rt.enara.app https://*.anam.ai wss://*.anam.ai",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    if (new URL(request.url).pathname === '/' || out.headers.get('content-type')?.includes('text/html')) out.headers.set('Cache-Control', 'no-cache');
    return out;
  },
};

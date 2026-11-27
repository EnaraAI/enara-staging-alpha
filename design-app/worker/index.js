// design.enara.app: serves the built app (static assets) and adds security headers to every response.
// Cloudflare Access sits in front of this hostname (only people you allow, plus the check service token).
// The kids app (#/kids) is lms-test's own kids app (src/lms), which lms-test serves with no CSP. Added for it, and nothing else:
// blob: scripts (ElevenLabs speech-to-text loads its microphone audio worklet from a blob: URL in the kids avatar call),
// Google Fonts (the same families frontend/index.html loads), ElevenLabs directly (the copied app's fallback when the
// rt.enara.app relay does not answer, as on lms-test), and YouTube / Vimeo players for lesson videos.
const CSP = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://lms-test.enara.app https://*.r2.cloudflarestorage.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' blob: https://lms-test.enara.app https://*.r2.cloudflarestorage.com",
  "connect-src 'self' https://lms-test.enara.app https://rt.enara.app wss://rt.enara.app https://*.anam.ai wss://*.anam.ai https://api.elevenlabs.io wss://api.elevenlabs.io",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

const LMS_TEST = 'https://lms-test.enara.app';

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
    // The copied kids app uses some server paths as lms-test returns them, relative to its own origin
    // (/api/tutor-faces/image/…, lesson videos under /uploads/…): send those reads to lms-test. Never test.enara.app.
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && /^\/(api|uploads)\//.test(url.pathname)) {
      return new Response(null, { status: 302, headers: { ...HEADERS, Location: `${LMS_TEST}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    if (new URL(request.url).pathname === '/' || out.headers.get('content-type')?.includes('text/html')) out.headers.set('Cache-Control', 'no-cache');
    return out;
  },
};

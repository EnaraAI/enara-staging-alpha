// Enara realtime relay (Cloudflare Worker, rt.enara.app).
// Live calls send the video avatar's signalling and the speech-to-text stream
// here instead of to the providers, so the browser only ever talks to Enara.
// It forwards only to the providers' own hosts, and only for Enara pages.
//
//   GET  /health                 relay check used by the browser before a call
//   *    /v/...                  video provider REST (target in X-Anam-Target-Url)
//   WS   /v/ws?target_url=...    video provider signalling
//   WS   /s/v1/...               speech-to-text realtime stream
//
// Live video and audio (WebRTC) still flow directly between the browser and
// the video provider's media servers.

const ALLOWED_ORIGIN = /^(https:\/\/test\.enara\.app|https:\/\/enara-staging-alpha(-[a-z0-9]+)?(-[a-z0-9-]+)?\.vercel\.app|http:\/\/localhost:\d+)$/;
const VIDEO_HOST = (host) => host === 'anam.ai' || host.endsWith('.anam.ai');
const STT_ORIGIN = 'https://api.elevenlabs.io';
// Upstream headers that would name the provider in the browser.
const DROP_RESPONSE = /^(server|via|x-envoy-[a-z-]*|x-amz[a-z-]*|x-cloud-trace-context|x-request-id|request-id|x-trace-id|alt-svc|x-anam[a-z-]*|x-eleven[a-z-]*|report-to|nel|access-control-[a-z-]*)$/i;
const DROP_REQUEST = /^(x-anam-target-url|host|cf-[a-z-]*|x-forwarded-[a-z-]*|x-real-ip)$/i;

function cors(origin) {
  return origin && ALLOWED_ORIGIN.test(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }
    : {};
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) },
  });
}

function targetFor(url, request) {
  if (url.pathname.startsWith('/s/')) {
    const t = new URL(STT_ORIGIN + url.pathname.slice(2) + url.search);
    return t.pathname.startsWith('/v1/speech-to-text/') ? t : null;
  }
  if (url.pathname === '/v/ws') {
    const raw = url.searchParams.get('target_url');
    if (!raw) return null;
    const t = new URL(raw);
    if (t.protocol !== 'wss:' && t.protocol !== 'https:') return null;
    t.protocol = 'https:';
    return VIDEO_HOST(t.hostname) ? t : null;
  }
  if (url.pathname.startsWith('/v/')) {
    const raw = request.headers.get('X-Anam-Target-Url');
    if (!raw) return null;
    const t = new URL(raw);
    return t.protocol === 'https:' && VIDEO_HOST(t.hostname) ? t : null;
  }
  return null;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors(origin),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600',
        },
      });
    }
    if (url.pathname === '/health') return reply(200, { ok: true }, origin);
    // Browsers always send Origin on these calls: anything else is not an Enara page.
    if (!ALLOWED_ORIGIN.test(origin)) return reply(403, { error: 'forbidden' }, origin);
    let target;
    try {
      target = targetFor(url, request);
    } catch {
      target = null;
    }
    if (!target) return reply(400, { error: 'not a relay route' }, origin);

    const headers = new Headers();
    for (const [k, v] of request.headers) if (!DROP_REQUEST.test(k)) headers.set(k, v);
    const upstream = await fetch(target.href, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    // WebSocket upgrades pass straight through.
    if (upstream.status === 101 || upstream.webSocket) return upstream;
    const out = new Headers();
    for (const [k, v] of upstream.headers) if (!DROP_RESPONSE.test(k)) out.set(k, v);
    for (const [k, v] of Object.entries(cors(origin))) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  },
};

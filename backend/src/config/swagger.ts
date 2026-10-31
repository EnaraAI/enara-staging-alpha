import { Express, Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec, type ServerRoute } from '../swagger/openapi';

// Every route mounted on the app (Express 4 router stack), read when the docs
// are requested so new routes appear without editing the spec.
function mountPath(layer: any): string {
  if (layer.regexp?.fast_slash) return '';
  const src: string = layer.regexp?.source ?? '';
  return src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/i, '').replace(/\\\//g, '/').replace(/\$$/, '');
}
function collectRoutes(stack: any[], prefix: string, out: ServerRoute[]): ServerRoute[] {
  for (const layer of stack ?? []) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        if (typeof p !== 'string') continue;
        for (const m of Object.keys(layer.route.methods)) out.push({ method: m, path: ((prefix + p).replace(/\/+$/, '') || '/') });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      collectRoutes(layer.handle.stack, prefix + mountPath(layer), out);
    }
  }
  return out;
}
function serverRoutes(app: Express): ServerRoute[] {
  const stack = (app as any)._router?.stack ?? [];
  return collectRoutes(stack, '', []).filter((r) => r.path.startsWith('/api/') && !r.path.startsWith('/api/docs'));
}

function getServerUrl(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(',')[0]?.trim() ||
    req.protocol ||
    'https';

  const forwardedHost = req.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim() ||
    req.get('host');

  if (host) {
    return `${protocol}://${host}`;
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }

  const port = process.env.PORT || '3001';
  return `http://localhost:${port}`;
}

// The docs are behind a password (HTTP Basic: any user name, the password in
// API_DOCS_PASSWORD). Without that setting they are closed on production
// servers and open only for local development and tests.
function docsGate(req: Request, res: Response, next: NextFunction) {
  const password = process.env.API_DOCS_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') { res.status(404).json({ message: 'Not found' }); return; }
    return next();
  }
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const supplied = given.includes(':') ? given.slice(given.indexOf(':') + 1) : '';
  const digest = (s: string) => createHash('sha256').update(s).digest();
  if (supplied && timingSafeEqual(digest(supplied), digest(password))) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="ENARA API docs", charset="UTF-8"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).send('Password required for the ENARA API docs.');
}

export function setupSwagger(app: Express): void {
  // Two addresses: /api-docs (local and container hosts) and /api/docs, which
  // Vercel sends to the backend (its other paths go to the web app).
  for (const base of ['/api-docs', '/api/docs']) mountDocs(app, base);
}

function mountDocs(app: Express, base: string): void {
  app.use(`${base}.json`, docsGate);
  app.use(base, docsGate);
  app.get(`${base}.json`, (req: Request, res: Response) => {
    res.json(buildOpenApiSpec(getServerUrl(req), serverRoutes(app)));
  });

  const page = (req: Request, res: Response, next: NextFunction) => {
    const spec = buildOpenApiSpec(getServerUrl(req), serverRoutes(app));
    swaggerUi.setup(spec, {
      customSiteTitle: 'ENARA API',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: true,
      },
    })(req, res, next);
  };
  // The page also lives at `${base}/ui`: on Vercel, /api/ addresses ending in
  // a slash go to the web app, so `${base}/` never reaches the backend there.
  // Its scripts and styles load relative to it, from `${base}/…`.
  app.get(`${base}/ui`, page);
  app.get(base, (req: Request, res: Response, next: NextFunction) => {
    if (req.path === base) return res.redirect(`${base}/ui`);
    next();
  });
  app.use(base, swaggerUi.serve);
  app.use(base, page);
}

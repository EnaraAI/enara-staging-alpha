import { Express, Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from '../swagger/openapi';

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

export function setupSwagger(app: Express): void {
  app.get('/api-docs.json', (req: Request, res: Response) => {
    res.json(buildOpenApiSpec(getServerUrl(req)));
  });

  app.use('/api-docs', swaggerUi.serve);
  app.use('/api-docs', (req: Request, res: Response, next: NextFunction) => {
    const spec = buildOpenApiSpec(getServerUrl(req));
    swaggerUi.setup(spec, {
      customSiteTitle: 'Enara Curriculum Center API',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: true,
      },
    })(req, res, next);
  });
}

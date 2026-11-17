import { Router, type NextFunction, type Request, type Response } from 'express';
import { lmsFlags } from './core/flags';
import { ensureActiveKey, getPublicJwks } from './core/keys';
import { ltiLaunch, ltiLogin } from './adapters/lti13/http';

// Public LTI endpoints: the tool's JWKS (Phase 0), the OIDC login and the
// resource-link launch (Phase 1a). With LMS_LTI_ENABLED
// off (or the LMS config broken) every route here falls through to the app's
// normal 404, so the site behaves exactly as before.
export function requireLti(_req: Request, _res: Response, next: NextFunction) {
  if (!lmsFlags().lti) return next('router');
  next();
}

async function jwks(_req: Request, res: Response, next: NextFunction) {
  try {
    await ensureActiveKey();
    const body = await getPublicJwks();
    res.set('Cache-Control', 'public, max-age=300');
    res.type('application/json').json(body);
  } catch (error) {
    next(error);
  }
}

export const ltiRouter = Router();
ltiRouter.use(requireLti);
ltiRouter.get('/jwks', jwks);
// OIDC third-party-initiated login: platforms may use GET or POST.
ltiRouter.get('/login', ltiLogin);
ltiRouter.post('/login', ltiLogin);
ltiRouter.post('/launch', ltiLaunch);

export const wellKnownRouter = Router();
wellKnownRouter.use(requireLti);
wellKnownRouter.get('/jwks.json', jwks);

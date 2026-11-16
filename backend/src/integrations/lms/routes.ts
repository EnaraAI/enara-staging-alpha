import { Router, type NextFunction, type Request, type Response } from 'express';
import { lmsFlags } from './core/flags';
import { ensureActiveKey, getPublicJwks } from './core/keys';

// Public LTI endpoints. Phase 0: the tool's JWKS only. With LMS_LTI_ENABLED
// off (or the LMS config broken) every route here falls through to the app's
// normal 404, so the site behaves exactly as before.
function requireLti(_req: Request, _res: Response, next: NextFunction) {
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

export const wellKnownRouter = Router();
wellKnownRouter.use(requireLti);
wellKnownRouter.get('/jwks.json', jwks);

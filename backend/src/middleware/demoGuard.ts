import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/jwt';
import { isDemoSessionInstitution } from '../config/demo';
import { User } from '../models/User';

// Demo-session accounts may try everything a school does with its own data,
// but nothing that reaches outside the demo or outlives it: no invitations or
// new accounts (they would email real people), no account or password
// changes, no file uploads, no API keys or ingestion.
const BLOCKED: [RegExp, RegExp][] = [
  [/^(POST|PUT|PATCH|DELETE)$/, /^\/api\/workspace\/(invitations|users)(\/|$)/],
  [/^POST$/, /^\/api\/auth\/(users|register|password-reset)(\/|$)/],
  [/^POST$/, /^\/api\/students\/?$/],
  [/^(POST|PUT)$/, /^\/api\/(upload|ingestion|integrations)(\/|$)/],
  [/^POST$/, /^\/api\/documents(\/|$)/],
  [/^POST$/, /^\/api\/curriculums\/[^/]+\/(upload|uploads|direct-upload)/],
  [/^PUT$/, /^\/api\/workspace\/document-retention$/],
];

export async function demoGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const h = req.headers.authorization;
  // Mounted under /api: match the full path.
  const path = req.originalUrl.split('?')[0];
  if (!h?.startsWith('Bearer ') || !BLOCKED.some(([m, p]) => m.test(req.method) && p.test(path))) return next();
  let institutionId: string | undefined;
  try {
    const user = await User.findById(verifyAccessToken(h.slice(7)).subject).select('institutionId').lean();
    institutionId = user?.institutionId;
  } catch {
    return next();
  }
  if (!isDemoSessionInstitution(institutionId)) return next();
  res.status(403).json({
    error: { code: 'DEMO_RESTRICTED', message: "This isn't available in the demo." },
    message: "This isn't available in the demo.",
  });
}

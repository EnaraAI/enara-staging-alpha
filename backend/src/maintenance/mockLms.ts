import { createHash, randomBytes } from 'crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type { JWK } from 'jose';
import { Schema, model, models, type Model } from 'mongoose';
import { LmsCryptoError, decryptSecret, encryptSecret } from '../integrations/lms/core/crypto';
import { lmsSettings } from '../integrations/lms/core/flags';
import { loadJose } from '../integrations/lms/core/jose';
import { getPublicJwks } from '../integrations/lms/core/keys';
import { maintenanceAuthorised } from './guards';

// A built-in MOCK LMS (LTI 1.3 platform) for the continuous-delivery health
// check on lms-test.enara.app (docs/lms/CONTINUOUS_DELIVERY.md). It is served
// by the app itself under /api/maintenance/mock-lms/* and so exists only where
// the maintenance routes exist (switch on, MONGODB_URI on the test cluster, a
// maintenance token configured: routes.ts). Everything it touches is fake and
// belongs to the fake school LT-SCHOOL-A, with IDs starting "health".
//
//   GET  /jwks                         the mock platform's public key
//   GET  /auth  (also POST)            OIDC authorization: takes the tool's login
//                                      redirect parameters, answers with a signed
//                                      id_token (JSON, or an auto-submitting form).
//                                      Needs the maintenance Bearer token: without
//                                      it, anyone could sign in to the fake school.
//   POST /token                        OAuth2 client_credentials; the client
//                                      assertion must verify against ENARA's own
//                                      JWKS (iss = sub = the mock's client_id,
//                                      aud = this token URL). Opaque access token,
//                                      stored only as a hash, 1 hour.
//   GET/POST /lineitems                AGS line items container (one line item)
//   GET  /lineitems/:li/lineitem       the line item
//   POST /lineitems/:li/lineitem/scores  records the score (lms_mock_scores)
//   GET  /lineitems/:li/lineitem/results the last score per user
//   GET  /memberships/:course          NRPS: one teacher and one student
// The service endpoints need an access token from /token.
//
// The platform's key pair is generated once and kept in lms_mock_lms_keys, the
// private key encrypted with the LMS crypto helpers (LMS_KEK). Scores and
// tokens expire on their own (TTL indexes).

export const MOCK_PATH = '/api/maintenance/mock-lms';
export const HEALTH = {
  institutionId: 'LT-SCHOOL-A',
  platformName: 'Mock LMS (health check)',
  clientId: 'health-check-mock-lms',
  deploymentId: 'health-deployment-1',
  contextId: 'health-course-1',
  resourceLinkId: 'health-rl-1',
  lineItemKey: 'health-1',
  assessmentId: 'LT-AS-HEALTH-CHECK',
  teacherSub: 'health-teacher-1',
  studentSub: 'health-student-1',
  emailDomain: 'lms-test.example',
  createdBy: 'system:health-check',
} as const;

const LTI = 'https://purl.imsglobal.org/spec/lti/claim/';
const LIS = 'http://purl.imsglobal.org/vocab/lis/v2/membership#';
const AGS = 'https://purl.imsglobal.org/spec/lti-ags/scope/';
const NRPS_SCOPE = 'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';
const SERVICE_SCOPES = [`${AGS}lineitem`, `${AGS}lineitem.readonly`, `${AGS}result.readonly`, `${AGS}score`, NRPS_SCOPE];
const TOKEN_TTL_S = 3600;
const SCORE_TTL_S = 30 * 86_400;
const ALG = 'RS256';

export interface MockUser {
  sub: string;
  role: 'teacher' | 'student';
  name: string;
  givenName: string;
  familyName: string;
}
export const MOCK_USERS: Record<string, MockUser> = {
  [HEALTH.teacherSub]: { sub: HEALTH.teacherSub, role: 'teacher', name: 'Health Teacher (fake)', givenName: 'Health', familyName: 'Teacher' },
  [HEALTH.studentSub]: { sub: HEALTH.studentSub, role: 'student', name: 'Health Student (fake)', givenName: 'Health', familyName: 'Student' },
};
const ROLES = { teacher: [`${LIS}Instructor`], student: [`${LIS}Learner`] } as const;
const emailOf = (sub: string) => `${sub}@${HEALTH.emailDomain}`;

// ------------------------------------------------------------------ models

interface IMockKey {
  name: string;
  kid: string;
  publicJwk: JWK;
  privateKeyEnc: string;
  createdAt: Date;
}
const keySchema = new Schema<IMockKey>(
  {
    name: { type: String, required: true, unique: true },
    kid: { type: String, required: true },
    publicJwk: { type: Schema.Types.Mixed, required: true },
    privateKeyEnc: { type: String, required: true, select: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'lms_mock_lms_keys', versionKey: false },
);

interface IMockToken {
  tokenHash: string;
  scopes: string[];
  expiresAt: Date;
}
const tokenSchema = new Schema<IMockToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    scopes: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'lms_mock_lms_tokens', versionKey: false },
);
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface IMockScore {
  lineItem: string;
  userId: string;
  scoreGiven?: number;
  scoreMaximum?: number;
  activityProgress?: string;
  gradingProgress?: string;
  timestamp?: string;
  receivedAt: Date;
}
const scoreSchema = new Schema<IMockScore>(
  {
    lineItem: { type: String, required: true },
    userId: { type: String, required: true },
    scoreGiven: Number,
    scoreMaximum: Number,
    activityProgress: String,
    gradingProgress: String,
    timestamp: String,
    receivedAt: { type: Date, required: true },
  },
  { collection: 'lms_mock_scores', versionKey: false },
);
scoreSchema.index({ userId: 1, receivedAt: -1 });
scoreSchema.index({ receivedAt: 1 }, { expireAfterSeconds: SCORE_TTL_S });

export const MockLmsKey = (models.MockLmsKey as Model<IMockKey>) || model<IMockKey>('MockLmsKey', keySchema);
export const MockLmsToken = (models.MockLmsToken as Model<IMockToken>) || model<IMockToken>('MockLmsToken', tokenSchema);
export const MockLmsScore = (models.MockLmsScore as Model<IMockScore>) || model<IMockScore>('MockLmsScore', scoreSchema);

let indexesReady: Promise<unknown> | undefined;
/** Unique and TTL indexes of the mock's three collections (once per process). */
export function ensureMockIndexes(): Promise<unknown> {
  indexesReady ??= Promise.all([MockLmsKey.createIndexes(), MockLmsToken.createIndexes(), MockLmsScore.createIndexes()]).catch((e) => {
    indexesReady = undefined;
    throw e;
  });
  return indexesReady;
}

// ---------------------------------------------------------------- the key

const KEY_NAME = 'health';
const keyAad = (kid: string) => `lms_mock_lms_keys:${kid}`;

/** The mock platform's key pair: created once (race-safe through the unique name), then reused. */
export async function ensureMockKey(): Promise<{ kid: string; publicJwk: JWK }> {
  await ensureMockIndexes();
  const existing = await MockLmsKey.findOne({ name: KEY_NAME }).lean();
  if (existing) return { kid: existing.kid, publicJwk: existing.publicJwk };
  const { generateKeyPair, exportJWK, exportPKCS8, calculateJwkThumbprint } = await loadJose();
  const { publicKey, privateKey } = await generateKeyPair(ALG, { modulusLength: 2048, extractable: true });
  const jwk = await exportJWK(publicKey);
  const kid = `health-${(await calculateJwkThumbprint(jwk, 'sha256')).slice(0, 16)}`;
  const publicJwk: JWK = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: ALG, use: 'sig' };
  try {
    await MockLmsKey.create({ name: KEY_NAME, kid, publicJwk, privateKeyEnc: encryptSecret(await exportPKCS8(privateKey), keyAad(kid)) });
    return { kid, publicJwk };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await MockLmsKey.findOne({ name: KEY_NAME }).lean();
    if (!winner) throw error;
    return { kid: winner.kid, publicJwk: winner.publicJwk };
  }
}

async function signingKey(retry = true): Promise<{ kid: string; key: Awaited<ReturnType<Awaited<ReturnType<typeof loadJose>>['importPKCS8']>> }> {
  await ensureMockKey();
  const row = await MockLmsKey.findOne({ name: KEY_NAME }).select('+privateKeyEnc').lean();
  if (!row) throw new Error('mock LMS key missing');
  const { importPKCS8 } = await loadJose();
  let pem: string;
  try {
    pem = decryptSecret(row.privateKeyEnc, keyAad(row.kid));
  } catch (error) {
    // LMS_KEK changed without LMS_KEK_PREVIOUS: the fake platform simply gets a new key (new kid; ENARA refetches the JWKS).
    if (!(error instanceof LmsCryptoError) || !retry) throw error;
    await MockLmsKey.deleteOne({ name: KEY_NAME, kid: row.kid });
    return signingKey(false);
  }
  return { kid: row.kid, key: await importPKCS8(pem, ALG) };
}

// ------------------------------------------------------------------- URLs

/** The tool's public origin (LMS_TOOL_BASE_URL); the mock lives on the same origin. */
export function toolBase(): string | undefined {
  return lmsSettings().toolBaseUrl;
}
export const mockIssuer = (base: string) => `${base}${MOCK_PATH}`;
export const mockUrls = (base: string) => {
  const iss = mockIssuer(base);
  return {
    issuer: iss,
    authLoginUrl: `${iss}/auth`,
    keysetUrl: `${iss}/jwks`,
    tokenUrl: `${iss}/token`,
    lineItems: `${iss}/lineitems`,
    lineItem: `${iss}/lineitems/${HEALTH.lineItemKey}/lineitem`,
    memberships: `${iss}/memberships/${HEALTH.contextId}`,
  };
};

// -------------------------------------------------------------- id_token

/** The launch claims of the health-check activity for one of the two mock users. */
export function launchClaims(base: string, user: MockUser, nonce: string): Record<string, unknown> {
  const u = mockUrls(base);
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: u.issuer,
    aud: HEALTH.clientId,
    sub: user.sub,
    nonce,
    iat: now,
    exp: now + 300,
    name: user.name,
    given_name: user.givenName,
    family_name: user.familyName,
    email: emailOf(user.sub),
    [`${LTI}message_type`]: 'LtiResourceLinkRequest',
    [`${LTI}version`]: '1.3.0',
    [`${LTI}deployment_id`]: HEALTH.deploymentId,
    [`${LTI}target_link_uri`]: `${base}/lti/launch`,
    [`${LTI}resource_link`]: { id: HEALTH.resourceLinkId, title: 'Health check activity (fake)' },
    [`${LTI}roles`]: [...ROLES[user.role]],
    [`${LTI}context`]: { id: HEALTH.contextId, label: 'HEALTH', title: 'Health check course (fake)', type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering'] },
    [`${LTI}custom`]: { enara_assessment: HEALTH.assessmentId },
    [`${LTI}launch_presentation`]: { document_target: 'iframe' },
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
      scope: [`${AGS}lineitem`, `${AGS}result.readonly`, `${AGS}score`],
      lineitems: u.lineItems,
      lineitem: u.lineItem,
    },
    'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': { context_memberships_url: u.memberships, service_versions: ['2.0'] },
  };
}

export async function signIdToken(claims: Record<string, unknown>): Promise<string> {
  const { SignJWT } = await loadJose();
  const { kid, key } = await signingKey();
  return new SignJWT(claims).setProtectedHeader({ alg: ALG, kid, typ: 'JWT' }).sign(key);
}

// ----------------------------------------------------------------- router

const sha = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const str = (v: unknown, max = 2048) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function needBase(res: Response): string | undefined {
  const base = toolBase();
  if (!base) res.status(409).json({ error: 'lti_not_configured' });
  return base;
}

export const mockLmsRouter = Router();
mockLmsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// AGS and NRPS media types are JSON (the app's parser only reads application/json).
mockLmsRouter.use(express.json({ limit: '64kb', type: ['application/json', 'application/*+json'] }));

mockLmsRouter.get(
  '/jwks',
  wrap(async (_req, res) => {
    const { publicJwk } = await ensureMockKey();
    res.json({ keys: [publicJwk] });
  }),
);

// OIDC authorization endpoint (the tool's /lti/login redirects here).
const auth = wrap(async (req, res) => {
  if (!maintenanceAuthorised(req.headers.authorization)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const base = needBase(res);
  if (!base) return;
  const p = { ...(req.query as Record<string, unknown>), ...((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>) };
  const user = MOCK_USERS[str(p.login_hint, 200) ?? ''];
  const state = str(p.state, 512);
  const nonce = str(p.nonce, 512);
  const redirect = str(p.redirect_uri);
  const problem =
    p.client_id !== HEALTH.clientId ? 'invalid_client' :
    redirect !== `${base}/lti/launch` ? 'invalid_redirect_uri' :
    !user ? 'unknown_login_hint' :
    !state || !nonce ? 'missing_state_or_nonce' :
    p.response_type !== 'id_token' || p.scope !== 'openid' ? 'invalid_request' : undefined;
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const idToken = await signIdToken(launchClaims(base, user!, nonce!));
  if (String(req.headers.accept ?? '').includes('application/json')) {
    res.json({ id_token: idToken, state, form_action: redirect });
    return;
  }
  // A browser: the usual form_post, submitted by a script allowed by its nonce.
  const scriptNonce = randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${scriptNonce}'; form-action ${base}; base-uri 'none'; frame-ancestors 'none'`);
  res.status(200).type('html').send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mock LMS (health check)</title></head><body>` +
      `<form id="f" method="post" action="${escapeHtml(redirect!)}"><input type="hidden" name="id_token" value="${escapeHtml(idToken)}">` +
      `<input type="hidden" name="state" value="${escapeHtml(state!)}"><noscript><button type="submit">Continue</button></noscript></form>` +
      `<script nonce="${scriptNonce}">document.getElementById('f').submit();</script></body></html>`,
  );
});
mockLmsRouter.get('/auth', auth);
mockLmsRouter.post('/auth', auth);

// OAuth2 token endpoint: client_credentials with ENARA's signed client assertion.
mockLmsRouter.post(
  '/token',
  wrap(async (req, res) => {
    const base = needBase(res);
    if (!base) return;
    const form = (req.body ?? {}) as Record<string, unknown>;
    if (form.grant_type !== 'client_credentials' || form.client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' || !str(form.client_assertion, 16_384)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const { jwtVerify, createLocalJWKSet } = await loadJose();
    try {
      await jwtVerify(form.client_assertion as string, createLocalJWKSet(await getPublicJwks()), {
        algorithms: [ALG],
        issuer: HEALTH.clientId,
        subject: HEALTH.clientId,
        audience: mockUrls(base).tokenUrl,
        requiredClaims: ['exp', 'iat', 'jti'],
        maxTokenAge: '10m',
      });
    } catch {
      res.status(401).json({ error: 'invalid_client' });
      return;
    }
    const asked = (str(form.scope, 2000) ?? '').split(' ').filter(Boolean);
    const scopes = asked.length ? asked.filter((s) => SERVICE_SCOPES.includes(s)) : SERVICE_SCOPES;
    if (!scopes.length) {
      res.status(400).json({ error: 'invalid_scope' });
      return;
    }
    const token = randomBytes(32).toString('base64url');
    await ensureMockIndexes();
    await MockLmsToken.create({ tokenHash: sha(token), scopes, expiresAt: new Date(Date.now() + TOKEN_TTL_S * 1000) });
    res.json({ access_token: token, token_type: 'Bearer', expires_in: TOKEN_TTL_S, scope: scopes.join(' ') });
  }),
);

/** AGS / NRPS: a valid access token from /token with the needed scope (answers 401/403 itself). */
async function serviceAllowed(req: Request, res: Response, scopeOk: (scopes: string[]) => boolean): Promise<boolean> {
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''));
  const row = m ? await MockLmsToken.findOne({ tokenHash: sha(m[1]) }).lean() : null;
  if (!row || row.expiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  if (!scopeOk(row.scopes)) {
    res.status(403).json({ error: 'insufficient_scope' });
    return false;
  }
  return true;
}
const has = (...wanted: string[]) => (scopes: string[]) => wanted.some((w) => scopes.includes(w));

function withService(scopeOk: (scopes: string[]) => boolean, fn: (req: Request, res: Response, base: string) => Promise<void> | void) {
  return wrap(async (req, res) => {
    const base = needBase(res);
    if (!base || !(await serviceAllowed(req, res, scopeOk))) return;
    await fn(req, res, base);
  });
}

function lineItemOf(base: string) {
  return {
    id: mockUrls(base).lineItem,
    label: 'Health check activity (fake)',
    scoreMaximum: 100,
    resourceLinkId: HEALTH.resourceLinkId,
    resourceId: HEALTH.assessmentId,
  };
}
const LINE_ITEM_READ = has(`${AGS}lineitem`, `${AGS}lineitem.readonly`);

mockLmsRouter.get(
  '/lineitems',
  withService(LINE_ITEM_READ, (req, res, base) => {
    const rl = req.query.resource_link_id;
    res.type('application/vnd.ims.lis.v2.lineitemcontainer+json').send(JSON.stringify(!rl || rl === HEALTH.resourceLinkId ? [lineItemOf(base)] : []));
  }),
);
mockLmsRouter.post(
  '/lineitems',
  withService(has(`${AGS}lineitem`), (_req, res, base) => {
    // One line item per resource link: creating returns the existing one.
    res.status(201).type('application/vnd.ims.lis.v2.lineitem+json').send(JSON.stringify(lineItemOf(base)));
  }),
);
mockLmsRouter.get(
  `/lineitems/:li/lineitem`,
  withService(LINE_ITEM_READ, (req, res, base) => {
    if (req.params.li !== HEALTH.lineItemKey) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.type('application/vnd.ims.lis.v2.lineitem+json').send(JSON.stringify(lineItemOf(base)));
  }),
);
mockLmsRouter.post(
  `/lineitems/:li/lineitem/scores`,
  withService(has(`${AGS}score`), async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const userId = str(body.userId, 255);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    if (req.params.li !== HEALTH.lineItemKey) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!userId || !str(body.activityProgress, 40) || !str(body.gradingProgress, 40) || !str(body.timestamp, 64)) {
      res.status(400).json({ error: 'invalid_score' });
      return;
    }
    await MockLmsScore.create({
      lineItem: HEALTH.lineItemKey,
      userId,
      scoreGiven: num(body.scoreGiven),
      scoreMaximum: num(body.scoreMaximum),
      activityProgress: str(body.activityProgress, 40),
      gradingProgress: str(body.gradingProgress, 40),
      timestamp: str(body.timestamp, 64),
      receivedAt: new Date(),
    });
    res.status(200).end();
  }),
);
mockLmsRouter.get(
  `/lineitems/:li/lineitem/results`,
  withService(has(`${AGS}result.readonly`), async (req, res, base) => {
    const item = mockUrls(base).lineItem;
    const userFilter = str(req.query.user_id, 255);
    const rows = await MockLmsScore.find({ lineItem: HEALTH.lineItemKey, ...(userFilter ? { userId: userFilter } : {}) }).sort({ receivedAt: -1 }).limit(50).lean();
    const latest = new Map<string, IMockScore>();
    for (const r of rows) if (!latest.has(r.userId)) latest.set(r.userId, r);
    const out = [...latest.values()].map((r) => ({
      id: `${item}/results/${encodeURIComponent(r.userId)}`,
      scoreOf: item,
      userId: r.userId,
      ...(typeof r.scoreGiven === 'number' && typeof r.scoreMaximum === 'number' && r.scoreMaximum > 0 ? { resultScore: Math.round((r.scoreGiven / r.scoreMaximum) * 10000) / 100 } : {}),
      resultMaximum: 100,
    }));
    res.type('application/vnd.ims.lis.v2.resultcontainer+json').send(JSON.stringify(out));
  }),
);

mockLmsRouter.get(
  '/memberships/:course',
  withService(has(NRPS_SCOPE), (req, res, base) => {
    if (req.params.course !== HEALTH.contextId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const members = Object.values(MOCK_USERS).map((u) => ({
      user_id: u.sub,
      roles: [...ROLES[u.role]],
      status: 'Active',
      name: u.name,
      given_name: u.givenName,
      family_name: u.familyName,
      email: emailOf(u.sub),
    }));
    res.type('application/vnd.ims.lti-nrps.v2.membershipcontainer+json').send(
      JSON.stringify({ id: mockUrls(base).memberships, context: { id: HEALTH.contextId, label: 'HEALTH', title: 'Health check course (fake)' }, members }),
    );
  }),
);

import http from 'http';
import type { AddressInfo } from 'net';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type JWTPayload } from 'jose';

// A local mock LTI 1.3 platform for tests (no network beyond 127.0.0.1): its
// own RSA keys, a JWKS endpoint, and id_token signing. The "browser" part of
// the flow (login redirect -> platform auth -> form post) is driven by the test.
// Phase 3 adds LTI Advantage AGS: an OAuth2 token endpoint (client_credentials
// with a JWT client assertion), a line items container (GET by resource link,
// POST to create) and {lineitem}/scores. Every request is recorded, and
// failures can be injected (status codes, delays).
// Phase 4 adds LTI NRPS: GET /memberships/<course> (membership container,
// `limit` paging with Link rel="next", member statuses, the `role` filter),
// with the same token check; members are set per course by the test.
// Phase 1b adds LTI Dynamic Registration (Moodle style): GET
// /mod/lti/openid-configuration.php (the platform's openid configuration with
// its lti-platform-configuration) and POST /mod/lti/openid-registration.php
// (checks the Bearer registration token, records the request, answers with a
// new client_id and deployment_id). Use `adoptServiceBaseAsIssuer()` so the
// issuer is this server's own origin (the configuration URL must start with it).

export const LIS = 'http://purl.imsglobal.org/vocab/lis/v2/membership#';
export const ROLE = {
  learner: `${LIS}Learner`,
  instructor: `${LIS}Instructor`,
  mentor: `${LIS}Mentor`,
  instAdmin: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
};
const C = 'https://purl.imsglobal.org/spec/lti/claim/';

interface Key {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

async function newKey(kid: string): Promise<Key> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  return { kid, privateKey, publicJwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

export interface ScorePost {
  path: string;
  query: string;
  auth: string;
  contentType: string;
  body: Record<string, unknown>;
}

export interface MockLineItem {
  id: string;
  scoreMaximum: number;
  label?: string;
  resourceLinkId?: string;
  resourceId?: string;
  tag?: string;
}

export interface MockMember {
  user_id: string;
  roles: string[];
  status?: 'Active' | 'Inactive' | 'Deleted';
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

export class MockPlatform {
  keys: Key[] = [];
  jwksStatus = 200;
  jwksHits = 0;
  private server?: http.Server;
  keysetUrl = '';
  /** http://127.0.0.1:<port> of the AGS services. */
  serviceBase = '';
  tokenRequests: Record<string, string>[] = [];
  /** Status for the next token requests (shifted per request); empty = 200. */
  tokenStatuses: number[] = [];
  tokenTtl = 3600;
  validTokens = new Set<string>();
  scores: ScorePost[] = [];
  /** Status for the next score posts (shifted per request); empty = 200. */
  scoreStatuses: number[] = [];
  scoreDelayMs = 0;
  lineItems: MockLineItem[] = [];
  lineItemPosts: Record<string, unknown>[] = [];
  lineItemGets: string[] = [];
  /**
   * Grade ledger: a Moodle-style gradebook behind the AGS result service. A
   * posted score is stored scaled to `gradebookMax` (Moodle scales to the line
   * item's maximum grade, e.g. 100); a teacher's own change can be set with
   * setGradebook (overridden: later tool scores are ignored, Moodle's rule).
   */
  gradebook = new Map<string, { resultScore: number | null; resultMaximum: number; overridden?: boolean }>();
  gradebookMax = 100;
  resultGets: { path: string; query: string; accept: string; auth: string }[] = [];
  /** Status for the next results reads (shifted per request); empty = 200. */
  resultStatuses: number[] = [];
  private tokenCount = 0;
  /** NRPS: members per course id. */
  memberships: Record<string, MockMember[]> = {};
  /** NRPS: page size when the request has no (or a larger) `limit`. */
  nrpsPageSize = 100;
  /** NRPS: status for the next membership requests (shifted per request); empty = 200. */
  nrpsStatuses: number[] = [];
  nrpsRequests: { path: string; query: string; accept: string; auth: string }[] = [];
  nrpsHonoursRoleFilter = true;
  /** NRPS: if set, the next-page links point at this origin instead (security test). */
  nrpsNextOrigin?: string;

  /** Dynamic Registration (Phase 1b). */
  registrationRequests: { auth: string; contentType: string; body: Record<string, unknown> }[] = [];
  /** The Bearer token the registration endpoint accepts; undefined = any (or none). */
  expectedRegistrationToken?: string;
  /** Status for the next registration posts (shifted per request); empty = 200. */
  registrationStatuses: number[] = [];
  /** Overrides in the served openid configuration (e.g. a wrong issuer). */
  openidOverrides: Record<string, unknown> = {};
  productFamilyCode = 'moodle';
  openidHits = 0;
  private registrationCount = 0;
  /** The client_id / deployment_id the next registration gets. */
  nextClientId?: string;
  nextDeploymentId?: string;

  constructor(
    public issuer: string,
    public clientId: string,
    public deploymentId = '1',
  ) {}

  /** The issuer becomes this server's origin (for Dynamic Registration tests). */
  adoptServiceBaseAsIssuer(): this {
    this.issuer = this.serviceBase;
    return this;
  }

  get openidConfigurationUrl() {
    return `${this.serviceBase}/mod/lti/openid-configuration.php`;
  }

  get registrationEndpoint() {
    return `${this.serviceBase}/mod/lti/openid-registration.php`;
  }

  openidConfiguration(): Record<string, unknown> {
    return {
      issuer: this.issuer,
      token_endpoint: this.tokenUrl,
      token_endpoint_auth_methods_supported: ['private_key_jwt'],
      token_endpoint_auth_signing_alg_values_supported: ['RS256'],
      jwks_uri: this.keysetUrl,
      authorization_endpoint: this.authLoginUrl,
      registration_endpoint: this.registrationEndpoint,
      scopes_supported: ['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem', 'https://purl.imsglobal.org/spec/lti-ags/scope/score', 'openid'],
      response_types_supported: ['id_token'],
      subject_types_supported: ['public', 'pairwise'],
      id_token_signing_alg_values_supported: ['RS256'],
      claims_supported: ['sub', 'iss', 'name', 'given_name', 'family_name', 'email'],
      'https://purl.imsglobal.org/spec/lti-platform-configuration': {
        product_family_code: this.productFamilyCode,
        version: '4.5.1 (Build: 20241007)',
        messages_supported: [{ type: 'LtiResourceLinkRequest' }, { type: 'LtiDeepLinkingRequest', placements: ['ContentArea'] }],
        variables: ['CourseSection.title'],
      },
      ...this.openidOverrides,
    };
  }

  resetRegistration() {
    this.registrationRequests = [];
    this.expectedRegistrationToken = undefined;
    this.registrationStatuses = [];
    this.openidOverrides = {};
    this.productFamilyCode = 'moodle';
    this.openidHits = 0;
    this.nextClientId = undefined;
    this.nextDeploymentId = undefined;
    this.registrationCount = 0;
  }

  private async registration(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', this.serviceBase || 'http://127.0.0.1');
    if (url.pathname === '/mod/lti/openid-configuration.php' && req.method === 'GET') {
      this.openidHits++;
      this.json(res, 200, this.openidConfiguration());
      return true;
    }
    if (url.pathname === '/mod/lti/openid-registration.php' && req.method === 'POST') {
      const raw = await this.body(req);
      const auth = String(req.headers.authorization ?? '');
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      this.registrationRequests.push({ auth, contentType: String(req.headers['content-type'] ?? ''), body });
      if (!auth.startsWith('Bearer ') || (this.expectedRegistrationToken !== undefined && auth !== `Bearer ${this.expectedRegistrationToken}`)) {
        this.json(res, 401, 'missing_registration_token');
        return true;
      }
      const status = this.registrationStatuses.shift() ?? 200;
      if (status !== 200) {
        this.json(res, status, { error: 'invalid_client_metadata' });
        return true;
      }
      const n = ++this.registrationCount;
      const toolConf = body['https://purl.imsglobal.org/spec/lti-tool-configuration'] as Record<string, unknown>;
      this.json(res, 200, {
        client_id: this.nextClientId ?? `dyn-client-${n}`,
        response_types: ['id_token'],
        jwks_uri: body.jwks_uri,
        initiate_login_uri: body.initiate_login_uri,
        grant_types: ['client_credentials', 'implicit'],
        redirect_uris: body.redirect_uris,
        application_type: 'web',
        token_endpoint_auth_method: 'private_key_jwt',
        client_name: body.client_name,
        logo_uri: body.logo_uri,
        scope: body.scope,
        'https://purl.imsglobal.org/spec/lti-tool-configuration': {
          version: '1.3.0',
          deployment_id: this.nextDeploymentId ?? String(n),
          target_link_uri: toolConf?.target_link_uri,
          domain: toolConf?.domain,
          description: toolConf?.description,
          claims: ['sub', 'iss', 'name', 'family_name', 'given_name', 'email'],
        },
      });
      return true;
    }
    return false;
  }

  get authLoginUrl() {
    return `${this.issuer}/mod/lti/auth.php`;
  }

  get tokenUrl() {
    return `${this.serviceBase}/token`;
  }

  get lineItemsUrl() {
    return `${this.serviceBase}/lineitems`;
  }

  /** The launch's own line item (Moodle style, with a query string). */
  lineItemUrl(n = 5) {
    return `${this.serviceBase}/lineitems/${n}/lineitem?type_id=1`;
  }

  /** The AGS endpoint claim with this mock's service URLs. */
  agsClaim(opts: { lineitem?: string | null; scope?: string[] } = {}) {
    const AGS = 'https://purl.imsglobal.org/spec/lti-ags/scope/';
    return {
      'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
        scope: opts.scope ?? [`${AGS}lineitem`, `${AGS}result.readonly`, `${AGS}score`],
        lineitems: this.lineItemsUrl,
        ...(opts.lineitem === null ? {} : { lineitem: opts.lineitem ?? this.lineItemUrl() }),
      },
    };
  }

  /** The course's context memberships URL (what Moodle sends in the launch's NRPS claim). */
  membershipsUrl(course = 'course-101') {
    return `${this.serviceBase}/memberships/${course}`;
  }

  /** The NRPS launch claim with this mock's memberships URL. */
  nrpsClaim(course = 'course-101') {
    return { 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': { context_memberships_url: this.membershipsUrl(course), service_versions: ['2.0'] } };
  }

  resetNrps() {
    this.memberships = {};
    this.nrpsPageSize = 100;
    this.nrpsStatuses = [];
    this.nrpsRequests = [];
    this.nrpsHonoursRoleFilter = true;
    this.nrpsNextOrigin = undefined;
  }

  resetAgs() {
    this.tokenRequests = [];
    this.tokenStatuses = [];
    this.tokenTtl = 3600;
    this.validTokens.clear();
    this.scores = [];
    this.scoreStatuses = [];
    this.scoreDelayMs = 0;
    this.lineItems = [];
    this.lineItemPosts = [];
    this.lineItemGets = [];
    this.gradebook.clear();
    this.gradebookMax = 100;
    this.resultGets = [];
    this.resultStatuses = [];
  }

  /** A grade typed into the LMS gradebook by its teacher (line item path like /lineitems/5/lineitem). */
  setGradebook(lineItemPath: string, userId: string, resultScore: number | null, opts: { overridden?: boolean; resultMaximum?: number } = {}) {
    this.gradebook.set(`${lineItemPath}|${userId}`, { resultScore, resultMaximum: opts.resultMaximum ?? this.gradebookMax, overridden: opts.overridden ?? true });
  }

  gradebookValue(lineItemPath: string, userId: string) {
    return this.gradebook.get(`${lineItemPath}|${userId}`);
  }

  private async body(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }

  private json(res: http.ServerResponse, status: number, body: unknown, type = 'application/json') {
    res.writeHead(status, { 'Content-Type': type });
    res.end(JSON.stringify(body));
  }

  private async ags(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.serviceBase);
    const raw = await this.body(req);
    if (req.method === 'POST' && url.pathname === '/token') {
      const form = Object.fromEntries(new URLSearchParams(raw));
      this.tokenRequests.push(form);
      const status = this.tokenStatuses.shift() ?? 200;
      if (status !== 200) return this.json(res, status, { error: 'invalid_client' });
      if (form.grant_type !== 'client_credentials' || form.client_assertion_type !== 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' || !form.client_assertion) {
        return this.json(res, 400, { error: 'invalid_request' });
      }
      const token = `tok-${++this.tokenCount}`;
      this.validTokens.add(token);
      return this.json(res, 200, { access_token: token, token_type: 'Bearer', expires_in: this.tokenTtl, scope: form.scope });
    }
    const auth = String(req.headers.authorization ?? '');
    if (!this.validTokens.has(auth.replace(/^Bearer /, ''))) return this.json(res, 401, { error: 'unauthorized' });
    const nrps = /^\/memberships\/([\w.-]+)$/.exec(url.pathname);
    if (nrps && req.method === 'GET') {
      this.nrpsRequests.push({ path: url.pathname, query: url.search, accept: String(req.headers.accept ?? ''), auth });
      const status = this.nrpsStatuses.shift() ?? 200;
      if (status !== 200) return this.json(res, status, { error: 'nope' });
      const course = nrps[1];
      const role = url.searchParams.get('role');
      let all = this.memberships[course] ?? [];
      if (role && this.nrpsHonoursRoleFilter) all = all.filter((m) => m.roles.includes(role));
      const limit = Math.min(Number(url.searchParams.get('limit')) || this.nrpsPageSize, this.nrpsPageSize);
      const from = Number(url.searchParams.get('from')) || 0;
      const page = all.slice(from, from + limit);
      if (from + limit < all.length) {
        const next = new URL(url.toString());
        next.searchParams.set('from', String(from + limit));
        const href = this.nrpsNextOrigin ? `${this.nrpsNextOrigin}${next.pathname}${next.search}` : next.toString();
        res.setHeader('Link', `<${href}>; rel="next"`);
      }
      return this.json(res, 200, { id: url.toString(), context: { id: course, label: 'ENG', title: 'English (LMS)' }, members: page }, 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json');
    }
    if (url.pathname === '/lineitems' && req.method === 'GET') {
      this.lineItemGets.push(url.search);
      const rl = url.searchParams.get('resource_link_id');
      return this.json(res, 200, this.lineItems.filter((li) => !rl || li.resourceLinkId === rl), 'application/vnd.ims.lis.v2.lineitemcontainer+json');
    }
    if (url.pathname === '/lineitems' && req.method === 'POST') {
      const body = JSON.parse(raw) as Record<string, unknown>;
      this.lineItemPosts.push(body);
      const item: MockLineItem = { ...(body as Omit<MockLineItem, 'id'>), id: `${this.serviceBase}/lineitems/${100 + this.lineItems.length}/lineitem` };
      this.lineItems.push(item);
      return this.json(res, 201, item, 'application/vnd.ims.lis.v2.lineitem+json');
    }
    if (/^\/lineitems\/\d+\/lineitem\/scores$/.test(url.pathname) && req.method === 'POST') {
      if (this.scoreDelayMs) await new Promise((r) => setTimeout(r, this.scoreDelayMs));
      const status = this.scoreStatuses.shift() ?? 200;
      const posted = JSON.parse(raw || '{}') as Record<string, unknown>;
      this.scores.push({ path: url.pathname, query: url.search, auth, contentType: String(req.headers['content-type'] ?? ''), body: posted });
      const cell = `${url.pathname.replace(/\/scores$/, '')}|${String(posted.userId)}`;
      if (status === 200 && typeof posted.scoreGiven === 'number' && typeof posted.scoreMaximum === 'number' && !this.gradebook.get(cell)?.overridden) {
        this.gradebook.set(cell, { resultScore: Math.round((posted.scoreGiven / posted.scoreMaximum) * this.gradebookMax * 100) / 100, resultMaximum: this.gradebookMax });
      }
      if (status === 429) res.setHeader('Retry-After', '1');
      res.writeHead(status).end();
      return;
    }
    if (/^\/lineitems\/\d+\/lineitem\/results$/.test(url.pathname) && req.method === 'GET') {
      this.resultGets.push({ path: url.pathname, query: url.search, accept: String(req.headers.accept ?? ''), auth });
      const status = this.resultStatuses.shift() ?? 200;
      if (status !== 200) return this.json(res, status, { error: 'x' });
      const item = url.pathname.replace(/\/results$/, '');
      const userId = url.searchParams.get('user_id');
      const rows = [...this.gradebook.entries()]
        .filter(([k]) => k.startsWith(`${item}|`) && (!userId || k === `${item}|${userId}`))
        .map(([k, v]) => ({ id: `${this.serviceBase}${item}/results/${k.split('|')[1]}`, scoreOf: `${this.serviceBase}${item}`, userId: k.split('|')[1], ...(v.resultScore === null ? {} : { resultScore: v.resultScore }), resultMaximum: v.resultMaximum }));
      return this.json(res, 200, rows, 'application/vnd.ims.lis.v2.resultcontainer+json');
    }
    res.writeHead(404).end();
  }

  async start(): Promise<this> {
    this.keys = [await newKey('k1')];
    this.server = http.createServer((req, res) => {
      if (req.url === '/jwks') {
        this.jwksHits++;
        res.writeHead(this.jwksStatus, { 'Content-Type': 'application/json' });
        res.end(this.jwksStatus === 200 ? JSON.stringify({ keys: this.keys.map((k) => k.publicJwk) }) : '{}');
        return;
      }
      this.registration(req, res)
        .then((handled) => (handled ? undefined : this.ags(req, res)))
        .catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', r));
    this.serviceBase = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`;
    this.keysetUrl = `${this.serviceBase}/jwks`;
    return this;
  }

  async stop() {
    await new Promise<void>((r) => this.server?.close(() => r()));
  }

  /** Rotate: a new key replaces the old one in the JWKS. */
  async rotate(kid: string) {
    this.keys = [await newKey(kid)];
  }

  /** A launch claim set; override or delete (value undefined) any claim. */
  claims(nonce: string, toolBase: string, over: Record<string, unknown> = {}): JWTPayload {
    const now = Math.floor(Date.now() / 1000);
    const base: Record<string, unknown> = {
      iss: this.issuer,
      aud: this.clientId,
      sub: 'user-1',
      nonce,
      iat: now,
      exp: now + 300,
      name: 'Layla Hassan',
      given_name: 'Layla',
      family_name: 'Hassan',
      email: 'layla@school.example',
      [`${C}message_type`]: 'LtiResourceLinkRequest',
      [`${C}version`]: '1.3.0',
      [`${C}deployment_id`]: this.deploymentId,
      [`${C}target_link_uri`]: `${toolBase}/lti/launch`,
      [`${C}resource_link`]: { id: 'rl-1', title: 'Unit 1 practice' },
      [`${C}roles`]: [ROLE.learner],
      [`${C}context`]: { id: 'course-101', label: 'SCI7', title: 'Grade 7 Science', type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering'] },
      [`${C}custom`]: { activity: 'unit-1' },
      [`${C}launch_presentation`]: { document_target: 'iframe', return_url: `${this.issuer}/course/view.php?id=101` },
      'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
        scope: ['https://purl.imsglobal.org/spec/lti-ags/scope/score'],
        lineitems: `${this.issuer}/mod/lti/services.php/101/lineitems`,
        lineitem: `${this.issuer}/mod/lti/services.php/101/lineitems/5/lineitem`,
      },
      'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': { context_memberships_url: `${this.issuer}/mod/lti/services.php/CourseSection/101/bindings/1/memberships`, service_versions: ['2.0'] },
    };
    for (const [k, v] of Object.entries(over)) {
      const key = k.startsWith('lti:') ? `${C}${k.slice(4)}` : k;
      if (v === undefined) delete base[key];
      else base[key] = v;
    }
    return base as JWTPayload;
  }

  async sign(payload: JWTPayload, opts: { kid?: string; key?: CryptoKey } = {}): Promise<string> {
    const key = this.keys[0];
    return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? key.kid, typ: 'JWT' }).sign(opts.key ?? key.privateKey);
  }

  /** A key the platform does not publish (for bad-signature tests). */
  async foreignKey(): Promise<CryptoKey> {
    return (await newKey('foreign')).privateKey;
  }
}

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
  private tokenCount = 0;

  constructor(
    public readonly issuer: string,
    public readonly clientId: string,
    public readonly deploymentId = '1',
  ) {}

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
      this.scores.push({ path: url.pathname, query: url.search, auth, contentType: String(req.headers['content-type'] ?? ''), body: JSON.parse(raw || '{}') });
      if (status === 429) res.setHeader('Retry-After', '1');
      res.writeHead(status).end();
      return;
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
      this.ags(req, res).catch(() => {
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

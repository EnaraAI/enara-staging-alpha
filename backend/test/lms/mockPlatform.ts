import http from 'http';
import type { AddressInfo } from 'net';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type JWTPayload } from 'jose';

// A local mock LTI 1.3 platform for tests (no network beyond 127.0.0.1): its
// own RSA keys, a JWKS endpoint, and id_token signing. The "browser" part of
// the flow (login redirect -> platform auth -> form post) is driven by the test.

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

export class MockPlatform {
  keys: Key[] = [];
  jwksStatus = 200;
  jwksHits = 0;
  private server?: http.Server;
  keysetUrl = '';

  constructor(
    public readonly issuer: string,
    public readonly clientId: string,
    public readonly deploymentId = '1',
  ) {}

  get authLoginUrl() {
    return `${this.issuer}/mod/lti/auth.php`;
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
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => this.server!.listen(0, '127.0.0.1', r));
    this.keysetUrl = `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}/jwks`;
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

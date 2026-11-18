import { isIP } from 'net';
import { getConfig } from '../../../../config/env';
import { Institution } from '../../../../models/Institution';
import { writeLmsAudit } from '../../core/audit';
import { AGS_SCOPE, NRPS_SCOPE } from '../../core/capabilities';
import { lmsFlags, lmsSettings } from '../../core/flags';
import { loadJose } from '../../core/jose';
import {
  attachPlatformToCode,
  finalizeRegistrationCode,
  findRegistrationCode,
  linkMakesActive,
  markRegistrationCodeOpened,
  releaseRegistrationCode,
  reserveRegistrationCode,
} from '../../core/registrationCode';
import { runInBackground } from '../../core/drain';
import { LmsDeployment, LmsOnboarding, LmsPlatform, LmsRegistrationCode, type ILmsPlatform, type ILmsRegistrationCode } from '../../models';
import { LtiError, type LtiErrorCode } from './errors';
import { isAcceptableKeysetUrl } from './jwks';

// LTI Dynamic Registration 1.0 (1EdTech, https://www.imsglobal.org/spec/lti-dr/v1p0),
// tool side, for the one-URL "Connect Moodle" link (Phase 1b):
//   GET /lti/register/<code>?openid_configuration=...&registration_token=...
//   1. the code: unknown/revoked, used, expired → refused; else RESERVED (atomic);
//   2. the platform's openid configuration (https only, 64 KB, 5 s, no
//      redirects); its issuer must be the start of the configuration URL
//      (spec §3.4/§3.5.1: "the OpenId Configuration URL's endpoint [is] a
//      path concatenated with the Issuer"), so same origin, path under it;
//   3. POST our tool configuration to its registration_endpoint with
//      "Authorization: Bearer <registration_token>" (10 s, no redirects);
//   4. on success: the code is used up, then the connection (lms_platforms,
//      registeredVia 'dynamic') and its deployment are stored for the code's
//      school, active or pending (R1). On any failure the code is released
//      (still usable) and nothing is stored.
// The registration token and the code are never stored or logged (audit rows
// carry IDs, codes and HTTP statuses only).

const FETCH_TIMEOUT_MS = 5_000;
const REGISTER_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PARAM = 2048;
const MAX_TOKEN = 8192;

export const PLATFORM_CONFIG_CLAIM = 'https://purl.imsglobal.org/spec/lti-platform-configuration';
export const TOOL_CONFIG_CLAIM = 'https://purl.imsglobal.org/spec/lti-tool-configuration';

/** The services ENARA asks for: AGS (grades, line items) and NRPS (roster). */
export const REGISTRATION_SCOPES = [AGS_SCOPE.lineItem, AGS_SCOPE.lineItemReadOnly, AGS_SCOPE.resultReadOnly, AGS_SCOPE.score, NRPS_SCOPE] as const;
/** Identity claims ENARA asks for (Moodle: name → "Share launcher's name" Always, email → "Share launcher's email" Always). */
export const REGISTRATION_CLAIMS = ['iss', 'sub', 'name', 'given_name', 'family_name', 'email'] as const;

class Refusal extends Error {
  constructor(public readonly code: LtiErrorCode, public readonly refIds: Record<string, unknown> = {}) {
    super(code);
  }
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);

// ------------------------------------------------------------ URL safety

/** Hosts a production server must never call (loopback, private, link-local), by literal. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (kind === 6) {
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('::ffff:')) return isPrivateHost(h.slice(7));
    return /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}

/** https (plain http only to this machine outside production, like every LMS URL), and no private host in production. */
function secureUrl(value: string): boolean {
  if (!isAcceptableKeysetUrl(value)) return false;
  const u = new URL(value);
  return !(getConfig().isProduction && isPrivateHost(u.hostname));
}

/**
 * Spec §3.4: the openid configuration URL is the issuer followed by a path
 * (and maybe a query). So: same origin, and the URL's path starts with the
 * issuer's path at a "/" boundary. The issuer itself is an https URL without
 * query or fragment.
 */
export function issuerMatchesConfigUrl(issuer: string, configUrl: string): boolean {
  let iss: URL;
  let conf: URL;
  try {
    iss = new URL(issuer);
    conf = new URL(configUrl);
  } catch {
    return false;
  }
  if (iss.search || iss.hash || issuer.includes('?') || issuer.includes('#')) return false;
  if (iss.origin !== conf.origin) return false;
  const issPath = iss.pathname.replace(/\/+$/, '');
  if (!issPath) return true;
  return conf.pathname === issPath || conf.pathname.startsWith(`${issPath}/`);
}

// ------------------------------------------------------------ HTTP

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('too_large');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

type CallResult = { status: number; ok: boolean; json?: unknown };

async function callJson(url: string, init: RequestInit, timeoutMs: number): Promise<CallResult | { failure: 'timeout' | 'network' | 'too_large' }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    return { failure: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' };
  }
  let text: string;
  try {
    text = await readCapped(res);
  } catch (error) {
    const name = (error as { name?: string; message?: string });
    return { failure: name?.message === 'too_large' ? 'too_large' : name?.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, ok: res.ok, json };
}

// ------------------------------------------------------------ platform config

export interface PlatformConfiguration {
  issuer: string;
  authorizationEndpoint: string;
  registrationEndpoint: string;
  jwksUri: string;
  tokenEndpoint: string;
  authorizationServer?: string;
  productFamilyCode?: string;
  productVersion?: string;
  messagesSupported: string[];
}

function parsePlatformConfiguration(json: unknown, configUrl: string): PlatformConfiguration {
  const c = obj(json);
  if (!c) throw new Refusal('registration_openid_invalid', { reason: 'not_json' });
  const issuer = str(c.issuer, 500);
  const fields = {
    authorizationEndpoint: str(c.authorization_endpoint, 1000),
    registrationEndpoint: str(c.registration_endpoint, 1000),
    jwksUri: str(c.jwks_uri, 1000),
    tokenEndpoint: str(c.token_endpoint, 1000),
  };
  const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);
  if (!issuer || missing.length) throw new Refusal('registration_openid_invalid', { reason: 'missing_fields', fields: [...(issuer ? [] : ['issuer']), ...missing].join(',') });
  if (!issuerMatchesConfigUrl(issuer, configUrl)) throw new Refusal('registration_issuer_mismatch');
  if (!secureUrl(issuer)) throw new Refusal('registration_insecure_url', { reason: 'issuer' });
  for (const [k, v] of Object.entries(fields)) {
    let parsed = false;
    try {
      new URL(v!);
      parsed = true;
    } catch {
      /* below */
    }
    if (!parsed) throw new Refusal('registration_openid_invalid', { reason: 'bad_url', fields: k });
    if (!secureUrl(v!)) throw new Refusal('registration_insecure_url', { reason: k });
  }
  const lti = obj(c[PLATFORM_CONFIG_CLAIM]);
  const messages = Array.isArray(lti?.messages_supported)
    ? lti!.messages_supported.map((m) => str(obj(m)?.type, 100)).filter((m): m is string => !!m).slice(0, 20)
    : [];
  const authorizationServer = str(c.authorization_server, 500);
  return {
    issuer,
    authorizationEndpoint: fields.authorizationEndpoint!,
    registrationEndpoint: fields.registrationEndpoint!,
    jwksUri: fields.jwksUri!,
    tokenEndpoint: fields.tokenEndpoint!,
    authorizationServer,
    productFamilyCode: str(lti?.product_family_code, 100),
    productVersion: str(lti?.version, 100),
    messagesSupported: messages,
  };
}

// ------------------------------------------------------------ tool config

/** R4: "ENARA", plus "(<school name>)" when this LMS already has an ENARA connection for another school. */
export function toolClientName(schoolName: string | undefined, issuerHasOtherSchool: boolean): string {
  if (!issuerHasOtherSchool) return 'ENARA';
  const clean = (schoolName ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean ? `ENARA (${clean})` : 'ENARA';
}

/**
 * The registration request (spec §2.2, OIDC Dynamic Client Registration). See
 * docs/lms/PHASE_1B_NOTES.md for what Moodle does with each field.
 */
export function buildRegistrationRequest(toolBase: string, clientName: string, opts: { deepLinking: boolean }): Record<string, unknown> {
  const launch = `${toolBase}/lti/launch`;
  const messages: Record<string, unknown>[] = [{ type: 'LtiResourceLinkRequest', target_link_uri: launch }];
  if (opts.deepLinking) {
    // Moodle: any LtiDeepLinkingRequest message turns on "Supports Deep Linking
    // (Content-Item Message)", and its target_link_uri becomes the "Content
    // Selection URL". label/placements are spec hints (Moodle ignores them).
    messages.push({ type: 'LtiDeepLinkingRequest', target_link_uri: launch, label: 'ENARA', placements: ['ContentArea'] });
  }
  return {
    application_type: 'web',
    response_types: ['id_token'],
    grant_types: ['implicit', 'client_credentials'],
    initiate_login_uri: `${toolBase}/lti/login`,
    redirect_uris: [launch],
    client_name: clientName,
    logo_uri: `${toolBase}/favicon.svg`,
    jwks_uri: `${toolBase}/.well-known/jwks.json`,
    token_endpoint_auth_method: 'private_key_jwt',
    scope: REGISTRATION_SCOPES.join(' '),
    [TOOL_CONFIG_CLAIM]: {
      domain: new URL(toolBase).host,
      target_link_uri: launch,
      description: 'ENARA lessons, practice and assessments. Grades are sent to the gradebook.',
      claims: [...REGISTRATION_CLAIMS],
      messages,
    },
  };
}

/** Moodle's registration token is a JWT; scope 'reg-update' means "Update" was chosen on Moodle's tool-exists page. */
async function isMoodleUpdate(token: string): Promise<boolean> {
  try {
    const { decodeJwt } = await loadJose();
    return decodeJwt(token).scope === 'reg-update';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the flow

export interface RegistrationOutcome {
  platform: ILmsPlatform;
  registrationId: string;
  status: 'active' | 'pending';
  /** R3: this school already had a connection from this LMS (both are kept). */
  alreadyConnected: boolean;
  clientName: string;
}

async function refuse(code: LtiErrorCode, row: ILmsRegistrationCode | undefined, refIds: Record<string, unknown> = {}): Promise<never> {
  await writeLmsAudit({
    event: 'registration.failed',
    outcome: 'fail',
    code,
    institutionId: row?.institutionId,
    refIds: { ...(row ? { registrationId: row.id } : {}), ...refIds },
  });
  throw new LtiError(code, row ? { institutionId: row.institutionId } : {});
}

export async function dynamicRegistration(params: { code: unknown; openidConfiguration: unknown; registrationToken: unknown }): Promise<RegistrationOutcome> {
  const toolBase = lmsSettings().toolBaseUrl;
  if (!toolBase) throw new LtiError('lti_disabled');

  // 1. The code (nothing reserved yet).
  const found = await findRegistrationCode(params.code);
  // Step 2: the status page's "link opened" (any attempt with a known link).
  if (found.row) await markRegistrationCodeOpened(found.row.id);
  if (found.problem) return refuse(found.problem, found.row);
  const row = found.row!;

  const configUrl = str(params.openidConfiguration, MAX_PARAM);
  const rawToken = params.registrationToken;
  if (!configUrl || (rawToken !== undefined && rawToken !== '' && !str(rawToken, MAX_TOKEN))) {
    return refuse('registration_missing_parameters', row, { hasOpenidConfiguration: !!configUrl, hasRegistrationToken: rawToken !== undefined && rawToken !== '' });
  }
  const registrationToken = str(rawToken, MAX_TOKEN);
  let parsedConfigUrl: URL;
  try {
    parsedConfigUrl = new URL(configUrl);
  } catch {
    return refuse('registration_openid_invalid', row, { reason: 'bad_url' });
  }
  if (parsedConfigUrl.hash) return refuse('registration_openid_invalid', row, { reason: 'fragment' });
  if (!secureUrl(configUrl)) return refuse('registration_insecure_url', row, { reason: 'openid_configuration', scheme: parsedConfigUrl.protocol.replace(':', '') });

  // 2. Reserve the code for this attempt.
  const reserved = await reserveRegistrationCode(row.id);
  if (reserved.problem) return refuse(reserved.problem, row);
  const reservationId = reserved.reservationId!;

  try {
    const outcome = await registerWithPlatform(row, reservationId, toolBase, configUrl, registrationToken);
    return outcome;
  } catch (error) {
    const code = error instanceof Refusal ? error.code : error instanceof LtiError ? error.code : 'internal_error';
    await releaseRegistrationCode(row.id, reservationId, code);
    if (error instanceof Refusal) return refuse(error.code, row, error.refIds);
    throw error;
  }
}

async function registerWithPlatform(
  row: ILmsRegistrationCode,
  reservationId: string,
  toolBase: string,
  configUrl: string,
  registrationToken: string | undefined,
): Promise<RegistrationOutcome> {
  // 3. The platform's openid configuration.
  const got = await callJson(configUrl, { method: 'GET', headers: { Accept: 'application/json' } }, FETCH_TIMEOUT_MS);
  if ('failure' in got) throw new Refusal('registration_openid_invalid', { reason: got.failure });
  if (!got.ok) throw new Refusal('registration_openid_invalid', { reason: 'http', httpStatus: got.status });
  const config = parsePlatformConfiguration(got.json, configUrl);
  const vendor = config.productFamilyCode === 'moodle' ? 'moodle' : 'generic';

  // Moodle always protects its registration endpoint with a token, so a
  // missing one is a broken request (spec: optional; other LMSs may omit it).
  if (!registrationToken && vendor === 'moodle') throw new Refusal('registration_missing_parameters', { hasRegistrationToken: false, vendor });
  // Moodle's "Update" path would rewrite an existing tool; never (R3: nothing is replaced).
  if (registrationToken && vendor === 'moodle' && (await isMoodleUpdate(registrationToken))) throw new Refusal('registration_update_not_supported', { vendor });

  // R3 / R4: what this LMS already has with ENARA.
  const existing = await LmsPlatform.find({ provider: 'lti13', issuer: config.issuer }).select('id institutionId').limit(50).lean();
  const sameSchool = existing.filter((p) => p.institutionId === row.institutionId);
  const otherSchool = existing.some((p) => p.institutionId !== row.institutionId);
  const school = otherSchool ? await Institution.findOne({ id: row.institutionId }).select('name').lean() : null;
  const clientName = toolClientName(school?.name, otherSchool);
  const deepLinking = lmsFlags().deepLinking;
  const body = buildRegistrationRequest(toolBase, clientName, { deepLinking });

  // 4. Register.
  const posted = await callJson(
    config.registrationEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(registrationToken ? { Authorization: `Bearer ${registrationToken}` } : {}) },
      body: JSON.stringify(body),
    },
    REGISTER_TIMEOUT_MS,
  );
  if ('failure' in posted) throw new Refusal('registration_failed', { reason: posted.failure, vendor });
  if (!posted.ok) throw new Refusal('registration_failed', { reason: 'http', httpStatus: posted.status, vendor });
  const reply = obj(posted.json);
  const clientId = str(reply?.client_id, 200);
  if (!clientId) throw new Refusal('registration_failed', { reason: 'no_client_id', httpStatus: posted.status, vendor });
  const toolConf = obj(reply?.[TOOL_CONFIG_CLAIM]);
  const rawDeployment = toolConf?.deployment_id;
  const deploymentId = typeof rawDeployment === 'number' && Number.isFinite(rawDeployment) ? String(rawDeployment) : str(rawDeployment, 255);
  const grantedScopes = typeof reply?.scope === 'string'
    ? [...new Set(reply.scope.split(/\s+/).filter((s) => s && s.length <= 200))].slice(0, 20)
    : [...REGISTRATION_SCOPES];

  // A client_id this LMS already gave ENARA: never moved to another school.
  const sameClient = await LmsPlatform.findOne({ issuer: config.issuer, clientId }).lean();
  if (sameClient && sameClient.institutionId !== row.institutionId) throw new Refusal('registration_conflict', { existingPlatformId: sameClient.id, vendor });

  // 5. Use the code up, then store the connection.
  if (!(await finalizeRegistrationCode(row.id, reservationId))) {
    const now = await LmsRegistrationCode.findOne({ id: row.id }).select('status').lean();
    throw new Refusal(now?.status === 'revoked' ? 'registration_code_invalid' : 'registration_code_used', { reason: 'reservation_lost' });
  }

  const status: 'active' | 'pending' = linkMakesActive(row, lmsSettings().schoolConnectionsRequireApproval) ? 'active' : 'pending';
  // Who approved an active connection: the link's maker, or the ENARA admin whose onboarding pre-approved it.
  const approver = row.preApprovedBy ?? row.createdBy;
  let platform: ILmsPlatform;
  let reused = false;
  if (sameClient) {
    platform = sameClient;
    reused = true;
  } else {
    try {
      platform = (
        await LmsPlatform.create({
          institutionId: row.institutionId,
          provider: 'lti13',
          vendor,
          issuer: config.issuer,
          clientId,
          authLoginUrl: config.authorizationEndpoint,
          authTokenUrl: config.tokenEndpoint,
          keysetUrl: config.jwksUri,
          ...(config.authorizationServer ? { tokenAudience: config.authorizationServer } : {}),
          status,
          registeredVia: 'dynamic',
          scopes: grantedScopes,
          // No deployment_id in the reply (an LMS that deploys separately): the
          // first launch records its deployment as pending, for approval.
          autoCreateDeployments: !deploymentId,
          createdBy: row.createdBy,
          ...(status === 'active' ? { approvedBy: approver, approvedAt: new Date() } : {}),
        })
      ).toObject();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const raced = await LmsPlatform.findOne({ issuer: config.issuer, clientId }).lean();
      if (!raced || raced.institutionId !== row.institutionId) throw new Refusal('registration_conflict', { vendor });
      platform = raced;
      reused = true;
    }
  }
  let deploymentCreated = false;
  if (deploymentId) {
    const dep = await LmsDeployment.updateOne(
      { platformId: platform.id, deploymentId },
      {
        $setOnInsert: {
          institutionId: row.institutionId,
          status: reused ? (platform.status === 'active' && status === 'active' ? 'active' : 'pending') : status,
          createdBy: row.createdBy,
          ...(status === 'active' ? { approvedBy: approver } : {}),
        },
      },
      { upsert: true },
    );
    deploymentCreated = dep.upsertedCount === 1;
  }
  await attachPlatformToCode(row.id, platform.id);

  const others = sameSchool.filter((p) => p.id !== platform.id).map((p) => p.id);
  const alreadyConnected = others.length > 0 || reused;
  await writeLmsAudit({
    event: 'platform.registered',
    outcome: 'ok',
    institutionId: row.institutionId,
    platformId: platform.id,
    actor: row.createdBy,
    refIds: { vendor, via: 'dynamic', status: platform.status, registrationId: row.id, deploymentCreated, deepLinking, reused, productVersion: config.productVersion },
  });
  if (alreadyConnected) {
    // R3: both connections are kept; the Problems view shows "already connected".
    await writeLmsAudit({
      event: 'registration.duplicate_lms',
      outcome: 'warn',
      code: reused ? 'same_client_id' : 'already_connected',
      institutionId: row.institutionId,
      platformId: platform.id,
      actor: row.createdBy,
      refIds: { registrationId: row.id, newPlatformId: platform.id, existingPlatformIds: (reused ? [platform.id, ...others] : others).slice(0, 10).join(',') },
    });
  }
  // Step 2 (S3): the automatic connection check runs right after the
  // registration, in the background, for a school onboarded with "New school".
  if (row.onboardingId || (await LmsOnboarding.exists({ institutionId: row.institutionId }))) {
    const platformId = platform.id;
    runInBackground('connection_check_registration', async () => (await import('../../core/connectionCheck')).runConnectionCheck(platformId, { trigger: 'registration' }));
  }
  return { platform, registrationId: row.id, status: platform.status === 'active' ? 'active' : 'pending', alreadyConnected, clientName };
}

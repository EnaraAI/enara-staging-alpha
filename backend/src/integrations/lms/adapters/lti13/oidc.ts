import { randomBytes } from 'crypto';
import type { JWTPayload } from 'jose';
import { isInstitutionSuspended } from '../../../../middleware/auth.middleware';
import { writeLmsAudit } from '../../core/audit';
import { BindingError, bindingRequest, validateBinding, type ValidatedBinding } from '../../core/binding';
import { pageTargetRequest, resolvePageTarget, type ResolvedPageTarget } from '../../core/pageTargets';
import { decryptSecret, encryptSecret, sha256Hex } from '../../core/crypto';
import { findStudentPreview, LmsProvisionError, provisionLaunch, type ProvisionInput, type ProvisionRole } from '../../core/domainService';
import { lmsFlags, lmsSettings } from '../../core/flags';
import { loadJose } from '../../core/jose';
import { issueLaunchToken } from '../../core/launchToken';
import { scheduleTargetedFlush } from '../../core/drain';
import { nrpsStudentPreview, scheduleRosterSyncOnLaunch } from '../../core/roster';
import { isTestUser, mapLtiRoles } from '../../core/roleMap';
import { findSuppression } from '../../core/suppression';
import type { LaunchResult } from '../../core/types';
import { LmsDeployment, LmsOidcState, LmsPlatform, type ILmsOidcState, type ILmsPlatform } from '../../models';
import { getPreset } from '../../presets';
import { CLAIM, DEEP_LINKING_REQUEST, LTI_VERSION, SUPPORTED_MESSAGE_TYPES } from './claims';
import { startDeepLinking } from './deepLinking';
import { LtiError, type LtiErrorCode } from './errors';
import { platformKeySet } from './jwks';
import { STORAGE_HOLD_TTL_MS, validStorageTarget } from './platformStorage';

// LTI 1.3 OIDC third-party-initiated login and the resource-link launch
// (1EdTech Security Framework 1.0 §5.1, LTI Core 1.3 §5). All signature and
// claim-time checks are done by jose; this file only handles LTI's own rules.
//
// Browser binding without third-party cookies (owner decision 2:A): the login
// sets a per-state cookie (SameSite=None; Secure; Partitioned). The launch
// accepts it when present; when the browser sent no state cookie at all the
// launch is allowed on the server-side single-use state alone, and is logged
// and counted as "cookieless". A browser that sends other state cookies but
// not this one is refused (state_cookie_mismatch: a login started elsewhere).
//
// Phase 1b, LTI platform storage (platformStorage.ts): when the login asked for
// it (lti_storage_target) and no state cookie comes back, the launch checks the
// platform's page storage first (POST /lti/launch/verify). A storage that
// answers with the right values binds the launch to this browser (not
// cookieless); one that answers with other values or "key_not_found" is
// refused (storage_mismatch, the login-CSRF signature); one that does not
// answer in time falls back to the cookieless path (counted, audit code
// storage_unavailable).

const STATE_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_S = 60;
export const STATE_COOKIE_PREFIX = 'lti_st_';
const MAX = { param: 2048, idToken: 16_384, sub: 255 };

export const stateCookieName = (stateHash: string) => `${STATE_COOKIE_PREFIX}${stateHash.slice(0, 16)}`;

function str(v: unknown, max = MAX.param): string | undefined {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined;
}

function toolBase(): string {
  const base = lmsSettings().toolBaseUrl;
  if (!base) throw new LtiError('lti_disabled');
  return base;
}

function originOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Origins a platform may frame ENARA from (its issuer and login URL hosts). */
export function platformFrameOrigins(p: Pick<ILmsPlatform, 'issuer' | 'authLoginUrl'>): string[] {
  return [...new Set([originOf(p.issuer), originOf(p.authLoginUrl)].filter((o): o is string => !!o && /^https?:\/\//.test(o)))];
}

function onToolOrigin(uri: string): boolean {
  try {
    return new URL(uri).origin === toolBase();
  } catch {
    return false;
  }
}

function platformError(p: ILmsPlatform): LtiErrorCode | undefined {
  if (p.status === 'pending') return 'platform_pending';
  if (p.status !== 'active') return 'platform_disabled';
  return undefined;
}

async function fail(code: LtiErrorCode, event: string, ctx: { platform?: ILmsPlatform; refIds?: Record<string, unknown> } = {}): Promise<never> {
  await writeLmsAudit({ event, outcome: 'fail', code, institutionId: ctx.platform?.institutionId, platformId: ctx.platform?.id, refIds: ctx.refIds });
  throw new LtiError(code, ctx.platform ? { platformId: ctx.platform.id, institutionId: ctx.platform.institutionId, frameOrigins: platformFrameOrigins(ctx.platform) } : {});
}

// ---------------------------------------------------------------- login

export interface LoginOutcome {
  redirectUrl: string;
  cookieName: string;
  platform: ILmsPlatform;
  /** Phase 1b: the login page puts state and nonce into the platform's storage frame first. */
  storage?: { target: string; origin: string; state: string; nonce: string };
}

export async function oidcLogin(params: Record<string, unknown>): Promise<LoginOutcome> {
  const base = toolBase();
  const iss = str(params.iss);
  const loginHint = str(params.login_hint);
  const targetLinkUri = str(params.target_link_uri);
  const clientId = str(params.client_id, 200);
  const messageHint = str(params.lti_message_hint);
  if (!iss || !loginHint || !targetLinkUri) return fail('missing_parameters', 'lti.login');
  if (!onToolOrigin(targetLinkUri)) return fail('invalid_target_link_uri', 'lti.login');

  const candidates = await LmsPlatform.find({ provider: 'lti13', issuer: iss, ...(clientId ? { clientId } : {}) }).limit(2).lean();
  if (!candidates.length) return fail('unknown_platform', 'lti.login', { refIds: { hasClientId: !!clientId } });
  if (candidates.length > 1) return fail('ambiguous_platform', 'lti.login', { refIds: { platformIds: candidates.map((c) => c.id).join(',') } });
  const platform = candidates[0];
  const bad = platformError(platform);
  if (bad) return fail(bad, 'lti.login', { platform });
  if (!platform.authLoginUrl || !/^https?:\/\//.test(platform.authLoginUrl)) return fail('platform_misconfigured', 'lti.login', { platform });

  // Phase 1b: the platform offers its page storage (lti_storage_target). The
  // messages go to the origin of its OIDC auth URL (the spec's targetOrigin).
  const storageRequested = params.lti_storage_target !== undefined;
  const storageTarget = lmsSettings().platformStorageEnabled ? validStorageTarget(params.lti_storage_target) : undefined;
  const storageOrigin = storageTarget ? originOf(platform.authLoginUrl) : undefined;
  const useStorage = !!(storageTarget && storageOrigin);

  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const stateHash = sha256Hex(state);
  await LmsOidcState.create({
    stateHash,
    nonceHash: sha256Hex(nonce),
    platformId: platform.id,
    institutionId: platform.institutionId,
    targetLinkUri,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
    ...(useStorage ? { storageTarget } : {}),
  });

  const url = new URL(platform.authLoginUrl);
  const q = url.searchParams;
  q.set('scope', 'openid');
  q.set('response_type', 'id_token');
  q.set('response_mode', 'form_post');
  q.set('prompt', 'none');
  q.set('client_id', platform.clientId);
  q.set('redirect_uri', `${base}/lti/launch`);
  q.set('login_hint', loginHint);
  q.set('state', state);
  q.set('nonce', nonce);
  if (messageHint) q.set('lti_message_hint', messageHint);
  await writeLmsAudit({
    event: 'lti.login',
    outcome: 'ok',
    institutionId: platform.institutionId,
    platformId: platform.id,
    ...(storageRequested ? { refIds: { storage: useStorage } } : {}),
  });
  return {
    redirectUrl: url.toString(),
    cookieName: stateCookieName(stateHash),
    platform,
    ...(useStorage ? { storage: { target: storageTarget!, origin: storageOrigin!, state, nonce } } : {}),
  };
}

// --------------------------------------------------------------- launch

/** How the launch was tied to the browser that started the login. */
export type LaunchBinding = 'cookie' | 'cookieless' | 'storage' | 'storage_unavailable';

export interface LaunchOutcome {
  token: string;
  cookieless: boolean;
  binding: LaunchBinding;
  result: LaunchResult;
  platform: ILmsPlatform;
  stateCookieName: string;
}

/** Phase 1b: the launch waits for the platform-storage check (the page asks the storage frame). */
export interface StorageCheckOutcome {
  kind: 'storage_check';
  platform: ILmsPlatform;
  stateCookieName: string;
  target: string;
  origin: string;
  state: string;
  nonce: string;
  handle: string;
}

/** Phase 2: a validated LtiDeepLinkingRequest opens the activity picker instead of signing in. */
export interface PickerOutcome {
  kind: 'picker';
  pickerSecret: string;
  cookieless: boolean;
  binding: LaunchBinding;
  platform: ILmsPlatform;
  stateCookieName: string;
}

const JOSE_CODES: Record<string, LtiErrorCode> = {
  ERR_JWKS_NO_MATCHING_KEY: 'unknown_kid',
  ERR_JWKS_MULTIPLE_MATCHING_KEYS: 'invalid_signature',
  ERR_JWS_SIGNATURE_VERIFICATION_FAILED: 'invalid_signature',
  ERR_JWT_EXPIRED: 'token_expired',
  ERR_JOSE_ALG_NOT_ALLOWED: 'invalid_alg',
  ERR_JOSE_NOT_SUPPORTED: 'invalid_alg',
  ERR_JWS_INVALID: 'invalid_token',
  ERR_JWT_INVALID: 'invalid_token',
  ERR_JWKS_TIMEOUT: 'jwks_unavailable',
  ERR_JWKS_INVALID: 'jwks_unavailable',
  ERR_JOSE_GENERIC: 'jwks_unavailable',
};

function joseErrorCode(error: unknown): LtiErrorCode {
  const e = error as { code?: string; claim?: string };
  if (e?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
    if (e.claim === 'iss') return 'invalid_iss';
    if (e.claim === 'aud') return 'invalid_aud';
    if (e.claim === 'iat') return 'missing_iat';
    return 'invalid_token';
  }
  if (e?.code && JOSE_CODES[e.code]) return JOSE_CODES[e.code];
  // A network failure fetching the platform's keys has no jose code.
  if (error instanceof TypeError) return 'jwks_unavailable';
  return 'invalid_token';
}

function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return out;
}

function stringMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v).slice(0, 30)) {
    if (!/^[\w.$-]{1,80}$/.test(k) || k.startsWith('$')) continue;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') out[k] = String(val).slice(0, 500);
  }
  return out;
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

export async function oidcLaunch(body: Record<string, unknown>, cookieHeader: string | undefined): Promise<LaunchOutcome | PickerOutcome | StorageCheckOutcome> {
  const state = str(body.state, 512);
  if (!state) return fail('state_missing', 'lti.launch');
  const idToken = str(body.id_token, MAX.idToken);
  const stateHash = sha256Hex(state);
  const cookieName = stateCookieName(stateHash);
  const cookies = parseCookies(cookieHeader);
  const hasOwnCookie = cookies.has(cookieName);
  const otherStateCookies = [...cookies.keys()].some((k) => k.startsWith(STATE_COOKIE_PREFIX) && k !== cookieName);

  // Phase 1b: the login used platform storage and no state cookie came back.
  if (!hasOwnCookie && !otherStateCookies && idToken) {
    const stored = await LmsOidcState.findOne({ stateHash, storageTarget: { $exists: true }, heldAt: { $exists: false } }).lean();
    if (stored) return holdForStorageCheck(stored, state, idToken, cookieName);
  }

  // Single use: the state row is removed by the first launch that presents it.
  const stateRow = await LmsOidcState.findOneAndDelete({ stateHash, heldAt: { $exists: false } }).lean();
  if (!stateRow || stateRow.expiresAt.getTime() < Date.now()) return fail('state_invalid', 'lti.launch');
  const platform = await LmsPlatform.findOne({ id: stateRow.platformId }).lean();
  if (!platform) return fail('unknown_platform', 'lti.launch');
  const bad = platformError(platform);
  if (bad) return fail(bad, 'lti.launch', { platform });

  let binding: LaunchBinding = 'cookie';
  if (!hasOwnCookie) {
    if (otherStateCookies) return fail('state_cookie_mismatch', 'lti.launch', { platform });
    binding = 'cookieless';
  }
  return completeLaunch({ platform, nonceHash: stateRow.nonceHash, idToken, binding, cookieName });
}

const holdAad = (stateHash: string) => `lms_oidc_state:${stateHash}`;

/**
 * Phase 1b: checks the id_token, parks it on the state row (encrypted, one-time
 * handle, 2 minutes) and asks the browser to read the platform storage. A token
 * that fails its checks is refused now and its state is used up.
 */
async function holdForStorageCheck(row: ILmsOidcState, state: string, idToken: string, cookieName: string): Promise<StorageCheckOutcome> {
  const now = Date.now();
  if (row.expiresAt.getTime() < now) {
    await LmsOidcState.deleteOne({ stateHash: row.stateHash });
    return fail('state_invalid', 'lti.launch');
  }
  try {
    const platform = await LmsPlatform.findOne({ id: row.platformId }).lean();
    if (!platform) return fail('unknown_platform', 'lti.launch');
    const bad = platformError(platform);
    if (bad) return fail(bad, 'lti.launch', { platform });
    const origin = originOf(platform.authLoginUrl);
    if (!origin || !platform.keysetUrl) return fail('platform_misconfigured', 'lti.launch', { platform });
    const payload = await verifyIdToken(platform, idToken, row.nonceHash);
    const handle = randomBytes(32).toString('base64url');
    const held = await LmsOidcState.findOneAndUpdate(
      { stateHash: row.stateHash, heldAt: { $exists: false } },
      {
        $set: {
          heldAt: new Date(now),
          holdHash: sha256Hex(handle),
          idTokenEnc: encryptSecret(idToken, holdAad(row.stateHash)),
          expiresAt: new Date(Math.min(row.expiresAt.getTime(), now + STORAGE_HOLD_TTL_MS)),
        },
      },
    ).lean();
    if (!held) return fail('state_invalid', 'lti.launch', { platform });
    await writeLmsAudit({ event: 'lti.storage_check', outcome: 'ok', institutionId: platform.institutionId, platformId: platform.id });
    return { kind: 'storage_check', platform, stateCookieName: cookieName, target: row.storageTarget!, origin, state, nonce: payload.nonce as string, handle };
  } catch (error) {
    // Refused before the storage check: the state is used up, as on the normal path.
    await LmsOidcState.deleteOne({ stateHash: row.stateHash, heldAt: { $exists: false } }).catch(() => undefined);
    throw error;
  }
}

/**
 * Phase 1b: POST /lti/launch/verify. The launch page sends back the state, the
 * one-time handle and what the platform storage returned (r = ok | missing |
 * unavailable, s, n). The parked id_token is used once.
 */
export async function oidcLaunchVerify(body: Record<string, unknown>): Promise<LaunchOutcome | PickerOutcome> {
  const state = str(body.state, 512);
  const handle = str(body.h, 100);
  if (!state || !handle) return fail('state_missing', 'lti.launch');
  const stateHash = sha256Hex(state);
  const row = await LmsOidcState.findOneAndDelete({ stateHash, holdHash: sha256Hex(handle), heldAt: { $exists: true } }).select('+idTokenEnc').lean();
  if (!row || !row.idTokenEnc || row.expiresAt.getTime() < Date.now()) return fail('state_invalid', 'lti.launch', { refIds: { storage: true } });
  const platform = await LmsPlatform.findOne({ id: row.platformId }).lean();
  if (!platform) return fail('unknown_platform', 'lti.launch');
  const bad = platformError(platform);
  if (bad) return fail(bad, 'lti.launch', { platform });
  let idToken: string;
  try {
    idToken = decryptSecret(row.idTokenEnc, holdAad(stateHash));
  } catch {
    return fail('state_invalid', 'lti.launch', { platform, refIds: { storage: true } });
  }

  const result = body.r;
  let binding: LaunchBinding;
  if (result === 'ok') {
    const s = str(body.s, 512);
    const n = str(body.n, 512);
    if (!s || !n || sha256Hex(s) !== row.stateHash || sha256Hex(n) !== row.nonceHash) {
      return fail('storage_mismatch', 'lti.launch', { platform, refIds: { reason: 'value' } });
    }
    binding = 'storage';
  } else if (result === 'missing') {
    return fail('storage_mismatch', 'lti.launch', { platform, refIds: { reason: 'key_not_found' } });
  } else {
    binding = 'storage_unavailable';
  }
  return completeLaunch({ platform, nonceHash: row.nonceHash, idToken, binding, cookieName: stateCookieName(stateHash) });
}

/** Signature, issuer, audience, times, azp and nonce. Refuses (audited) on any failure. */
async function verifyIdToken(platform: ILmsPlatform, idToken: string, nonceHash: string): Promise<JWTPayload> {
  const { jwtVerify } = await loadJose();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, await platformKeySet(platform.keysetUrl!), {
      algorithms: ['RS256'],
      issuer: platform.issuer,
      audience: platform.clientId,
      clockTolerance: CLOCK_SKEW_S,
      requiredClaims: ['exp', 'iat', 'nonce'],
    }));
  } catch (error) {
    const e = error as { code?: string; claim?: string; reason?: string };
    const code = e?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && e.claim === 'nonce' ? 'nonce_invalid' : joseErrorCode(error);
    return fail(code, 'lti.launch', { platform, refIds: { joseCode: e?.code ?? 'none' } });
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== 'number') return fail('missing_iat', 'lti.launch', { platform });
  if (payload.iat > now + CLOCK_SKEW_S) return fail('iat_in_future', 'lti.launch', { platform });
  const aud = payload.aud;
  if (Array.isArray(aud) && aud.length > 1 && payload.azp === undefined) return fail('invalid_azp', 'lti.launch', { platform });
  if (payload.azp !== undefined && payload.azp !== platform.clientId) return fail('invalid_azp', 'lti.launch', { platform });
  if (typeof payload.nonce !== 'string' || sha256Hex(payload.nonce) !== nonceHash) return fail('nonce_invalid', 'lti.launch', { platform });
  return payload;
}

interface CompleteInput {
  platform: ILmsPlatform;
  nonceHash: string;
  idToken?: string;
  binding: LaunchBinding;
  cookieName: string;
}

/** Audit code for how the launch was bound (cookie and storage need none). */
const bindingCode = (b: LaunchBinding) => (b === 'cookieless' || b === 'storage_unavailable' ? b : undefined);

/** Everything after the browser binding: the id_token, its claims, then sign-in or the picker. */
async function completeLaunch({ platform, nonceHash, idToken, binding: via, cookieName }: CompleteInput): Promise<LaunchOutcome | PickerOutcome> {
  // A storage fallback is counted as cookieless (decision 2:A applies).
  const cookieless = via === 'cookieless' || via === 'storage_unavailable';
  if (!idToken) return fail('id_token_missing', 'lti.launch', { platform });
  if (!platform.keysetUrl) return fail('platform_misconfigured', 'lti.launch', { platform });
  const payload = await verifyIdToken(platform, idToken, nonceHash);

  const claims = payload as Record<string, unknown>;
  if (claims[CLAIM.version] !== LTI_VERSION) return fail('invalid_version', 'lti.launch', { platform });
  const messageType = claims[CLAIM.messageType];
  const deepLink = messageType === DEEP_LINKING_REQUEST;
  if (!(SUPPORTED_MESSAGE_TYPES as readonly unknown[]).includes(messageType) || (deepLink && !lmsFlags().deepLinking)) {
    return fail('unsupported_message_type', 'lti.launch', { platform, refIds: { messageType: typeof messageType === 'string' ? messageType.slice(0, 60) : 'none' } });
  }
  const externalDeploymentId = str(claims[CLAIM.deploymentId], 255);
  if (!externalDeploymentId) return fail('missing_deployment', 'lti.launch', { platform });
  const deployment = await LmsDeployment.findOne({ platformId: platform.id, deploymentId: externalDeploymentId }).lean();
  if (!deployment) {
    if (platform.autoCreateDeployments) {
      await LmsDeployment.updateOne(
        { platformId: platform.id, deploymentId: externalDeploymentId },
        { $setOnInsert: { institutionId: platform.institutionId, status: 'pending' } },
        { upsert: true },
      ).catch(() => undefined);
      return fail('deployment_pending', 'lti.launch', { platform, refIds: { deploymentId: externalDeploymentId, autoCreated: true } });
    }
    return fail('unknown_deployment', 'lti.launch', { platform, refIds: { deploymentId: externalDeploymentId } });
  }
  if (deployment.status === 'pending') return fail('deployment_pending', 'lti.launch', { platform, refIds: { deploymentId: deployment.id } });
  if (deployment.status !== 'active') return fail('unknown_deployment', 'lti.launch', { platform, refIds: { deploymentId: deployment.id } });

  const targetLinkUri = str(claims[CLAIM.targetLinkUri]);
  if (!targetLinkUri || !onToolOrigin(targetLinkUri)) return fail('invalid_target_link_uri', 'lti.launch', { platform });
  const sub = str(payload.sub, MAX.sub);
  if (!sub) return fail('anonymous_launch', 'lti.launch', { platform });
  const roles = claims[CLAIM.roles];
  if (!Array.isArray(roles) || !roles.some((r) => typeof r === 'string' && r)) return fail('missing_roles', 'lti.launch', { platform });
  const context = obj(claims[CLAIM.context]);
  const contextId = str(context?.id, 255);
  if (!contextId) return fail('missing_context', 'lti.launch', { platform });
  const resourceLink = obj(claims[CLAIM.resourceLink]);
  const resourceLinkId = str(resourceLink?.id, 255);
  if (!resourceLinkId && !deepLink) return fail('missing_resource_link', 'lti.launch', { platform });

  if (await isInstitutionSuspended(platform.institutionId)) return fail('institution_suspended', 'lti.launch', { platform });
  // PDPL (Priority 0): a permanently deleted student's LMS identity is never
  // re-created. Refused before any preview, picker or provisioning.
  const suppressed = await findSuppression(platform.id, sub);
  if (suppressed) return fail('identity_suppressed', 'lti.launch', { platform, refIds: { deploymentId: deployment.id, suppressionId: suppressed.id } });

  const preset = getPreset(platform.vendor);
  const mapped = mapLtiRoles(roles, {
    allowAdminRole: platform.allowAdminRole,
    overrides: { ...(preset?.roleOverrides ?? {}), ...((platform.roleOverrides as Record<string, string> | undefined) ?? {}) },
  });
  if (mapped.role === 'observer') return fail('observer_not_supported', 'lti.launch', { platform, refIds: { warnings: mapped.warnings.join(',') } });

  // Phase 2: the activity picker. Nothing is provisioned; the picker session
  // only carries IDs, and the picked items bind on their first launch.
  if (deepLink) {
    const pickerSecret = await startDeepLinking({
      platform,
      externalDeploymentId,
      externalContextId: contextId,
      contextTitle: str(context?.title, 200),
      sub,
      role: mapped.role,
      claims,
    });
    return { kind: 'picker', pickerSecret, cookieless, binding: via, platform, stateCookieName: cookieName };
  }

  const ags = obj(claims[CLAIM.ags]);
  const nrps = obj(claims[CLAIM.nrps]);
  const customParams = stringMap(claims[CLAIM.custom]);
  const agsScopes = Array.isArray(ags?.scope) ? ags.scope.filter((x): x is string => typeof x === 'string' && x.length <= 200).slice(0, 10) : undefined;

  // Phase 3: the ENARA work this activity opens (custom parameter), checked
  // against this school before anything is provisioned.
  let binding: ValidatedBinding | undefined;
  try {
    const wanted = bindingRequest(customParams);
    if (wanted) binding = await validateBinding(wanted, platform.institutionId);
  } catch (error) {
    if (error instanceof BindingError) return fail('invalid_activity_binding', 'lti.launch', { platform, refIds: { reason: error.reason } });
    throw error;
  }
  // Phase 2b: a page of ENARA instead of work (enara_target; never both, checked
  // above). Resolved for the role the session opens: never a page that role
  // may not open (an unknown or forbidden page lands on that role's home).
  const requestedPage = pageTargetRequest(customParams);
  const pageFor = (role: 'student' | 'teacher' | 'admin'): ResolvedPageTarget | undefined => (requestedPage === null ? undefined : resolvePageTarget(requestedPage, role));

  const input: ProvisionInput = {
    platformId: platform.id,
    institutionId: platform.institutionId,
    externalUserId: sub,
    person: { email: str(payload.email, 254), givenName: str(payload.given_name, 120), familyName: str(payload.family_name, 120), name: str(payload.name, 200) },
    role: mapped.role as ProvisionRole,
    rawRoles: roles.filter((r): r is string => typeof r === 'string'),
    testUser: isTestUser(roles),
    context: { externalId: contextId, title: str(context?.title, 200), label: str(context?.label, 120) },
    resourceLink: { externalId: resourceLinkId!, title: str(resourceLink?.title, 200), customParams, lineItemUrl: str(ags?.lineitem) },
    services: { nrpsUrl: str(nrps?.context_memberships_url), agsLineItemsUrl: str(ags?.lineitems), agsScopes },
    binding,
  };

  // Staff opening the activity as a learner (owner decision L1): a read-only
  // preview of the student view. Nothing is provisioned or changed.
  let preview;
  try {
    preview = await findStudentPreview(input);
    // Phase 4 (owner item): a first-ever launch already switched to student.
    // No ENARA account yet: ask the LMS roster (NRPS) for the real course role.
    if (!preview) preview = await nrpsStudentPreview(input, platform);
  } catch (error) {
    if (error instanceof LmsProvisionError) return fail(error.code, 'lti.launch', { platform, refIds: { role: mapped.role, testUser: !!input.testUser } });
    throw error;
  }
  if (preview) {
    const token = await issueLaunchToken({
      institutionId: platform.institutionId,
      enaraUserId: preview.enaraUserId,
      purpose: 'launch',
      enaraRole: 'student',
      preview: true,
      platformId: platform.id,
      lmsUserId: preview.lmsUserId,
      contextId: preview.contextId,
      enaraClassId: preview.enaraClassId,
      resourceLinkId: preview.resourceLinkId,
      ...(requestedPage === null ? { targetAssignmentId: preview.targetAssignmentId } : { targetPage: pageFor('student')!.page }),
      presentation: preview.presentation,
      cookieless,
    });
    await writeLmsAudit({
      event: 'preview_launch',
      outcome: 'ok',
      institutionId: platform.institutionId,
      platformId: platform.id,
      actor: preview.lmsUserId,
      code: bindingCode(via),
      refIds: {
        deploymentId: deployment.id,
        lmsUserId: preview.lmsUserId,
        enaraUserId: preview.enaraUserId,
        staffRole: preview.staffRole,
        detectedBy: preview.detectedBy,
        contextId: preview.contextId,
        resourceLinkId: preview.resourceLinkId,
        enaraClassId: preview.enaraClassId,
        cookieless,
        ...(via.startsWith('storage') ? { binding: via } : {}),
      },
    });
    return {
      token,
      cookieless,
      binding: via,
      platform,
      stateCookieName: cookieName,
      result: {
        enaraUserId: preview.enaraUserId,
        enaraRole: 'student',
        enaraOrgId: platform.institutionId,
        enaraClassId: preview.enaraClassId,
        presentation: preview.presentation,
        returnUrl: str(obj(claims[CLAIM.launchPresentation])?.return_url),
        preview: true,
      },
    };
  }

  let provisioned;
  try {
    provisioned = await provisionLaunch(input);
  } catch (error) {
    if (error instanceof LmsProvisionError) return fail(error.code, 'lti.launch', { platform, refIds: { role: mapped.role } });
    throw error;
  }

  await LmsPlatform.updateOne(
    { id: platform.id },
    { $inc: { launchCount: 1, ...(cookieless ? { cookielessLaunchCount: 1 } : {}), ...(via === 'storage' ? { storageLaunchCount: 1 } : {}) }, $set: { lastLaunchAt: new Date() } },
  );
  const tokenRole = mapped.role as ProvisionRole;
  const page = pageFor(tokenRole);
  const token = await issueLaunchToken({
    institutionId: platform.institutionId,
    enaraUserId: provisioned.enaraUserId,
    purpose: 'launch',
    enaraRole: tokenRole,
    platformId: platform.id,
    lmsUserId: provisioned.lmsUser.id,
    contextId: provisioned.context.id,
    enaraClassId: provisioned.enaraClassId,
    resourceLinkId: provisioned.resourceLink.id,
    // A page target opens its page, never work the link may have been bound to before.
    ...(page ? { targetPage: page.page } : { targetAssignmentId: provisioned.resourceLink.enaraActivityId }),
    presentation: provisioned.resourceLink.presentation,
    cookieless,
  });
  // Plan §5 (d): a learner's launch flushes that learner's pending grades; a
  // teacher's launch flushes the course's. Background; inert unless passback is on.
  scheduleTargetedFlush(tokenRole === 'student' ? { lmsUserId: provisioned.lmsUser.id } : { contextId: provisioned.context.id });
  // Phase 4: a teacher's launch syncs the roster in the background when the
  // last sync is older than 24 h. Inert unless LMS_ROSTER_SYNC_ENABLED is on.
  const rosterSyncStarted = tokenRole !== 'student' ? scheduleRosterSyncOnLaunch(provisioned.context) : false;
  await writeLmsAudit({
    event: 'lti.launch',
    outcome: mapped.warnings.length || cookieless || provisioned.seat?.overLimit ? 'warn' : 'ok',
    institutionId: platform.institutionId,
    platformId: platform.id,
    actor: provisioned.lmsUser.id,
    code: bindingCode(via),
    refIds: {
      deploymentId: deployment.id,
      contextId: provisioned.context.id,
      lmsUserId: provisioned.lmsUser.id,
      resourceLinkId: provisioned.resourceLink.id,
      enaraClassId: provisioned.enaraClassId,
      role: mapped.role,
      warnings: mapped.warnings.join(','),
      cookieless,
      ...(via.startsWith('storage') ? { binding: via } : {}),
      createdUser: provisioned.createdUser,
      createdContext: provisioned.createdContext,
      overSeatLimit: !!provisioned.seat?.overLimit,
      ...(rosterSyncStarted ? { rosterSyncStarted } : {}),
      ...(page ? { pageTarget: page.key, page: page.page, ...(page.fallback ? { pageFallback: page.fallback } : {}), ...(page.activity ? { activity: page.activity } : {}) } : {}),
    },
  });
  return {
    token,
    cookieless,
    binding: via,
    platform,
    stateCookieName: cookieName,
    result: {
      enaraUserId: provisioned.enaraUserId,
      enaraRole: mapped.role,
      enaraOrgId: platform.institutionId,
      enaraClassId: provisioned.enaraClassId,
      targetActivityId: page ? undefined : provisioned.resourceLink.enaraActivityId,
      presentation: provisioned.resourceLink.presentation,
      returnUrl: str(obj(claims[CLAIM.launchPresentation])?.return_url),
    },
  };
}

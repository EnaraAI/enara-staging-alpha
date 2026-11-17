import { randomBytes } from 'crypto';
import type { JWTPayload } from 'jose';
import { isInstitutionSuspended } from '../../../../middleware/auth.middleware';
import { writeLmsAudit } from '../../core/audit';
import { BindingError, bindingRequest, validateBinding, type ValidatedBinding } from '../../core/binding';
import { sha256Hex } from '../../core/crypto';
import { findStudentPreview, LmsProvisionError, provisionLaunch, type ProvisionInput, type ProvisionRole } from '../../core/domainService';
import { lmsSettings } from '../../core/flags';
import { loadJose } from '../../core/jose';
import { issueLaunchToken } from '../../core/launchToken';
import { scheduleTargetedFlush } from '../../core/drain';
import { isTestUser, mapLtiRoles } from '../../core/roleMap';
import type { LaunchResult } from '../../core/types';
import { LmsDeployment, LmsOidcState, LmsPlatform, type ILmsPlatform } from '../../models';
import { getPreset } from '../../presets';
import { CLAIM, LTI_VERSION, SUPPORTED_MESSAGE_TYPES } from './claims';
import { LtiError, type LtiErrorCode } from './errors';
import { platformKeySet } from './jwks';

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
  await writeLmsAudit({ event: 'lti.login', outcome: 'ok', institutionId: platform.institutionId, platformId: platform.id });
  return { redirectUrl: url.toString(), cookieName: stateCookieName(stateHash), platform };
}

// --------------------------------------------------------------- launch

export interface LaunchOutcome {
  token: string;
  cookieless: boolean;
  result: LaunchResult;
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

export async function oidcLaunch(body: Record<string, unknown>, cookieHeader: string | undefined): Promise<LaunchOutcome> {
  const state = str(body.state, 512);
  if (!state) return fail('state_missing', 'lti.launch');
  const idToken = str(body.id_token, MAX.idToken);
  const stateHash = sha256Hex(state);
  const cookieName = stateCookieName(stateHash);

  // Single use: the state row is removed by the first launch that presents it.
  const stateRow = await LmsOidcState.findOneAndDelete({ stateHash }).lean();
  if (!stateRow || stateRow.expiresAt.getTime() < Date.now()) return fail('state_invalid', 'lti.launch');
  const platform = await LmsPlatform.findOne({ id: stateRow.platformId }).lean();
  if (!platform) return fail('unknown_platform', 'lti.launch');
  const bad = platformError(platform);
  if (bad) return fail(bad, 'lti.launch', { platform });

  const cookies = parseCookies(cookieHeader);
  const stateCookies = [...cookies.keys()].filter((k) => k.startsWith(STATE_COOKIE_PREFIX));
  let cookieless = false;
  if (!cookies.has(cookieName)) {
    if (stateCookies.length) return fail('state_cookie_mismatch', 'lti.launch', { platform });
    cookieless = true;
  }
  if (!idToken) return fail('id_token_missing', 'lti.launch', { platform });
  if (!platform.keysetUrl) return fail('platform_misconfigured', 'lti.launch', { platform });

  const { jwtVerify } = await loadJose();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, await platformKeySet(platform.keysetUrl), {
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
  if (typeof payload.nonce !== 'string' || sha256Hex(payload.nonce) !== stateRow.nonceHash) return fail('nonce_invalid', 'lti.launch', { platform });

  const claims = payload as Record<string, unknown>;
  if (claims[CLAIM.version] !== LTI_VERSION) return fail('invalid_version', 'lti.launch', { platform });
  const messageType = claims[CLAIM.messageType];
  if (!(SUPPORTED_MESSAGE_TYPES as readonly unknown[]).includes(messageType)) {
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
  if (!resourceLinkId) return fail('missing_resource_link', 'lti.launch', { platform });

  if (await isInstitutionSuspended(platform.institutionId)) return fail('institution_suspended', 'lti.launch', { platform });

  const preset = getPreset(platform.vendor);
  const mapped = mapLtiRoles(roles, {
    allowAdminRole: platform.allowAdminRole,
    overrides: { ...(preset?.roleOverrides ?? {}), ...((platform.roleOverrides as Record<string, string> | undefined) ?? {}) },
  });
  if (mapped.role === 'observer') return fail('observer_not_supported', 'lti.launch', { platform, refIds: { warnings: mapped.warnings.join(',') } });

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

  const input: ProvisionInput = {
    platformId: platform.id,
    institutionId: platform.institutionId,
    externalUserId: sub,
    person: { email: str(payload.email, 254), givenName: str(payload.given_name, 120), familyName: str(payload.family_name, 120), name: str(payload.name, 200) },
    role: mapped.role as ProvisionRole,
    rawRoles: roles.filter((r): r is string => typeof r === 'string'),
    testUser: isTestUser(roles),
    context: { externalId: contextId, title: str(context?.title, 200), label: str(context?.label, 120) },
    resourceLink: { externalId: resourceLinkId, title: str(resourceLink?.title, 200), customParams, lineItemUrl: str(ags?.lineitem) },
    services: { nrpsUrl: str(nrps?.context_memberships_url), agsLineItemsUrl: str(ags?.lineitems), agsScopes },
    binding,
  };

  // Staff opening the activity as a learner (owner decision L1): a read-only
  // preview of the student view. Nothing is provisioned or changed.
  let preview;
  try {
    preview = await findStudentPreview(input);
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
      targetAssignmentId: preview.targetAssignmentId,
      presentation: preview.presentation,
      cookieless,
    });
    await writeLmsAudit({
      event: 'preview_launch',
      outcome: 'ok',
      institutionId: platform.institutionId,
      platformId: platform.id,
      actor: preview.lmsUserId,
      code: cookieless ? 'cookieless' : undefined,
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
      },
    });
    return {
      token,
      cookieless,
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
    { $inc: { launchCount: 1, ...(cookieless ? { cookielessLaunchCount: 1 } : {}) }, $set: { lastLaunchAt: new Date() } },
  );
  const tokenRole = mapped.role as ProvisionRole;
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
    targetAssignmentId: provisioned.resourceLink.enaraActivityId,
    presentation: provisioned.resourceLink.presentation,
    cookieless,
  });
  // Plan §5 (d): a learner's launch flushes that learner's pending grades; a
  // teacher's launch flushes the course's. Background; inert unless passback is on.
  scheduleTargetedFlush(tokenRole === 'student' ? { lmsUserId: provisioned.lmsUser.id } : { contextId: provisioned.context.id });
  await writeLmsAudit({
    event: 'lti.launch',
    outcome: mapped.warnings.length || cookieless || provisioned.seat?.overLimit ? 'warn' : 'ok',
    institutionId: platform.institutionId,
    platformId: platform.id,
    actor: provisioned.lmsUser.id,
    code: cookieless ? 'cookieless' : undefined,
    refIds: {
      deploymentId: deployment.id,
      contextId: provisioned.context.id,
      lmsUserId: provisioned.lmsUser.id,
      resourceLinkId: provisioned.resourceLink.id,
      enaraClassId: provisioned.enaraClassId,
      role: mapped.role,
      warnings: mapped.warnings.join(','),
      cookieless,
      createdUser: provisioned.createdUser,
      createdContext: provisioned.createdContext,
      overSeatLimit: !!provisioned.seat?.overLimit,
    },
  });
  return {
    token,
    cookieless,
    platform,
    stateCookieName: cookieName,
    result: {
      enaraUserId: provisioned.enaraUserId,
      enaraRole: mapped.role,
      enaraOrgId: platform.institutionId,
      enaraClassId: provisioned.enaraClassId,
      targetActivityId: provisioned.resourceLink.enaraActivityId,
      presentation: provisioned.resourceLink.presentation,
      returnUrl: str(obj(claims[CLAIM.launchPresentation])?.return_url),
    },
  };
}

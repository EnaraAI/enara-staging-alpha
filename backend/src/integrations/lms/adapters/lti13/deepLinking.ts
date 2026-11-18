import { createHash, randomBytes } from 'crypto';
import { writeLmsAudit } from '../../core/audit';
import { lmsSettings } from '../../core/flags';
import { getSigningKey } from '../../core/keys';
import { loadJose } from '../../core/jose';
import { itemKey, type PickerItem } from '../../core/picker';
import { LmsDeepLinkSession, type ILmsDeepLinkSession, type ILmsPlatform } from '../../models';
import { CLAIM, DEEP_LINKING_RESPONSE, LTI_VERSION } from './claims';
import { LtiError } from './errors';

// LTI Deep Linking 2.0 (Phase 2, the activity picker).
//
// Request: a teacher or admin clicks "Select content" in the LMS. The launch
// is validated like any other (oidc.ts: signature, nonce, issuer, deployment),
// then startDeepLinking() checks the deep-linking settings, stores a picker
// session (10 minutes, single use, IDs only) and returns its secret. The
// browser goes to /lms/picker#ps=<secret> (fragment: never sent to a server).
//
// Response: the picker posts the chosen items; buildDeepLinkResponse() signs
// an LtiDeepLinkingResponse with ENARA's LMS key (the same key the LMS already
// trusts for grades) and the page auto-posts it to the LMS return URL. Each
// item becomes one LMS activity: its title, the custom parameter the launch
// already understands (Phase 3 binding), a grade column (max 100, owner
// decision P2) only for graded items, and a request for a new window for
// items that need the microphone or camera (owner decision P3: ENARA asks the
// LMS for a new window and always offers its own new tab; Moodle 4.3+ ignores
// the request, MDL-79442).

export const PICKER_TTL_MS = 10 * 60_000;
export const SCORE_MAXIMUM = 100;
const RESPONSE_TTL_S = 300;
const MAX_ITEMS = 20;

export const hashSecret = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function sameSite(url: string, platform: Pick<ILmsPlatform, 'issuer' | 'authLoginUrl'>): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(process.env.NODE_ENV === 'test' && u.protocol === 'http:')) return false;
    return [platform.issuer, platform.authLoginUrl].some((p) => {
      try {
        return !!p && new URL(p).host === u.host;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export interface DeepLinkStart {
  platform: ILmsPlatform;
  externalDeploymentId: string;
  externalContextId: string;
  contextTitle?: string;
  sub: string;
  role: string;
  claims: Record<string, unknown>;
}

function fail(code: 'deep_link_not_allowed' | 'deep_link_invalid', platform: ILmsPlatform, refIds: Record<string, unknown> = {}): never {
  void writeLmsAudit({ event: 'lti.deep_link', outcome: 'fail', code, institutionId: platform.institutionId, platformId: platform.id, refIds });
  const origins = [platform.issuer, platform.authLoginUrl].flatMap((u) => {
    try {
      return u ? [new URL(u).origin] : [];
    } catch {
      return [];
    }
  });
  throw new LtiError(code, { platformId: platform.id, institutionId: platform.institutionId, frameOrigins: [...new Set(origins)] });
}

/** Checks a validated LtiDeepLinkingRequest and opens a picker session. Returns the picker secret. */
export async function startDeepLinking(input: DeepLinkStart): Promise<string> {
  const { platform } = input;
  if (input.role !== 'teacher' && input.role !== 'admin') fail('deep_link_not_allowed', platform, { role: input.role });
  const settings = obj(input.claims[CLAIM.deepLinkingSettings]);
  const returnUrl = typeof settings?.deep_link_return_url === 'string' ? settings.deep_link_return_url : '';
  if (!returnUrl || returnUrl.length > 2048 || !sameSite(returnUrl, platform)) fail('deep_link_invalid', platform, { reason: 'return_url' });
  const acceptTypes = strArr(settings?.accept_types);
  if (!acceptTypes.includes('ltiResourceLink')) fail('deep_link_invalid', platform, { reason: 'accept_types' });
  const targets = strArr(settings?.accept_presentation_document_targets);
  const data = typeof settings?.data === 'string' && settings.data.length <= 4096 ? settings.data : undefined;
  const presentation = obj(input.claims[CLAIM.launchPresentation]);
  const locale = typeof presentation?.locale === 'string' && /^ar\b/i.test(presentation.locale) ? 'ar' : 'en';

  const secret = randomBytes(32).toString('base64url');
  const session = await LmsDeepLinkSession.create({
    secretHash: hashSecret(secret),
    institutionId: platform.institutionId,
    platformId: platform.id,
    externalDeploymentId: input.externalDeploymentId,
    externalContextId: input.externalContextId,
    contextTitle: input.contextTitle,
    lmsUserSub: input.sub,
    role: input.role as 'teacher' | 'admin',
    locale,
    returnUrl,
    data,
    acceptMultiple: settings?.accept_multiple !== false,
    acceptLineItem: settings?.accept_lineitem !== false,
    acceptWindow: !targets.length || targets.includes('window'),
    acceptIframe: !targets.length || targets.includes('iframe'),
    expiresAt: new Date(Date.now() + PICKER_TTL_MS),
    purgeAt: new Date(Date.now() + PICKER_TTL_MS),
  });
  await writeLmsAudit({
    event: 'lti.deep_link',
    outcome: 'ok',
    institutionId: platform.institutionId,
    platformId: platform.id,
    refIds: { step: 'request', contextExternalId: input.externalContextId, role: input.role, locale, sessionAt: session.createdAt.toISOString() },
  });
  return secret;
}

export type DeepLinkSessionError = 'picker_session_invalid' | 'picker_session_expired' | 'picker_session_used';

/** The open session for a secret, or an error code (never throws for a bad secret). */
export async function findPickerSession(secret: unknown): Promise<{ session: ILmsDeepLinkSession } | { error: DeepLinkSessionError }> {
  if (typeof secret !== 'string' || secret.length < 20 || secret.length > 100) return { error: 'picker_session_invalid' };
  const session = await LmsDeepLinkSession.findOne({ secretHash: hashSecret(secret) }).lean();
  if (!session) return { error: 'picker_session_invalid' };
  if (session.usedAt) return { error: 'picker_session_used' };
  if (session.expiresAt.getTime() < Date.now()) return { error: 'picker_session_expired' };
  return { session };
}

/** One LTI DL content item for a picked ENARA item. */
export function contentItem(item: PickerItem, session: Pick<ILmsDeepLinkSession, 'acceptLineItem' | 'acceptWindow'>): Record<string, unknown> {
  const base = lmsSettings().toolBaseUrl;
  const ci: Record<string, unknown> = {
    type: 'ltiResourceLink',
    title: item.title.slice(0, 255),
    url: `${base}/lti/launch`,
    custom: item.custom,
  };
  if (item.description) ci.text = item.description;
  if (item.graded && session.acceptLineItem) {
    ci.lineItem = { scoreMaximum: SCORE_MAXIMUM, label: item.title.slice(0, 255), resourceId: itemKey(item.type, item.id), tag: 'enara' };
  }
  // Mic / camera: ask the LMS for a new window (decision P3). Moodle 4.3+ ignores it; ENARA's own
  // "Open in new tab" covers that. Without a hint the LMS uses its default (embedded).
  if (item.needsMedia && session.acceptWindow) ci.window = { targetName: `enara_${item.id}`.slice(0, 60) };
  return ci;
}

/**
 * Marks the session used (atomically: a second submit fails) and returns the
 * signed LtiDeepLinkingResponse for the LMS. `items` may be empty (the teacher cancelled).
 */
export async function buildDeepLinkResponse(
  secret: string,
  items: PickerItem[],
  platform: Pick<ILmsPlatform, 'id' | 'clientId' | 'issuer' | 'institutionId'>,
): Promise<{ returnUrl: string; jwt: string }> {
  if (items.length > MAX_ITEMS) throw new LtiError('deep_link_invalid');
  const session = await LmsDeepLinkSession.findOneAndUpdate(
    { secretHash: hashSecret(secret), usedAt: { $exists: false }, expiresAt: { $gt: new Date() }, platformId: platform.id },
    { $set: { usedAt: new Date(), picked: items.map((i) => ({ type: i.type, id: i.id })) }, $unset: { purgeAt: 1 } },
    { new: true },
  ).lean();
  if (!session) throw new LtiError('picker_session_used');
  if (!session.acceptMultiple && items.length > 1) throw new LtiError('deep_link_invalid');

  const { SignJWT } = await loadJose();
  const { kid, key } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    [CLAIM.messageType]: DEEP_LINKING_RESPONSE,
    [CLAIM.version]: LTI_VERSION,
    [CLAIM.deploymentId]: session.externalDeploymentId,
    [CLAIM.deepLinkingContentItems]: items.map((i) => contentItem(i, session)),
    nonce: randomBytes(16).toString('base64url'),
  };
  if (session.data) payload[CLAIM.deepLinkingData] = session.data;
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(platform.clientId)
    .setAudience(platform.issuer)
    .setIssuedAt(now)
    .setExpirationTime(now + RESPONSE_TTL_S)
    .setJti(randomBytes(16).toString('base64url'))
    .sign(key);
  await writeLmsAudit({
    event: 'lti.deep_link',
    outcome: 'ok',
    institutionId: platform.institutionId,
    platformId: platform.id,
    refIds: {
      step: 'response',
      contextExternalId: session.externalContextId,
      items: items.length,
      graded: items.filter((i) => i.graded).length,
      newWindow: items.filter((i) => i.needsMedia).length,
      itemIds: items.map((i) => itemKey(i.type, i.id)).join(',').slice(0, 200),
    },
  });
  return { returnUrl: session.returnUrl, jwt };
}

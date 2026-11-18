import { randomUUID } from 'crypto';
import { Assignment } from '../../../../models/Assignment';
import { AGS_SCOPE, resolveCapabilities } from '../../core/capabilities';
import { decryptSecret, encryptSecret } from '../../core/crypto';
import { loadJose } from '../../core/jose';
import { getSigningKey } from '../../core/keys';
import type { GradeSyncJobView, PushResult } from '../../core/types';
import { LmsAccessToken, LmsContext, LmsLineItem, LmsPlatform, LmsResourceLink, LmsUser, type ILmsContext, type ILmsPlatform, type ILmsResourceLink } from '../../models';
import { getPreset } from '../../presets';
import { isAcceptableKeysetUrl } from './jwks';

// LTI Advantage Assignment and Grade Services 2.0 (Phase 3), for one outbox job:
//  1. a service token: OAuth2 client_credentials with a signed JWT client
//     assertion (our active tool key, its kid published in our JWKS; iss = sub
//     = client_id, aud = the platform's token URL), cached encrypted in
//     lms_access_tokens until a minute before it expires;
//  2. the line item: the launch's endpoint.lineitem when there is one;
//     otherwise found through endpoint.lineitems (by resource link), or created
//     there when the platform granted the lineitem scope (capability
//     lineItemCreate); remembered on the resource link and in lms_line_items;
//  3. POST {lineitem}/scores (application/vnd.ims.lis.v1.score+json).
// Every LMS call has an 8 s timeout. Only short codes are returned (http_503,
// timeout, ...): never a response body, which could carry personal data.

const MEDIA = {
  score: 'application/vnd.ims.lis.v1.score+json',
  lineItem: 'application/vnd.ims.lis.v2.lineitem+json',
  lineItems: 'application/vnd.ims.lis.v2.lineitemcontainer+json',
  results: 'application/vnd.ims.lis.v2.resultcontainer+json',
} as const;
const WANTED_SCOPES: string[] = [AGS_SCOPE.lineItem, AGS_SCOPE.resultReadOnly, AGS_SCOPE.score];
const TOKEN_MARGIN_MS = 60_000;
export const LINE_ITEM_GONE = 'lineitem_gone';
let callTimeoutMs = 8_000;

/** A failed LTI service call (AGS here, NRPS in nrps.ts): a short code, never a response body. */
export class AgsFailure extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean, public readonly status?: number, public readonly retryAfterSeconds?: number) {
    super(code);
  }
}

/** Only https (plain http to this machine outside production, for tests). */
export function safeUrl(url: string | undefined, code: string): string {
  if (!url || !isAcceptableKeysetUrl(url)) throw new AgsFailure(code, false);
  return url;
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(callTimeoutMs) });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    throw new AgsFailure(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', true);
  }
}

function retryAfter(res: Response): number | undefined {
  const v = Number(res.headers.get('retry-after'));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 24 * 3600) : undefined;
}

export function httpFailure(prefix: string, res: Response): AgsFailure {
  const retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
  return new AgsFailure(`${prefix}http_${res.status}`, retryable, res.status, retryAfter(res));
}

// ---------------------------------------------------------------- token

const scopesKeyOf = (scopes: string[]) => [...new Set(scopes)].sort().join(' ');
const tokenAad = (platformId: string, scopesKey: string) => `lms_access_tokens:${platformId}:${scopesKey}`;

/** The scopes to ask for: lineitem, result.readonly and score, narrowed to what the launch granted (when it said). */
export function tokenScopes(granted: string[] | undefined): string[] {
  if (!granted?.length) return [...WANTED_SCOPES];
  const g = new Set(granted);
  const out = WANTED_SCOPES.filter((s) => g.has(s));
  // A platform that grants only lineitem.readonly still lets us read line items.
  if (!g.has(AGS_SCOPE.lineItem) && g.has(AGS_SCOPE.lineItemReadOnly)) out.push(AGS_SCOPE.lineItemReadOnly);
  return out.length ? out : [AGS_SCOPE.score];
}

/** The signed client assertion (RFC 7523) for the platform's token endpoint. */
export async function clientAssertion(platform: Pick<ILmsPlatform, 'clientId' | 'authTokenUrl' | 'tokenAudience'>): Promise<string> {
  const { SignJWT } = await loadJose();
  const { kid, key } = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(platform.clientId)
    .setSubject(platform.clientId)
    .setAudience(platform.tokenAudience || platform.authTokenUrl!)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(randomUUID())
    .sign(key);
}

/** A service token for these scopes: from the encrypted cache, or a new one from the platform. */
export async function serviceToken(platform: ILmsPlatform, scopes: string[], opts: { force?: boolean } = {}): Promise<string> {
  const scopesKey = scopesKeyOf(scopes);
  const aad = tokenAad(platform.id, scopesKey);
  if (!opts.force) {
    const cached = await LmsAccessToken.findOne({ platformId: platform.id, scopesKey }).select('+tokenEnc').lean();
    if (cached && cached.expiresAt.getTime() - Date.now() > TOKEN_MARGIN_MS) {
      try {
        return decryptSecret(cached.tokenEnc, aad);
      } catch {
        /* unreadable (e.g. the key changed): fetch a new one */
      }
    }
  }
  const tokenUrl = safeUrl(platform.authTokenUrl, 'no_token_url');
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: await clientAssertion(platform),
    scope: scopesKey,
  });
  const res = await call(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
  if (!res.ok) throw httpFailure('token_', res);
  const json = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  const token = typeof json?.access_token === 'string' && json.access_token.length <= 8192 ? json.access_token : undefined;
  if (!token) throw new AgsFailure('token_invalid_response', true);
  const seconds = typeof json?.expires_in === 'number' && Number.isFinite(json.expires_in) && json.expires_in > 0 ? Math.min(json.expires_in, 24 * 3600) : 3600;
  await LmsAccessToken.updateOne(
    { platformId: platform.id, scopesKey },
    { $set: { tokenEnc: encryptSecret(token, aad), expiresAt: new Date(Date.now() + seconds * 1000), institutionId: platform.institutionId } },
    { upsert: true },
  ).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
  });
  return token;
}

/** One LTI service request (AGS, NRPS) with the service token; a 401 refreshes the token once. */
export async function agsFetch(platform: ILmsPlatform, scopes: string[], url: string, init: RequestInit & { headers: Record<string, string> }): Promise<Response> {
  let token = await serviceToken(platform, scopes);
  let res = await call(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    token = await serviceToken(platform, scopes, { force: true });
    res = await call(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  }
  return res;
}

// ------------------------------------------------------------ line item

/** {lineitem}/scores, keeping the line item's query string (Moodle: ?type_id=). */
export function scoresUrl(lineItemUrl: string): string {
  const u = new URL(lineItemUrl);
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/scores`;
  return u.toString();
}

function withQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function grantedScopes(platform: ILmsPlatform, context: ILmsContext): string[] {
  return [...new Set([...(platform.scopes ?? []), ...(context.agsScopes ?? [])])];
}

async function remember(context: ILmsContext, link: ILmsResourceLink, url: string, scoreMaximum: number, label?: string): Promise<string> {
  await LmsLineItem.updateOne(
    { contextId: context.id, externalLineItemUrl: url },
    { $set: { resourceLinkId: link.id, scoreMaximum, ...(label ? { label } : {}), ...(link.enaraActivityId ? { resourceId: link.enaraActivityId } : {}), tag: 'enara' }, $setOnInsert: { institutionId: context.institutionId } },
    { upsert: true },
  ).catch((error: { code?: number }) => {
    if (error.code !== 11000) throw error;
  });
  await LmsResourceLink.updateOne({ id: link.id, lineItemUrl: { $exists: false } }, { $set: { lineItemUrl: url } });
  return url;
}

/** The line item to post to: the launch's, else found or created through the course's line items service. */
export async function resolveLineItem(platform: ILmsPlatform, context: ILmsContext, link: ILmsResourceLink, scoreMaximum: number): Promise<string> {
  if (link.lineItemUrl) return safeUrl(link.lineItemUrl, 'bad_line_item_url');
  const container = safeUrl(context.agsLineItemsUrl, 'no_line_item');
  const granted = grantedScopes(platform, context);
  const scopes = tokenScopes(context.agsScopes);
  const res = await agsFetch(platform, scopes, withQuery(container, { resource_link_id: link.externalResourceLinkId }), { method: 'GET', headers: { Accept: MEDIA.lineItems } });
  if (!res.ok) throw httpFailure('lineitems_', res);
  const items = (await res.json().catch(() => [])) as Array<{ id?: unknown; resourceLinkId?: unknown; resourceId?: unknown; tag?: unknown }>;
  const found = (Array.isArray(items) ? items : []).find(
    (i) => typeof i?.id === 'string' && (i.resourceLinkId === link.externalResourceLinkId || (!!link.enaraActivityId && i.resourceId === link.enaraActivityId && i.tag === 'enara')),
  );
  if (found) return remember(context, link, safeUrl(found.id as string, 'bad_line_item_url'), scoreMaximum);

  const preset = getPreset(platform.vendor);
  const caps = preset ? resolveCapabilities(preset, { scopes: granted.length ? granted : WANTED_SCOPES }) : undefined;
  if (!caps?.lineItemCreate) throw new AgsFailure('line_item_create_not_allowed', false);
  const assignment = link.enaraActivityId ? await Assignment.findOne({ id: link.enaraActivityId, institutionId: context.institutionId }).select('title').lean() : null;
  const label = (assignment?.title || 'ENARA activity').slice(0, 120);
  const created = await agsFetch(platform, scopes, container, {
    method: 'POST',
    headers: { 'Content-Type': MEDIA.lineItem, Accept: MEDIA.lineItem },
    body: JSON.stringify({ scoreMaximum, label, resourceLinkId: link.externalResourceLinkId, ...(link.enaraActivityId ? { resourceId: link.enaraActivityId } : {}), tag: 'enara' }),
  });
  if (!created.ok) throw httpFailure('lineitem_create_', created);
  const item = (await created.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof item?.id !== 'string') throw new AgsFailure('lineitem_create_invalid_response', true);
  return remember(context, link, safeUrl(item.id, 'bad_line_item_url'), scoreMaximum, label);
}

// ---------------------------------------------------------------- score

export interface AgsScore {
  userId: string;
  scoreGiven?: number;
  scoreMaximum?: number;
  comment?: string;
  activityProgress: string;
  gradingProgress: string;
  timestamp: string;
}

export function scorePayload(job: GradeSyncJobView, externalUserId: string): AgsScore {
  return {
    userId: externalUserId,
    // AGS: scoreGiven needs scoreMaximum; a status-only push (PendingManual) sends neither.
    ...(typeof job.scoreGiven === 'number' ? { scoreGiven: job.scoreGiven, scoreMaximum: job.scoreMaximum } : {}),
    ...(job.comment ? { comment: job.comment } : {}),
    activityProgress: job.activityProgress,
    gradingProgress: job.gradingProgress,
    timestamp: job.timestamp.toISOString(),
  };
}

/** Sends one outbox job's score. Never throws for an LMS problem: returns a code. */
export async function pushScore(job: GradeSyncJobView): Promise<PushResult> {
  let lineItemRef: string | undefined;
  try {
    const [platform, context, link, lmsUser] = await Promise.all([
      LmsPlatform.findOne({ id: job.platformId, institutionId: job.institutionId }).lean(),
      LmsContext.findOne({ id: job.contextId, institutionId: job.institutionId }).lean(),
      job.resourceLinkId ? LmsResourceLink.findOne({ id: job.resourceLinkId, institutionId: job.institutionId }).lean() : null,
      LmsUser.findOne({ id: job.lmsUserId, platformId: job.platformId, institutionId: job.institutionId }).lean(),
    ]);
    if (!platform || platform.status !== 'active') return { ok: false, retryable: true, error: 'platform_not_active' };
    if (!context || !lmsUser) return { ok: false, retryable: false, error: 'not_eligible' };
    if (link?.lineItemGoneAt) return { ok: false, retryable: false, error: LINE_ITEM_GONE };
    lineItemRef = /^https?:\/\//.test(job.lineItemRef) ? job.lineItemRef : link ? await resolveLineItem(platform, context, link, job.scoreMaximum) : undefined;
    if (!lineItemRef) return { ok: false, retryable: false, error: 'no_line_item' };
    const res = await agsFetch(platform, tokenScopes(context.agsScopes), scoresUrl(safeUrl(lineItemRef, 'bad_line_item_url')), {
      method: 'POST',
      headers: { 'Content-Type': MEDIA.score },
      body: JSON.stringify(scorePayload(job, lmsUser.externalUserId)),
    });
    if (res.ok) return { ok: true, lineItemRef };
    // Phase 3 follow-up: 404/410 for the line item = the LMS activity (or its
    // gradebook column) may have been deleted. Flag the link (shown to teachers
    // and admins), make the job dead (lineitem_gone), and send nothing more for
    // it until the activity is launched again (domainService clears the flag).
    // Never "find or create again" here: for a deleted activity that would add
    // an orphan column to the gradebook.
    if (res.status === 404 || res.status === 410) {
      if (link) await LmsResourceLink.updateOne({ id: link.id }, { $set: { lineItemGoneAt: new Date(), lineItemGoneStatus: res.status } });
      return { ok: false, retryable: false, status: res.status, error: LINE_ITEM_GONE, lineItemRef };
    }
    const f = httpFailure('score_', res);
    return { ok: false, retryable: f.retryable, status: f.status, retryAfterSeconds: f.retryAfterSeconds, error: f.code, lineItemRef };
  } catch (error) {
    if (error instanceof AgsFailure) return { ok: false, retryable: error.retryable, status: error.status, retryAfterSeconds: error.retryAfterSeconds, error: error.code, lineItemRef };
    return { ok: false, retryable: true, error: 'internal_error', lineItemRef };
  }
}

// --------------------------------------------------------------- results
// Grade ledger (docs/lms/GRADE_LEDGER_NOTES.md): read what the LMS gradebook
// shows for one user, to notice a grade a teacher changed in the LMS.

/** {lineitem}/results, keeping the line item's query string (Moodle: ?type_id=). */
export function resultsUrl(lineItemUrl: string, userId?: string): string {
  const u = new URL(lineItemUrl);
  u.pathname = `${u.pathname.replace(/\/+$/, '')}/results`;
  if (userId) u.searchParams.set('user_id', userId);
  return u.toString();
}

export interface LmsResultValue {
  /** null: the LMS has no score for the user (no result, or a result without resultScore). */
  resultScore: number | null;
  /** AGS: absent means 1. */
  resultMaximum: number;
}

export type ReadResult = { ok: true; result: LmsResultValue | null } | { ok: false; error: string; retryable: boolean; status?: number };

/**
 * GET {lineitem}/results?user_id=<sub> (scope result.readonly, Accept
 * application/vnd.ims.lis.v2.resultcontainer+json) with the cached service
 * token. Never throws for an LMS problem: returns a short code.
 */
export async function readLmsResult(platform: ILmsPlatform, context: ILmsContext, lineItemUrl: string, externalUserId: string): Promise<ReadResult> {
  try {
    if (context.agsScopes?.length && !context.agsScopes.includes(AGS_SCOPE.resultReadOnly)) return { ok: false, error: 'no_result_scope', retryable: false };
    const url = resultsUrl(safeUrl(lineItemUrl, 'bad_line_item_url'), externalUserId);
    const res = await agsFetch(platform, tokenScopes(context.agsScopes), url, { method: 'GET', headers: { Accept: MEDIA.results } });
    if (!res.ok) {
      const f = httpFailure('results_', res);
      return { ok: false, error: f.code, retryable: f.retryable, status: f.status };
    }
    const body = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(body)) return { ok: false, error: 'results_invalid_response', retryable: true };
    const rows = body.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
    const mine = rows.find((r) => r.userId === externalUserId) ?? (rows.length === 1 && rows[0].userId === undefined ? rows[0] : undefined);
    if (!mine) return { ok: true, result: null };
    const score = typeof mine.resultScore === 'number' && Number.isFinite(mine.resultScore) ? mine.resultScore : null;
    const max = typeof mine.resultMaximum === 'number' && Number.isFinite(mine.resultMaximum) && mine.resultMaximum > 0 ? mine.resultMaximum : 1;
    return { ok: true, result: { resultScore: score, resultMaximum: max } };
  } catch (error) {
    if (error instanceof AgsFailure) return { ok: false, error: error.code, retryable: error.retryable, status: error.status };
    return { ok: false, error: 'internal_error', retryable: true };
  }
}

/** Tests only. */
export function setAgsTimeoutForTests(ms: number): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  callTimeoutMs = ms;
}

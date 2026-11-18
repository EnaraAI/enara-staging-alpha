import { NRPS_SCOPE, resolveCapabilities } from '../../core/capabilities';
import type { ILmsPlatform } from '../../models';
import { getPreset } from '../../presets';
import { AgsFailure, agsFetch, httpFailure, safeUrl } from './ags';

// LTI Advantage Names and Role Provisioning Services 2.0 (Phase 4): reads the
// members of one LMS course from the context memberships URL the launch gave
// (lms_contexts.nrpsUrl). Same service token flow as AGS (ags.ts: client
// credentials with our signed client assertion, cached encrypted in
// lms_access_tokens), with the scope contextmembership.readonly.
//
// Paging: the platform may split the list; each page names the next one in a
// `Link: <url>; rel="next"` header. Every page is followed, up to a bound
// (pages, members and time); a list cut short by the bound is reported as
// `truncated`, so the caller never treats missing members as removed.
// The next URL must be https on the same origin as the memberships URL (the
// service token is sent to it). Every call has the 8 s timeout of ags.ts.
// Errors are short codes only (token_http_401, memberships_http_403, timeout,
// network, ...): never a response body, which could carry personal data.

export const NRPS_MEDIA = 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';
const PAGE_SIZE = 100;

export interface NrpsMember {
  /** The LTI user id (the launch's `sub`): the only key used to match people. */
  userId: string;
  roles: string[];
  status: 'Active' | 'Inactive' | 'Deleted';
  name?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

export type NrpsResult =
  | { ok: true; members: NrpsMember[]; pages: number; truncated: boolean; truncatedBy?: 'pages' | 'members' | 'time' }
  | { ok: false; code: string; pages: number };

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);

function member(raw: unknown): NrpsMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const userId = str(m.user_id, 255);
  if (!userId) return null;
  const roles = Array.isArray(m.roles) ? m.roles.filter((r): r is string => typeof r === 'string' && r.length <= 200).slice(0, 30) : [];
  const status = m.status === 'Inactive' ? 'Inactive' : m.status === 'Deleted' ? 'Deleted' : 'Active';
  return {
    userId,
    roles,
    status,
    name: str(m.name, 200),
    givenName: str(m.given_name, 120),
    familyName: str(m.family_name, 120),
    email: str(m.email, 254),
  };
}

/** The `rel="next"` URL of a Link header, if any. */
export function nextLink(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/,(?=\s*<)/)) {
    const m = /^\s*<([^>]+)>\s*;(.*)$/.exec(part);
    if (!m) continue;
    for (const param of m[2].split(';')) {
      const [k, v] = param.split('=').map((x) => x?.trim());
      if (k?.toLowerCase() === 'rel' && v && v.replace(/"/g, '').toLowerCase().split(/\s+/).includes('next')) return m[1];
    }
  }
  return undefined;
}

/** Whether ENARA may call this platform's NRPS: the preset allows rosters and the platform's scopes (when it lists any) include NRPS. */
export function nrpsAllowed(platform: Pick<ILmsPlatform, 'vendor' | 'scopes'>): boolean {
  const preset = getPreset(platform.vendor);
  if (!preset) return false;
  const scopes = platform.scopes?.length ? platform.scopes : [NRPS_SCOPE];
  return resolveCapabilities(preset, { scopes }).roster;
}

function withParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  return u.toString();
}

export interface FetchMembersOptions {
  maxPages?: number;
  maxMembers?: number;
  /** Stop following pages after this long (ms). */
  budgetMs?: number;
  /** Ask the platform to list only this role (NRPS `role` filter; a platform may ignore it). */
  role?: string;
  /** Stop early once this returns true for a member (the list is then reported as truncated). */
  stopWhen?: (m: NrpsMember) => boolean;
}

/** Reads the course's members, following `next` pages within the bounds. Never throws for an LMS problem. */
export async function fetchMembers(platform: ILmsPlatform, membershipsUrl: string, opts: FetchMembersOptions = {}): Promise<NrpsResult> {
  const maxPages = opts.maxPages ?? 50;
  const maxMembers = opts.maxMembers ?? 5000;
  const deadline = Date.now() + (opts.budgetMs ?? 30_000);
  let pages = 0;
  try {
    const first = safeUrl(membershipsUrl, 'bad_memberships_url');
    const origin = new URL(first).origin;
    let next: string | undefined = withParams(first, { limit: String(PAGE_SIZE), ...(opts.role ? { role: opts.role } : {}) });
    const members = new Map<string, NrpsMember>();
    while (next) {
      if (pages >= maxPages) return { ok: true, members: [...members.values()], pages, truncated: true, truncatedBy: 'pages' };
      if (Date.now() > deadline) return { ok: true, members: [...members.values()], pages, truncated: true, truncatedBy: 'time' };
      const res = await agsFetch(platform, [NRPS_SCOPE], next, { method: 'GET', headers: { Accept: NRPS_MEDIA } });
      pages++;
      if (!res.ok) throw httpFailure('memberships_', res);
      const body = (await res.json().catch(() => null)) as { members?: unknown } | null;
      if (!body || !Array.isArray(body.members)) throw new AgsFailure('memberships_invalid_response', true);
      for (const raw of body.members) {
        const m = member(raw);
        if (!m) continue;
        members.set(m.userId, m);
        if (opts.stopWhen?.(m)) return { ok: true, members: [...members.values()], pages, truncated: true };
        if (members.size >= maxMembers) return { ok: true, members: [...members.values()], pages, truncated: true, truncatedBy: 'members' };
      }
      const link = nextLink(res.headers.get('link'));
      if (!link) break;
      let nextUrl: URL;
      try {
        nextUrl = new URL(link, next);
      } catch {
        throw new AgsFailure('memberships_bad_next_link', false);
      }
      // The service token goes only to the platform that issued the memberships URL.
      if (nextUrl.origin !== origin) throw new AgsFailure('memberships_next_other_origin', false);
      next = safeUrl(nextUrl.toString(), 'memberships_bad_next_link');
    }
    return { ok: true, members: [...members.values()], pages, truncated: false };
  } catch (error) {
    if (error instanceof AgsFailure) return { ok: false, code: error.code, pages };
    return { ok: false, code: 'internal_error', pages };
  }
}

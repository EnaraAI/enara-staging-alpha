import { createHmac, hkdfSync } from 'crypto';
import { getConfig } from '../../../config/env';
import { LmsSuppressedIdentity, type ILmsSuppressedIdentity } from '../models';
import { writeLmsAudit } from './audit';
import { kekId } from './crypto';

// PDPL suppression list (Priority 0). When a student is permanently deleted
// (services/studentErasure.ts), each LMS identity linked to their accounts is
// written here first. Then:
//   - roster sync (core/roster.ts) skips the member (counted `suppressed`):
//     no account, student, enrollment or seat is created;
//   - a launch is refused with identity_suppressed before anything is
//     provisioned (adapters/lti13/oidc.ts), and createEnaraAccount refuses too.
// Only an ENARA admin can lift a row (admin/routes.ts); a lifted row no longer
// blocks.
//
// Stored: institutionId, platformId and identityHash = HMAC-SHA256 of
// `${platformId}:${externalUserId}` under a key derived (HKDF) from LMS_KEK,
// as launchToken.ts derives its key. No name, email or raw LMS user id.
// Lookups also try LMS_KEK_PREVIOUS, so rows keep matching during a rotation.
// Rows are never re-hashed (the raw id is not kept), so a row made under a key
// that is no longer configured stops matching: an LMS_KEK rotation must keep
// the old key as LMS_KEK_PREVIOUS for as long as these rows must hold.

const INFO = 'enara-lms-identity-suppression-v1';
const SYSTEM_ACTOR = 'system:lms';

export class SuppressionKeyError extends Error {
  readonly code = 'suppression_key_missing';
  constructor() {
    super('LMS_KEK is not set: the LMS suppression list cannot be written');
    this.name = 'SuppressionKeyError';
  }
}

type HashKey = { keyId: string; key: Buffer };

/** The current key first, then LMS_KEK_PREVIOUS. Empty when LMS_KEK is not set (the LMS parts are off then). */
function hashKeys(): HashKey[] {
  const { kek, kekPrevious } = getConfig().lms;
  return [kek, kekPrevious]
    .filter((k): k is Buffer => !!k)
    .map((k) => ({ keyId: kekId(k), key: Buffer.from(hkdfSync('sha256', k, Buffer.alloc(0), INFO, 32)) }));
}

const hmac = (key: Buffer, platformId: string, externalUserId: string) =>
  createHmac('sha256', key).update(`${platformId}:${externalUserId}`, 'utf8').digest('hex');

/** Every hash this identity can be stored under (current key first). */
export function identityHashes(platformId: string, externalUserId: string): string[] {
  return hashKeys().map((k) => hmac(k.key, platformId, externalUserId));
}

const active = { liftedAt: { $exists: false } };

export interface IdentityToSuppress {
  institutionId: string;
  platformId: string;
  externalUserId: string;
}

/**
 * Puts each identity on the list (or re-activates a lifted row). Returns the
 * suppression row ids. Throws SuppressionKeyError when there is something to
 * write and LMS_KEK is not set, so the caller can stop before deleting.
 */
export async function suppressIdentities(identities: IdentityToSuppress[], actor: string | undefined, reason: ILmsSuppressedIdentity['reason'] = 'pdpl_erasure'): Promise<string[]> {
  if (!identities.length) return [];
  const keys = hashKeys();
  if (!keys.length) throw new SuppressionKeyError();
  const [current] = keys;
  const by = actor?.slice(0, 80) ?? SYSTEM_ACTOR;
  const out: string[] = [];
  for (const who of identities) {
    const hashes = keys.map((k) => hmac(k.key, who.platformId, who.externalUserId));
    const existing = await LmsSuppressedIdentity.findOne({ platformId: who.platformId, identityHash: { $in: hashes }, ...active }).select('id').lean();
    if (existing) {
      out.push(existing.id);
      continue;
    }
    const key = { platformId: who.platformId, identityHash: hashes[0] };
    const update = {
      $set: { institutionId: who.institutionId, keyId: current.keyId, reason, createdAt: new Date(), createdBy: by },
      $unset: { liftedAt: 1, liftedBy: 1 },
    };
    let row: ILmsSuppressedIdentity;
    try {
      row = (await LmsSuppressedIdentity.findOneAndUpdate(key, update, { upsert: true, new: true, setDefaultsOnInsert: true }).lean())!;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      row = (await LmsSuppressedIdentity.findOneAndUpdate(key, update, { new: true }).lean())!;
    }
    out.push(row.id);
    await writeLmsAudit({
      event: 'lms.identity_suppressed',
      outcome: 'ok',
      institutionId: who.institutionId,
      platformId: who.platformId,
      actor: by,
      code: reason,
      refIds: { suppressionId: row.id },
    });
  }
  return out;
}

/** The active suppression for one identity, or null. */
export async function findSuppression(platformId: string, externalUserId: string): Promise<Pick<ILmsSuppressedIdentity, 'id' | 'institutionId'> | null> {
  const hashes = identityHashes(platformId, externalUserId);
  if (!hashes.length) return null;
  return LmsSuppressedIdentity.findOne({ platformId, identityHash: { $in: hashes }, ...active }).select('id institutionId').lean();
}

/** Which of these LMS user ids (of one platform) are suppressed. */
export async function suppressedExternalIds(platformId: string, externalUserIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const keys = hashKeys();
  if (!keys.length || !externalUserIds.length) return out;
  if (!(await LmsSuppressedIdentity.exists({ platformId, ...active }))) return out;
  const byHash = new Map<string, string>();
  for (const ext of externalUserIds) for (const k of keys) byHash.set(hmac(k.key, platformId, ext), ext);
  const all = [...byHash.keys()];
  for (let i = 0; i < all.length; i += 2000) {
    const rows = await LmsSuppressedIdentity.find({ platformId, identityHash: { $in: all.slice(i, i + 2000) }, ...active }).select('identityHash').lean();
    for (const r of rows) out.add(byHash.get(r.identityHash)!);
  }
  return out;
}

export interface SuppressionView {
  id: string;
  institutionId: string;
  platformId: string;
  reason: string;
  createdAt: Date;
  createdBy: string | null;
  liftedAt: Date | null;
  liftedBy: string | null;
}

const view = (r: ILmsSuppressedIdentity): SuppressionView => ({
  id: r.id,
  institutionId: r.institutionId,
  platformId: r.platformId,
  reason: r.reason,
  createdAt: r.createdAt,
  createdBy: r.createdBy ?? null,
  liftedAt: r.liftedAt ?? null,
  liftedBy: r.liftedBy ?? null,
});

/** ENARA admins: counts per school and the rows (IDs only; never the hash). */
export async function listSuppressions(filter: { institutionId?: string; platformId?: string; includeLifted?: boolean }, limit = 500) {
  const match: Record<string, unknown> = {};
  if (filter.institutionId) match.institutionId = filter.institutionId;
  if (filter.platformId) match.platformId = filter.platformId;
  const agg = await LmsSuppressedIdentity.aggregate<{ _id: string; active: number; lifted: number }>([
    { $match: match },
    { $group: { _id: '$institutionId', active: { $sum: { $cond: [{ $ifNull: ['$liftedAt', false] }, 0, 1] } }, lifted: { $sum: { $cond: [{ $ifNull: ['$liftedAt', false] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const rows = await LmsSuppressedIdentity.find({ ...match, ...(filter.includeLifted ? {} : active) }).sort({ createdAt: -1 }).limit(limit).lean();
  return {
    schools: agg.map((a) => ({ institutionId: a._id, active: a.active, lifted: a.lifted })),
    suppressions: rows.map(view),
  };
}

export type LiftResult = { ok: true; suppression: SuppressionView } | { ok: false; reason: 'not_found' | 'already_lifted' };

/** ENARA admins: lifts one row (it no longer blocks a sync or a launch). Audited. */
export async function liftSuppression(id: string, actor: string): Promise<LiftResult> {
  const row = await LmsSuppressedIdentity.findOneAndUpdate({ id, ...active }, { $set: { liftedAt: new Date(), liftedBy: actor.slice(0, 80) } }, { new: true }).lean();
  if (!row) return { ok: false, reason: (await LmsSuppressedIdentity.exists({ id })) ? 'already_lifted' : 'not_found' };
  await writeLmsAudit({ event: 'lms.identity_suppression_lifted', outcome: 'ok', institutionId: row.institutionId, platformId: row.platformId, actor, code: row.reason, refIds: { suppressionId: row.id } });
  return { ok: true, suppression: view(row) };
}

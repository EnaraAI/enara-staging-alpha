import { AvatarSession, type IAvatarSession } from '../models/AvatarSession';
import { runWithCallContext } from '../utils/callContext';
import { logger, serializeError } from '../utils/logging';
import { recordAttempt } from './aiGateway';
import { settleAiBudget } from './aiBudget';

// Anam avatar time (4Level1 plan, P0c). One immutable usage_ledger row per
// call, keyed `avatar:<session id>`, appended once the end is known. The
// mutable lifecycle lives on AvatarSession, never in the ledger:
//   1. the first finalizer freezes the end (usageEndAt, usageEndBasis) with a
//      conditional update, so a close racing a sweep agrees on one end;
//   2. the ledger row is appended (idempotent: identical data each time);
//   3. usageFinalizedAt and retentionExpiresAt are set together. A crash
//      between 2 and 3 is retried by the sweep and adds nothing; a failed
//      append leaves the call unexpired and due for the next sweep.
// Duration is our server's view, not Anam's billing record (Anam bills per
// second from session start to end): reconcile against Anam account usage.
// Duration runs from the session start (token issued) to the explicit end, or
// for an abandoned call to the last request seen, which is a lower bound
// (Anam may keep streaming without server requests). No price is assumed:
// Anam has no catalogue rate, so rows are 'unpriced', or 'usage_unknown' when
// nothing grounds a duration.

// A call with no request for this long, and never ended, is treated as abandoned.
export const AVATAR_STALE_MS = 60 * 60 * 1000;
// How long a metered call is kept after finalization: room for ledger
// retries, audit questions and reconciliation against the provider's usage
// export (which may list the call's providerSessionIds) before it is deleted.
export const AVATAR_RETENTION_AFTER_FINALIZE_MS = 7 * 24 * 60 * 60 * 1000;

async function setRetention(sessionId: string, finalizedAt: Date) {
  await AvatarSession.updateOne(
    { id: sessionId, retentionExpiresAt: null },
    { $set: { retentionExpiresAt: new Date(finalizedAt.getTime() + AVATAR_RETENTION_AFTER_FINALIZE_MS) } },
  );
}

function chooseEnd(s: IAvatarSession, now: Date): { at?: Date; basis: 'explicit_end' | 'last_activity' | 'none' } | null {
  if (s.endedAt) return { at: s.endedAt, basis: 'explicit_end' };
  const last = s.lastActivityAt;
  if ((last ?? s.createdAt).getTime() > now.getTime() - AVATAR_STALE_MS) return null; // still live
  return last && last > s.createdAt ? { at: last, basis: 'last_activity' } : { basis: 'none' };
}

// Meters one call if it has ended or gone stale. Safe to call repeatedly and
// concurrently. Returns true once the ledger row is stored.
export async function finalizeAvatarUsage(sessionId: string, now = new Date()): Promise<boolean> {
  let s = await AvatarSession.findOne({ id: sessionId });
  if (!s) return false;
  if (s.usageFinalizedAt) {
    if (!s.retentionExpiresAt) await setRetention(sessionId, s.usageFinalizedAt);
    return true;
  }
  if (!s.usageEndBasis) {
    const end = chooseEnd(s, now);
    if (!end) return false;
    await AvatarSession.updateOne({ id: sessionId, usageEndBasis: null }, { $set: { usageEndAt: end.at, usageEndBasis: end.basis } });
    s = await AvatarSession.findOne({ id: sessionId });
    if (!s) return false;
  }
  const seconds = s.usageEndAt ? Math.max(0, Math.round((s.usageEndAt.getTime() - s.createdAt.getTime()) / 1000)) : undefined;
  const grounded = seconds !== undefined && s.usageEndBasis !== 'none';
  // The session record is the trusted owner (copied from the authenticated
  // user at start), whoever finalizes it.
  const stored = await runWithCallContext({ institutionId: s.institutionId, userId: s.userId, studentId: s.studentId, role: s.role }, () =>
    recordAttempt({
      operationKey: `avatar:${s!.id}`,
      attempt: 1,
      meta: { feature: 'avatar_session', provider: 'anam', modelName: s!.avatarId || 'anam-default', institutionId: s!.institutionId, refs: { sessionId: s!.id } },
      modelName: s!.avatarId || 'anam-default',
      status: 'ok',
      units: grounded ? { avatarSeconds: seconds } : undefined,
      unitsBasis: grounded ? (s!.usageEndBasis === 'explicit_end' ? 'server_measured' : 'inferred_from_activity') : undefined,
    }),
  );
  if (!stored) return false;
  // The call's budget reservation (if any) is kept whole: Anam has no price.
  await settleAiBudget({ key: `avatar:${s.id}`, state: 'reserved' }, null);
  const finalizedAt = new Date();
  await AvatarSession.updateOne(
    { id: sessionId, usageFinalizedAt: null },
    { $set: { usageFinalizedAt: finalizedAt, retentionExpiresAt: new Date(finalizedAt.getTime() + AVATAR_RETENTION_AFTER_FINALIZE_MS) } },
  );
  // A concurrent finalizer won: keep its time, and make sure retention is set.
  const done = await AvatarSession.findOne({ id: sessionId }).select('usageFinalizedAt retentionExpiresAt').lean();
  if (done?.usageFinalizedAt && !done.retentionExpiresAt) await setRetention(sessionId, done.usageFinalizedAt);
  return true;
}

// Finalizes ended or abandoned calls not yet metered, including any whose
// ledger append failed earlier. Run from the daily cron and opportunistically.
export async function sweepAvatarUsage(opts: { limit?: number; userId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const stale = new Date(now.getTime() - AVATAR_STALE_MS);
  const filter: Record<string, unknown> = {
    $or: [
      // Finalized but retention not yet set (crash between the two writes).
      { usageFinalizedAt: { $ne: null }, retentionExpiresAt: null },
      {
        usageFinalizedAt: null,
        $or: [{ endedAt: { $ne: null } }, { usageEndBasis: { $ne: null } }, { lastActivityAt: { $lt: stale } }, { lastActivityAt: null, createdAt: { $lt: stale } }],
      },
    ],
  };
  if (opts.userId) filter.userId = opts.userId;
  const due = await AvatarSession.find(filter).select('id').limit(opts.limit ?? 200).lean();
  let finalized = 0;
  for (const { id } of due) {
    try {
      if (await finalizeAvatarUsage(id, now)) finalized += 1;
    } catch (error) {
      logger.error('avatar_usage_finalize_failed', { sessionId: id, error: serializeError(error) });
    }
  }
  return { due: due.length, finalized };
}

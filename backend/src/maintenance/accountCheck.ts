import { createHash } from 'node:crypto';
import { AuditEvent } from '../models/AuditEvent';
import { PasswordReset } from '../models/AccountToken';
import { SignInEvent } from '../models/SignInEvent';
import { Student } from '../models/Student';
import { User } from '../models/User';

// Read-only account check for lms-test (owner "go", 20 Nov 2026: why a test
// account says "incorrect password"). The login reply is the same for an
// unknown account, a disabled one and a wrong password; this says which, and
// what changed the account. Behind the maintenance token (routes.ts), lms-test
// only. Reads only; returns codes, roles, IDs and times, never a password,
// hash, token, IP address, name or email.
//
// The caller sends the SHA-256 of the lower-case email, so the address never
// has to sit in a workflow file, a log or a job summary.

export const sha256Email = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const HEX64 = /^[a-f0-9]{64}$/;
const SCAN_LIMIT = 20000; // lms-test holds a few hundred accounts; a bound so the scan can never run away

export type AccountCheck = {
  found: boolean;
  /** One line in plain words. */
  verdict: string;
  account?: { userId: string; role: string; status: string; institutionId: string | null; createdAt: string | null; updatedAt: string | null; tokenVersion: number; origin: string | null };
  student?: { studentId: string; archivedAt: string | null; deleted: boolean };
  passwordResets30d: { requestedAt: string; usedAt: string | null }[];
  auditEvents: { at: string; action: string; actorRole: string | null }[];
  signIns: { at: string; result: string }[];
};

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : null);

export async function accountCheck(emailSha256: string, now = new Date()): Promise<AccountCheck> {
  const want = String(emailSha256 ?? '').trim().toLowerCase();
  if (!HEX64.test(want)) throw Object.assign(new Error('emailSha256 must be 64 hex characters'), { status: 400 });

  // Find the address by its hash (no index on a hash, so a bounded scan of emails only).
  let email: string | undefined;
  for await (const u of User.find({}).select('email').lean().limit(SCAN_LIMIT).cursor()) {
    if (typeof u.email === 'string' && sha256Email(u.email) === want) { email = u.email; break; }
  }
  // Sign-in history keeps the typed address even when no account matches it.
  let signInEmail = email;
  if (!signInEmail) {
    const seen = await SignInEvent.distinct('email', { email: { $type: 'string' } });
    signInEmail = (seen as string[]).find((e) => sha256Email(e) === want);
  }
  const signIns = signInEmail
    ? (await SignInEvent.find({ email: signInEmail }).sort({ at: -1 }).limit(10).select('at result').lean()).map((r) => ({ at: iso(r.at) ?? '', result: String(r.result) }))
    : [];

  if (!email) {
    return {
      found: false,
      verdict: signIns.length
        ? 'No account with this email exists in the lms-test database, but sign-ins were tried with it (unknown_account). It was never created here, or it was deleted.'
        : 'No account with this email exists in the lms-test database, and no sign-in with it is recorded in the kept history.',
      passwordResets30d: [], auditEvents: [], signIns,
    };
  }

  const u = await User.findOne({ email }).select('role status institutionId studentId createdAt updatedAt tokenVersion origin').lean();
  if (!u) return { found: false, verdict: 'The account disappeared while checking; run the check again.', passwordResets30d: [], auditEvents: [], signIns };
  const userId = String(u._id);
  const st = u.studentId ? await Student.findOne({ id: u.studentId }).select('id archivedAt').lean() : null;
  const since = new Date(now.getTime() - 30 * 86400_000);
  const resets = (await PasswordReset.find({ userId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(10).select('createdAt usedAt').lean())
    .map((r) => ({ requestedAt: iso((r as { createdAt?: Date }).createdAt) ?? '', usedAt: iso((r as { usedAt?: Date | null }).usedAt) }));
  const ids = [userId, ...(u.studentId ? [u.studentId] : [])];
  const audits = (await AuditEvent.find({ $or: [{ targetId: { $in: ids } }, { 'detail.fromUserId': userId }] }).sort({ at: -1 }).limit(10).select('at action actorRole').lean())
    .map((a) => ({ at: iso(a.at) ?? '', action: String(a.action), actorRole: a.actorRole ?? null }));

  const last = signIns[0]?.result;
  const usedReset = resets.find((r) => r.usedAt);
  const verdict =
    u.status !== 'active'
      ? `The account exists but is disabled${st?.archivedAt ? ' because the student was archived' : audits.some((a) => a.action === 'parent_accounts_merged') ? ' because it was merged into another parent account' : ''}. Sign-in is refused with the same "incorrect" message.`
      : usedReset
        ? `The account is active. Its password was changed through a reset link on ${usedReset.usedAt}; the old password no longer works.`
        : last === 'wrong_password'
          ? 'The account is active and the last sign-in failed on the password itself (wrong_password). Nothing in the record changed the password in the last 30 days.'
          : last === 'success'
            ? 'The account is active and the last recorded sign-in succeeded.'
            : 'The account is active. No failed sign-in for it is recorded in the kept history.';

  return {
    found: true,
    verdict,
    account: { userId, role: String(u.role), status: String(u.status), institutionId: u.institutionId ?? null, createdAt: iso(u.createdAt), updatedAt: iso((u as { updatedAt?: Date }).updatedAt), tokenVersion: Number(u.tokenVersion ?? 0), origin: u.origin ?? null },
    ...(u.studentId ? { student: { studentId: u.studentId, archivedAt: iso(st?.archivedAt), deleted: !st } } : {}),
    passwordResets30d: resets,
    auditEvents: audits,
    signIns,
  };
}

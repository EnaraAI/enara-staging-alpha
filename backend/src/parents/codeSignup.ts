import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { ParentLinkCode } from '../models/ParentLinkCode';
import { ParentLearnerLink } from '../models/ParentLearnerLink';
import { ParentProfile } from '../models/ParentProfile';
import { User } from '../models/User';
import { recordAudit } from '../services/auditTrail';
import { INVALID_CODE_MESSAGE, confirmCode, hashCode, normalizeCode, previewFor } from './codes';
import { createDeviceSession } from './deviceSession';
import { endReasonFor } from './linkLifecycle';
import { parentAccessOf, schoolAccessOffError } from './schoolAccess';
import { Student } from '../models/Student';

// Parents P1, owner decision a) (18 Nov 2026): "Code only". A parent types the
// link code from the school and gets straight in: no sign-up, no password, no
// Google step. A parent account is created without an email (role 'parent',
// a reserved placeholder address that can never be emailed or signed in with,
// and a random password nobody knows), the code is redeemed for it, and this
// device remembers the session (deviceSession.ts).
//
// Abuse: these routes are public, so the per-IP limiter in app.ts applies
// (the per-account lockout in codes.ts needs an account). Codes are
// 31^8 ≈ 8.5e11; a wrong code says only "Code not valid or expired".
// Existing parent accounts (password or Google) keep working as they are (g);
// a signed-in parent adds a child with /api/parents/link/* ("Add another child").
export const CODE_ONLY_EMAIL_DOMAIN = 'code.parents.enara.invalid';
export const isCodeOnlyEmail = (email: string | undefined) => !!email && email.toLowerCase().endsWith(`@${CODE_ONLY_EMAIL_DOMAIN}`);

async function usableCode(input: unknown) {
  const normalized = normalizeCode(input);
  const code = normalized ? await ParentLinkCode.findOne({ codeHash: hashCode(normalized) }).lean() : null;
  if (!code || code.status !== 'active' || code.expiresAt <= new Date()) throw new AppError(INVALID_CODE_MESSAGE, 400, 'INVALID_CODE');
  const student = await Student.findOne({ id: code.studentId }).select('id institutionId archivedAt').lean();
  if (endReasonFor({ institutionId: code.institutionId }, student)) throw new AppError(INVALID_CODE_MESSAGE, 400, 'INVALID_CODE');
  if ((await parentAccessOf(code.institutionId)) === 'off') throw schoolAccessOffError();
  return code;
}

/** Public: the learner's first name + last initial and the school, before the parent confirms. */
export async function previewStartCode(input: unknown) {
  return previewFor(await usableCode(input));
}

/** Public: makes a code-only parent account, redeems the code for it, and remembers this device. */
export async function startWithCode(input: unknown, opts: { language?: unknown } = {}) {
  await usableCode(input);
  const language = opts.language === 'ar' ? 'ar' : 'en';
  const user = await User.create({
    email: `p-${randomUUID()}@${CODE_ONLY_EMAIL_DOMAIN}`,
    password: await bcrypt.hash(randomBytes(32).toString('hex'), getConfig().bcryptRounds),
    role: 'parent',
    name: language === 'ar' ? 'ولي الأمر' : 'Parent',
  });
  const userId = String(user._id);
  try {
    await ParentProfile.create({ userId, language, signIn: 'code' });
    const link = await confirmCode({ id: userId, role: 'parent' }, input);
    await recordAudit('parent_registered', { id: userId, role: 'parent' }, { type: 'user', id: userId }, { method: 'code', linkId: link.linkId });
    const device = await createDeviceSession(user);
    return { user, link, device };
  } catch (e) {
    // The code was taken in the meantime (single use): leave no empty account behind.
    await ParentLearnerLink.deleteMany({ parentUserId: userId });
    await ParentProfile.deleteOne({ userId });
    await User.deleteOne({ _id: user._id });
    throw e;
  }
}

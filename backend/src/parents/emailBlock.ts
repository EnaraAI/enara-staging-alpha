import { getConfig } from '../config/env';
import { isStagingMode } from '../config/stagingGuard';
import { AppError } from '../middleware/errorHandler';

// Owner rule (lms-test): on a staging deployment (ENARA_STAGING=true) the two
// parent email buttons, "Send code by email" (school admin, student profile)
// and "Share this week -> Email" (parent portal), are BLOCKED: the API answers
// 409 PARENT_EMAIL_BLOCKED_STAGING and the UI disables them with this note.
// Parents P4 brings them back through the safe path (email/testInbox.ts).
// Every other email path stays on the test inbox redirect. Not staging: unchanged.

export const PARENT_EMAIL_BLOCKED_CODE = 'PARENT_EMAIL_BLOCKED_STAGING';
export const PARENT_EMAIL_BLOCKED_MESSAGE = {
  en: 'Parent emails are switched on in a later step.',
  ar: 'سيتم تفعيل رسائل البريد الإلكتروني لأولياء الأمور في خطوة لاحقة.',
} as const;

export function parentEmailBlocked(): boolean {
  let staging = false;
  try {
    staging = getConfig().stagingMode === true;
  } catch {
    staging = false;
  }
  return staging || isStagingMode(process.env);
}

/** What the UI needs to disable a parent email button (and say why). */
export function parentEmailState(): { blocked: boolean; code?: string; message?: { en: string; ar: string } } {
  return parentEmailBlocked() ? { blocked: true, code: PARENT_EMAIL_BLOCKED_CODE, message: { ...PARENT_EMAIL_BLOCKED_MESSAGE } } : { blocked: false };
}

/** 409 PARENT_EMAIL_BLOCKED_STAGING on staging (before anything is created or sent). */
export function assertParentEmailAllowed(): void {
  if (parentEmailBlocked()) throw new AppError(PARENT_EMAIL_BLOCKED_MESSAGE.en, 409, PARENT_EMAIL_BLOCKED_CODE);
}

/** The 409 answer, with the note in English and Arabic (the parent portal is bilingual). */
export function parentEmailBlockedBody(requestId?: string) {
  return {
    error: { code: PARENT_EMAIL_BLOCKED_CODE, message: PARENT_EMAIL_BLOCKED_MESSAGE.en, messages: { ...PARENT_EMAIL_BLOCKED_MESSAGE }, requestId },
    message: PARENT_EMAIL_BLOCKED_MESSAGE.en,
  };
}

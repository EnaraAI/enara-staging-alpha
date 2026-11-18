import { LMS_TEMPLATES_BUNDLE, type LmsTemplateAlias } from './lms/lmsTemplatesBundle';
import { renderCodeTemplate, sendCodeTemplate } from './sendBundledTemplate';
import type { SendTemplateResult } from './sendTemplate';

// LMS emails (lms-*-en / lms-*-ar, owner decision D1: one template per
// language). The HTML lives in ./lms (bundled into lmsTemplatesBundle.ts), not
// in ./templates: these are not Resend-hosted templates and are never pushed or
// published there. Rendered the same way as sendTemplate (Resend-style
// placeholders, inline logos; see sendBundledTemplate.ts). Callers (LMS code,
// e.g. integrations/lms/core/onboarding.ts) add the LMS gates
// (LMS_EMAILS_ENABLED, REMINDERS_ENABLED, RESEND_API_KEY) and never pass a
// token, a link code or personal data other than the recipient's own name.

export function renderLmsTemplate(alias: LmsTemplateAlias, values: Record<string, string>): { subject: string; html: string } {
  return renderCodeTemplate(LMS_TEMPLATES_BUNDLE[alias], values);
}

export async function sendLmsTemplate(alias: LmsTemplateAlias, to: string, variables: Record<string, string>): Promise<SendTemplateResult> {
  return sendCodeTemplate('lms', LMS_TEMPLATES_BUNDLE, alias, to, variables);
}

import { PARENT_TEMPLATES_BUNDLE, type ParentTemplateAlias } from './parents/parentTemplatesBundle';
import { renderCodeTemplate, sendCodeTemplate } from './sendBundledTemplate';
import type { SendTemplateResult } from './sendTemplate';

// Parent emails (parent-*-en / parent-*-ar, one template per language). The
// HTML lives in ./parents (bundled into parentTemplatesBundle.ts), not in
// ./templates: these are not Resend-hosted templates, not in TEMPLATE_REGISTRY,
// and are never pushed or published there. Rendered and checked the same way
// as sendLmsTemplate (see sendBundledTemplate.ts); a link carrying the parent
// link code is refused (code_in_url: the code is shown in the body only, D15).
// No caller is wired yet.

export function renderParentTemplate(alias: ParentTemplateAlias, values: Record<string, string>): { subject: string; html: string } {
  return renderCodeTemplate(PARENT_TEMPLATES_BUNDLE[alias], values);
}

export async function sendParentTemplate(alias: ParentTemplateAlias, to: string, variables: Record<string, string>): Promise<SendTemplateResult> {
  return sendCodeTemplate('parent', PARENT_TEMPLATES_BUNDLE, alias, to, variables);
}

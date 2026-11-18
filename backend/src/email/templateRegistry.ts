/**
 * Single source of truth for ENARA transactional email templates hosted in Resend.
 * Used by sendTemplate.ts and by scripts/email/{pull,push}-templates.ts.
 */
export const EMAIL_SENDER = 'The Enara Team <noreply@test.enara.app>' as const;
export const EMAIL_LOGO_URL = 'https://assets.enara.app/email/enara-logo.png' as const;

export const TEMPLATE_REGISTRY = {
  'enara-welcome': {
    id: '4f7c1ade-5991-4ebe-a300-aa5a5b4db313',
    variables: ['NAME', 'ACTION_URL'],
  },
  'enara-verify-email': {
    id: 'ef72353a-9930-4670-b68a-42c30986e8ad',
    variables: ['NAME', 'ACTION_URL', 'EXPIRES_IN'],
  },
  'enara-password-reset': {
    id: '15397fc6-acaa-453d-a103-b80d9e0f6394',
    variables: ['NAME', 'ACTION_URL', 'EXPIRES_IN'],
  },
  'enara-parent-consent': {
    id: '57ebb3c9-2cb5-4ab5-aea6-1c4baba3952b',
    // LINK_CODE: the parent link code, shown in the body only (never in a URL, D15).
    variables: ['NAME', 'CHILD_NAME', 'LINK_CODE', 'ACTION_URL', 'EXPIRES_IN'],
  },
  'enara-lesson-reminder': {
    id: 'f6972409-d9e9-4bec-9c99-c6c41b573221',
    variables: ['NAME', 'LESSON_TITLE', 'ACTION_URL'],
  },
  'enara-weekly-progress': {
    id: '879509b9-d69b-4c01-8b7f-26d01be2e15e',
    variables: ['NAME', 'CHILD_NAME', 'LESSONS_DONE', 'OUTCOMES_MASTERED', 'TIME_SPENT', 'PRACTICE_TIP', 'ACTION_URL'],
  },
  'enara-assessment-results': {
    id: '732d6b7a-77cb-4c51-be8f-22278fb4e70f',
    variables: ['NAME', 'CHILD_NAME', 'TEST_NAME', 'SCORE', 'LEVEL', 'SUMMARY', 'ACTION_URL'],
  },
  'enara-class-invitation': {
    id: '4fc89699-5d97-40e1-8c9f-906c2846f97d',
    variables: ['NAME', 'TEACHER_NAME', 'CLASS_NAME', 'ACTION_URL', 'EXPIRES_IN'],
  },
} as const;

export type TemplateAlias = keyof typeof TEMPLATE_REGISTRY;
export type TemplateVariableName<A extends TemplateAlias> = (typeof TEMPLATE_REGISTRY)[A]['variables'][number];
/** Exactly the variables a template needs: all required, no extras. */
export type TemplateVariables<A extends TemplateAlias> = { [K in TemplateVariableName<A>]: string | number };

export const TEMPLATE_ALIASES = Object.keys(TEMPLATE_REGISTRY) as TemplateAlias[];

export function isTemplateAlias(value: string): value is TemplateAlias {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_REGISTRY, value);
}

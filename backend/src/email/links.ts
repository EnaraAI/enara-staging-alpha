import { getConfig } from '../config/env';
import type { TemplateAlias, TemplateVariables } from './templateRegistry';

/**
 * Builds the ACTION_URL of each template from the configured app URL
 * (getConfig().appUrl, i.e. APP_URL). Callers pass link params, never the URL.
 *
 * enara-verify-email and enara-parent-consent have no page in the app yet, so
 * their ACTION_URL stays caller-supplied (see README).
 */
export const TEMPLATE_LINKS = {
  'enara-welcome': { path: '/', params: [] },
  'enara-weekly-progress': { path: '/', params: [] },
  'enara-password-reset': { path: '/reset-password', params: ['token'] },
  'enara-class-invitation': { path: '/accept-invitation', params: ['token'] },
  'enara-assessment-results': { path: '/', params: ['assessmentId'], query: { assessmentId: 'assessment' } },
  'enara-lesson-reminder': { path: '/', params: ['courseId'], query: { courseId: 'course' } },
} as const satisfies Partial<Record<TemplateAlias, { path: string; params: readonly string[]; query?: Record<string, string> }>>;

export type LinkedAlias = keyof typeof TEMPLATE_LINKS;
export type LinkParams<A extends LinkedAlias> = { [K in (typeof TEMPLATE_LINKS)[A]['params'][number]]: string };

/** What a caller passes to sendTemplate for alias A. */
export type TemplateSendVariables<A extends TemplateAlias> = A extends LinkedAlias
  ? Omit<TemplateVariables<A>, 'ACTION_URL'> & LinkParams<A>
  : TemplateVariables<A>;

export function isLinkedAlias(alias: string): alias is LinkedAlias {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_LINKS, alias);
}

export class MissingAppUrlError extends Error {
  readonly code = 'missing_app_url';
  constructor() {
    super('APP_URL (appUrl) is not configured');
  }
}

export function getAppUrl(): string {
  return ((getConfig() as { appUrl?: string }).appUrl || '').trim().replace(/\/+$/, '');
}

/** Build the ACTION_URL for a linked alias. Throws MissingAppUrlError without an app URL. */
export function buildActionUrl<A extends LinkedAlias>(alias: A, params: LinkParams<A>, appUrl: string = getAppUrl()): string {
  const base = (appUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new MissingAppUrlError();
  const spec = TEMPLATE_LINKS[alias] as { path: string; params: readonly string[]; query?: Record<string, string> };
  const query = spec.params
    .map((p) => `${encodeURIComponent(spec.query?.[p] ?? p)}=${encodeURIComponent(String((params as Record<string, string>)[p]))}`)
    .join('&');
  return `${base}${spec.path}${query ? `?${query}` : ''}`;
}

import type { LmsProvider, LmsProviderKind } from './core/types';

// The one place providers are registered (docs/lms/IMPLEMENTATION_PLAN.md §2.1).
// Phase 0 has no adapters: 'lti13' arrives in Phase 1, 'google_classroom' in
// Phase 5. No stub adapters are registered for platforms we do not ship.
const providers = new Map<string, LmsProvider>();

export function registerProvider(provider: LmsProvider): void {
  if (providers.has(provider.kind)) throw new Error(`LMS provider registered twice: ${provider.kind}`);
  providers.set(provider.kind, provider);
}

export function getProvider(kind: LmsProviderKind): LmsProvider | undefined {
  return providers.get(kind);
}

export function listProviders(): LmsProvider[] {
  return [...providers.values()];
}

/** Tests only: start each suite from an empty registry. */
export function resetProvidersForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  providers.clear();
}

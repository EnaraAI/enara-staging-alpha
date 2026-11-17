import { lti13Provider } from './adapters/lti13';
import type { LmsProvider, LmsProviderKind } from './core/types';

// The one place providers are registered (docs/lms/IMPLEMENTATION_PLAN.md §2.1).
// 'lti13' since Phase 1a; 'google_classroom' arrives in Phase 5. No stub
// adapters are registered for platforms we do not ship.
const BUILT_IN: readonly LmsProvider[] = [lti13Provider];
const providers = new Map<string, LmsProvider>(BUILT_IN.map((p) => [p.kind, p]));

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

/** Tests only: back to the built-in providers. */
export function resetProvidersForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test only');
  providers.clear();
  for (const p of BUILT_IN) providers.set(p.kind, p);
}

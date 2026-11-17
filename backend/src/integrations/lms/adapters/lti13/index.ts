import { resolveCapabilities } from '../../core/capabilities';
import { NO_CAPABILITIES, type LaunchResult, type LmsProvider } from '../../core/types';
import { getPreset } from '../../presets';
import { pushScore } from './ags';
import { oidcLaunch } from './oidc';

// The LTI 1.3 adapter: OIDC login and resource-link launch (Phase 1a), AGS
// score push (Phase 3). Deep linking (Phase 2) and NRPS (Phase 4) add methods here.
export const lti13Provider: LmsProvider = {
  kind: 'lti13',
  capabilities(platform) {
    const preset = getPreset(platform.vendor);
    return preset ? resolveCapabilities(preset, { scopes: platform.scopes }) : { ...NO_CAPABILITIES };
  },
  async handleLaunch(input: unknown): Promise<LaunchResult> {
    const { body, cookieHeader } = (input ?? {}) as { body?: Record<string, unknown>; cookieHeader?: string };
    return (await oidcLaunch(body ?? {}, cookieHeader)).result;
  },
  pushScore,
};

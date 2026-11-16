import type { LmsCapabilities, LmsEnaraRole, LmsProviderKind } from '../core/types';

// A vendor preset is data: what to expect from one LMS product. Adding a vendor
// is a new preset file plus one line in presets/index.ts (docs/lms/ADDING_A_NEW_LMS.md).
export interface LmsVendorPreset {
  /** Stored in lms_platforms.vendor. Lowercase, a-z0-9 and dashes. */
  id: string;
  label: string;
  provider: LmsProviderKind;
  registration: Array<'dynamic' | 'manual'>;
  /** Capability ceiling for this vendor; a deployment can only narrow it (by its claims and scopes). */
  capabilities: LmsCapabilities;
  /** Role-URI suffix overrides, applied after the standard map (Spec §5.4). */
  roleOverrides?: Record<string, LmsEnaraRole>;
  /** Free-form notes for admins and the registration page. No logic branches on them. */
  notes?: string;
}

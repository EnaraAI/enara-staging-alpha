import { genericPreset } from './generic';
import { moodlePreset } from './moodle';
import type { LmsVendorPreset } from './types';

// The one list of vendor presets. Release 1 ships 'moodle' and 'generic' only.
const PRESETS: readonly LmsVendorPreset[] = [moodlePreset, genericPreset];

const VENDOR_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const byId = new Map<string, LmsVendorPreset>();
for (const p of PRESETS) {
  if (!VENDOR_ID.test(p.id)) throw new Error(`LMS preset id is invalid: ${p.id}`);
  if (byId.has(p.id)) throw new Error(`LMS preset registered twice: ${p.id}`);
  byId.set(p.id, Object.freeze({ ...p, capabilities: Object.freeze({ ...p.capabilities }) }));
}

export function getPreset(id: string): LmsVendorPreset | undefined {
  return byId.get(id);
}

export function listPresets(): LmsVendorPreset[] {
  return [...byId.values()];
}

export function isKnownVendor(id: unknown): id is string {
  return typeof id === 'string' && byId.has(id);
}

export type { LmsVendorPreset } from './types';

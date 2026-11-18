import { LmsContext, LmsDeepLinkSession, LmsResourceLink } from '../models';
import { BINDING_PARAM } from './binding';

// Phase 2 activity picker: the registry of item types. The picker screen,
// its API and the Deep Linking response know nothing about assessments or
// assignments; each item type is a plug-in that lists the school's items and
// re-checks one item on submit. Adding a new type (lessons, practice sets,
// tutor sessions, dashboards) = one new file that implements PickerItemType
// and calls registerPickerType(), plus, on the launch side, reading the
// item's custom parameter (see docs/lms/PHASE_2_NOTES.md, "Adding an item type").

export interface PickerItem {
  type: string;
  id: string;
  title: string;
  description?: string;
  subject?: string;
  /** e.g. quiz, unit_test, practice, speaking */
  kind?: string;
  difficulty?: string;
  /** Only for items of a language course: CEFR level and skills (the picker shows these filters only then). */
  language?: { level?: string; skills?: string[] };
  questions?: number;
  points?: number;
  /** Gets a grade column in the LMS (an AGS line item). */
  graded: boolean;
  /** Needs the microphone or camera: always opens in a new window (owner decision P3). */
  needsMedia: boolean;
  /** LTI custom parameters the launch reads to open this item. */
  custom: Record<string, string>;
  /** Extra line shown in the list (e.g. the class and due date of an assignment). */
  meta?: string;
}

export interface PickerItemType {
  type: string;
  label: { en: string; ar: string };
  /** The school's items of this type (published / usable only). */
  list(institutionId: string, limit: number): Promise<PickerItem[]>;
  /** Re-checks one item at submit time (null: not found, other school, or not usable). */
  resolve(institutionId: string, id: string): Promise<PickerItem | null>;
}

const REGISTRY = new Map<string, PickerItemType>();

export function registerPickerType(t: PickerItemType): void {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(t.type)) throw new Error(`bad picker type id: ${t.type}`);
  REGISTRY.set(t.type, t);
}

export function pickerTypes(): PickerItemType[] {
  return [...REGISTRY.values()];
}

export function pickerType(type: string): PickerItemType | undefined {
  return REGISTRY.get(type);
}

export const itemKey = (type: string, id: string) => `${type}:${id}`;

/** Items already added in this LMS course: earlier picks, plus activities launched with a binding. */
export async function alreadyAddedKeys(platformId: string, institutionId: string, externalContextId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const used = await LmsDeepLinkSession.find({ platformId, institutionId, externalContextId, usedAt: { $exists: true } }).select('picked').lean();
  for (const s of used) for (const p of s.picked ?? []) keys.add(itemKey(p.type, p.id));
  const context = await LmsContext.findOne({ platformId, institutionId, externalContextId }).select('id').lean();
  if (context) {
    const links = await LmsResourceLink.find({ contextId: context.id, institutionId }).select('customParams').lean();
    for (const l of links) {
      const c = (l.customParams ?? {}) as Record<string, string>;
      for (const [type, param] of Object.entries(BINDING_PARAM)) if (c[param]) keys.add(itemKey(type, c[param]));
    }
  }
  return keys;
}

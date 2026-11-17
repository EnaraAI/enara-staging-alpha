import { getConfig } from '../config/env';
import { EnrollmentShadowStat, type ShadowFeature } from '../models/EnrollmentShadowStat';
import { logger } from '../utils/logging';

// Multi-class step 4: shadow reads (docs/multi-class/STEP_4_NOTES.md).
// Where the app answers "who is in this class" or "which classes is this
// student in" from the old fields, it can also compute the answer from
// class_enrollments and compare. The OLD answer is always the one returned.
//   - does nothing unless ENROLLMENT_SHADOW is on;
//   - checks a share of requests (ENROLLMENT_SHADOW_SAMPLE_RATE, default all);
//   - never throws and never changes the response: any error is counted;
//   - a mismatch is logged with IDs only (no names, no emails) and counted per
//     day and feature in enrollment_shadow_stats.

const MAX_LOGGED_IDS = 20;

export function shadowOn(): boolean {
  const c = getConfig().enrollment;
  return c.shadow && c.shadowSampleRate > 0 && (c.shadowSampleRate >= 1 || Math.random() < c.shadowSampleRate);
}

function day(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Clean checks are counted in memory and written in batches (every
// FLUSH_EVERY checks or FLUSH_MS), so a clean check adds only the enrollment
// read to the request. Mismatches and errors are written at once, together
// with any pending clean checks. A batch lost when an instance stops only
// under-counts clean checks; it never hides a mismatch.
const FLUSH_EVERY = 50;
const FLUSH_MS = 60_000;
const pending = new Map<string, number>(); // `${day}|${feature}` -> clean checks
let pendingTotal = 0;
let lastFlush = Date.now();

async function write(dayKey: string, feature: ShadowFeature, inc: Record<string, number>): Promise<void> {
  try {
    await EnrollmentShadowStat.updateOne({ day: dayKey, feature }, { $inc: inc }, { upsert: true });
  } catch {
    // Counting must never affect the request.
  }
}

/** Writes pending clean-check counts. Exported for tests and graceful shutdown. */
export async function flushShadowCounts(): Promise<void> {
  const entries = [...pending.entries()];
  pending.clear();
  pendingTotal = 0;
  lastFlush = Date.now();
  for (const [k, n] of entries) {
    const [d, f] = k.split('|');
    await write(d, f as ShadowFeature, { checks: n });
  }
}

async function count(feature: ShadowFeature, field: 'mismatches' | 'errors' | null): Promise<void> {
  const key = `${day()}|${feature}`;
  if (field) {
    const clean = pending.get(key) ?? 0;
    pending.delete(key);
    pendingTotal -= clean;
    await write(day(), feature, { checks: clean + 1, [field]: 1 });
    return;
  }
  pending.set(key, (pending.get(key) ?? 0) + 1);
  pendingTotal++;
  if (pendingTotal >= FLUSH_EVERY || Date.now() - lastFlush >= FLUSH_MS) await flushShadowCounts();
}

export interface ShadowDiff {
  onlyOld: string[];
  onlyNew: string[];
}

export function diffIds(oldIds: Iterable<string>, newIds: Iterable<string>): ShadowDiff {
  const a = new Set(oldIds);
  const b = new Set(newIds);
  return { onlyOld: [...a].filter((x) => !b.has(x)).sort(), onlyNew: [...b].filter((x) => !a.has(x)).sort() };
}

/**
 * Compares the old answer with the enrollment answer for one subject (a class
 * or a student). Call only after the old answer is computed; the caller keeps
 * returning the old answer whatever happens here.
 */
export async function shadowCompare(
  feature: ShadowFeature,
  subject: { classId?: string; studentId?: string; institutionId?: string },
  oldIds: Iterable<string>,
  newIds: () => Promise<Iterable<string>>,
): Promise<void> {
  try {
    const d = diffIds(oldIds, await newIds());
    if (!d.onlyOld.length && !d.onlyNew.length) {
      await count(feature, null);
      return;
    }
    logger.warn('enrollment_shadow_mismatch', {
      feature,
      ...subject,
      onlyOldCount: d.onlyOld.length,
      onlyNewCount: d.onlyNew.length,
      onlyOld: d.onlyOld.slice(0, MAX_LOGGED_IDS),
      onlyNew: d.onlyNew.slice(0, MAX_LOGGED_IDS),
    });
    await count(feature, 'mismatches');
  } catch (error) {
    logger.warn('enrollment_shadow_error', { feature, ...subject, code: (error as { code?: string }).code ?? 'error' });
    await count(feature, 'errors');
  }
}

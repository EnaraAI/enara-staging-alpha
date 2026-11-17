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

async function count(feature: ShadowFeature, field: 'mismatches' | 'errors' | null): Promise<void> {
  try {
    await EnrollmentShadowStat.updateOne(
      { day: day(), feature },
      { $inc: { checks: 1, ...(field ? { [field]: 1 } : {}) } },
      { upsert: true },
    );
  } catch {
    // Counting must never affect the request.
  }
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

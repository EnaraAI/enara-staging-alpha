import { AppError } from '../../../middleware/errorHandler';
import { BROWSER_FAMILIES, LmsMicDaily, MIC_EVENTS, MIC_FEATURES, type BrowserFamily, type MicEvent, type MicFeature } from '../models';

// Mic telemetry (mic / new tab, item 6): daily counts per school of the mic
// check outcome and of "Open in new tab", by browser family, frame and
// feature. The request body is strict: only the four enumerated fields are
// accepted, so no name, user id or user-agent string can be stored.

export interface MicTelemetryEvent {
  event: MicEvent;
  browserFamily: BrowserFamily;
  inFrame: boolean;
  feature: MicFeature;
}

const ALLOWED_KEYS = new Set(['event', 'browserFamily', 'inFrame', 'feature']);
const invalid = (message: string) => new AppError(message, 400, 'VALIDATION_ERROR');

export function parseMicTelemetry(body: unknown): MicTelemetryEvent {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('body must be an object');
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) if (!ALLOWED_KEYS.has(key)) throw invalid('Only event, browserFamily, inFrame and feature are accepted');
  if (typeof b.event !== 'string' || !(MIC_EVENTS as readonly string[]).includes(b.event)) throw invalid('event is invalid');
  if (typeof b.browserFamily !== 'string' || !(BROWSER_FAMILIES as readonly string[]).includes(b.browserFamily)) throw invalid('browserFamily is invalid');
  if (typeof b.inFrame !== 'boolean') throw invalid('inFrame must be a boolean');
  const feature = b.feature === undefined ? 'none' : b.feature;
  if (typeof feature !== 'string' || !(MIC_FEATURES as readonly string[]).includes(feature)) throw invalid('feature is invalid');
  return { event: b.event as MicEvent, browserFamily: b.browserFamily as BrowserFamily, inFrame: b.inFrame, feature: feature as MicFeature };
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export async function recordMicTelemetry(institutionId: string, ev: MicTelemetryEvent, now = new Date()): Promise<void> {
  const day = utcDay(now);
  await LmsMicDaily.updateOne(
    { institutionId, day, event: ev.event, browserFamily: ev.browserFamily, inFrame: ev.inFrame, feature: ev.feature },
    { $inc: { count: 1 }, $setOnInsert: { dayStart: new Date(`${day}T00:00:00.000Z`) } },
    { upsert: true },
  );
}

export interface MicCountsView {
  since: string;
  days: number;
  schools: {
    institutionId: string;
    totals: Partial<Record<MicEvent, number>>;
    rows: { event: MicEvent; browserFamily: BrowserFamily; inFrame: boolean; feature: MicFeature; count: number }[];
  }[];
}

/** Counts per school over the last `days` UTC days (today included). */
export async function micCounts(opts: { institutionId?: string; days: number }, now = new Date()): Promise<MicCountsView> {
  const days = Math.max(1, Math.min(400, Math.floor(opts.days)));
  const since = utcDay(new Date(now.getTime() - (days - 1) * 86400_000));
  const match: Record<string, unknown> = { day: { $gte: since } };
  if (opts.institutionId) match.institutionId = opts.institutionId;
  const grouped = await LmsMicDaily.aggregate<{ _id: { institutionId: string; event: MicEvent; browserFamily: BrowserFamily; inFrame: boolean; feature: MicFeature }; count: number }>([
    { $match: match },
    { $group: { _id: { institutionId: '$institutionId', event: '$event', browserFamily: '$browserFamily', inFrame: '$inFrame', feature: '$feature' }, count: { $sum: '$count' } } },
    { $sort: { '_id.institutionId': 1, '_id.event': 1, '_id.browserFamily': 1, '_id.feature': 1, '_id.inFrame': 1 } },
  ]);
  const bySchool = new Map<string, MicCountsView['schools'][number]>();
  for (const g of grouped) {
    const school = bySchool.get(g._id.institutionId) ?? { institutionId: g._id.institutionId, totals: {}, rows: [] };
    school.totals[g._id.event] = (school.totals[g._id.event] ?? 0) + g.count;
    school.rows.push({ event: g._id.event, browserFamily: g._id.browserFamily, inFrame: g._id.inFrame, feature: g._id.feature, count: g.count });
    bySchool.set(g._id.institutionId, school);
  }
  return { since, days, schools: [...bySchool.values()] };
}

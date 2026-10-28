import { randomUUID } from 'crypto';
import { LearningEvent, type ILearningEvent } from '../models/LearningEvent';
import { LearningEvidence } from '../models/LearningEvidence';
import { MasteryHistory, StudentObjectiveMastery } from '../models/StudentObjectiveMastery';
import { logger, serializeError } from '../utils/logging';
import { EVIDENCE_POLICY_VERSION, evidenceFromEvent } from './evidencePolicy';
import { isFeatureEnabled } from './featureFlags';
import { estimateMastery } from './masteryModel';
import { detectMisconceptions } from './misconceptionRules';
import { updateTimeToUnderstand } from './timeToUnderstand';
import { updateRetention } from './retention';

const MAX_ATTEMPTS = 5;

// Recomputes one student's mastery of one objective from all its evidence and
// records a history row when the result changes. Deterministic for a fixed
// evidence set and model version.
export async function recomputeMastery(studentId: string, objectiveId: string, trigger: string, institutionId?: string) {
  const evidence = await LearningEvidence.find({ studentId, objectiveId })
    .select('id normalizedScore result reliabilityWeight assistanceLevel itemKey occurredAt invalidatedAt institutionId')
    .lean();
  const result = estimateMastery(evidence);
  const now = new Date();
  const previous = await StudentObjectiveMastery.findOne({ studentId, objectiveId }).lean();
  const school = institutionId ?? previous?.institutionId ?? evidence[0]?.institutionId;
  await StudentObjectiveMastery.updateOne(
    { studentId, objectiveId },
    { $set: { ...result, institutionId: school, lastMasteryUpdateAt: now } },
    { upsert: true },
  );
  const changed =
    !previous ||
    previous.masteryStatus !== result.masteryStatus ||
    previous.masteryEstimate !== result.masteryEstimate ||
    previous.evidenceStrength !== result.evidenceStrength ||
    previous.modelVersion !== result.modelVersion;
  if (changed) {
    await MasteryHistory.create({
      institutionId: school,
      studentId,
      objectiveId,
      masteryEstimate: result.masteryEstimate,
      evidenceStrength: result.evidenceStrength,
      masteryStatus: result.masteryStatus,
      previousStatus: previous?.masteryStatus,
      previousEstimate: previous?.masteryEstimate,
      evidenceCount: result.evidenceCount,
      trigger,
      modelVersion: result.modelVersion,
      at: now,
    });
  }
  if (await isFeatureEnabled(school, 'retention_intelligence_enabled')) {
    await updateRetention(studentId, objectiveId, school).catch((error) =>
      logger.warn('retention_update_failed', { studentId, objectiveId, error: serializeError(error) }),
    );
  }
  await updateTimeToUnderstand(studentId, objectiveId, result, school).catch((error) =>
    logger.warn('ttu_update_failed', { studentId, objectiveId, error: serializeError(error) }),
  );
  return result;
}

async function processEvent(event: ILearningEvent | Record<string, any>) {
  const touched: string[] = [];
  for (const objectiveId of event.objectiveIds || []) {
    const itemKey = evidenceFromEvent(event as ILearningEvent, 0)?.itemKey;
    const priorExposures = itemKey
      ? (await LearningEvidence.distinct('sourceEventId', {
          studentId: event.studentId,
          itemKey,
          occurredAt: { $lt: event.at },
        })).length
      : 0;
    const draft = evidenceFromEvent(event as ILearningEvent, priorExposures);
    if (!draft) continue;
    await LearningEvidence.updateOne(
      { sourceEventId: event.id, objectiveId },
      {
        $setOnInsert: {
          id: `ev-${randomUUID()}`,
          institutionId: event.institutionId,
          studentId: event.studentId,
          objectiveId,
          sourceEventId: event.id,
          ...draft,
          priorExposures,
          evidenceVersion: EVIDENCE_POLICY_VERSION,
          occurredAt: event.at,
          recordedAt: new Date(),
          history: [{ at: new Date(), action: 'created', note: EVIDENCE_POLICY_VERSION }],
        },
      },
      { upsert: true },
    );
    touched.push(objectiveId);
  }
  return touched;
}

const STUDENT_CONCURRENCY = 8;

// Runs fn over items with at most `size` running at a time.
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

// Turns pending evidence-eligible events into evidence and updates mastery.
// Safe to call repeatedly: evidence is keyed by (event, objective) and an
// event is marked done only after its evidence is written. Schools without
// mastery tracking keep their events pending until it is turned on.
export async function processPendingEvidence(params: { studentId?: string; institutionId?: string; limit?: number } = {}) {
  const filter: Record<string, unknown> = {
    'processing.evidence': { $in: ['pending', 'failed'] },
    'processing.attempts': { $lt: MAX_ATTEMPTS },
    supersededBy: { $exists: false },
  };
  if (params.studentId) filter.studentId = params.studentId;
  if (params.institutionId) filter.institutionId = params.institutionId;
  const events = await LearningEvent.find(filter).sort({ at: 1 }).limit(params.limit ?? 200).lean();
  const enabled = new Map<string, boolean>();
  const touched = new Map<string, { studentId: string; objectiveId: string; institutionId?: string; trigger: string }>();
  let processed = 0;
  let failed = 0;
  for (const event of events) {
    const school = event.institutionId || '';
    if (!enabled.has(school)) enabled.set(school, await isFeatureEnabled(event.institutionId, 'mastery_tracking_enabled'));
  }
  // Students are independent; each student's events stay in time order
  // (exposure counts depend on it). A few students run at once.
  const byStudentEvents = new Map<string, typeof events>();
  for (const event of events) {
    if (!enabled.get(event.institutionId || '')) continue;
    byStudentEvents.set(event.studentId, [...(byStudentEvents.get(event.studentId) ?? []), event]);
  }
  const processStudent = async (studentEvents: typeof events) => {
    for (const event of studentEvents) {
      try {
        for (const objectiveId of await processEvent(event)) {
          touched.set(`${event.studentId}|${objectiveId}`, {
            studentId: event.studentId,
            objectiveId,
            institutionId: event.institutionId,
            trigger: `evidence:${event.id}`,
          });
        }
        await LearningEvent.updateOne(
          { id: event.id },
          { $set: { 'processing.evidence': 'done', 'processing.processedAt': new Date() }, $inc: { 'processing.attempts': 1 } },
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        logger.warn('evidence_processing_failed', { eventId: event.id, error: serializeError(error) });
        await LearningEvent.updateOne(
          { id: event.id },
          {
            $set: { 'processing.evidence': 'failed', 'processing.lastError': String((error as Error).message).slice(0, 300) },
            $inc: { 'processing.attempts': 1 },
          },
        );
      }
    }
  };
  await inBatches([...byStudentEvents.values()], STUDENT_CONCURRENCY, processStudent);
  await inBatches([...touched.values()], STUDENT_CONCURRENCY, (t) => recomputeMastery(t.studentId, t.objectiveId, t.trigger, t.institutionId));
  // Misconception rules run per student on the objectives that changed.
  const byStudent = new Map<string, { institutionId?: string; objectiveIds: string[] }>();
  for (const t of touched.values()) {
    const entry = byStudent.get(t.studentId) ?? { institutionId: t.institutionId, objectiveIds: [] };
    entry.objectiveIds.push(t.objectiveId);
    byStudent.set(t.studentId, entry);
  }
  await inBatches([...byStudent], STUDENT_CONCURRENCY, ([studentId, entry]) =>
    detectMisconceptions(studentId, entry.objectiveIds, entry.institutionId).catch((error) =>
      logger.warn('misconception_detection_failed', { studentId, error: serializeError(error) }),
    ),
  );
  return { processed, failed, masteryUpdated: touched.size };
}

// Called right after a student's action. Never throws: mastery is a side
// effect and must not fail the action.
export async function processStudentEvidenceSafely(studentId: string) {
  try {
    return await processPendingEvidence({ studentId, limit: 100 });
  } catch (error) {
    logger.warn('evidence_inline_processing_failed', { studentId, error: serializeError(error) });
    return null;
  }
}

// Invalidates one evidence row (kept, with who and why) and recomputes mastery.
export async function invalidateEvidence(evidenceId: string, by: string, reason: string) {
  const evidence = await LearningEvidence.findOneAndUpdate(
    { id: evidenceId, invalidatedAt: { $exists: false } },
    {
      $set: { invalidatedAt: new Date(), invalidatedBy: by, invalidationReason: reason },
      $push: { history: { at: new Date(), by, action: 'invalidated', note: reason } },
    },
    { new: true },
  );
  if (!evidence) return null;
  await recomputeMastery(evidence.studentId, evidence.objectiveId, `invalidation:${evidence.id}`, evidence.institutionId);
  return evidence;
}
